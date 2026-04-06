/**
 * Expandable card for a single individual (instance).
 * Shows the individual's types, then all its property values nested underneath,
 * grouped by the class schema (properties whose domain matches any of the
 * individual's types are shown first, grouped under that class).
 */

import { useState } from "react";
import { ChevronDown, ChevronRight, Pencil, Check, X, Trash2, Plus } from "lucide-react";
import { useStore } from "../lib/store";
import { compact } from "../lib/uri-utils";
import type { Individual, IndividualPropertyValue, OntologyProperty } from "../types";

interface Props {
  individual: Individual;
  defaultExpanded?: boolean;
}

export default function IndividualCard({ individual, defaultExpanded = false }: Props) {
  const activeOntology = useStore((s) => s.getActiveOntology());
  const updateIndividualProperty = useStore((s) => s.updateIndividualProperty);
  const removeIndividualProperty = useStore((s) => s.removeIndividualProperty);
  const addIndividualProperty = useStore((s) => s.addIndividualProperty);

  const [expanded, setExpanded] = useState(defaultExpanded);
  const [editingIdx, setEditingIdx] = useState<number | null>(null);
  const [editValue, setEditValue] = useState("");
  const [adding, setAdding] = useState(false);
  const [newPropUri, setNewPropUri] = useState("");
  const [newPropValue, setNewPropValue] = useState("");
  const [newPropIsLiteral, setNewPropIsLiteral] = useState(true);

  const prefixes = activeOntology?.metadata.prefixes ?? {};
  const allClasses = activeOntology?.classes ?? [];
  const allProperties = activeOntology?.properties ?? [];
  const individuals = activeOntology?.individuals ?? [];

  const c = (uri: string) => compact(uri, prefixes);

  // Resolve type labels
  const typeLabels = individual.typeUris.map((uri) => {
    const cls = allClasses.find((cl) => cl.uri === uri);
    return cls?.labels[0]?.value || c(uri);
  });

  // Build the schema-aware property grouping:
  // For each type the individual has, find all properties whose domain matches that type.
  // This gives us "expected" properties. Then group actual values accordingly.
  const schemaProps = new Map<string, OntologyProperty[]>(); // classUri → properties defined for it
  for (const typeUri of individual.typeUris) {
    const propsForType = allProperties.filter((p) => p.domainUri === typeUri);
    if (propsForType.length > 0) {
      schemaProps.set(typeUri, propsForType);
    }
  }

  // Index of property values by property URI for quick lookup
  const valuesByPropUri = new Map<string, Array<{ pv: IndividualPropertyValue; originalIndex: number }>>();
  const usedIndices = new Set<number>();

  individual.propertyValues.forEach((pv, idx) => {
    const existing = valuesByPropUri.get(pv.propertyUri) ?? [];
    existing.push({ pv, originalIndex: idx });
    valuesByPropUri.set(pv.propertyUri, existing);
  });

  // Resolve a property URI to a label
  const propLabel = (uri: string) => {
    const prop = allProperties.find((p) => p.uri === uri);
    return prop?.labels[0]?.value || c(uri);
  };

  // Resolve an object value to a label (could be a class or individual URI)
  const valueLabel = (pv: IndividualPropertyValue) => {
    if (pv.isLiteral) {
      const langSuffix = pv.lang ? `@${pv.lang}` : "";
      return `"${pv.value}"${langSuffix}`;
    }
    // Try to find a class label
    const cls = allClasses.find((cl) => cl.uri === pv.value);
    if (cls) return cls.labels[0]?.value || c(pv.value);
    // Try to find an individual label
    const ind = individuals.find((i) => i.uri === pv.value);
    if (ind) return ind.localName;
    return c(pv.value);
  };

  const startEdit = (idx: number, currentValue: string) => {
    setEditingIdx(idx);
    setEditValue(currentValue);
  };

  const saveEdit = (idx: number, isLiteral: boolean) => {
    updateIndividualProperty(individual.id, idx, { value: editValue, isLiteral });
    setEditingIdx(null);
  };

  const cancelEdit = () => {
    setEditingIdx(null);
    setEditValue("");
  };

  const handleAdd = () => {
    if (!newPropUri || !newPropValue) return;
    addIndividualProperty(individual.id, {
      propertyUri: newPropUri,
      value: newPropValue,
      isLiteral: newPropIsLiteral,
    });
    setNewPropValue("");
    setAdding(false);
  };

  // Determine property type color
  const propTypeColor = (uri: string) => {
    const prop = allProperties.find((p) => p.uri === uri);
    if (!prop) return "text-th-fg-3";
    if (prop.type === "owl:ObjectProperty") return "text-prop-object-500";
    if (prop.type === "owl:DatatypeProperty") return "text-prop-datatype-500";
    return "text-prop-annotation-500";
  };

  const renderPropertyValue = (pv: IndividualPropertyValue, originalIndex: number) => {
    const isEditing = editingIdx === originalIndex;

    return (
      <div
        key={originalIndex}
        className="group flex items-center gap-2 rounded px-2 py-0.5 hover:bg-th-hover/50"
      >
        <span className={`min-w-0 flex-shrink-0 text-2xs font-medium ${propTypeColor(pv.propertyUri)}`}>
          {propLabel(pv.propertyUri)}
        </span>
        <span className="text-2xs text-th-fg-4">→</span>

        {isEditing ? (
          <div className="flex flex-1 items-center gap-1">
            <input
              type="text"
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") saveEdit(originalIndex, pv.isLiteral);
                if (e.key === "Escape") cancelEdit();
              }}
              autoFocus
              className="flex-1 rounded bg-th-input px-1.5 py-0.5 text-2xs text-th-fg focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
            <button
              onClick={() => saveEdit(originalIndex, pv.isLiteral)}
              className="rounded p-0.5 text-green-500 hover:text-green-400"
            >
              <Check size={11} />
            </button>
            <button onClick={cancelEdit} className="rounded p-0.5 text-th-fg-4 hover:text-th-fg">
              <X size={11} />
            </button>
          </div>
        ) : (
          <>
            <span className="min-w-0 flex-1 truncate text-2xs text-th-fg">
              {valueLabel(pv)}
            </span>
            <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100">
              <button
                onClick={() => startEdit(originalIndex, pv.value)}
                className="rounded p-0.5 text-th-fg-4 hover:text-th-fg-2"
                title="Edit value"
              >
                <Pencil size={10} />
              </button>
              <button
                onClick={() => removeIndividualProperty(individual.id, originalIndex)}
                className="rounded p-0.5 text-th-fg-4 hover:text-red-400"
                title="Remove"
              >
                <Trash2 size={10} />
              </button>
            </div>
          </>
        )}
      </div>
    );
  };

  return (
    <div className="rounded border border-th-border-muted bg-th-surface">
      {/* Header */}
      <div className="flex items-start gap-1">
        <button
          onClick={() => setExpanded((e) => !e)}
          className="mt-0.5 flex-shrink-0 rounded p-1 text-th-fg-4 hover:text-th-fg-2"
        >
          {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </button>

        <div className="group flex min-w-0 flex-1 items-start gap-2 py-1.5 pr-2">
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline gap-2">
              <span className="text-sm font-semibold text-th-fg">{individual.localName}</span>
              {/* Type badges */}
              {typeLabels.map((label, i) => (
                <span
                  key={i}
                  className="rounded bg-purple-500/15 px-1.5 py-0.5 text-2xs font-medium text-purple-500 ring-1 ring-inset ring-purple-500/25"
                >
                  {label}
                </span>
              ))}
            </div>
            {/* URI on hover */}
            <span className="hidden font-mono text-2xs text-th-fg-4 group-hover:inline">
              {c(individual.uri)}
            </span>
          </div>

          <span className="flex-shrink-0 text-2xs text-th-fg-4">
            {individual.propertyValues.length} values
          </span>
        </div>
      </div>

      {/* Expanded body */}
      {expanded && (
        <div className="border-t border-th-border-muted pb-1">
          {/* Schema-grouped properties: for each type, show its schema properties */}
          {Array.from(schemaProps.entries()).map(([classUri, props]) => {
            const clsLabel = allClasses.find((cl) => cl.uri === classUri)?.labels[0]?.value || c(classUri);
            return (
              <div key={classUri}>
                <div className="px-3 pt-1.5 pb-0.5 text-2xs font-medium uppercase tracking-wide text-purple-500">
                  {clsLabel} properties
                </div>
                {props.map((schemaProp) => {
                  const entries = valuesByPropUri.get(schemaProp.uri) ?? [];
                  entries.forEach((e) => usedIndices.add(e.originalIndex));

                  if (entries.length === 0) {
                    // Show empty slot for this expected property
                    return (
                      <div key={schemaProp.id} className="flex items-center gap-2 px-2 py-0.5">
                        <span className={`text-2xs font-medium ${propTypeColor(schemaProp.uri)}`}>
                          {schemaProp.labels[0]?.value || schemaProp.localName}
                        </span>
                        <span className="text-2xs text-th-fg-4">→</span>
                        <span className="text-2xs italic text-th-fg-4">(empty)</span>
                      </div>
                    );
                  }

                  return entries.map((entry) =>
                    renderPropertyValue(entry.pv, entry.originalIndex)
                  );
                })}
              </div>
            );
          })}

          {/* Remaining property values not covered by schema */}
          {(() => {
            const remaining = individual.propertyValues
              .map((pv, idx) => ({ pv, idx }))
              .filter(({ idx }) => !usedIndices.has(idx));

            if (remaining.length === 0) return null;
            return (
              <div>
                {schemaProps.size > 0 && (
                  <div className="px-3 pt-1.5 pb-0.5 text-2xs font-medium uppercase tracking-wide text-th-fg-4">
                    Other
                  </div>
                )}
                {remaining.map(({ pv, idx }) => renderPropertyValue(pv, idx))}
              </div>
            );
          })()}

          {individual.propertyValues.length === 0 && !adding && (
            <p className="px-3 py-1.5 text-2xs text-th-fg-4">No property values</p>
          )}

          {/* Add property value */}
          {adding ? (
            <div className="mx-3 mt-1 space-y-1.5 rounded border border-th-border bg-th-base p-2">
              <select
                value={newPropUri}
                onChange={(e) => setNewPropUri(e.target.value)}
                className="w-full rounded bg-th-input px-2 py-1 text-2xs text-th-fg focus:outline-none focus:ring-1 focus:ring-blue-500"
              >
                <option value="">Select property…</option>
                {allProperties.map((p) => (
                  <option key={p.id} value={p.uri}>
                    {p.labels[0]?.value || p.localName} ({p.type.replace("owl:", "")})
                  </option>
                ))}
              </select>
              <div className="flex items-center gap-1">
                <input
                  type="text"
                  value={newPropValue}
                  onChange={(e) => setNewPropValue(e.target.value)}
                  placeholder="Value"
                  onKeyDown={(e) => { if (e.key === "Enter") handleAdd(); if (e.key === "Escape") setAdding(false); }}
                  className="flex-1 rounded bg-th-input px-2 py-1 text-2xs text-th-fg placeholder-th-fg-4 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
                <label className="flex items-center gap-1 text-2xs text-th-fg-3">
                  <input
                    type="checkbox"
                    checked={newPropIsLiteral}
                    onChange={(e) => setNewPropIsLiteral(e.target.checked)}
                    className="rounded"
                  />
                  Literal
                </label>
              </div>
              <div className="flex gap-1">
                <button
                  onClick={handleAdd}
                  className="rounded bg-blue-600 px-2 py-0.5 text-2xs font-medium text-white hover:bg-blue-500"
                >
                  Add
                </button>
                <button
                  onClick={() => setAdding(false)}
                  className="rounded bg-th-hover px-2 py-0.5 text-2xs text-th-fg-2 hover:bg-th-border"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setAdding(true)}
              className="ml-3 mt-1 flex items-center gap-1 text-2xs text-th-fg-4 hover:text-blue-400"
            >
              <Plus size={11} />
              Add property value
            </button>
          )}
        </div>
      )}
    </div>
  );
}
