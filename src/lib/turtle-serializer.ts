/**
 * Serializes an Ontology to valid Turtle (.ttl) format.
 */

import type { Ontology, OntologyClass, OntologyProperty, LangString, Individual } from "../types";
import { compact, STANDARD_PREFIXES } from "./uri-utils";

export function serializeToTurtle(ontology: Ontology): string {
  const lines: string[] = [];
  const prefixes = { ...STANDARD_PREFIXES, ...ontology.metadata.prefixes };

  // Compact a URI using the merged prefix map
  const c = (uri: string): string => compact(uri, prefixes);

  // Escape a string literal value
  const escLit = (value: string): string =>
    value
      .replace(/\\/g, "\\\\")
      .replace(/"/g, '\\"')
      .replace(/\n/g, "\\n")
      .replace(/\r/g, "\\r")
      .replace(/\t/g, "\\t");

  // Serialize a language-tagged literal
  const langLit = (ls: LangString): string =>
    ls.lang
      ? `"${escLit(ls.value)}"@${ls.lang}`
      : `"${escLit(ls.value)}"`;

  // Serialize a typed literal (for datatype properties — used in unmapped triples)
  const typedLit = (value: string, datatype?: string, lang?: string): string => {
    if (lang) return `"${escLit(value)}"@${lang}`;
    if (datatype) return `"${escLit(value)}"^^${c(datatype)}`;
    return `"${escLit(value)}"`;
  };

  // Build predicate-object pairs for a subject block
  // Returns lines of the block (not including trailing " .")
  const buildBlock = (pairs: Array<[string, string]>): string[] => {
    if (pairs.length === 0) return [];
    const blockLines: string[] = [];
    blockLines.push(`${pairs[0]![0]} ${pairs[0]![1]}`);
    for (let i = 1; i < pairs.length; i++) {
      blockLines.push(`    ; ${pairs[i]![0]} ${pairs[i]![1]}`);
    }
    return blockLines;
  };

  // ── 1. @prefix declarations ─────────────────────────────────────────────
  for (const [prefix, uri] of Object.entries(prefixes).sort(([a], [b]) => a.localeCompare(b))) {
    lines.push(`@prefix ${prefix}: <${uri}> .`);
  }
  lines.push("");

  // ── 2. owl:Ontology declaration ─────────────────────────────────────────
  const { ontologyUri, ontologyLabel, ontologyComment } = ontology.metadata;
  if (ontologyUri) {
    const ontoPairs: Array<[string, string]> = [["a", "owl:Ontology"]];
    if (ontologyLabel) ontoPairs.push(["rdfs:label", `"${escLit(ontologyLabel)}"`]);
    if (ontologyComment) ontoPairs.push(["rdfs:comment", `"${escLit(ontologyComment)}"`]);
    const ontoBlock = buildBlock(ontoPairs);
    lines.push(`${c(ontologyUri)} ${ontoBlock[0]!}`);
    for (let i = 1; i < ontoBlock.length; i++) lines.push(ontoBlock[i]!);
    lines.push("    .");
    lines.push("");
  }

  // ── 3. Classes ────────────────────────────────────────────────────────────
  const sortedClasses = [...ontology.classes].sort((a, b) =>
    a.localName.localeCompare(b.localName)
  );

  if (sortedClasses.length > 0) {
    lines.push("# ── Classes ─────────────────────────────────────────────────────────────");
    lines.push("");
    for (const cls of sortedClasses) {
      serializeClass(cls);
    }
  }

  // ── 4. Properties (grouped by type) ───────────────────────────────────────
  const objProps = sortedProps("owl:ObjectProperty");
  const datProps = sortedProps("owl:DatatypeProperty");
  const annProps = sortedProps("owl:AnnotationProperty");

  if (objProps.length > 0) {
    lines.push("# ── Object Properties ───────────────────────────────────────────────────");
    lines.push("");
    for (const prop of objProps) serializeProperty(prop);
  }
  if (datProps.length > 0) {
    lines.push("# ── Datatype Properties ─────────────────────────────────────────────────");
    lines.push("");
    for (const prop of datProps) serializeProperty(prop);
  }
  if (annProps.length > 0) {
    lines.push("# ── Annotation Properties ───────────────────────────────────────────────");
    lines.push("");
    for (const prop of annProps) serializeProperty(prop);
  }

  // ── 5. Individuals ────────────────────────────────────────────────────────
  const sortedIndividuals = [...(ontology.individuals ?? [])].sort((a, b) =>
    a.localName.localeCompare(b.localName)
  );

  if (sortedIndividuals.length > 0) {
    lines.push("# ── Individuals ─────────────────────────────────────────────────────────");
    lines.push("");
    for (const ind of sortedIndividuals) {
      serializeIndividual(ind);
    }
  }

  // ── 6. Unmapped triples ───────────────────────────────────────────────────
  if (ontology.unmappedTriples.length > 0) {
    lines.push("# ── Preserved triples ────────────────────────────────────────────────────");
    lines.push("");
    for (const t of ontology.unmappedTriples) {
      const obj = t.isLiteral
        ? typedLit(t.object, t.datatype, t.lang)
        : c(t.object);
      lines.push(`${c(t.subject)} ${c(t.predicate)} ${obj} .`);
    }
    lines.push("");
  }

  return lines.join("\n");

  // ── Helpers ───────────────────────────────────────────────────────────────

  function serializeExtraTriples(extras: Array<{ predicate: string; object: string; isLiteral: boolean; lang?: string; datatype?: string }>, pairs: Array<[string, string]>) {
    for (const et of extras) {
      const obj = et.isLiteral
        ? typedLit(et.object, et.datatype, et.lang)
        : c(et.object);
      pairs.push([c(et.predicate), obj]);
    }
  }

  function serializeClass(cls: OntologyClass) {
    const pairs: Array<[string, string]> = [["a", "owl:Class"]];
    for (const lbl of cls.labels.filter((l) => l.value)) {
      pairs.push(["rdfs:label", langLit(lbl)]);
    }
    for (const desc of cls.descriptions.filter((d) => d.value)) {
      pairs.push(["rdfs:comment", langLit(desc)]);
    }
    for (const parentUri of cls.subClassOf) {
      pairs.push(["rdfs:subClassOf", c(parentUri)]);
    }
    serializeExtraTriples(cls.extraTriples ?? [], pairs);
    const block = buildBlock(pairs);
    lines.push(`${c(cls.uri)} ${block[0]!}`);
    for (let i = 1; i < block.length; i++) lines.push(block[i]!);
    lines.push("    .");
    lines.push("");
  }

  function serializeProperty(prop: OntologyProperty) {
    const typeUri =
      prop.type === "owl:ObjectProperty"
        ? "owl:ObjectProperty"
        : prop.type === "owl:DatatypeProperty"
        ? "owl:DatatypeProperty"
        : "owl:AnnotationProperty";
    const pairs: Array<[string, string]> = [["a", typeUri]];
    for (const lbl of prop.labels.filter((l) => l.value)) {
      pairs.push(["rdfs:label", langLit(lbl)]);
    }
    for (const desc of prop.descriptions.filter((d) => d.value)) {
      pairs.push(["rdfs:comment", langLit(desc)]);
    }
    if (prop.domainUri) pairs.push(["rdfs:domain", c(prop.domainUri)]);
    if (prop.range) pairs.push(["rdfs:range", c(prop.range)]);
    for (const parentUri of prop.subPropertyOf) {
      pairs.push(["rdfs:subPropertyOf", c(parentUri)]);
    }
    serializeExtraTriples(prop.extraTriples ?? [], pairs);
    const block = buildBlock(pairs);
    lines.push(`${c(prop.uri)} ${block[0]!}`);
    for (let i = 1; i < block.length; i++) lines.push(block[i]!);
    lines.push("    .");
    lines.push("");
  }

  function serializeIndividual(ind: Individual) {
    const pairs: Array<[string, string]> = [];
    // rdf:type assertions
    for (const typeUri of ind.typeUris) {
      pairs.push(["a", c(typeUri)]);
    }
    // Property values
    for (const pv of ind.propertyValues) {
      const pred = c(pv.propertyUri);
      const obj = pv.isLiteral
        ? typedLit(pv.value, pv.datatype, pv.lang)
        : c(pv.value);
      pairs.push([pred, obj]);
    }
    if (pairs.length === 0) return;
    const block = buildBlock(pairs);
    lines.push(`${c(ind.uri)} ${block[0]!}`);
    for (let i = 1; i < block.length; i++) lines.push(block[i]!);
    lines.push("    .");
    lines.push("");
  }

  function sortedProps(type: OntologyProperty["type"]): OntologyProperty[] {
    return ontology.properties
      .filter((p) => p.type === type)
      .sort((a, b) => a.localName.localeCompare(b.localName));
  }
}
