(() => {
'use strict';

// ==================== CONFIG ====================

const ARROW_GAP = 8;
const ARROWHEAD_SIZE = 10;
const DEFAULT_RECT_W = 110;
const DEFAULT_RECT_H = 110;
const DEFAULT_CIRCLE_RX = 50;
const DEFAULT_CIRCLE_RY = 40;
const DEFAULT_TRI_W = 130;
const DEFAULT_TRI_H = 100;

const COLORS = [
    { name: 'Blue',   hex: '#4a7fd9' },
    { name: 'Red',    hex: '#e74c3c' },
    { name: 'Green',  hex: '#27ae60' },
    { name: 'Yellow', hex: '#f39c12' },
    { name: 'Purple', hex: '#8e44ad' },
    { name: 'Teal',   hex: '#1abc9c' },
    { name: 'Orange', hex: '#e67e22' },
    { name: 'Dark',   hex: '#2c3e50' },
];

// ==================== STATE ====================

let state = {
    nodes: [],
    arrows: [],
    groups: [],
    nextId: 1,
};

let ui = {
    tool: 'select',
    color: COLORS[0].hex,
    selected: [],         // [{ type: 'node'|'arrow'|'group', id }]
    arrowSource: null,
    history: [],
    redo: [],
    clipboard: null,      // { nodes, arrows, groups } for copy/paste
    drag: null,
    pan: null,
    groupDraw: null,
    resize: null,
    boxSelect: null,      // { startX, startY } for drag-select
    guides: [],           // [{ axis: 'x'|'y', pos }] alignment guides
    spaceHeld: false,
    mouseWorld: { x: 0, y: 0 },
};

let viewBox = { x: 0, y: 0, w: 0, h: 0 };

// ==================== DOM REFS ====================

const svg = document.getElementById('canvas');
const world = document.getElementById('world');
const nodesLayer = document.getElementById('nodes-layer');
const arrowsLayer = document.getElementById('arrows-layer');
const groupsLayer = document.getElementById('groups-layer');
const labelsLayer = document.getElementById('labels-layer');
const container = document.getElementById('canvas-container');
const statusText = document.getElementById('status-text');
const zoomLevel = document.getElementById('zoom-level');
const textEditor = document.getElementById('text-editor');
const textInput = document.getElementById('text-input');
const fileInput = document.getElementById('file-input');
const colorPalette = document.getElementById('color-palette');
const arrowEditor = document.getElementById('arrow-editor');
const arrowLabelInput = document.getElementById('arrow-label-input');
const arrowDetailInput = document.getElementById('arrow-detail-input');
const arrowTooltip = document.getElementById('arrow-tooltip');

let tempLine = null; // SVG line shown while drawing arrow

// Manual double-click tracking (native dblclick breaks when render() replaces DOM between clicks)
let lastClick = { time: 0, type: null, id: null };

// ==================== INIT ====================

function init() {
    // Set initial viewBox from container size
    const rect = container.getBoundingClientRect();
    viewBox.w = rect.width;
    viewBox.h = rect.height;
    updateViewBox();

    // Build color palette
    COLORS.forEach((c, i) => {
        const swatch = document.createElement('div');
        swatch.className = 'color-swatch' + (i === 0 ? ' active' : '');
        swatch.style.backgroundColor = c.hex;
        swatch.title = c.name;
        swatch.dataset.color = c.hex;
        swatch.addEventListener('click', () => selectColor(c.hex));
        colorPalette.appendChild(swatch);
    });

    // Toolbar tool buttons
    document.querySelectorAll('[data-tool]').forEach(btn => {
        btn.addEventListener('click', () => selectTool(btn.dataset.tool));
    });

    // Action buttons
    document.getElementById('btn-delete').addEventListener('click', deleteSelected);
    document.getElementById('btn-undo').addEventListener('click', undo);
    document.getElementById('btn-redo').addEventListener('click', redo);
    document.getElementById('btn-fit').addEventListener('click', zoomToFit);
    document.getElementById('btn-save').addEventListener('click', save);
    document.getElementById('btn-load').addEventListener('click', () => fileInput.click());
    document.getElementById('btn-export').addEventListener('click', exportText);
    document.getElementById('btn-png').addEventListener('click', exportPNG);
    fileInput.addEventListener('change', load);

    // Canvas events
    svg.addEventListener('mousedown', handleMouseDown);
    svg.addEventListener('mousemove', handleMouseMove);
    svg.addEventListener('mouseup', handleMouseUp);
    svg.addEventListener('wheel', handleWheel, { passive: false });
    svg.addEventListener('contextmenu', e => e.preventDefault());
    svg.addEventListener('mouseover', handleArrowHover);
    svg.addEventListener('mouseout', handleArrowHover);

    // Keyboard
    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('keyup', handleKeyUp);

    // Text editor
    textInput.addEventListener('keydown', e => {
        if (e.key === 'Enter') commitEditor();
        if (e.key === 'Escape') hideEditor();
    });
    textInput.addEventListener('blur', commitEditor);

    // Arrow editor
    document.getElementById('arrow-editor-ok').addEventListener('click', commitArrowEditor);
    document.getElementById('arrow-editor-cancel').addEventListener('click', hideArrowEditor);
    arrowLabelInput.addEventListener('keydown', e => {
        if (e.key === 'Enter') { e.preventDefault(); arrowDetailInput.focus(); }
        if (e.key === 'Escape') hideArrowEditor();
    });
    arrowDetailInput.addEventListener('keydown', e => {
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); commitArrowEditor(); }
        if (e.key === 'Escape') hideArrowEditor();
    });

    // Resize
    window.addEventListener('resize', () => {
        const r = container.getBoundingClientRect();
        const zf = getZoomFactor();
        viewBox.w = r.width * zf;
        viewBox.h = r.height * zf;
        updateViewBox();
    });

    updateStatus();
}

// ==================== HELPERS ====================

function createSVG(tag, attrs) {
    const el = document.createElementNS('http://www.w3.org/2000/svg', tag);
    for (const [k, v] of Object.entries(attrs || {})) {
        el.setAttribute(k, v);
    }
    return el;
}

function wrapText(text, maxWidth, fontSize) {
    const charW = fontSize * 0.55; // approximate character width
    const maxChars = Math.max(1, Math.floor(maxWidth / charW));
    const words = text.split(' ');
    const lines = [];
    let line = '';
    for (const word of words) {
        const test = line ? line + ' ' + word : word;
        if (test.length > maxChars && line) {
            lines.push(line);
            line = word;
        } else {
            line = test;
        }
    }
    if (line) lines.push(line);
    return lines.length ? lines : [''];
}

function segSegIntersect(x1, y1, x2, y2, x3, y3, x4, y4) {
    const denom = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4);
    if (Math.abs(denom) < 0.0001) return false;
    const t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / denom;
    const u = -((x1 - x2) * (y1 - y3) - (y1 - y2) * (x1 - x3)) / denom;
    return t > 0.05 && t < 0.95 && u > 0.05 && u < 0.95; // exclude near-endpoint touches
}

function pointToSegDist(px, py, x1, y1, x2, y2) {
    const dx = x2 - x1, dy = y2 - y1;
    const lenSq = dx * dx + dy * dy;
    if (lenSq === 0) return Math.hypot(px - x1, py - y1);
    let t = ((px - x1) * dx + (py - y1) * dy) / lenSq;
    t = Math.max(0, Math.min(1, t));
    return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}

function pointSideOfLine(px, py, x1, y1, x2, y2) {
    return (x2 - x1) * (py - y1) - (y2 - y1) * (px - x1);
}

function screenToWorld(sx, sy) {
    const r = svg.getBoundingClientRect();
    return {
        x: viewBox.x + (sx - r.left) / r.width * viewBox.w,
        y: viewBox.y + (sy - r.top) / r.height * viewBox.h,
    };
}

function worldToScreen(wx, wy) {
    const r = svg.getBoundingClientRect();
    return {
        x: r.left + (wx - viewBox.x) / viewBox.w * r.width,
        y: r.top + (wy - viewBox.y) / viewBox.h * r.height,
    };
}

