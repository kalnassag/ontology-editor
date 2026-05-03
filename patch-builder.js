import fs from 'fs';
import path from 'path';

const parserPath = path.join(process.cwd(), 'src/lib/turtle-parser.ts');
let code = fs.readFileSync(parserPath, 'utf8');

// 1. Add equivalentClass to P
code = code.replace(
  /subPropertyOf:\s*RDFS \+ "subPropertyOf",/,
  `subPropertyOf:    RDFS + "subPropertyOf",\n  equivalentClass:  OWL + "equivalentClass",`
);

// 2. Add imports for OntologyRestriction
code = code.replace(
  /ExtraTriple } from "\.\.\/types";/,
  `ExtraTriple, OntologyRestriction } from "../types";`
);

// 3. Find buildModelFromTriples definition to insert restriction parsing
const bmtRegex = /export function buildModelFromTriples\(parsed: ParseResult\): Ontology \{[\s\S]*?\/\/ ── Step 1: initial scan ──────────────────────────────────────────/;

const restrictionLogic = `export function buildModelFromTriples(parsed: ParseResult): Ontology {
  const { prefixes, triples } = parsed;
  let ontologyUri = "";
  let ontologyLabel = "";
  let ontologyComment = "";

  // ── Step 0: Extract Restrictions ─────────────────────────────────────────
  const mappedTripleSet = new Set<number>();
  const restrictionNodes = new Map<string, Partial<OntologyRestriction>>();
  const restrictionsByBNode = new Map<string, OntologyRestriction>();

  // Find Restriction nodes
  triples.forEach((t, idx) => {
    if (t.p === P.type && t.o === OWL + "Restriction") {
      restrictionNodes.set(t.s, {});
      mappedTripleSet.add(idx);
    }
  });

  // Extract restriction properties
  triples.forEach((t, idx) => {
    const r = restrictionNodes.get(t.s);
    if (r) {
      if (t.p === OWL + "onProperty") { r.propertyUri = t.o; mappedTripleSet.add(idx); }
      else if (t.p === OWL + "someValuesFrom") { r.type = "someValuesFrom"; r.value = t.o; mappedTripleSet.add(idx); }
      else if (t.p === OWL + "allValuesFrom") { r.type = "allValuesFrom"; r.value = t.o; mappedTripleSet.add(idx); }
      else if (t.p === OWL + "hasValue") { r.type = "hasValue"; r.value = t.o; mappedTripleSet.add(idx); }
      else if (t.p === P.minCardinality) { r.type = "minCardinality"; r.value = t.o; mappedTripleSet.add(idx); }
      else if (t.p === P.maxCardinality) { r.type = "maxCardinality"; r.value = t.o; mappedTripleSet.add(idx); }
      else if (t.p === OWL + "exactCardinality") { r.type = "exactCardinality"; r.value = t.o; mappedTripleSet.add(idx); }
    }
  });

  for (const [id, r] of restrictionNodes.entries()) {
    if (r.propertyUri && r.type && r.value) {
      restrictionsByBNode.set(id, r as OntologyRestriction);
    }
  }

  // ── Step 1: initial scan ──────────────────────────────────────────`;

code = code.replace(bmtRegex, restrictionLogic);

// 4. Update the main mapping loop (Step 4) to handle restrictions and equivalentClass
const classMappingRegex = /\} else if \(t\.p === P\.subClassOf && !t\.isLiteral\) \{\s+if \(!cls\.subClassOf\.includes\(t\.o\)\) cls\.subClassOf\.push\(t\.o\);\s+\} else if \(t\.p === P\.disjointWith && !t\.isLiteral\) \{/;

const newClassMapping = `} else if (t.p === P.subClassOf && !t.isLiteral) {
        if (restrictionsByBNode.has(t.o)) {
          cls.restrictions.push(restrictionsByBNode.get(t.o)!);
          mappedTripleSet.add(idx); // The link to the restriction is mapped
        } else if (!cls.subClassOf.includes(t.o)) {
          cls.subClassOf.push(t.o);
        }
      } else if (t.p === P.equivalentClass && !t.isLiteral) {
        if (restrictionsByBNode.has(t.o)) {
          cls.restrictions.push(restrictionsByBNode.get(t.o)!);
          mappedTripleSet.add(idx);
        } else {
          cls.extraTriples.push({ predicate: t.p, object: t.o, isLiteral: false });
        }
      } else if (t.p === P.disjointWith && !t.isLiteral) {`;

code = code.replace(classMappingRegex, newClassMapping);

// Remove "const mappedTripleSet = new Set<number>();" from Step 4 since we declared it at Step 0
code = code.replace(/const mappedTripleSet = new Set<number>\(\);\n/, '');

fs.writeFileSync(parserPath, code);
console.log("Patched parser logic for restrictions.");
