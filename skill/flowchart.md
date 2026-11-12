# Flowchart Generator

Generate a flowchart for the Flowchart Maker app located at `$FLOWCHART_APP_PATH` (default `~/flowchart-maker`; ask the user if neither exists).

## User's request

$ARGUMENTS

## Instructions

Generate a valid flowchart JSON file based on the user's description. The file format is:

```json
{
  "nodes": [
    { "id": 1, "type": "square|circle|triangle", "name": "Plain-language name", "color": "#hex", "x": 200, "y": 200, "width": 120, "height": 110 }
  ],
  "arrows": [
    { "id": 100, "from": 1, "to": 2, "direction": "one-way|two-way", "label": "short plain-English verb phrase", "detail": "plain sentence | technical line" }
  ],
  "groups": [
    { "id": 200, "name": "Group Name", "x": 50, "y": 50, "width": 400, "height": 300, "color": "#hex" },
    { "id": 201, "kind": "legend", "name": "Legend", "summary": "One or two plain sentences: what this chart shows and how to read it.",
      "entries": [ { "shape": "square", "color": "#4a7fd9", "meaning": "A step or service that does work" } ],
      "x": 0, "y": 0, "width": 420, "height": 300, "color": "#2c3e50" }
  ],
  "nextId": 202,
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
- Label and detail are written as described in "Writing for humans" below.

## Writing for humans (names, labels, details)

The chart is read by people first and by AI second. Write every visible text so someone who has never seen the code understands it.

**Node names** (always visible):
- Name nodes by what they DO or ARE in everyday words, 1-4 words: "Login Page", "User Database", "Send Welcome Email" — not `AuthMiddleware`, `userRepo.ts` or `svc_mailer`.
- No file names, class names, acronyms or jargon in the name. If an acronym is unavoidable, spell it out once in the legend.
- Processes start with a verb ("Check Password"); stores and outputs are nouns ("Order Database", "Confirmation Email").

**Arrow labels** (always visible):
- A short verb phrase of 1-4 words saying what happens or what moves: "sends order", "asks for data", "saves result". Never leave a label empty.

**Arrow details** (shown on hover, and kept in the AI export). Two parts on one line, separated by ` | `:
1. **Plain sentence first**: one sentence a non-programmer understands, saying what happens and why ("The page sends the typed username and password to the server so it can check them.").
2. **Technical line second**, so AI loses nothing: `source/file.py → target/file.py | function_a() → function_b() | DataTypeIn → DataTypeOut`

Example `detail`:
`The checkout page sends the shopping cart to the payment service to be charged. | web/checkout.ts → api/pay.py | submitCart() → charge() | Cart → Receipt`

**Node technical info**: names stay plain, so put the code location in the group name or in the arrow technical lines. For any node whose real code name matters, mention it in the technical line of its arrows.

**Scaling rules based on project size:**
- **Small projects** (<15 nodes): plain sentence + file paths + function names + data shapes
- **Large projects** (15+ nodes): plain sentence + file paths only, skip function signatures unless the connection is non-obvious
- **Always**: one line per detail, plain sentence under ~25 words

**Keep it scannable**: aim for 12 or fewer top-level nodes; merge small internals into one node and use groups for sections. Prefer left→right flow.

## Legend (REQUIRED)

Every chart you draw MUST include exactly one legend: a group with `"kind": "legend"`.
- `name`: "Legend" (or "How to read this chart").
- `summary`: 1-2 plain sentences on what the chart shows and where the flow starts and ends.
- `entries`: one per shape and color you ACTUALLY used (never list unused ones), as `{ "shape": "square|circle|triangle|arrow", "color": "#hex", "meaning": "plain-language meaning" }`. Add an `arrow` entry for one-way vs two-way arrows if both appear.
- Group colors used for sections may get an entry too (`"shape": "square"`, meaning "Section: ...").
- Size: width 420 (wider if meanings are long); height = 90 + 40 per entry + 20 per summary line (about 55 chars per line).
- Placement: below or to the left of the whole chart, at least 60px from every node and group, never overlapping anything. A legend contains no nodes.
- It is also exported to the `.txt` as a `LEGEND:` section, so the AI gets the same key.

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
    plain sentence | source/file.py → target/file.py | func_a() → func_b() | TypeIn → TypeOut
  NodeC <-> (label) <-> NodeD
    file.py ↔ other.py | read_data() ↔ write_data()

NodeE --> (label) --> NodeF
  plain sentence | api/routes.py → core/engine.py | handle_request() → process()

LEGEND - Legend:
  Summary sentence.
  square #4a7fd9: A step or service that does work
```

Rules for export:
- Arrows inside a group (both endpoints inside) are indented under the group header
- Arrows crossing groups or ungrouped are at the top level
- Detail line: `plain sentence | file_path → file_path | function() → function() | DataType → DataType`
- For large projects (15+ nodes), omit function names and data types — file paths only
- Unnamed nodes are skipped, unnamed arrows have no `(label)` part
- The legend is appended at the end as a `LEGEND:` section (summary, then one line per entry)

## Steps

1. **Plan** (Phase 1): Write out all nodes (plain-language names), arrows (verb-phrase labels), groups, the legend entries, and the flow direction.
2. **Place nodes and arrows** (Phase 2): Build outward from one end of the flow. 4+ grid lengths (240px) between all nodes. No arrow crossings.
3. **Place groups** (Phase 3): Compute bounding box of member nodes, expand by 1+ grid length (60px) on every side. Then add the required legend group clear of everything else.
4. **Generate the `.txt` export** from the JSON.
5. Save BOTH files to the **project folder**:
   - `<project>/flowchart.json` — full save file (user opens in Flowchart Maker to view/edit)
   - `<project>/flowchart.txt` — export file (Claude reads to understand architecture)
6. Also copy the JSON to `$FLOWCHART_APP_PATH/generated/<name>.json` for auto-loading.
7. Open it in the browser: `xdg-open "http://localhost:8765?load=generated/<name>.json"`
8. If the server isn't running, start it first: `cd "$FLOWCHART_APP_PATH" && python3 -m http.server 8765 &` (run in background), then open the URL.

## Updating existing flowcharts

If the project already has a `flowchart.json`, read it first. Update it to reflect changes rather than regenerating from scratch — this preserves the user's layout adjustments. After updating:
- Regenerate the `.txt` export
- Copy updated JSON to the generated folder
- Open in browser so user can see changes
