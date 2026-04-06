# Ontology Editor — Claude Code Guide

## Project Overview

A browser-based OWL 2 ontology editor built for knowledge engineers who are frustrated
by tools that flatten property–class relationships into disconnected lists. The core
design principle: **every class visually displays the properties it is the domain of,
nested directly beneath it.** This is the thing that Protégé, WebVOWL, and PoolParty
all get wrong.

This is a serious professional tool for people who work with OWL 2 daily. It is not a
teaching tool or a toy. Assume the user understands OWL 2, RDF, RDFS, SKOS, and SPARQL.

## Tech Stack

- **Framework:** React 18+ with TypeScript
- **Build:** Vite
- **Styling:** Tailwind CSS 3
- **State:** Zustand (lightweight, no boilerplate)
- **Persistence:** IndexedDB via `idb` (for multi-ontology storage across sessions)
- **Turtle parsing:** Custom parser in `src/lib/turtle-parser.ts`
- **Turtle serialization:** Custom serializer in `src/lib/turtle-serializer.ts`
- **Icons:** Lucide React
- **No backend.** This is a fully client-side application.

## Domain Model

### Core Entities

**Ontology** — a named, versioned container. Has:
- Base URI (namespace)
- Prefix map (prefix → URI)
- owl:Ontology metadata (label, comment, versionIRI)
- A set of Classes and Properties

**Class** (`owl:Class`) — Has:
- URI (derived from base URI + local name)
- Labels (`rdfs:label`) — multilingual, each with value + language tag
- Descriptions (`rdfs:comment`) — multilingual, same structure
- `rdfs:subClassOf` — zero or more parent classes (from within the same ontology)
- **Visually displays all properties where this class is the `rdfs:domain`**

**Property** — one of three OWL types:
- `owl:ObjectProperty` — range is a class URI
- `owl:DatatypeProperty` — range is an XSD datatype
- `owl:AnnotationProperty` — range is unconstrained (often a literal or URI)

Each property has:
- URI (derived from base URI + local name)
- Property type (one of the three above)
- Labels (`rdfs:label`) — multilingual
- Descriptions (`rdfs:comment`) — multilingual
- `rdfs:domain` — exactly one class (the class it "belongs to" visually)
- `rdfs:range` — a class URI, XSD type, or empty depending on property type
- `rdfs:subPropertyOf` — zero or more parent properties

### Key Design Decisions

1. **Domain is required for visual nesting.** Every property MUST have a domain to
   appear nested under a class. Properties without a domain go into an "Unassigned
   Properties" bucket and the UI should make this visible.

2. **Multiple labels/descriptions per language.** This is standard RDF practice.
   The UI must allow adding/removing language-tagged literals for labels and comments.

3. **URI construction.** Local names are derived from the label by default (camelCase
   for properties, PascalCase for classes) but are always editable. The full URI is
   `{baseURI}{localName}`.

4. **No blank nodes in the model.** Keep it clean. Restrictions and complex class
   expressions are out of scope for v1.

## Architecture

```
src/
  components/
    App.tsx                 — Root layout, sidebar + main panel
    OntologyList.tsx        — Sidebar: list of saved ontologies, create/import
    OntologyMeta.tsx        — Edit ontology metadata (URI, prefixes, label)
    ClassCard.tsx           — Expandable card for a single class
    PropertyRow.tsx         — Single property nested inside a ClassCard
    PropertyForm.tsx        — Modal/inline form for creating/editing a property
    ClassForm.tsx           — Modal/inline form for creating/editing a class
    LabelEditor.tsx         — Reusable widget for multilingual label/description editing
    PrefixEditor.tsx        — Table for editing prefix mappings
    UnassignedProperties.tsx — Bucket for domain-less properties
    ImportExport.tsx        — TTL import/export controls
    Toast.tsx               — Notification component
  lib/
    turtle-parser.ts        — Turtle → triples → internal model
    turtle-serializer.ts    — Internal model → valid Turtle
    store.ts                — Zustand store: ontology state + actions
    persistence.ts          — IndexedDB read/write via idb
    uri-utils.ts            — URI compaction, expansion, local name extraction
    validation.ts           — Model validation (duplicate URIs, missing domains, etc.)
  types/
    index.ts                — TypeScript interfaces for the domain model
  main.tsx                  — Vite entry point
  index.css                 — Tailwind imports + custom styles
```

## Feature Requirements (Priority Order)

### P0 — Must Have

1. **Create new ontology from scratch**
   - Set base URI, ontology label, default language
   - Manage prefix map (add/remove/edit)
   - Auto-generates standard prefixes (owl, rdf, rdfs, xsd, skos, dcterms)

2. **Import existing ontology from .ttl file**
   - Parse Turtle into internal model
   - Handle: prefixed names, `a` shorthand, language-tagged literals, datatype literals,
     `;` and `,` shorthand, multi-line strings, comments
   - Gracefully handle parse errors with line-level feedback

3. **Visual class list with nested properties**
   - Each class renders as an expandable card
   - Properties where `rdfs:domain` = this class appear nested beneath it
   - Properties grouped by type (Object, Datatype, Annotation)
   - Show property type icon, label, range, and description inline
   - Expand a property to see full details / edit

