import { useState } from 'react';
import { useStore } from '../lib/store';
import { compact } from '../lib/uri-utils';
import PropertyRow from './PropertyRow';
import ClassForm from './ClassForm';
import PropertyForm from './PropertyForm';
import type { OntologyClass } from '../types';
import { ChevronDown, ChevronRight, Plus, Pencil, Trash2 } from 'lucide-react';

interface Props {
  cls: OntologyClass;
  defaultExpanded?: boolean;
}

const TYPE_ORDER: Array<'owl:ObjectProperty' | 'owl:DatatypeProperty' | 'owl:AnnotationProperty'> = [
  'owl:ObjectProperty',
  'owl:DatatypeProperty',
  'owl:AnnotationProperty',
];

const TYPE_LABEL: Record<string, string> = {
  'owl:ObjectProperty': 'Object',
  'owl:DatatypeProperty': 'Datatype',
  'owl:AnnotationProperty': 'Annotation',
};

const TYPE_COLOR: Record<string, string> = {
  'owl:ObjectProperty': 'text-prop-object-500',
  'owl:DatatypeProperty': 'text-prop-datatype-500',
  'owl:AnnotationProperty': 'text-prop-annotation-500',
};

export default function ClassCard({ cls, defaultExpanded = true }: Props) {
  const deleteClass = useStore((s) => s.deleteClass);
  const getPropertiesByDomain = useStore((s) => s.getPropertiesByDomain);
  const activeOntology = useStore((s) => s.getActiveOntology());

  const [expanded, setExpanded] = useState(defaultExpanded);
  const [editingClass, setEditingClass] = useState(false);
  const [addingProperty, setAddingProperty] = useState(false);

  const prefixes = activeOntology?.metadata.prefixes ?? {};
  const allClasses = activeOntology?.classes ?? [];
  const propertiesByDomain = getPropertiesByDomain();
  const properties = propertiesByDomain.get(cls.id) ?? [];

  const primaryLabel = cls.labels[0]?.value || cls.localName;
  const allLabels = cls.labels;

  // Group properties by type
  const grouped = new Map<string, typeof properties>();
  for (const type of TYPE_ORDER) grouped.set(type, []);
  for (const prop of properties) {
    const group = grouped.get(prop.type);
    if (group) group.push(prop);
  }

  // Resolve parent class labels
  const parentLabels = cls.subClassOf.map((parentUri) => {
    const parent = allClasses.find((c) => c.uri === parentUri);
    return parent?.labels[0]?.value || compact(parentUri, prefixes);
  });

  return (
    <div className="rounded border border-th-border-muted bg-th-surface">
      {/* Header */}
      <div className="flex items-start gap-1">
        <button
          onClick={() => setExpanded((e) => !e)}
          className="mt-0.5 flex-shrink-0 rounded p-1 text-th-fg-4 hover:text-th-fg-2"
          title={expanded ? 'Collapse' : 'Expand'}
        >
          {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </button>

        <div className="group flex min-w-0 flex-1 items-start gap-2 py-1.5 pr-2">
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline gap-2">
              <span className="text-sm font-semibold text-th-fg">{primaryLabel}</span>
              {/* Additional labels */}
              {allLabels.slice(1).map((lbl, i) => (
                <span key={i} className="text-xs text-th-fg-3">
                  "{lbl.value}"{lbl.lang ? <span>@{lbl.lang}</span> : null}
                </span>
              ))}
              {/* URI on hover */}
              <span className="hidden font-mono text-2xs text-th-fg-4 group-hover:inline">
                {compact(cls.uri, prefixes)}
              </span>
            </div>
            {/* Parent classes */}
            {parentLabels.length > 0 && (
              <div className="mt-0.5 flex items-center gap-1">
                <span className="text-2xs text-th-fg-3">⊆</span>
                {parentLabels.map((lbl, i) => (
                  <span key={i} className="text-2xs text-th-fg-3">{lbl}</span>
                ))}
              </div>
            )}
            {/* Description */}
            {cls.descriptions[0]?.value && (
              <p className="mt-0.5 text-2xs leading-snug text-th-fg-3">
                {cls.descriptions[0]?.value}
              </p>
            )}
          </div>

          {/* Action buttons */}
          <div className="flex flex-shrink-0 items-center gap-0.5 opacity-0 group-hover:opacity-100">
            <button
              onClick={() => { setAddingProperty(true); setExpanded(true); }}
              className="rounded p-1 text-th-fg-4 hover:text-blue-400"
              title="Add property"
            >
              <Plus size={13} />
            </button>
            <button
              onClick={() => setEditingClass(true)}
              className="rounded p-1 text-th-fg-4 hover:text-th-fg-2"
              title="Edit class"
            >
              <Pencil size={12} />
            </button>
            <button
              onClick={() => deleteClass(cls.id)}
              className="rounded p-1 text-th-fg-4 hover:text-red-400"
              title="Delete class"
            >
              <Trash2 size={12} />
            </button>
          </div>
        </div>
      </div>

      {/* Edit class form */}
      {editingClass && (
        <div className="px-3 pb-3">
          <ClassForm existing={cls} onDone={() => setEditingClass(false)} />
        </div>
      )}

      {/* Expanded body: properties + add-property form */}
      {expanded && !editingClass && (
        <div className="border-t border-th-border-muted pb-1">
          {TYPE_ORDER.map((type) => {
            const group = grouped.get(type) ?? [];
            if (group.length === 0) return null;
            return (
              <div key={type}>
                <div className={`px-3 pt-1.5 pb-0.5 text-2xs font-medium uppercase tracking-wide ${TYPE_COLOR[type]}`}>
                  {TYPE_LABEL[type]}
                </div>
                {group.map((prop) => (
                  <PropertyRow key={prop.id} property={prop} />
                ))}
              </div>
            );
          })}

          {/* Extra triples (prov:wasQuotedFrom, skos:*, etc.) */}
          {(cls.extraTriples ?? []).length > 0 && (
            <div>
              <div className="px-3 pt-1.5 pb-0.5 text-2xs font-medium uppercase tracking-wide text-th-fg-4">
                Additional Annotations
              </div>
              {(cls.extraTriples ?? []).map((et, i) => (
                <div key={i} className="flex items-center gap-2 px-3 py-0.5">
                  <span className="text-2xs font-medium text-th-fg-3">
                    {compact(et.predicate, prefixes)}
                  </span>
                  <span className="text-2xs text-th-fg-4">→</span>
                  <span className="text-2xs text-th-fg">
                    {et.isLiteral
                      ? `"${et.object}"${et.lang ? `@${et.lang}` : ''}${et.datatype ? `^^${compact(et.datatype, prefixes)}` : ''}`
                      : compact(et.object, prefixes)}
                  </span>
                </div>
              ))}
            </div>
          )}

          {properties.length === 0 && (cls.extraTriples ?? []).length === 0 && !addingProperty && (
            <p className="px-3 py-1.5 text-2xs text-th-fg-4">No properties</p>
          )}

          {/* Add-property form */}
          {addingProperty ? (
            <div className="px-3 pt-1.5">
              <PropertyForm
                defaultDomainUri={cls.uri}
                onDone={() => setAddingProperty(false)}
              />
            </div>
          ) : (
            <button
              onClick={() => setAddingProperty(true)}
              className="ml-3 mt-1 flex items-center gap-1 text-2xs text-th-fg-4 hover:text-blue-400"
            >
              <Plus size={11} />
              Add property
            </button>
          )}
        </div>
      )}
    </div>
  );
}