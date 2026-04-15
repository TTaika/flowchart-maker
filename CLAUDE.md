# Flowchart Maker

Web-based flowchart creation tool. No build step — open `index.html` in a browser.

## Files

- `index.html` — Main page with toolbar and SVG canvas
- `style.css` — All styling (dark toolbar, light canvas)
- `app.js` — All application logic (single IIFE, no dependencies)

## Architecture

- SVG-based canvas with full re-render on state change
- State: `{ nodes, arrows, groups, nextId, name }`
- UI state (selection, tool, drag, pan) kept separate from data state
- Undo via history stack of deep-cloned states (50 levels)
- Manual double-click detection (native dblclick breaks due to re-render between clicks — must use `e.preventDefault()` to stop blur)

## Tools & Shortcuts

- V: Select — click to select, drag to move, double-click to rename
- R: Square, C: Circle, T: Triangle — click to place, editor opens immediately
- G: Group — click-and-drag to draw container area
- A: One-way arrow, D: Two-way arrow — click source then target
- P: Paint — click shapes/groups to apply selected color
- Left click places, right click returns to select tool
- Tools stay active after placing (no auto-switch to select)

## Export Format

Minimal text for Claude consumption:
```
NodeA --> (label) --> NodeB
NodeC <-> (label) <-> NodeD
[GroupName]:
  NodeE --> NodeF
```

## Key Behaviors

- Shapes have no default name — empty if user doesn't type anything
- Only one arrow allowed between any two shapes (opposite direction merges to two-way)
- Arrows snap to shape edges with 8px gap, line ends at arrowhead base (no overlap)
- Groups are visual containers; export lists contained nodes under group header
- Pan: right-drag (select mode), left-drag on empty canvas, middle-drag, space+left-drag
- Save/Export prompts for flowchart name