function getZoomFactor() {
    const r = container.getBoundingClientRect();
    return viewBox.w / r.width;
}

function updateViewBox() {
    svg.setAttribute('viewBox', `${viewBox.x} ${viewBox.y} ${viewBox.w} ${viewBox.h}`);
    const pct = Math.round(100 / getZoomFactor());
    zoomLevel.textContent = pct + '%';

    // Move background grid with the viewport so it feels like the canvas moves
    const r = container.getBoundingClientRect();
    const gridSize = 24;
    const scale = r.width / viewBox.w;
    const scaledGrid = gridSize * scale;
    const offsetX = -viewBox.x * scale;
    const offsetY = -viewBox.y * scale;
    container.style.backgroundSize = `${scaledGrid}px ${scaledGrid}px`;
    container.style.backgroundPosition = `${offsetX}px ${offsetY}px`;
}

function getNode(id) {
    return state.nodes.find(n => n.id === id);
}

function isSelected(type, id) {
    return ui.selected.some(s => s.type === type && s.id === id);
}

function clearSelection() {
    ui.selected = [];
}

function selectOne(type, id) {
    ui.selected = [{ type, id }];
}

function toggleSelection(type, id) {
    const idx = ui.selected.findIndex(s => s.type === type && s.id === id);
    if (idx >= 0) ui.selected.splice(idx, 1);
    else ui.selected.push({ type, id });
}

function getSelectedPositions() {
    return ui.selected.map(s => {
        if (s.type === 'node') { const n = getNode(s.id); return n ? { type: 'node', id: s.id, x: n.x, y: n.y } : null; }
        if (s.type === 'group') { const g = getGroup(s.id); return g ? { type: 'group', id: s.id, x: g.x, y: g.y } : null; }
        return null;
    }).filter(Boolean);
}

function getCenter(node) {
    return { x: node.x, y: node.y };
}

function deepClone(obj) {
    return JSON.parse(JSON.stringify(obj));
}

// ==================== GEOMETRY ====================

function getEdgePoint(node, tx, ty) {
    const cx = node.x, cy = node.y;
    const dx = tx - cx, dy = ty - cy;
    if (dx === 0 && dy === 0) return { x: cx, y: cy };

    if (node.type === 'square') {
        return rectEdge(cx, cy, node.width, node.height, dx, dy);
    } else if (node.type === 'circle') {
        return ellipseEdge(cx, cy, node.width / 2, node.height / 2, dx, dy);
    } else if (node.type === 'triangle') {
        return triangleEdge(cx, cy, node.width, node.height, tx, ty);
    }
    return { x: cx, y: cy };
}

function rectEdge(cx, cy, w, h, dx, dy) {
    const hw = w / 2, hh = h / 2;
    const sx = Math.abs(dx) < 0.001 ? 1e9 : hw / Math.abs(dx);
    const sy = Math.abs(dy) < 0.001 ? 1e9 : hh / Math.abs(dy);
    const s = Math.min(sx, sy);
    return { x: cx + dx * s, y: cy + dy * s };
}

function ellipseEdge(cx, cy, rx, ry, dx, dy) {
    const t = 1 / Math.sqrt((dx * dx) / (rx * rx) + (dy * dy) / (ry * ry));
    return { x: cx + dx * t, y: cy + dy * t };
}

function triangleEdge(cx, cy, w, h, tx, ty) {
    const hw = w / 2, hh = h / 2;
    const verts = [
        { x: cx, y: cy - hh },
        { x: cx + hw, y: cy + hh },
        { x: cx - hw, y: cy + hh },
    ];
    const edges = [[0,1],[1,2],[2,0]];

    let best = null, bestDist = Infinity;
    for (const [a, b] of edges) {
        const pt = lineSegIntersect(cx, cy, tx, ty, verts[a].x, verts[a].y, verts[b].x, verts[b].y);
        if (pt) {
            const d = Math.hypot(pt.x - cx, pt.y - cy);
            if (d < bestDist) { bestDist = d; best = pt; }
        }
    }
    return best || { x: cx, y: cy };
}

function lineSegIntersect(x1, y1, x2, y2, x3, y3, x4, y4) {
    const denom = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4);
    if (Math.abs(denom) < 0.0001) return null;
    const t =  ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / denom;
    const u = -((x1 - x2) * (y1 - y3) - (y1 - y2) * (x1 - x3)) / denom;
    if (t > 0.001 && u >= 0 && u <= 1) {
        return { x: x1 + t * (x2 - x1), y: y1 + t * (y2 - y1) };
    }
    return null;
}

// ==================== RENDERING ====================

