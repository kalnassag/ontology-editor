# Ontology Editor

A browser-based OWL 2 ontology editor that shows properties nested under
their domain classes — the way knowledge engineers actually think about them.

## Quick Start

```bash
npm install
npm run dev
```

Open [http://localhost:5173](http://localhost:5173).

## Project Structure

See `CLAUDE.md` for the full specification, architecture, and implementation
guide. That file is the primary reference for Claude Code when working on
this project.

### Key directories

```
src/
  components/   — React components (one per file)
  lib/          — Core logic (parser, serializer, store, utils)
  types/        — TypeScript interfaces
docs/           — Sample ontologies and reference material
```

### Implementation status

| Module                | Status         |
|-----------------------|----------------|
| Types                 | ✅ Complete     |
| URI utils             | ✅ Complete     |
| Persistence (IDB)     | ✅ Complete     |
| Validation            | ✅ Complete     |
| Zustand store         | ✅ Complete     |
| Turtle parser         | ✅ Complete     |
| Turtle serializer     | ✅ Complete     |
| App shell             | ✅ Complete     |
| ClassCard             | ✅ Complete     |
| PropertyRow           | ✅ Complete     |
| PropertyForm          | ✅ Complete     |
| ClassForm             | ✅ Complete     |
| LabelEditor           | ✅ Complete     |
| OntologyList          | ✅ Complete     |
| ImportExport          | ✅ Complete     |
| Graph Visualizations  | ✅ Complete     |
| Individual Handling   | ✅ Complete     |

### Suggested build order for Claude Code

1. **Turtle parser** — everything else depends on import working
2. **Turtle serializer** — needed for export and round-trip testing
3. **Wire up store.importOntology** and **store.exportTurtle**
4. **LabelEditor** — reused by every form
5. **ClassCard + PropertyRow** — the core visual components
6. **ClassForm + PropertyForm** — create/edit workflows
7. **OntologyList + sidebar** — multi-ontology management
8. **ImportExport controls** — file picker + download
9. **Validation panel** — surface issues inline
10. **Polish** — keyboard shortcuts, search, undo/redo

## Testing

Use the sample ontology in `docs/sample.ttl` to test import/export
round-tripping. After import and re-export, the semantic content should
be equivalent (triple-level, not character-level).
