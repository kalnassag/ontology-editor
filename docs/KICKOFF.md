# Claude Code Kickoff Prompt

## Getting Started

Paste this into Claude Code after opening the `ontology-editor` project directory:

---

```
Read CLAUDE.md thoroughly — it's the complete specification for this project. Then read README.md for current implementation status and suggested build order.

The project scaffold is in place: types, store skeleton, persistence layer, validation, URI utils, Tailwind config, and a sample .ttl file for testing. The Turtle parser and serializer are stubs. The React components are minimal shells.

Follow the build order in the README:

1. Implement the Turtle parser in src/lib/turtle-parser.ts (parseTurtle + buildModelFromTriples). This is the most critical module. Use a character-level tokenizer — not regex splitting. Test it against docs/sample.ttl.

2. Implement the Turtle serializer in src/lib/turtle-serializer.ts (serializeToTurtle). Verify round-trip: parse sample.ttl → build model → serialize → the output should be semantically equivalent.

3. Wire up store.importOntology to use parseTurtle + buildModelFromTriples, and store.exportTurtle to use serializeToTurtle.

4. Build the LabelEditor component — a reusable widget for editing multilingual rdfs:label and rdfs:comment values. Each entry has a text input + language tag selector. Support add/remove entries.

5. Build ClassCard — the core visual component. An expandable card showing a class's labels, URI, and all properties nested beneath it (grouped by type: Object, Datatype, Annotation). Use the property type colour coding from tailwind.config.js (blue/green/amber).

6. Build PropertyRow — renders a single property inside a ClassCard. Shows type badge, primary label, range, and description inline. Clicking expands to full edit view.

7. Build ClassForm and PropertyForm — inline forms for creating/editing. ClassForm: local name, labels, descriptions, subClassOf picker. PropertyForm: local name, type selector, labels, descriptions, range picker (class dropdown for ObjectProperty, XSD dropdown for DatatypeProperty, free text for AnnotationProperty), domain (pre-set when created from within a ClassCard).

8. Build OntologyList sidebar — list saved ontologies, create new, import .ttl file, delete. Wire up to store actions.

9. Build ImportExport controls — file input for .ttl import, download button for export.

10. Add the UnassignedProperties section below the class list for properties with no domain.

After each step, run `npm run dev` and verify it works in the browser. Use docs/sample.ttl as your test fixture throughout — import it and confirm classes show with their nested properties.

Start with step 1 now.
```

---

## Session Continuation Prompts

Use these when returning to the project after a break:

### Check status
```
Read CLAUDE.md and README.md, then check the current implementation status of each module. List what's done, what's stubbed, and what's missing.
```

### Continue building
```
Read CLAUDE.md, check what's been implemented so far, identify the next unfinished item from the build order in README.md, and continue from there.
```

### Fix a specific issue
```
Read CLAUDE.md for context. I'm seeing [describe the issue]. Diagnose and fix it.
```

### Add a feature
```
Read CLAUDE.md for the project spec. I want to add [feature]. Check how it fits with the existing architecture and implement it.
```

### Test round-trip
```
Import docs/sample.ttl, then export to Turtle. Compare the output with the original — the semantic content (classes, properties, labels, domains, ranges) should be equivalent even if formatting differs. Fix any discrepancies.
```