function render() {
    groupsLayer.innerHTML = '';
    arrowsLayer.innerHTML = '';
    nodesLayer.innerHTML = '';
    labelsLayer.innerHTML = '';

    // Render groups (behind everything)
    state.groups.forEach(group => {
        const isSel = isSelected('group', group.id);
        const g = createSVG('g', { 'data-group-id': group.id, class: 'group-container' + (isSel ? ' selected' : '') });

        const rect = createSVG('rect', {
            x: group.x, y: group.y, width: group.width, height: group.height,
            rx: 12, fill: group.color + '18', stroke: group.color,
            'stroke-width': 2, 'stroke-dasharray': '8 4', class: 'group-rect',
        });
        g.appendChild(rect);

        if (group.name) {
            const labelBg = createSVG('rect', {
                x: group.x + 10, y: group.y - 10,
                width: group.name.length * 8 + 16, height: 22,
                rx: 4, fill: group.color, class: 'group-label-bg',
            });
            g.appendChild(labelBg);

            const txt = createSVG('text', {
                x: group.x + 18, y: group.y + 5,
                class: 'group-label-text',
            });
            txt.textContent = group.name;
            g.appendChild(txt);
        }

        // Resize handles when selected
        if (isSel) {
            const { x: gx, y: gy, width: gw, height: gh } = group;
            [[gx, gy, 'nw'], [gx + gw, gy, 'ne'], [gx, gy + gh, 'sw'], [gx + gw, gy + gh, 'se']].forEach(([hx, hy, handle]) => {
                g.appendChild(createSVG('rect', {
                    x: hx - 5, y: hy - 5, width: 10, height: 10,
                    rx: 2, class: 'resize-handle', 'data-handle': handle,
                }));
            });
        }

        groupsLayer.appendChild(g);
    });

    // Render group draw preview
    if (ui.groupDraw && ui.groupDraw.drawing) {
        const gd = ui.groupDraw;
        const x = Math.min(gd.startX, ui.mouseWorld.x);
        const y = Math.min(gd.startY, ui.mouseWorld.y);
        const w = Math.abs(ui.mouseWorld.x - gd.startX);
        const h = Math.abs(ui.mouseWorld.y - gd.startY);
        const preview = createSVG('rect', {
            x, y, width: w, height: h, rx: 12,
            fill: ui.color + '10', stroke: ui.color,
            'stroke-width': 2, 'stroke-dasharray': '8 4',
        });
        groupsLayer.appendChild(preview);
    }

    // Pre-compute arrow segments for crossing detection
    const arrowSegs = [];
    state.arrows.forEach(arrow => {
        const fromNode = getNode(arrow.from);
        const toNode = getNode(arrow.to);
        if (!fromNode || !toNode) return;
        const fc = getCenter(fromNode), tc = getCenter(toNode);
        const fromEdge = getEdgePoint(fromNode, tc.x, tc.y);
        const toEdge = getEdgePoint(toNode, fc.x, fc.y);
        const dx = toEdge.x - fromEdge.x, dy = toEdge.y - fromEdge.y;
        const len = Math.hypot(dx, dy);
        if (len < ARROW_GAP * 3) return;
        const ux = dx / len, uy = dy / len;
        arrowSegs.push({
            arrow,
            sx: fromEdge.x + ux * ARROW_GAP, sy: fromEdge.y + uy * ARROW_GAP,
            ex: toEdge.x - ux * ARROW_GAP, ey: toEdge.y - uy * ARROW_GAP,
            len,
        });
    });

    // Render arrows
    arrowSegs.forEach((seg, idx) => {
        const { arrow, sx, sy, ex, ey, len } = seg;

        const isSel = isSelected('arrow', arrow.id);
        const g = createSVG('g', { 'data-arrow-id': arrow.id, class: 'arrow-group' + (isSel ? ' selected' : '') });

        // Compute bezier curve — detect obstructing nodes and crossing arrows
        const mx = (sx + ex) / 2, my = (sy + ey) / 2;
        const perpNx = -(ey - sy) / len;
        const perpNy = (ex - sx) / len;

        // Check for nodes blocking the path
        let maxOffset = Math.min(len * 0.1, 25);
        const fromId = arrow.from, toId = arrow.to;
        for (const node of state.nodes) {
            if (node.id === fromId || node.id === toId) continue;
            const nodeR = Math.max(node.width, node.height) / 2 + 15;
            const dist = pointToSegDist(node.x, node.y, sx, sy, ex, ey);
            if (dist < nodeR) {
                const clearance = nodeR - dist + 30;
                const side = pointSideOfLine(node.x, node.y, sx, sy, ex, ey);
                const neededOffset = side > 0 ? -clearance : clearance;
                if (Math.abs(neededOffset) > Math.abs(maxOffset)) {
                    maxOffset = neededOffset;
                }
            }
        }

        // Check for crossing arrows — flip curve direction to avoid
        for (let j = 0; j < idx; j++) {
            const other = arrowSegs[j];
            const cross = segSegIntersect(sx, sy, ex, ey, other.sx, other.sy, other.ex, other.ey);
            if (cross) {
                maxOffset = -maxOffset;
                if (Math.abs(maxOffset) < 60) maxOffset = maxOffset < 0 ? -60 : 60;
                break;
            }
        }

        const cpx = mx + perpNx * maxOffset;
        const cpy = my + perpNy * maxOffset;

        // Angles at endpoints (tangent of bezier at t=0 and t=1)
        const endAngle = Math.atan2(ey - cpy, ex - cpx);
        const startAngle = Math.atan2(sy - cpy, sx - cpx);

        // Shorten curve endpoints to not overlap arrowheads
        const lineEndX = ex - ARROWHEAD_SIZE * Math.cos(endAngle);
        const lineEndY = ey - ARROWHEAD_SIZE * Math.sin(endAngle);
        let lineStartX = sx, lineStartY = sy;
        if (arrow.direction === 'two-way') {
            lineStartX = sx - ARROWHEAD_SIZE * Math.cos(startAngle);
            lineStartY = sy - ARROWHEAD_SIZE * Math.sin(startAngle);
        }

        const curvePath = `M ${lineStartX} ${lineStartY} Q ${cpx} ${cpy} ${lineEndX} ${lineEndY}`;

        // Hit area (wider invisible path)
        g.appendChild(createSVG('path', { d: curvePath, class: 'arrow-hit' }));
        // Visible curved line
        g.appendChild(createSVG('path', { d: curvePath, class: 'arrow-line' }));

        // Arrowhead at target
        g.appendChild(makeArrowhead(ex, ey, endAngle));

        // Arrowhead at source if two-way
        if (arrow.direction === 'two-way') {
            g.appendChild(makeArrowhead(sx, sy, startAngle));
        }

        arrowsLayer.appendChild(g);

        // Labels rendered in top layer (above nodes)
        if (arrow.label) {
            const lx = 0.25 * sx + 0.5 * cpx + 0.25 * ex;
            const ly = 0.25 * sy + 0.5 * cpy + 0.25 * ey;

            const labelGroup = createSVG('g', { class: 'arrow-label-group' + (isSel ? ' selected' : ''), 'data-arrow-id': arrow.id });
            const header = createSVG('text', { x: lx, y: ly - 8, class: 'arrow-label' });
            header.textContent = arrow.label;
            labelGroup.appendChild(header);
            labelsLayer.appendChild(labelGroup);
        }
    });

    // Render nodes
    state.nodes.forEach(node => {
        const isSel = isSelected('node', node.id);
        const isArrowSrc = ui.arrowSource === node.id;
        let cls = 'node';
        if (isSel) cls += ' selected';
        if (isArrowSrc) cls += ' arrow-source';

        const g = createSVG('g', { 'data-node-id': node.id, class: cls, transform: `translate(${node.x},${node.y})` });

        let shape;
        if (node.type === 'square') {
            shape = createSVG('rect', {
                x: -node.width / 2, y: -node.height / 2,
                width: node.width, height: node.height,
                rx: 8, fill: node.color, stroke: 'none', 'stroke-width': 0, class: 'shape',
            });
        } else if (node.type === 'circle') {
            shape = createSVG('ellipse', {
                cx: 0, cy: 0, rx: node.width / 2, ry: node.height / 2,
                fill: node.color, stroke: 'none', 'stroke-width': 0, class: 'shape',
            });
        } else if (node.type === 'triangle') {
            const hw = node.width / 2, hh = node.height / 2;
            shape = createSVG('polygon', {
                points: `0,${-hh} ${hw},${hh} ${-hw},${hh}`,
                fill: node.color, stroke: 'none', 'stroke-width': 0, class: 'shape',
            });
        }
        g.appendChild(shape);

        // Label with word wrap via tspan
        if (node.name) {
            const pad = 12;
            const maxW = node.width - pad * 2;
            const lines = wrapText(node.name, maxW, 16);
            const lineH = 20;
            const totalH = lines.length * lineH;
            const baseY = node.type === 'triangle' ? node.height * 0.12 : 0;
            const startY = baseY - (totalH - lineH) / 2;

            const txt = createSVG('text', { x: 0, class: 'node-label' });
            lines.forEach((line, i) => {
                const tspan = createSVG('tspan', {
                    x: 0, y: startY + i * lineH,
                });
                tspan.textContent = line;
                txt.appendChild(tspan);
            });
            g.appendChild(txt);
        }

        // Resize handles when selected
        if (isSel) {
            const hw = node.width / 2, hh = node.height / 2;
            [[-hw, -hh, 'nw'], [hw, -hh, 'ne'], [-hw, hh, 'sw'], [hw, hh, 'se']].forEach(([hx, hy, handle]) => {
                g.appendChild(createSVG('rect', {
                    x: hx - 5, y: hy - 5, width: 10, height: 10,
                    rx: 2, class: 'resize-handle', 'data-handle': handle,
                }));
            });
        }

        nodesLayer.appendChild(g);
    });

    // Temp line for arrow drawing
    if (tempLine && tempLine.parentNode) tempLine.remove();
    if (ui.arrowSource != null) {
        const src = getNode(ui.arrowSource);
        if (src) {
            tempLine = createSVG('line', {
                x1: src.x, y1: src.y,
                x2: ui.mouseWorld.x, y2: ui.mouseWorld.y,
                class: 'temp-line',
            });
            arrowsLayer.appendChild(tempLine);
        }
    }

    // Shape placement preview
    if (['square', 'circle', 'triangle'].includes(ui.tool)) {
        const mx = ui.mouseWorld.x, my = ui.mouseWorld.y;
        const pg = createSVG('g', { transform: `translate(${mx},${my})`, class: 'shape-preview', opacity: '0.4' });
        let preview;
        if (ui.tool === 'square') {
            preview = createSVG('rect', {
                x: -DEFAULT_RECT_W / 2, y: -DEFAULT_RECT_H / 2,
                width: DEFAULT_RECT_W, height: DEFAULT_RECT_H,
                rx: 8, fill: ui.color,
            });
        } else if (ui.tool === 'circle') {
            preview = createSVG('ellipse', {
                cx: 0, cy: 0, rx: DEFAULT_CIRCLE_RX, ry: DEFAULT_CIRCLE_RY,
                fill: ui.color,
            });
        } else if (ui.tool === 'triangle') {
            const hw = DEFAULT_TRI_W / 2, hh = DEFAULT_TRI_H / 2;
            preview = createSVG('polygon', {
                points: `0,${-hh} ${hw},${hh} ${-hw},${hh}`,
                fill: ui.color,
            });
        }
        pg.appendChild(preview);
        nodesLayer.appendChild(pg);
    }

    // Box-select rectangle
    if (ui.boxSelect) {
        const bx = Math.min(ui.boxSelect.startX, ui.mouseWorld.x);
        const by = Math.min(ui.boxSelect.startY, ui.mouseWorld.y);
        const bw = Math.abs(ui.mouseWorld.x - ui.boxSelect.startX);
        const bh = Math.abs(ui.mouseWorld.y - ui.boxSelect.startY);
        nodesLayer.appendChild(createSVG('rect', {
            x: bx, y: by, width: bw, height: bh,
            fill: 'rgba(74, 127, 217, 0.1)', stroke: '#4a7fd9',
            'stroke-width': 1.5, 'stroke-dasharray': '6 3', rx: 4,
        }));
    }

    // Alignment guides
    ui.guides.forEach(g => {
        if (g.axis === 'x') {
            labelsLayer.appendChild(createSVG('line', {
                x1: g.pos, y1: viewBox.y, x2: g.pos, y2: viewBox.y + viewBox.h,
                stroke: '#4a7fd9', 'stroke-width': 0.8, 'stroke-dasharray': '4 4', opacity: '0.6',
            }));
        } else {
            labelsLayer.appendChild(createSVG('line', {
                x1: viewBox.x, y1: g.pos, x2: viewBox.x + viewBox.w, y2: g.pos,
                stroke: '#4a7fd9', 'stroke-width': 0.8, 'stroke-dasharray': '4 4', opacity: '0.6',
            }));
        }
    });
}

