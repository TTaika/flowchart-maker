# Flowchart Generator

Generate a flowchart for the Flowchart Maker app at `C:\Users\eemil\aikansio\flowchart\`.

## User's request

$ARGUMENTS

## Instructions

Generate a valid flowchart JSON file based on the user's description. The file format is:

```json
{
  "nodes": [
    { "id": 1, "type": "square|circle|triangle", "name": "Node Name", "color": "#hex", "x": 200, "y": 200, "width": 120, "height": 110 }
  ],
  "arrows": [
    { "id": 100, "from": 1, "to": 2, "direction": "one-way|two-way", "label": "short header", "detail": "longer explanation of what flows here" }
  ],
  "groups": [
    { "id": 200, "name": "Group Name", "x": 50, "y": 50, "width": 400, "height": 300, "color": "#hex" }
  ],
  "nextId": 201,
  "name": "flowchart-name"
}
```

## Generation Process

**Think before you place.** Follow these phases in order:

### Phase 1: Plan (no JSON yet)

Before placing any nodes, write out:
1. **List all nodes** — name, type (square/circle/triangle), which group they belong to (if any)
2. **List all arrows** — from → to, direction, label, detail
3. **List all groups** — name, which nodes are inside it
4. **Identify entry and exit points** — where does the data flow start and end?
5. **Identify the primary flow direction** — top→bottom or left→right?

### Phase 2: Place nodes and arrows

Use a **grid of 60px** as your spacing unit. All node positions should be multiples of 60.

**Placement algorithm:**
1. Start from one end of the flow (either entry point or final output — whichever feels most natural)
2. Place that first node at a starting position (e.g. `x: 120, y: 120`)
3. For each neighbor connected to an already-placed node:
   - Place it **at least 4 grid lengths (240px)** from the nearest edge of any neighboring node
   - Keep connected nodes close together
   - Align it so arrows flow naturally (next node in flow goes right/down)
4. **No node should be closer than 4 grid lengths (240px)** edge-to-edge from any other node
5. Trace every arrow path — if two arrows would cross, reposition nodes until they don't

**After all nodes are placed:** double-check arrows don't cross. If they do, swap node positions.

### Phase 3: Place groups (AFTER all nodes are final)

For each group:
1. Find the bounding box of all nodes that belong to it (min/max x and y of the nodes' edges)
2. Expand the bounding box by **at least 1 grid length (60px) on every side**
3. This gives the group a padding buffer from:
   - The nodes inside it
   - Other groups nearby
   - Ungrouped nodes nearby
4. If two groups would overlap or touch, reposition nodes in Phase 2 to give them room

### Node shapes and colors

- **Shapes**: `square` for processes/services, `circle` for data stores/databases, `triangle` for outputs/endpoints.
- **Colors**: `#4a7fd9` (blue), `#e74c3c` (red), `#27ae60` (green), `#f39c12` (yellow), `#8e44ad` (purple), `#1abc9c` (teal), `#e67e22` (orange), `#2c3e50` (dark). Use different colors for different types of components.
- **Default sizes**: Squares `110x110`, circles `100x80`, triangles `130x100`. Adjust wider if the name is long.

### Arrow rules

- `direction` is `"one-way"` or `"two-way"`. Only one arrow between any two nodes — use two-way if data flows both directions.
- `label` is a short header (always visible).
- `detail` is a longer explanation shown on hover — **include file paths, function names, and data shapes**.

### Arrow detail format

Each arrow detail should be a single line with file paths and function signatures, separated by `|`:
```
source/file.py → target/file.py | function_a() → function_b() | DataTypeIn → DataTypeOut
```

**Scaling rules based on project size:**
- **Small projects** (<15 nodes): include file paths + function names + data shapes
- **Large projects** (15+ nodes): include file paths only, skip function signatures unless the connection is non-obvious
- **Always**: keep each detail to 1 line max

**Token budget for the .txt export:**
- Small projects: ~800 tokens target
- Large projects: ~1500 tokens target
- Never exceed ~3000 tokens regardless of project size

### IDs

All ids across nodes, arrows, and groups must be unique. Set `nextId` to max id + 1.

### Export format

The export `.txt` is a lightweight version for Claude to quickly understand the architecture without spending tokens on positions/colors. Generate it from the JSON:

```
[GroupName]:
  NodeA --> (label) --> NodeB
    source/file.py → target/file.py | func_a() → func_b() | TypeIn → TypeOut
  NodeC <-> (label) <-> NodeD
    file.py ↔ other.py | read_data() ↔ write_data()

NodeE --> (label) --> NodeF
  api/routes.py → core/engine.py | handle_request() → process()
```

Rules for export:
- Arrows inside a group (both endpoints inside) are indented under the group header
- Arrows crossing groups or ungrouped are at the top level
- Detail line: `file_path → file_path | function() → function() | DataType → DataType`
- For large projects (15+ nodes), omit function names and data types — file paths only
- Unnamed nodes are skipped, unnamed arrows have no `(label)` part

## Steps

1. **Plan** (Phase 1): Write out all nodes, arrows, groups, and the flow direction.
2. **Place nodes and arrows** (Phase 2): Build outward from one end of the flow. 4+ grid lengths (240px) between all nodes. No arrow crossings.
3. **Place groups** (Phase 3): Compute bounding box of member nodes, expand by 1+ grid length (60px) on every side.
4. **Generate the `.txt` export** from the JSON.
5. Save BOTH files to the **project folder**:
   - `<project>/flowchart.json` — full save file (user opens in Flowchart Maker to view/edit)
   - `<project>/flowchart.txt` — export file (Claude reads to understand architecture)
6. Also copy the JSON to `C:\Users\eemil\aikansio\flowchart\generated\<name>.json` for auto-loading.
7. Open it in the browser: `start "" "http://localhost:8765?load=generated/<name>.json"`
8. If the server isn't running, start it first: `cd "C:/Users/eemil/aikansio/flowchart" && py -3.13 -m http.server 8765 &` (run in background), then open the URL.

## Updating existing flowcharts

If the project already has a `flowchart.json`, read it first. Update it to reflect changes rather than regenerating from scratch — this preserves the user's layout adjustments. After updating:
- Regenerate the `.txt` export
- Copy updated JSON to the generated folder
- Open in browser so user can see changes