4. **Create/edit classes**
   - Set local name (auto-derived from label, editable)
   - Add multilingual labels and descriptions
   - Set subClassOf from dropdown of existing classes

5. **Create/edit properties within a class context**
   - When creating a property from inside a ClassCard, domain is pre-set to that class
   - Choose property type (Object, Datatype, Annotation)
   - Set local name, multilingual labels, descriptions
   - Set range: class picker for ObjectProperty, XSD type picker for DatatypeProperty,
     free text/URI for AnnotationProperty
   - Set subPropertyOf from dropdown of existing properties of same type

6. **Export to .ttl**
   - Serialize entire ontology to valid Turtle
   - Proper prefix declarations, grouped by type, human-readable formatting
   - Download as file

7. **Persist across sessions**
   - Save to IndexedDB automatically on change (debounced)
   - List saved ontologies on sidebar, switch between them
   - Delete ontologies

### P1 — Should Have

8. **Unassigned properties bucket**
   - Show properties with no domain in a separate section
   - Allow dragging them into a class to assign domain

9. **Validation panel**
   - Flag: classes with no labels, properties with no domain, duplicate URIs,
     object properties with non-class ranges, datatype properties with non-XSD ranges

10. **Search/filter**
    - Filter classes and properties by label text
    - Highlight matches

11. **Undo/redo**
    - Track state history, allow stepping back

### P2 — Nice to Have

12. **Class hierarchy tree view**
    - Render subClassOf as a collapsible tree in the sidebar

13. **Drag-and-drop reordering of properties within a class**

14. **Dark mode**

15. **Keyboard shortcuts**
    - `Ctrl+N` new class, `Ctrl+Shift+N` new property, `Ctrl+S` export, `Ctrl+Z` undo

## Turtle Parser Requirements

The parser in `src/lib/turtle-parser.ts` must handle:

- `@prefix` and `PREFIX` (SPARQL-style) declarations
- `@base` and `BASE` declarations
- The `a` shorthand for `rdf:type`
- Prefixed names (`ex:Thing`, `:localName`)
- Full URIs (`<http://example.org/Thing>`)
- String literals with language tags (`"label"@en`)
- String literals with datatype (`"42"^^xsd:integer`)
- Triple-quoted strings (`"""..."""`)
- Predicate-object list shorthand (`;`)
- Object list shorthand (`,`)
- Comments (`# ...`)
- Blank lines and arbitrary whitespace

It does NOT need to handle (v1):
- Blank node syntax (`[ ]` or `_:`)
- Collections (`( )`)
- Numeric/boolean shorthand literals (`42`, `true`)

Return structured triples with proper literal metadata (value, language, datatype).

## Turtle Serializer Requirements

The serializer in `src/lib/turtle-serializer.ts` must produce:

- Properly formatted `@prefix` declarations
- `owl:Ontology` declaration block
- Classes grouped under a `# Classes` comment header
- Properties grouped under `# Object Properties`, `# Datatype Properties`,
  `# Annotation Properties` comment headers
- Predicate-object list shorthand (`;`) within each resource block
- Language-tagged and datatype literals where appropriate
- Compact URIs using the prefix map wherever possible
- Clean, human-readable indentation (4-space indent for continuation lines)

## UI/UX Principles

- **Information density over whitespace.** This is a power-user tool. Don't waste
  screen real estate on padding and margins. Think VS Code, not Notion.
- **Keyboard navigable.** Tab through fields, Enter to confirm, Escape to cancel.
- **Inline editing preferred.** Minimise modals. Expand-in-place is better.
- **Colour-code property types.** Use consistent, distinguishable colours for
  Object (blue), Datatype (green), Annotation (amber) across the entire UI.
- **Show URIs on demand.** Default to showing labels; show full URI on hover or
  in an expanded detail view.
- **Error states are visible.** Validation issues surface inline, not in a hidden panel.

## Coding Standards

- TypeScript strict mode. No `any` unless absolutely unavoidable (and commented why).
- Components are functional with hooks. No class components.
- One component per file. Keep files under 300 lines; extract when they grow.
- All state mutations go through the Zustand store. No local component state for
  domain data (local UI state like "is this panel expanded" is fine).
- Name files in PascalCase for components, kebab-case for lib modules.
- Use descriptive variable names. `cls` not `c`, `property` not `p`.
- Handle edge cases: empty strings, missing fields, duplicate URIs.

## Common Pitfalls to Avoid

1. **Don't flatten multilingual labels.** Every label is a `{value, lang}` pair.
   A class can have `"Dog"@en` and `"Hund"@de` simultaneously.
2. **Don't confuse URI with local name.** The URI is `{baseURI}{localName}`.
   Display the local name in the UI; use the full URI in serialization.
3. **Don't lose unrecognised triples on round-trip.** If the parser encounters
   triples it doesn't map to the model (e.g., `owl:disjointWith`), store them
   in a `unmappedTriples` array and re-serialize them verbatim on export.
4. **Don't auto-assign language tags.** PoolParty's blanket `@en` tagging is
   a known antipattern. Only tag with a language when the user explicitly sets one.
5. **Prefix collisions.** When importing, merge prefixes with existing ones.
   Flag conflicts (same prefix, different URI) to the user.