function makeArrowhead(x, y, angle) {
    const s = ARROWHEAD_SIZE;
    const halfAngle = Math.PI / 6;
    // Tip
    const p1x = x, p1y = y;
    // Two base points
    const p2x = x - s * Math.cos(angle - halfAngle);
    const p2y = y - s * Math.sin(angle - halfAngle);
    const p3x = x - s * Math.cos(angle + halfAngle);
    const p3y = y - s * Math.sin(angle + halfAngle);
    // Indent point for a sleek notched arrowhead
    const indent = s * 0.35;
    const p4x = x - indent * Math.cos(angle);
    const p4y = y - indent * Math.sin(angle);
    return createSVG('polygon', {
        points: `${p1x},${p1y} ${p2x},${p2y} ${p4x},${p4y} ${p3x},${p3y}`,
        class: 'arrowhead',
    });
}

// ==================== ACTIONS ====================

function pushHistory() {
    ui.history.push(deepClone(state));
    if (ui.history.length > 50) ui.history.shift();
    ui.redo = []; // new action clears redo stack
}

function undo() {
    if (ui.history.length === 0) return;
    ui.redo.push(deepClone(state));
    state = ui.history.pop();
    clearSelection();
    ui.arrowSource = null;
    render();
    updateStatus();
}

function redo() {
    if (ui.redo.length === 0) return;
    ui.history.push(deepClone(state));
    state = ui.redo.pop();
    clearSelection();
    ui.arrowSource = null;
    render();
    updateStatus();
}

function copySelected() {
    if (ui.selected.length === 0) return;
    const nodeIds = new Set(ui.selected.filter(s => s.type === 'node').map(s => s.id));
    const groupIds = new Set(ui.selected.filter(s => s.type === 'group').map(s => s.id));
    ui.clipboard = {
        nodes: state.nodes.filter(n => nodeIds.has(n.id)).map(n => deepClone(n)),
        groups: state.groups.filter(g => groupIds.has(g.id)).map(g => deepClone(g)),
        arrows: state.arrows.filter(a => nodeIds.has(a.from) && nodeIds.has(a.to)).map(a => deepClone(a)),
    };
}

function pasteClipboard() {
    if (!ui.clipboard) return;
    pushHistory();
    const idMap = {};
    const offset = 30;
    clearSelection();

    // Paste nodes with new IDs
    for (const n of ui.clipboard.nodes) {
        const newId = state.nextId++;
        idMap[n.id] = newId;
        const clone = deepClone(n);
        clone.id = newId;
        clone.x += offset;
        clone.y += offset;
        state.nodes.push(clone);
        ui.selected.push({ type: 'node', id: newId });
    }
    // Paste groups
    for (const g of ui.clipboard.groups) {
        const newId = state.nextId++;
        idMap[g.id] = newId;
        const clone = deepClone(g);
        clone.id = newId;
        clone.x += offset;
        clone.y += offset;
        state.groups.push(clone);
        ui.selected.push({ type: 'group', id: newId });
    }
    // Paste arrows with remapped IDs
    for (const a of ui.clipboard.arrows) {
        if (idMap[a.from] && idMap[a.to]) {
            const clone = deepClone(a);
            clone.id = state.nextId++;
            clone.from = idMap[a.from];
            clone.to = idMap[a.to];
            state.arrows.push(clone);
        }
    }
    render();
    updateStatus();
}

function selectAll() {
    clearSelection();
    state.nodes.forEach(n => ui.selected.push({ type: 'node', id: n.id }));
    state.groups.forEach(g => ui.selected.push({ type: 'group', id: g.id }));
    render();
    updateStatus();
}

function zoomToFit() {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    state.nodes.forEach(n => {
        minX = Math.min(minX, n.x - n.width / 2);
        minY = Math.min(minY, n.y - n.height / 2);
        maxX = Math.max(maxX, n.x + n.width / 2);
        maxY = Math.max(maxY, n.y + n.height / 2);
    });
    state.groups.forEach(g => {
        minX = Math.min(minX, g.x);
        minY = Math.min(minY, g.y - 15);
        maxX = Math.max(maxX, g.x + g.width);
        maxY = Math.max(maxY, g.y + g.height);
    });
    if (!isFinite(minX)) return;
    const pad = 60;
    minX -= pad; minY -= pad; maxX += pad; maxY += pad;
    const r = container.getBoundingClientRect();
    const fitW = maxX - minX;
    const fitH = maxY - minY;
    const aspect = r.width / r.height;
    if (fitW / fitH > aspect) {
        viewBox.w = fitW;
        viewBox.h = fitW / aspect;
        viewBox.x = minX;
        viewBox.y = minY - (viewBox.h - fitH) / 2;
    } else {
        viewBox.h = fitH;
        viewBox.w = fitH * aspect;
        viewBox.x = minX - (viewBox.w - fitW) / 2;
        viewBox.y = minY;
    }
    updateViewBox();
    render();
}

function addNode(type, x, y) {
    pushHistory();
    let w, h;
    if (type === 'square') { w = DEFAULT_RECT_W; h = DEFAULT_RECT_H; }
    else if (type === 'circle') { w = DEFAULT_CIRCLE_RX * 2; h = DEFAULT_CIRCLE_RY * 2; }
    else { w = DEFAULT_TRI_W; h = DEFAULT_TRI_H; }

    const node = {
        id: state.nextId++,
        type, name: '',
        color: ui.color,
        x, y, width: w, height: h,
    };
    state.nodes.push(node);
    selectOne('node', node.id);
    // Stay on the same tool so user can place multiple shapes
    render();
    updateStatus();

    // Immediately open editor so user can type the name
    const screen = worldToScreen(node.x, node.y);
    showEditor(screen.x, screen.y, '', val => {
        node.name = val;
        render();
    });
}

function addArrow(fromId, toId, direction) {
    if (fromId === toId) return;

    // Check for existing arrow between this pair (either direction)
    const existing = state.arrows.find(a =>
        (a.from === fromId && a.to === toId) ||
        (a.from === toId && a.to === fromId)
    );

    if (existing) {
        // Already two-way or exact same direction → ignore
        if (existing.direction === 'two-way') {
            ui.arrowSource = null;
            render();
            updateStatus();
            return;
        }
        // Existing is one-way. If new arrow is also one-way in the opposite direction → upgrade to two-way
        const sameDirection = (existing.from === fromId && existing.to === toId);
        if (sameDirection) {
            // Same arrow already exists → ignore
            ui.arrowSource = null;
            render();
            updateStatus();
            return;
        }
        // Opposite direction → merge into two-way
        pushHistory();
        existing.direction = 'two-way';
        selectOne('arrow', existing.id);
        ui.arrowSource = null;
        render();
        updateStatus();
        return;
    }

    pushHistory();
    const arrow = {
        id: state.nextId++,
        from: fromId, to: toId,
        direction, label: '', detail: '',
    };
    state.arrows.push(arrow);
    selectOne('arrow', arrow.id);
    ui.arrowSource = null;
    // Stay on arrow tool so user can draw more arrows
    render();
    updateStatus();
}

