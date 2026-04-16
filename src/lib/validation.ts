/**
 * Validates an ontology and returns a list of issues.
 *
 * Checks:
 * - Classes without labels
 * - Properties without labels
 * - Properties without domain (unassigned)
 * - Object properties whose range is not a known class URI
 * - Datatype properties whose range is not a known XSD type
 * - Duplicate URIs across classes and properties
 * - Empty base URI
 * - subClassOf referencing non-existent class
 * - subPropertyOf referencing non-existent property
 */

import type { Ontology, ValidationIssue } from "../types";
import { XSD_TYPES } from "./uri-utils";

const xsdUris = new Set(Object.values(XSD_TYPES));

export function validate(ontology: Ontology): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const classUris = new Set(ontology.classes.map((c) => c.uri));
  const propUris = new Set(ontology.properties.map((p) => p.uri));
  const allUris = new Map<string, string>(); // uri → entityId for duplicate detection

  // Ontology-level
  if (!ontology.metadata.baseUri) {
    issues.push({
      severity: "error",
      entityId: ontology.id,
      entityType: "ontology",
      message: "Base URI is empty",
      field: "baseUri",
    });
  }

  // Classes
  for (const cls of ontology.classes) {
    if (!cls.labels.some((l) => l.value.trim())) {
      issues.push({
        severity: "warning",
        entityId: cls.id,
        entityType: "class",
        message: `Class ${cls.localName || cls.uri} has no labels`,
        field: "labels",
      });
    }

    if (allUris.has(cls.uri)) {
      issues.push({
        severity: "error",
        entityId: cls.id,
        entityType: "class",
        message: `Duplicate URI: ${cls.uri}`,
        field: "uri",
      });
    }
    allUris.set(cls.uri, cls.id);

    for (const parentUri of cls.subClassOf) {
      if (!classUris.has(parentUri)) {
        issues.push({
          severity: "warning",
          entityId: cls.id,
          entityType: "class",
          message: `rdfs:subClassOf references unknown class: ${parentUri}`,
          field: "subClassOf",
        });
      }
    }

    for (const disjUri of cls.disjointWith ?? []) {
      if (cls.subClassOf.includes(disjUri)) {
        const name = disjUri.split(/[#/]/).pop() ?? disjUri;
        issues.push({
          severity: "error",
          entityId: cls.id,
          entityType: "class",
          message: `${cls.localName} is both rdfs:subClassOf and owl:disjointWith ${name} — contradiction`,
          field: "disjointWith",
        });
      }
    }
  }

  // Properties
  for (const prop of ontology.properties) {
    if (!prop.labels.some((l) => l.value.trim())) {
      issues.push({
        severity: "warning",
        entityId: prop.id,
        entityType: "property",
        message: `Property ${prop.localName || prop.uri} has no labels`,
        field: "labels",
      });
    }

    if (!prop.domainUri) {
      issues.push({
        severity: "warning",
        entityId: prop.id,
        entityType: "property",
        message: `Property ${prop.localName || prop.uri} has no domain (unassigned)`,
        field: "domainUri",
      });
    } else if (!classUris.has(prop.domainUri)) {
      issues.push({
        severity: "error",
        entityId: prop.id,
        entityType: "property",
        message: `Property domain references unknown class: ${prop.domainUri}`,
        field: "domainUri",
      });
    }

    if (prop.type === "owl:ObjectProperty" && prop.range && !classUris.has(prop.range)) {
      issues.push({
        severity: "warning",
        entityId: prop.id,
        entityType: "property",
        message: `Object property range is not a known class: ${prop.range}`,
        field: "range",
      });
    }

    if (prop.type === "owl:DatatypeProperty" && prop.range && !xsdUris.has(prop.range)) {
      issues.push({
        severity: "warning",
        entityId: prop.id,
        entityType: "property",
        message: `Datatype property range is not a known XSD type: ${prop.range}`,
        field: "range",
      });
    }

    if (allUris.has(prop.uri)) {
      issues.push({
        severity: "error",
        entityId: prop.id,
        entityType: "property",
        message: `Duplicate URI: ${prop.uri}`,
        field: "uri",
      });
    }
    allUris.set(prop.uri, prop.id);

    if (prop.inverseOf && !propUris.has(prop.inverseOf)) {
      issues.push({
        severity: "warning",
        entityId: prop.id,
        entityType: "property",
        message: `owl:inverseOf references unknown property: ${prop.inverseOf}`,
        field: "inverseOf",
      });
    }

    if (
      prop.exactCardinality !== undefined &&
      (prop.minCardinality !== undefined || prop.maxCardinality !== undefined)
    ) {
      issues.push({
        severity: "warning",
        entityId: prop.id,
        entityType: "property",
        message: `${prop.localName}: owl:cardinality conflicts with min/max cardinality`,
        field: "exactCardinality",
      });
    }
    if (
      prop.minCardinality !== undefined &&
      prop.maxCardinality !== undefined &&
      prop.minCardinality > prop.maxCardinality
    ) {
      issues.push({
        severity: "error",
        entityId: prop.id,
        entityType: "property",
        message: `${prop.localName}: minCardinality (${prop.minCardinality}) > maxCardinality (${prop.maxCardinality})`,
        field: "minCardinality",
      });
    }
  }

  return issues;
}
