/**
 * Renders a single property nested inside a ClassCard.
 * Clicking expands to the full edit form.
 */

import { useState } from "react";
import { Pencil, Trash2, Clipboard } from "lucide-react";
import { useStore } from "../../lib/store";
import { compact } from "../../lib/uri-utils";
import PropertyForm from "../forms/PropertyForm";
import type { OntologyProperty } from "../../types";

interface Props {
  property: OntologyProperty;
}

const TYPE_BADGE: Record<OntologyProperty["type"], { label: string; className: string }> = {
  "owl:ObjectProperty": { label: "O", className: "bg-prop-object-700 text-prop-object-100" },
  "owl:DatatypeProperty": { label: "D", className: "bg-prop-datatype-700 text-prop-datatype-100" },
  "owl:AnnotationProperty": { label: "A", className: "bg-prop-annotation-700 text-prop-annotation-100" },
};

export default function PropertyRow({ property }: Props) {
  const deleteProperty = useStore((s) => s.deleteProperty);
  const copyProperty = useStore((s) => s.copyProperty);
  const activeOntology = useStore((s) => s.getActiveOntology());
  const [editing, setEditing] = useState(false);

  const prefixes = activeOntology?.metadata.prefixes ?? {};
  const badge = TYPE_BADGE[property.type];
  const primaryLabel = property.labels[0]?.value || property.localName;
  const rangeLabel = property.range ? compact(property.range, prefixes) : null;
  const description = property.descriptions[0]?.value;

  if (editing) {
    return (
      <div className="ml-4 mt-1">
        <PropertyForm existing={property} onDone={() => setEditing(false)} />
      </div>
    );
  }

  return (
    <div className="group flex items-start gap-1.5 rounded px-2 py-1 hover:bg-th-hover/50">
      {/* Type badge */}
      <span
        className={`mt-0.5 inline-flex h-4 w-4 flex-shrink-0 items-center justify-center rounded text-2xs font-bold ${badge.className}`}
        title={property.type}
      >
        {badge.label}
      </span>

      {/* Content */}
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <span className="text-sm font-medium text-th-fg">{primaryLabel}</span>
          {rangeLabel && (
            <span className="font-mono text-xs text-th-fg-3">{rangeLabel}</span>
          )}
        </div>
        {description && (
          <p className="mt-0.5 text-xs leading-snug text-th-fg-3">{description}</p>
        )}
        {/* Additional labels */}
        {property.labels.length > 1 && (
          <div className="mt-0.5 flex flex-wrap gap-1">
            {property.labels.slice(1).map((lbl, i) => (
              <span key={i} className="text-2xs text-th-fg-4">
                "{lbl.value}"{lbl.lang ? <span>@{lbl.lang}</span> : null}
              </span>
            ))}
          </div>
        )}
        {/* Extra triples (prov:wasQuotedFrom, etc.) */}
        {(property.extraTriples ?? []).length > 0 && (
          <div className="mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5">
            {(property.extraTriples ?? []).map((et, i) => (
              <span key={i} className="text-2xs text-th-fg-4">
                <span className="text-th-fg-3">{compact(et.predicate, prefixes)}</span>
                {" → "}
                {et.isLiteral
                  ? `"${et.object}"${et.lang ? `@${et.lang}` : ""}`
                  : compact(et.object, prefixes)}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Actions (shown on hover) */}
      <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100">
        <button
          onClick={() => copyProperty(property.id)}
          className="rounded p-1 text-th-fg-4 hover:text-purple-400"
          title="Copy property"
        >
          <Clipboard size={11} />
        </button>
        <button
          onClick={() => setEditing(true)}
          className="rounded p-1 text-th-fg-4 hover:text-th-fg-2"
          title="Edit property"
        >
          <Pencil size={11} />
        </button>
        <button
          onClick={() => deleteProperty(property.id)}
          className="rounded p-1 text-th-fg-4 hover:text-red-400"
          title="Delete property"
        >
          <Trash2 size={11} />
        </button>
      </div>
    </div>
  );
}