function addGroup(x, y, w, h) {
    pushHistory();
    const group = {
        id: state.nextId++,
        name: '',
        x, y, width: w, height: h,
        color: ui.color,
    };
    state.groups.push(group);
    selectOne('group', group.id);
    // Stay on group tool so user can draw more groups
    render();
    updateStatus();

    // Open editor for group name
    const screen = worldToScreen(x + w / 2, y + 12);
    showEditor(screen.x, screen.y, '', val => {
        group.name = val;
        render();
    });
}

function getGroup(id) {
    return state.groups.find(g => g.id === id);
}

function deleteSelected() {
    if (ui.selected.length === 0) return;
    pushHistory();
    for (const sel of ui.selected) {
        if (sel.type === 'node') {
            state.nodes = state.nodes.filter(n => n.id !== sel.id);
            state.arrows = state.arrows.filter(a => a.from !== sel.id && a.to !== sel.id);
        } else if (sel.type === 'arrow') {
            state.arrows = state.arrows.filter(a => a.id !== sel.id);
        } else if (sel.type === 'group') {
            state.groups = state.groups.filter(g => g.id !== sel.id);
        }
    }
    clearSelection();
    render();
    updateStatus();
}

function changeSelectedColor(hex) {
    // unused now — paint tool handles coloring
}

// ==================== TOOL / COLOR SELECTION ====================

function selectTool(tool) {
    ui.tool = tool;
    ui.arrowSource = null;
    document.querySelectorAll('[data-tool]').forEach(b => b.classList.toggle('active', b.dataset.tool === tool));

    container.classList.remove('tool-shape', 'tool-arrow', 'tool-group', 'tool-paint');
    if (['square', 'circle', 'triangle'].includes(tool)) container.classList.add('tool-shape');
    if (tool.startsWith('arrow-')) container.classList.add('tool-arrow');
    if (tool === 'group') container.classList.add('tool-group');
    if (tool === 'paint') container.classList.add('tool-paint');

    updateStatus();
    render();
}

function selectColor(hex) {
    ui.color = hex;
    document.querySelectorAll('.color-swatch').forEach(s => s.classList.toggle('active', s.dataset.color === hex));
}

// ==================== EVENT HANDLERS ====================

function handleMouseDown(e) {
    const w = screenToWorld(e.clientX, e.clientY);
    ui.mouseWorld = w;



    // Right-click: if a placement tool is active, switch back to select
    if (e.button === 2 && ui.tool !== 'select') {
        e.preventDefault();
        selectTool('select');
        return;
    }

    // Right-click (on select) or middle mouse or space+left → pan
    if (e.button === 2 || e.button === 1 || (e.button === 0 && ui.spaceHeld)) {
        e.preventDefault();
        ui.pan = { startX: e.clientX, startY: e.clientY, vbX: viewBox.x, vbY: viewBox.y };
        container.classList.add('panning');
        return;
    }

    if (e.button !== 0) return;

    // Resize handle detection
    const handleEl = e.target.closest('[data-handle]');
    if (handleEl && ui.selected.length === 1) {
        e.preventDefault();
        const handle = handleEl.dataset.handle;
        const sel = ui.selected[0];
        if (sel.type === 'node') {
            const node = getNode(sel.id);
            if (node) {
                const hw = node.width / 2, hh = node.height / 2;
                const fixedX = handle.includes('e') ? node.x - hw : node.x + hw;
                const fixedY = handle.includes('s') ? node.y - hh : node.y + hh;
                ui.resize = { elemType: 'node', id: node.id, handle, fixedX, fixedY };
                pushHistory();
            }
        } else if (sel.type === 'group') {
            const group = getGroup(sel.id);
            if (group) {
                const fixedX = handle.includes('e') ? group.x : group.x + group.width;
                const fixedY = handle.includes('s') ? group.y : group.y + group.height;
                ui.resize = { elemType: 'group', id: group.id, handle, fixedX, fixedY };
                pushHistory();
            }
        }
        container.classList.add('dragging');
        return;
    }

    const nodeEl = e.target.closest('[data-node-id]');
    const arrowEl = e.target.closest('[data-arrow-id]');
    const groupEl = e.target.closest('[data-group-id]');

    // Ctrl+drag starts box-select regardless of what's under cursor
    if ((e.ctrlKey || e.metaKey) && !e.key) {
        ui.boxSelect = { startX: w.x, startY: w.y };
        return;
    }

    // Shape placement tools
    if (['square', 'circle', 'triangle'].includes(ui.tool)) {
        if (!nodeEl && !arrowEl) {
            e.preventDefault();
            addNode(ui.tool, w.x, w.y);
        }
        return;
    }

    // Group tool: click-and-drag to define area
    if (ui.tool === 'group') {
        e.preventDefault();
        ui.groupDraw = { startX: w.x, startY: w.y, drawing: true };
        return;
    }

    // Paint tool: click to apply color
    if (ui.tool === 'paint') {
        if (nodeEl) {
            const node = getNode(+nodeEl.dataset.nodeId);
            if (node && node.color !== ui.color) {
                pushHistory();
                node.color = ui.color;
                render();
            }
        } else if (groupEl) {
            const group = getGroup(+groupEl.dataset.groupId);
            if (group && group.color !== ui.color) {
                pushHistory();
                group.color = ui.color;
                render();
            }
        }
        return;
    }

    // Arrow tools
    if (ui.tool.startsWith('arrow-')) {
        if (nodeEl) {
            const nid = +nodeEl.dataset.nodeId;
            if (ui.arrowSource == null) {
                ui.arrowSource = nid;
                render();
                updateStatus();
            } else {
                const dir = ui.tool === 'arrow-twoway' ? 'two-way' : 'one-way';
                addArrow(ui.arrowSource, nid, dir);
            }
        } else {
            // Clicked empty space → cancel
            ui.arrowSource = null;
            render();
            updateStatus();
        }
        return;
    }

    // Select tool
    if (ui.tool === 'select') {
        const now = Date.now();
        const shift = e.shiftKey;

        if (nodeEl) {
            const nid = +nodeEl.dataset.nodeId;

            if (now - lastClick.time < 400 && lastClick.type === 'node' && lastClick.id === nid) {
                e.preventDefault();
                lastClick = { time: 0, type: null, id: null };
                const node = getNode(nid);
                if (node) {
                    const screen = worldToScreen(node.x, node.y);
                    showEditor(screen.x, screen.y, node.name, val => {
                        pushHistory();
                        node.name = val;
                        render();
                    });
                }
                return;
            }

            lastClick = { time: now, type: 'node', id: nid };
            if (shift) { toggleSelection('node', nid); }
            else if (!isSelected('node', nid)) { selectOne('node', nid); }
            const node = getNode(nid);
            ui.drag = { startItems: getSelectedPositions(), offsetX: w.x - node.x, offsetY: w.y - node.y };
            container.classList.add('dragging');
            render();
            updateStatus();
        } else if (arrowEl) {
            const aid = +arrowEl.dataset.arrowId;

            if (now - lastClick.time < 400 && lastClick.type === 'arrow' && lastClick.id === aid) {
                e.preventDefault();
                lastClick = { time: 0, type: null, id: null };
                const arrow = state.arrows.find(a => a.id === aid);
                if (arrow) {
                    const fromNode = getNode(arrow.from), toNode = getNode(arrow.to);
                    if (fromNode && toNode) {
                        const mx = (fromNode.x + toNode.x) / 2;
                        const my = (fromNode.y + toNode.y) / 2;
                        const screen = worldToScreen(mx, my);
                        showArrowEditor(screen.x, screen.y, arrow.label, arrow.detail || '', (label, detail) => {
                            pushHistory();
                            arrow.label = label;
                            arrow.detail = detail;
                            render();
                        });
                    }
                }
                return;
            }

            lastClick = { time: now, type: 'arrow', id: aid };
            if (shift) toggleSelection('arrow', aid);
            else selectOne('arrow', aid);
            render();
            updateStatus();
        } else if (groupEl) {
            const gid = +groupEl.dataset.groupId;

            if (now - lastClick.time < 400 && lastClick.type === 'group' && lastClick.id === gid) {
                e.preventDefault();
                lastClick = { time: 0, type: null, id: null };
                const group = getGroup(gid);
                if (group) {
                    const screen = worldToScreen(group.x + group.width / 2, group.y + 12);
                    showEditor(screen.x, screen.y, group.name, val => {
                        pushHistory();
                        group.name = val;
                        render();
                    });
                }
                return;
            }

            lastClick = { time: now, type: 'group', id: gid };
            if (shift) { toggleSelection('group', gid); }
            else if (!isSelected('group', gid)) { selectOne('group', gid); }
            const group = getGroup(gid);
            ui.drag = { startItems: getSelectedPositions(), offsetX: w.x - group.x, offsetY: w.y - group.y };
            container.classList.add('dragging');
            render();
            updateStatus();
        } else {
            // Empty canvas: start box-select or pan
            lastClick = { time: 0, type: null, id: null };
            ui.pan = { startX: e.clientX, startY: e.clientY, vbX: viewBox.x, vbY: viewBox.y, deselectOnRelease: true };
            container.classList.add('panning');
        }
    }
}

