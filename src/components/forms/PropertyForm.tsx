/**
 * Inline form for creating or editing an OWL property.
 */

import { useState } from "react";
import { useStore } from "../../lib/store";
import { toCamelCase, XSD_TYPES, compact, expand, buildUri } from "../../lib/uri-utils";
import LabelEditor from "./LabelEditor";
import ExtraTripleEditor from "./ExtraTripleEditor";
import type { OntologyProperty, LangString, PropertyType, ExtraTriple } from "../../types";

interface Props {
  existing?: OntologyProperty;
  /** Pre-set domain URI when opened from within a ClassCard */
  defaultDomainUri?: string;
  onDone: () => void;
}

const PROPERTY_TYPES: { value: PropertyType; label: string }[] = [
  { value: "owl:ObjectProperty", label: "Object" },
  { value: "owl:DatatypeProperty", label: "Datatype" },
  { value: "owl:AnnotationProperty", label: "Annotation" },
];

export default function PropertyForm({ existing, defaultDomainUri, onDone }: Props) {
  const addProperty = useStore((s) => s.addProperty);
  const updateProperty = useStore((s) => s.updateProperty);
  const activeOntology = useStore((s) => s.getActiveOntology());

  const prefixes = activeOntology?.metadata.prefixes ?? {};
  const baseUri = activeOntology?.metadata.baseUri ?? "";

  const [labels, setLabels] = useState<LangString[]>(
    existing?.labels?.length ? existing.labels : [{ value: "", lang: "" }]
  );
  const [descriptions, setDescriptions] = useState<LangString[]>(
    existing?.descriptions?.length ? existing.descriptions : []
  );
  const [localName, setLocalName] = useState(existing?.localName ?? "");
  const [localNameManual, setLocalNameManual] = useState(!!existing);
  // uriValue: "" means auto-compute from baseUri + localName; non-empty means explicit override
  const [uriValue, setUriValue] = useState(existing?.uri ?? "");
  const [propType, setPropType] = useState<PropertyType>(
    existing?.type ?? "owl:DatatypeProperty"
  );
  const [domainUri, setDomainUri] = useState(existing?.domainUri ?? defaultDomainUri ?? "");
  const [ranges, setRanges] = useState<string[]>(existing?.ranges ?? []);
  const [rangeInput, setRangeInput] = useState(""); // for annotation free-text input
  const [subPropertyOf, setSubPropertyOf] = useState<string[]>(existing?.subPropertyOf ?? []);
  const [inverseOf, setInverseOf] = useState(existing?.inverseOf ?? "");
  const [minCard, setMinCard] = useState(existing?.minCardinality !== undefined ? String(existing.minCardinality) : "");
  const [maxCard, setMaxCard] = useState(existing?.maxCardinality !== undefined ? String(existing.maxCardinality) : "");
  const [exactCard, setExactCard] = useState(existing?.exactCardinality !== undefined ? String(existing.exactCardinality) : "");

  // Extra triples — stored in compact/prefixed form for editing
  const [extraTriples, setExtraTriples] = useState<ExtraTriple[]>(
    (existing?.extraTriples ?? []).map((et) => ({
      ...et,
      predicate: compact(et.predicate, prefixes),
      object: et.isLiteral ? et.object : compact(et.object, prefixes),
    }))
  );

  const allClasses = activeOntology?.classes ?? [];
  const allProperties = activeOntology?.properties ?? [];
  const sameTypeProps = allProperties.filter(
    (p) => p.type === propType && (!existing || p.id !== existing.id)
  );

  const derivedLocalName = localNameManual
    ? localName
    : toCamelCase(labels[0]?.value ?? "");

  const computedUri = buildUri(baseUri, derivedLocalName);
  const effectiveUri = uriValue || computedUri;

  const handleSave = () => {
    const effectiveName = derivedLocalName.trim() || "unnamedProperty";
    const cleanLabels = labels.filter((l) => l.value.trim());
    const cleanDescs = descriptions.filter((d) => d.value.trim());

    // Expand prefixed names back to full URIs
    const expandedTriples = extraTriples
      .filter((t) => t.predicate.trim() && t.object.trim())
      .map((t) => ({
        ...t,
        predicate: expand(t.predicate, prefixes),
        object: t.isLiteral ? t.object : expand(t.object, prefixes),
      }));

    const parseCard = (s: string) => { const n = parseInt(s, 10); return isNaN(n) ? undefined : n; };
    const exactCardVal = parseCard(exactCard);
    const data: Partial<OntologyProperty> = {
      localName: effectiveName,
      uri: uriValue || buildUri(baseUri, effectiveName),
      type: propType,
      labels: cleanLabels.length ? cleanLabels : [{ value: effectiveName, lang: "" }],
      descriptions: cleanDescs,
      domainUri,
      ranges,
      subPropertyOf,
      inverseOf: inverseOf || undefined,
      exactCardinality: exactCardVal,
      minCardinality: exactCardVal !== undefined ? undefined : parseCard(minCard),
      maxCardinality: exactCardVal !== undefined ? undefined : parseCard(maxCard),
      extraTriples: expandedTriples,
    };

    if (existing) {
      updateProperty(existing.id, data);
    } else {
      addProperty(data);
    }
    onDone();
  };

  const toggleSubPropOf = (uri: string) => {
    setSubPropertyOf((prev) =>
      prev.includes(uri) ? prev.filter((u) => u !== uri) : [...prev, uri]
    );
  };

  return (
    <div className="space-y-3 rounded border border-th-border bg-th-surface p-3">
      {/* Property type */}
      <div>
        <label className="mb-1 block text-2xs font-medium uppercase tracking-wide text-th-fg-3">
          Type
        </label>
        <div className="flex gap-1">
          {PROPERTY_TYPES.map(({ value, label }) => (
            <button
              key={value}
              onClick={() => setPropType(value)}
              className={`rounded px-2 py-0.5 text-2xs font-medium ${
                propType === value
                  ? value === "owl:ObjectProperty"
                    ? "bg-prop-object-600 text-white"
                    : value === "owl:DatatypeProperty"
                    ? "bg-prop-datatype-600 text-white"
                    : "bg-prop-annotation-600 text-white"
                  : "bg-th-hover text-th-fg-3 hover:bg-th-border"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Labels */}
      <div>
        <label className="mb-1 block text-2xs font-medium uppercase tracking-wide text-th-fg-3">
          Labels
        </label>
        <LabelEditor values={labels} onChange={setLabels} placeholder="Property label" />
      </div>

      {/* Descriptions */}
      <div>
        <label className="mb-1 block text-2xs font-medium uppercase tracking-wide text-th-fg-3">
          Descriptions
        </label>
        <LabelEditor
          values={descriptions}
          onChange={setDescriptions}
          placeholder="Description"
          multiline
        />
      </div>

      {/* Local name */}
      <div>
        <label className="mb-1 block text-2xs font-medium uppercase tracking-wide text-th-fg-3">
          Local Name
        </label>
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={derivedLocalName}
            onChange={(e) => { setLocalName(e.target.value); setLocalNameManual(true); }}
            placeholder="camelCase"
            className="flex-1 rounded bg-th-input px-2 py-1 font-mono text-xs text-th-fg focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
          {localNameManual && (
            <button
              onClick={() => { setLocalNameManual(false); setLocalName(""); }}
              className="text-2xs text-th-fg-3 hover:text-th-fg"
            >
              auto
            </button>
          )}
        </div>
      </div>

      {/* Full URI */}
      <div>
        <label className="mb-1 flex items-center gap-2 text-2xs font-medium uppercase tracking-wide text-th-fg-3">
          URI
          {uriValue && uriValue !== computedUri && (
            <button
              onClick={() => setUriValue("")}
              className="font-normal normal-case text-th-fg-4 hover:text-th-fg"
              title="Reset to auto-computed URI"
            >
              reset
            </button>
          )}
        </label>
        <input
          type="text"
          value={effectiveUri}
          onChange={(e) => setUriValue(e.target.value)}
          className="w-full rounded bg-th-input px-2 py-1 font-mono text-xs text-th-fg focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
      </div>

      {/* Domain */}
      <div>
        <label className="mb-1 block text-2xs font-medium uppercase tracking-wide text-th-fg-3">
          Domain
        </label>
        <select
          value={domainUri}
          onChange={(e) => setDomainUri(e.target.value)}
          className="w-full rounded bg-th-input px-2 py-1 text-xs text-th-fg focus:outline-none focus:ring-1 focus:ring-blue-500"
        >
          <option value="">(unassigned)</option>
          {allClasses.map((cls) => (
            <option key={cls.id} value={cls.uri}>
              {cls.labels[0]?.value || cls.localName}
            </option>
          ))}
        </select>
      </div>

      {/* Range — multi-select */}
      <div>
        <label className="mb-1 block text-2xs font-medium uppercase tracking-wide text-th-fg-3">
          Range
          {ranges.length > 0 && (
            <span className="ml-1.5 rounded bg-blue-600/20 px-1.5 text-2xs font-normal text-blue-400">
              {ranges.length} selected
            </span>
          )}
        </label>

        {propType === "owl:ObjectProperty" ? (
          <div className="space-y-1.5">
            {/* Selected chips */}
            {ranges.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {ranges.map((uri) => {
                  const cls = allClasses.find((c) => c.uri === uri);
                  return (
                    <span
                      key={uri}
                      className="flex items-center gap-1 rounded-full bg-blue-700/30 px-2 py-0.5 text-2xs text-blue-300"
                    >
                      {cls?.labels[0]?.value || cls?.localName || uri.split(/[#/]/).pop()}
                      <button
                        onClick={() => setRanges((prev) => prev.filter((r) => r !== uri))}
                        className="ml-0.5 opacity-60 hover:opacity-100"
                        title="Remove"
                      >×</button>
                    </span>
                  );
                })}
              </div>
            )}
            {/* Dropdown to add more */}
            <select
              value=""
              onChange={(e) => {
                const val = e.target.value;
                if (val && !ranges.includes(val)) setRanges((prev) => [...prev, val]);
              }}
              className="w-full rounded bg-th-input px-2 py-1 text-xs text-th-fg focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              <option value="">+ Add class range…</option>
              {allClasses
                .filter((cls) => !ranges.includes(cls.uri))
                .map((cls) => (
                  <option key={cls.id} value={cls.uri}>
                    {cls.labels[0]?.value || cls.localName}
                  </option>
                ))}
            </select>
            {ranges.some((r) => !allClasses.find((c) => c.uri === r)) && (
              <p className="text-2xs text-amber-500">Some ranges are not known classes — will save as external references.</p>
            )}
          </div>
        ) : propType === "owl:DatatypeProperty" ? (
          <div className="space-y-1.5">
            {/* Selected chips */}
            {ranges.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {ranges.map((uri) => {
                  const compacted = Object.entries(XSD_TYPES).find(([, v]) => v === uri)?.[0] ?? uri.split(/[#/]/).pop() ?? uri;
                  return (
                    <span
                      key={uri}
                      className="flex items-center gap-1 rounded-full bg-emerald-700/30 px-2 py-0.5 text-2xs text-emerald-300"
                    >
                      {compacted}
                      <button
                        onClick={() => setRanges((prev) => prev.filter((r) => r !== uri))}
                        className="ml-0.5 opacity-60 hover:opacity-100"
                        title="Remove"
                      >×</button>
                    </span>
                  );
                })}
              </div>
            )}
            <select
              value=""
              onChange={(e) => {
                const val = e.target.value;
                if (val && !ranges.includes(val)) setRanges((prev) => [...prev, val]);
              }}
              className="w-full rounded bg-th-input px-2 py-1 text-xs text-th-fg focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              <option value="">+ Add XSD type…</option>
              {Object.entries(XSD_TYPES)
                .filter(([, full]) => !ranges.includes(full))
                .map(([compacted, full]) => (
                  <option key={full} value={full}>{compacted}</option>
                ))}
            </select>
          </div>
        ) : (
          /* Annotation: free-text multi-input */
          <div className="space-y-1.5">
            {ranges.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {ranges.map((uri) => (
                  <span
                    key={uri}
                    className="flex items-center gap-1 rounded-full bg-th-border px-2 py-0.5 text-2xs text-th-fg-3"
                  >
                    {uri}
                    <button
                      onClick={() => setRanges((prev) => prev.filter((r) => r !== uri))}
                      className="ml-0.5 opacity-60 hover:opacity-100"
                    >×</button>
                  </span>
                ))}
              </div>
            )}
            <div className="flex gap-1">
              <input
                type="text"
                value={rangeInput}
                onChange={(e) => setRangeInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && rangeInput.trim()) {
                    const val = rangeInput.trim();
                    if (!ranges.includes(val)) setRanges((prev) => [...prev, val]);
                    setRangeInput("");
                    e.preventDefault();
                  }
                }}
                placeholder="URI or free text, press Enter to add"
                className="flex-1 rounded bg-th-input px-2 py-1 text-xs text-th-fg placeholder-th-fg-4 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
              <button
                onClick={() => {
                  const val = rangeInput.trim();
                  if (val && !ranges.includes(val)) { setRanges((prev) => [...prev, val]); setRangeInput(""); }
                }}
                className="rounded bg-th-hover px-2 text-xs text-th-fg-2 hover:bg-th-border"
              >Add</button>
            </div>
          </div>
        )}
      </div>

      {/* subPropertyOf */}
      {sameTypeProps.length > 0 && (
        <div>
          <label className="mb-1 block text-2xs font-medium uppercase tracking-wide text-th-fg-3">
            subPropertyOf
          </label>
          <div className="flex flex-wrap gap-1">
            {sameTypeProps.map((prop) => {
              const selected = subPropertyOf.includes(prop.uri);
              return (
                <button
                  key={prop.id}
                  onClick={() => toggleSubPropOf(prop.uri)}
                  className={`rounded px-2 py-0.5 text-2xs ${
                    selected
                      ? "bg-blue-600 text-white"
                      : "bg-th-hover text-th-fg-3 hover:bg-th-border"
                  }`}
                >
                  {prop.labels[0]?.value || prop.localName}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* owl:inverseOf — ObjectProperty only */}
      {propType === "owl:ObjectProperty" && (
        <div>
          <label className="mb-1 block text-2xs font-medium uppercase tracking-wide text-th-fg-3">
            owl:inverseOf
          </label>
          <select
            value={inverseOf}
            onChange={(e) => setInverseOf(e.target.value)}
            className="w-full rounded bg-th-input px-2 py-1 text-xs text-th-fg focus:outline-none focus:ring-1 focus:ring-blue-500"
          >
            <option value="">(none)</option>
            {allProperties
              .filter((p) => p.type === "owl:ObjectProperty" && p.id !== existing?.id)
              .map((p) => (
                <option key={p.id} value={p.uri}>
                  {p.labels[0]?.value || p.localName}
                </option>
              ))}
          </select>
        </div>
      )}

      {/* Cardinality */}
      <div>
        <label className="mb-1 block text-2xs font-medium uppercase tracking-wide text-th-fg-3">
          Cardinality
        </label>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1">
            <span className="text-2xs text-th-fg-3">Exact</span>
            <input
              type="number"
              min="0"
              value={exactCard}
              onChange={(e) => { setExactCard(e.target.value); if (e.target.value) { setMinCard(""); setMaxCard(""); } }}
              placeholder="—"
              className="w-14 rounded bg-th-input px-2 py-0.5 text-xs text-th-fg placeholder-th-fg-4 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>
          {!exactCard && (
            <>
              <div className="flex items-center gap-1">
                <span className="text-2xs text-th-fg-3">Min</span>
                <input
                  type="number"
                  min="0"
                  value={minCard}
                  onChange={(e) => setMinCard(e.target.value)}
                  placeholder="—"
                  className="w-14 rounded bg-th-input px-2 py-0.5 text-xs text-th-fg placeholder-th-fg-4 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>
              <div className="flex items-center gap-1">
                <span className="text-2xs text-th-fg-3">Max</span>
                <input
                  type="number"
                  min="0"
                  value={maxCard}
                  onChange={(e) => setMaxCard(e.target.value)}
                  placeholder="—"
                  className="w-14 rounded bg-th-input px-2 py-0.5 text-xs text-th-fg placeholder-th-fg-4 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>
            </>
          )}
        </div>
        <p className="mt-0.5 text-2xs text-th-fg-4">Simplified constraints — not OWL 2 restriction blank nodes</p>
      </div>

      {/* Extra triples (prov:wasQuotedFrom, skos:*, etc.) */}
      <div>
        <label className="mb-1 block text-2xs font-medium uppercase tracking-wide text-th-fg-3">
          Additional Annotations
        </label>
        <ExtraTripleEditor values={extraTriples} onChange={setExtraTriples} />
      </div>

      {/* Actions */}
      <div className="flex gap-2">
        <button
          onClick={handleSave}
          className="rounded bg-blue-600 px-3 py-1 text-xs font-medium text-white hover:bg-blue-500"
        >
          {existing ? "Save" : "Create"}
        </button>
        <button
          onClick={onDone}
          className="rounded bg-th-hover px-3 py-1 text-xs text-th-fg-2 hover:bg-th-border"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
