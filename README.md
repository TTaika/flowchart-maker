# Flowchart Maker

A lightweight web-based flowchart editor designed for **AI-assisted development workflows**. Create architecture diagrams that Claude can both generate and consume efficiently.

## Quick Start

Open `index.html` in any browser. No build step, no server, no dependencies.

## What Makes This Different

| Feature | This Tool | draw.io | Excalidraw | Mermaid |
|---------|-----------|---------|------------|---------|
| AI-readable export (.txt) | Yes (~400 tokens) | No (XML) | No (complex JSON) | Partial |
| AI can generate files | Yes (simple JSON) | Yes (verbose XML) | Yes (complex JSON) | Yes (DSL) |
| Claude Code `/flowchart` skill | Yes | No | No | No |
| Arrow detail tooltips | Yes | No | No | No |
| Project-folder workflow | Yes | No | No | No |
| Zero dependencies | Yes | No (React) | No (React) | Partial |

## Features

- **Shapes**: Square, Circle, Triangle — click to place, type to name
- **Arrows**: One-way and two-way with curved bezier paths, obstacle avoidance
- **Labels**: Header (always visible) + detail text (shown on hover)
- **Groups**: Visual containers for organizing related components
- **Colors**: 8-color palette with paint tool
- **Resize**: Drag corner handles on shapes and groups
- **Multi-select**: Shift+click or Ctrl+drag box select
- **Copy/paste**: Ctrl+C/V with connected arrows preserved
- **Undo/Redo**: Ctrl+Z / Ctrl+Y (50 levels)
- **Pan**: Right-drag, left-drag empty canvas, middle-drag, Space+drag
- **Zoom**: Mouse wheel (centered on cursor), F key to fit all
- **Save**: JSON file with full state (positions, colors, sizes)
- **Export**: Minimal .txt for AI consumption (names, arrows, labels only)
- **PNG**: Preview and save with 2x resolution

## Claude Code Skill

The `/flowchart` command lets Claude analyze a project and generate an architecture diagram automatically.

### Install

Copy `skill/flowchart.md` to your Claude Code commands folder:

```bash
# macOS/Linux
cp skill/flowchart.md ~/.claude/commands/flowchart.md

# Windows
copy skill\flowchart.md %USERPROFILE%\.claude\commands\flowchart.md
```

Restart Claude Code.

### Usage

```
/flowchart the login system architecture
/flowchart make a flowchart of project "C:\path\to\project"
```

Claude will:
1. Explore the codebase
2. Generate a visual flowchart (JSON) and a token-efficient export (TXT)
3. Save both to the project folder
4. Open the flowchart in the browser

### Project Workflow

Each project gets two files:
- `flowchart.json` — full visual file, open in the app to view/edit
- `flowchart.txt` — lightweight export, Claude reads this to understand architecture

The export includes file paths, function signatures, and data shapes:
```
[Core Logic]:
  Scraper Manager --> (Raw events) --> Event Matcher
    scraper/manager.py → scraper/matcher.py | run_all() → match_events() | List[RawEvent] → Dict[key, MatchedEvent]
```

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| V | Select tool |
| R | Square |
| C | Circle |
| T | Triangle |
| G | Group |
| A | One-way arrow |
| D | Two-way arrow |
| P | Paint |
| F | Zoom to fit |
| Delete | Delete selected |
| Ctrl+Z | Undo |
| Ctrl+Y | Redo |
| Ctrl+C | Copy |
| Ctrl+V | Paste |
| Ctrl+A | Select all |
| Ctrl+S | Save |
| Escape | Deselect / cancel |
| Right-click | Back to select (from any tool) |
| Ctrl+drag | Box select |

## File Format

The save file is simple flat JSON:

```json
{
  "nodes": [{ "id": 1, "type": "square", "name": "API", "color": "#4a7fd9", "x": 200, "y": 200, "width": 110, "height": 110 }],
  "arrows": [{ "id": 2, "from": 1, "to": 3, "direction": "one-way", "label": "REST", "detail": "api.py → db.py | fetch() → query()" }],
  "groups": [{ "id": 4, "name": "Backend", "x": 100, "y": 100, "width": 400, "height": 300, "color": "#27ae60" }],
  "nextId": 5
}
```

## License

MIT