function handleMouseMove(e) {
    const w = screenToWorld(e.clientX, e.clientY);
    ui.mouseWorld = w;

    // Panning
    if (ui.pan) {
        const dx = e.clientX - ui.pan.startX;
        const dy = e.clientY - ui.pan.startY;
        if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
            ui.pan.moved = true;
        }
        const zf = getZoomFactor();
        viewBox.x = ui.pan.vbX - dx * zf;
        viewBox.y = ui.pan.vbY - dy * zf;
        updateViewBox();
        return;
    }

    // Resizing
    if (ui.resize) {
        const r = ui.resize;
        const MIN_SIZE = 40;
        if (r.elemType === 'node') {
            const node = getNode(r.id);
            if (node) {
                node.width = Math.max(MIN_SIZE, Math.abs(w.x - r.fixedX));
                node.height = Math.max(MIN_SIZE, Math.abs(w.y - r.fixedY));
                node.x = (r.fixedX + w.x) / 2;
                node.y = (r.fixedY + w.y) / 2;
                render();
            }
        } else if (r.elemType === 'group') {
            const group = getGroup(r.id);
            if (group) {
                const x1 = Math.min(r.fixedX, w.x);
                const y1 = Math.min(r.fixedY, w.y);
                const x2 = Math.max(r.fixedX, w.x);
                const y2 = Math.max(r.fixedY, w.y);
                group.x = x1;
                group.y = y1;
                group.width = Math.max(MIN_SIZE, x2 - x1);
                group.height = Math.max(MIN_SIZE, y2 - y1);
                render();
            }
        }
        return;
    }

    // Dragging selected items
    if (ui.drag) {
        if (!ui.drag.moved) {
            pushHistory();
            ui.drag.moved = true;
        }
        const dx = w.x - ui.drag.offsetX;
        const dy = w.y - ui.drag.offsetY;

        // Move all selected items relative to their start positions
        if (ui.drag.startItems) {
            const first = ui.drag.startItems[0];
            if (!first) { ui.drag = null; return; }
            const moveDx = dx - first.x;
            const moveDy = dy - first.y;

            // Compute alignment guides (snap to other elements)
            ui.guides = [];
            const SNAP = 8;
            let snapDx = 0, snapDy = 0;
            const selectedIds = new Set(ui.selected.map(s => s.type + s.id));

            // Collect all non-selected element positions for snapping
            const targets = [];
            state.nodes.forEach(n => { if (!selectedIds.has('node' + n.id)) targets.push({ x: n.x, y: n.y }); });
            state.groups.forEach(g => { if (!selectedIds.has('group' + g.id)) targets.push({ x: g.x + g.width / 2, y: g.y + g.height / 2 }); });

            // Check snap for first dragged item
            const newX = first.x + moveDx;
            const newY = first.y + moveDy;
            for (const t of targets) {
                if (Math.abs(newX - t.x) < SNAP) { snapDx = t.x - newX; ui.guides.push({ axis: 'x', pos: t.x }); break; }
            }
            for (const t of targets) {
                if (Math.abs(newY - t.y) < SNAP) { snapDy = t.y - newY; ui.guides.push({ axis: 'y', pos: t.y }); break; }
            }

            for (const item of ui.drag.startItems) {
                if (item.type === 'node') {
                    const node = getNode(item.id);
                    if (node) { node.x = item.x + moveDx + snapDx; node.y = item.y + moveDy + snapDy; }
                } else if (item.type === 'group') {
                    const group = getGroup(item.id);
                    if (group) { group.x = item.x + moveDx + snapDx; group.y = item.y + moveDy + snapDy; }
                }
            }
        }
        render();
        return;
    }

    // Box select
    if (ui.boxSelect) {
        render();
        return;
    }

    // Drawing group preview
    if (ui.groupDraw?.drawing) {
        render();
        return;
    }

    // Update temp arrow line
    if (ui.arrowSource != null) {
        render();
        return;
    }

    // Shape placement preview
    if (['square', 'circle', 'triangle'].includes(ui.tool)) {
        render();
    }
}

function handleMouseUp(e) {
    const w = screenToWorld(e.clientX, e.clientY);
    if (ui.pan) {
        // If this was a left-click on empty canvas with no drag, deselect
        if (ui.pan.deselectOnRelease && !ui.pan.moved) {
            clearSelection();
            render();
            updateStatus();
        }
        ui.pan = null;
        container.classList.remove('panning');
    }
    if (ui.drag) {
        ui.drag = null;
        ui.guides = [];
        container.classList.remove('dragging');
        render();
    }
    if (ui.boxSelect) {
        // Select all items inside the box
        const bx1 = Math.min(ui.boxSelect.startX, w.x);
        const by1 = Math.min(ui.boxSelect.startY, w.y);
        const bx2 = Math.max(ui.boxSelect.startX, w.x);
        const by2 = Math.max(ui.boxSelect.startY, w.y);
        const w2 = screenToWorld(e.clientX, e.clientY);
        if (!e.shiftKey) clearSelection();
        state.nodes.forEach(n => {
            if (n.x >= bx1 && n.x <= bx2 && n.y >= by1 && n.y <= by2) {
                if (!isSelected('node', n.id)) ui.selected.push({ type: 'node', id: n.id });
            }
        });
        state.groups.forEach(g => {
            const cx = g.x + g.width / 2, cy = g.y + g.height / 2;
            if (cx >= bx1 && cx <= bx2 && cy >= by1 && cy <= by2) {
                if (!isSelected('group', g.id)) ui.selected.push({ type: 'group', id: g.id });
            }
        });
        ui.boxSelect = null;
        render();
        updateStatus();
    }
    if (ui.resize) {
        ui.resize = null;
        container.classList.remove('dragging');
    }
    if (ui.groupDraw?.drawing) {
        const gd = ui.groupDraw;
        const w = screenToWorld(e.clientX, e.clientY);
        const x = Math.min(gd.startX, w.x);
        const y = Math.min(gd.startY, w.y);
        const gw = Math.abs(w.x - gd.startX);
        const gh = Math.abs(w.y - gd.startY);
        ui.groupDraw = null;

        // Only create if big enough
        if (gw > 30 && gh > 30) {
            addGroup(x, y, gw, gh);
        } else {
            render();
        }
    }
}

