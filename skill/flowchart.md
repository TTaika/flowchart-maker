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

### Rules

- **IDs**: All ids across nodes, arrows, and groups must be unique. Set `nextId` to max id + 1.
- **Shapes**: Use `square` for processes/services, `circle` for data stores/databases, `triangle` for outputs/endpoints.
- **Colors**: Pick from: `#4a7fd9` (blue), `#e74c3c` (red), `#27ae60` (green), `#f39c12` (yellow), `#8e44ad` (purple), `#1abc9c` (teal), `#e67e22` (orange), `#2c3e50` (dark). Use different colors for different types of components.
- **Layout**: Space nodes ~200-250px apart. Use a left-to-right or top-to-bottom flow. Typical x range: 100-900, y range: 100-1200. Don't stack nodes on top of each other. Prioritize readability over compactness. **CRITICAL: Arrange nodes so that ZERO arrows cross each other.** Before finalizing, trace every arrow and verify no two arrows intersect. If they do, rearrange nodes until all crossings are eliminated. Place connected nodes close together — a node should be adjacent to its connections, not across the chart. Use a staircase/cascade layout for branching paths rather than putting things in rigid columns far apart.
- **Default sizes**: Squares `110x110`, circles `100x80`, triangles `130x100`. Adjust wider if the name is long.
- **Arrows**: `direction` is `"one-way"` or `"two-way"`. `label` is a short header (always visible). `detail` is a longer explanation (shown on hover) — **include file paths, function names, and data shapes** (see detail format below). Only one arrow between any two nodes — use two-way if data flows both directions.

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
- **Groups**: Use groups to visually contain related nodes. The group rect must be large enough to enclose its nodes (add ~50px padding around them).

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

### Steps

1. Analyze the user's description and identify nodes, connections, and groupings.
2. Generate the JSON with a sensible, spacious layout.
3. Generate the export `.txt` from the JSON.
4. Save BOTH files to the **project folder**:
   - `<project>/flowchart.json` — full save file (user opens in Flowchart Maker to view/edit)
   - `<project>/flowchart.txt` — export file (Claude reads to understand architecture)
5. Also copy the JSON to `C:\Users\eemil\aikansio\flowchart\generated\<name>.json` for auto-loading.
6. Open it in the browser: `start "" "http://localhost:8765?load=generated/<name>.json"`
7. If the server isn't running, start it first: `cd "C:/Users/eemil/aikansio/flowchart" && py -3.13 -m http.server 8765 &` (run in background), then open the URL.

### Updating existing flowcharts

If the project already has a `flowchart.json`, read it first. Update it to reflect changes rather than regenerating from scratch — this preserves the user's layout adjustments. After updating:
- Regenerate the `.txt` export
- Copy updated JSON to the generated folder
- Open in browser so user can see changes