function handleArrowHover(e) {
    const arrowEl = e.target.closest('[data-arrow-id]');
    const labelEl = e.target.closest('.arrow-label-group[data-arrow-id]');
    const aid = (arrowEl || labelEl)?.dataset?.arrowId;

    if (e.type === 'mouseout' || !aid) {
        // Clear highlight
        document.querySelectorAll('.arrow-group.hovered').forEach(el => el.classList.remove('hovered'));
        document.querySelectorAll('.arrow-label-group.hovered').forEach(el => el.classList.remove('hovered'));
        arrowTooltip.classList.add('hidden');
        return;
    }

    const arrow = state.arrows.find(a => a.id === +aid);
    if (!arrow || !arrow.detail) {
        arrowTooltip.classList.add('hidden');
        return;
    }

    // Highlight the arrow line + label
    document.querySelectorAll('.arrow-group.hovered').forEach(el => el.classList.remove('hovered'));
    document.querySelectorAll('.arrow-label-group.hovered').forEach(el => el.classList.remove('hovered'));
    const arrowGroup = document.querySelector(`.arrow-group[data-arrow-id="${aid}"]`);
    if (arrowGroup) arrowGroup.classList.add('hovered');
    const labelGroup = document.querySelector(`.arrow-label-group[data-arrow-id="${aid}"]`);
    if (labelGroup) labelGroup.classList.add('hovered');

    // Show tooltip near mouse
    arrowTooltip.textContent = arrow.detail;
    arrowTooltip.classList.remove('hidden');
    arrowTooltip.style.left = (e.clientX + 12) + 'px';
    arrowTooltip.style.top = (e.clientY + 12) + 'px';
}

function handleWheel(e) {
    e.preventDefault();
    const factor = e.deltaY > 0 ? 1.08 : 1 / 1.08;
    const mouse = screenToWorld(e.clientX, e.clientY);

    viewBox.x = mouse.x - (mouse.x - viewBox.x) * factor;
    viewBox.y = mouse.y - (mouse.y - viewBox.y) * factor;
    viewBox.w *= factor;
    viewBox.h *= factor;

    // Clamp zoom
    const r = container.getBoundingClientRect();
    const minW = r.width * 0.1, maxW = r.width * 10;
    if (viewBox.w < minW) {
        const s = minW / viewBox.w;
        viewBox.w *= s; viewBox.h *= s;
    }
    if (viewBox.w > maxW) {
        const s = maxW / viewBox.w;
        viewBox.w *= s; viewBox.h *= s;
    }

    updateViewBox();
}

function handleKeyDown(e) {
    // Don't handle when editing text
    if (textEditor.classList.contains('hidden') === false) return;
    if (arrowEditor.classList.contains('hidden') === false) return;

    if (e.key === ' ') {
        e.preventDefault();
        ui.spaceHeld = true;
        return;
    }
    if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        deleteSelected();
        return;
    }
    if (e.key === 'z' && (e.ctrlKey || e.metaKey) && !e.shiftKey) {
        e.preventDefault();
        undo();
        return;
    }
    if ((e.key === 'y' && (e.ctrlKey || e.metaKey)) || (e.key === 'z' && (e.ctrlKey || e.metaKey) && e.shiftKey)) {
        e.preventDefault();
        redo();
        return;
    }
    if (e.key === 'c' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        copySelected();
        return;
    }
    if (e.key === 'v' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        pasteClipboard();
        return;
    }
    if (e.key === 'a' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        selectAll();
        return;
    }
    if (e.key === 's' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        save();
        return;
    }
    if (e.key === 'Escape') {
        clearSelection();
        ui.arrowSource = null;
        selectTool('select');
        render();
        updateStatus();
        return;
    }

    // Keyboard shortcuts for tools
    if (e.key === 'f' && !e.ctrlKey && !e.metaKey) { zoomToFit(); return; }
    const shortcuts = { v: 'select', r: 'square', c: 'circle', t: 'triangle', g: 'group', p: 'paint', a: 'arrow-oneway', d: 'arrow-twoway' };
    if (shortcuts[e.key] && !e.ctrlKey && !e.metaKey) {
        selectTool(shortcuts[e.key]);
    }
}

function handleKeyUp(e) {
    if (e.key === ' ') ui.spaceHeld = false;
}

// ==================== INLINE EDITOR ====================

let editorCallback = null;

function showEditor(sx, sy, value, callback) {
    editorCallback = callback;
    textEditor.classList.remove('hidden');
    textInput.value = value;

    // Position centered on the point
    const inputW = Math.max(120, value.length * 9 + 30);
    textInput.style.width = inputW + 'px';
    textEditor.style.left = (sx - inputW / 2) + 'px';
    textEditor.style.top = (sy - 16) + 'px';

    textInput.focus();
    textInput.select();
}

function commitEditor() {
    if (textEditor.classList.contains('hidden')) return;
    if (editorCallback) {
        editorCallback(textInput.value);
        editorCallback = null;
    }
    hideEditor();
}

function hideEditor() {
    textEditor.classList.add('hidden');
    editorCallback = null;
}

// ==================== ARROW EDITOR ====================

let arrowEditorCallback = null;

function showArrowEditor(sx, sy, label, detail, callback) {
    arrowEditorCallback = callback;
    arrowEditor.classList.remove('hidden');
    arrowLabelInput.value = label;
    arrowDetailInput.value = detail;

    arrowEditor.style.left = (sx - 120) + 'px';
    arrowEditor.style.top = (sy - 20) + 'px';

    arrowLabelInput.focus();
}

function commitArrowEditor() {
    if (arrowEditor.classList.contains('hidden')) return;
    if (arrowEditorCallback) {
        arrowEditorCallback(arrowLabelInput.value, arrowDetailInput.value);
        arrowEditorCallback = null;
    }
    hideArrowEditor();
}

function hideArrowEditor() {
    arrowEditor.classList.add('hidden');
    arrowEditorCallback = null;
}

// ==================== STATUS ====================

function updateStatus() {
    const msgs = {
        select: 'Click to select, drag to move, double-click to rename',
        square: 'Click on canvas to place a square',
        circle: 'Click on canvas to place a circle',
        triangle: 'Click on canvas to place a triangle',
        group: 'Click and drag to draw a group area',
        paint: 'Click a shape or group to apply the selected color',
        'arrow-oneway': ui.arrowSource ? 'Click target node to complete arrow' : 'Click source node for one-way arrow',
        'arrow-twoway': ui.arrowSource ? 'Click target node to complete arrow' : 'Click source node for two-way arrow',
    };
    let msg = msgs[ui.tool] || '';
    if (ui.selected.length > 0) {
        if (ui.selected.length === 1) {
            const s = ui.selected[0];
            const name = s.type === 'node' ? (getNode(s.id)?.name || '(unnamed)')
                       : s.type === 'group' ? (getGroup(s.id)?.name || '(unnamed)')
                       : 'Arrow ' + s.id;
            msg += '  |  Selected: ' + name;
        } else {
            msg += '  |  Selected: ' + ui.selected.length + ' items';
        }
    }
    statusText.textContent = msg;
}

// ==================== FILE I/O ====================

function save() {
    const name = prompt('Flowchart name:', state.name || 'flowchart');
    if (!name) return;
    state.name = name;
    const data = JSON.stringify(state, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name + '.json';
    a.click();
    URL.revokeObjectURL(url);
}

function load() {
    const file = fileInput.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
        try {
            pushHistory();
            state = JSON.parse(reader.result);
            clearSelection();
            ui.arrowSource = null;
            render();
            updateStatus();
        } catch (err) {
            alert('Invalid file: ' + err.message);
        }
    };
    reader.readAsText(file);
    fileInput.value = '';
}

function nodeInGroup(node, group) {
    return node.x >= group.x && node.x <= group.x + group.width &&
           node.y >= group.y && node.y <= group.y + group.height;
}

function exportText() {
    const lines = [];

    // Build arrow lines
    function arrowLine(arrow) {
        const from = getNode(arrow.from);
        const to = getNode(arrow.to);
        if (!from || !to) return null;
        const fname = from.name || '(unnamed)';
        const tname = to.name || '(unnamed)';
        const arrowSym = arrow.direction === 'two-way' ? '<->' : '-->';
        let line;
        if (arrow.label) {
            line = `${fname} ${arrowSym} (${arrow.label}) ${arrowSym} ${tname}`;
        } else {
            line = `${fname} ${arrowSym} ${tname}`;
        }
        if (arrow.detail) {
            line += `\n    ${arrow.detail}`;
        }
        return line;
    }

    // Track which nodes/arrows are inside groups
    const groupedNodeIds = new Set();
    const groupedArrowIds = new Set();

    state.groups.forEach(group => {
        if (!group.name) return;
        const nodesInGroup = state.nodes.filter(n => nodeInGroup(n, group));
        const nodeIds = new Set(nodesInGroup.map(n => n.id));
        nodesInGroup.forEach(n => groupedNodeIds.add(n.id));

        // Arrows where both endpoints are in this group
        const arrowsInGroup = state.arrows.filter(a => nodeIds.has(a.from) && nodeIds.has(a.to));
        arrowsInGroup.forEach(a => groupedArrowIds.add(a.id));

        lines.push(`[${group.name}]:`);
        arrowsInGroup.forEach(a => {
            const line = arrowLine(a);
            if (line) lines.push(`  ${line}`);
        });

        // Isolated nodes in this group
        const connInGroup = new Set();
        arrowsInGroup.forEach(a => { connInGroup.add(a.from); connInGroup.add(a.to); });
        nodesInGroup.forEach(n => {
            if (!connInGroup.has(n.id) && n.name) {
                lines.push(`  [${n.name}]`);
            }
        });

        lines.push('');
    });

    // Ungrouped arrows
    state.arrows.forEach(arrow => {
        if (groupedArrowIds.has(arrow.id)) return;
        const line = arrowLine(arrow);
        if (line) lines.push(line);
    });

    // Isolated ungrouped nodes
    const connectedIds = new Set();
    state.arrows.forEach(a => { connectedIds.add(a.from); connectedIds.add(a.to); });
    state.nodes.forEach(n => {
        if (!connectedIds.has(n.id) && !groupedNodeIds.has(n.id) && n.name) {
            lines.push(`[${n.name}]`);
        }
    });

    const text = lines.join('\n');
    const blob = new Blob([text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const name = prompt('Flowchart name:', state.name || 'flowchart');
    if (!name) return;
    state.name = name;
    a.download = name + '.txt';
    a.click();
    URL.revokeObjectURL(url);
}

// ==================== PNG EXPORT ====================

function exportPNG() {

    // Calculate bounding box of all content
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

    state.nodes.forEach(n => {
        minX = Math.min(minX, n.x - n.width / 2);
        minY = Math.min(minY, n.y - n.height / 2);
        maxX = Math.max(maxX, n.x + n.width / 2);
        maxY = Math.max(maxY, n.y + n.height / 2);
    });
    state.groups.forEach(g => {
        minX = Math.min(minX, g.x);
        minY = Math.min(minY, g.y - 15); // account for label above
        maxX = Math.max(maxX, g.x + g.width);
        maxY = Math.max(maxY, g.y + g.height);
    });

    if (!isFinite(minX)) return; // nothing to export

    // Add padding
    const pad = 40;
    minX -= pad; minY -= pad;
    maxX += pad; maxY += pad;
    const w = maxX - minX;
    const h = maxY - minY;

    // Scale for high quality (2x)
    const scale = 2;

    // Clone the SVG with the correct viewBox
    const svgClone = svg.cloneNode(true);
    svgClone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    svgClone.setAttribute('viewBox', `${minX} ${minY} ${w} ${h}`);
    svgClone.setAttribute('width', w * scale);
    svgClone.setAttribute('height', h * scale);

    // Remove IDs to avoid conflicts
    svgClone.removeAttribute('id');
    svgClone.querySelectorAll('[id]').forEach(el => el.removeAttribute('id'));

    // Hardcoded styles for PNG export (avoids CORS issues with file://)
    const styleEl = document.createElementNS('http://www.w3.org/2000/svg', 'style');
    styleEl.textContent = `
        .node-label { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 16px; font-weight: 700; fill: #fff; text-anchor: middle; dominant-baseline: central; }
        .arrow-line { stroke: #6b7280; stroke-width: 2.5; fill: none; stroke-linecap: round; }
        .arrowhead { fill: #6b7280; }
        .arrow-hit { display: none; }
        .arrow-label { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 13px; font-weight: 600; fill: #374151; text-anchor: middle; paint-order: stroke; stroke: rgba(255,255,255,0.9); stroke-width: 5px; stroke-linecap: round; stroke-linejoin: round; }
        .group-rect { stroke-width: 2; stroke-dasharray: 8 4; }
        .group-label-text { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 12px; font-weight: 700; fill: #fff; text-transform: uppercase; letter-spacing: 0.5px; }
        .resize-handle { display: none; }
        .shape-preview { display: none; }
        .temp-line { display: none; }
    `;
    svgClone.insertBefore(styleEl, svgClone.firstChild);

    // Add background
    const bg = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    bg.setAttribute('x', minX);
    bg.setAttribute('y', minY);
    bg.setAttribute('width', w);
    bg.setAttribute('height', h);
    bg.setAttribute('fill', '#f0f2f5');
    const worldEl = svgClone.querySelector('g');
    svgClone.insertBefore(bg, worldEl || svgClone.firstChild);

    // Show SVG preview directly, convert to PNG on save
    const svgData = new XMLSerializer().serializeToString(svgClone);
    const svgDataUrl = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svgData);
    showPNGPreview(svgDataUrl, name, w, h, scale);
}

function showPNGPreview(svgDataUrl, name, w, h, scale) {
    const previewEl = document.getElementById('png-preview');
    const previewImg = document.getElementById('png-preview-img');
    const saveBtn = document.getElementById('png-preview-save');
    const cancelBtn = document.getElementById('png-preview-cancel');
    const nameInput = document.getElementById('png-name-input');

    previewImg.src = svgDataUrl;
    nameInput.value = state.name || 'flowchart';
    previewEl.style.display = 'flex';
    nameInput.focus();
    nameInput.select();

    function cleanup() {
        previewEl.style.display = 'none';
        previewImg.src = '';
        saveBtn.removeEventListener('click', doSave);
        cancelBtn.removeEventListener('click', doCancel);
        previewEl.removeEventListener('click', doBackdrop);
    }
    function doSave() {
        const fileName = nameInput.value.trim() || 'flowchart';
        state.name = fileName;
        // Convert SVG to PNG via canvas on save
        const img = new Image();
        img.onload = () => {
            const cvs = document.createElement('canvas');
            cvs.width = w * scale;
            cvs.height = h * scale;
            const ctx = cvs.getContext('2d');
            ctx.fillStyle = '#f0f2f5';
            ctx.fillRect(0, 0, cvs.width, cvs.height);
            ctx.drawImage(img, 0, 0);
            try {
                const pngUrl = cvs.toDataURL('image/png');
                const a = document.createElement('a');
                a.href = pngUrl;
                a.download = fileName + '.png';
                a.click();
            } catch(e) {
                // Tainted canvas fallback — save as SVG
                const a = document.createElement('a');
                a.href = svgDataUrl;
                a.download = fileName + '.svg';
                a.click();
            }
            cleanup();
        };
        img.onerror = () => {
            // Image load failed — save SVG directly
            const a = document.createElement('a');
            a.href = svgDataUrl;
            a.download = fileName + '.svg';
            a.click();
            cleanup();
        };
        img.src = svgDataUrl;
    }
    function doCancel() { cleanup(); }
    function doBackdrop(e) { if (e.target === previewEl) cleanup(); }

    saveBtn.addEventListener('click', doSave);
    cancelBtn.addEventListener('click', doCancel);
    previewEl.addEventListener('click', doBackdrop);
}

// ==================== START ====================

init();
render();

// Auto-load from URL parameter: ?load=path/to/file.json
const urlParams = new URLSearchParams(window.location.search);
const loadPath = urlParams.get('load');
if (loadPath) {
    fetch(loadPath)
        .then(r => { if (!r.ok) throw new Error(r.status); return r.json(); })
        .then(data => {
            state = data;
            clearSelection();
            ui.arrowSource = null;
            render();
            updateStatus();
        })
        .catch(err => console.warn('Could not auto-load:', err));
}

})();
