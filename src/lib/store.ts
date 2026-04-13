/**
 * Zustand store for ontology editor state.
 *
 * Single source of truth for all domain data. Persistence goes to both
 * IndexedDB (session survival) and the original file on disk via the
 * File System Access API (Chrome/Edge) when a file handle is available.
 */

import { create } from "zustand";
import type { Ontology, OntologyClass, OntologyMetadata, OntologyProperty, IndividualPropertyValue } from "../types";
import { loadAllOntologies, saveOntology, deleteOntology as dbDelete, debounce } from "./persistence";
import { buildUri, toPascalCase, toCamelCase, STANDARD_PREFIXES } from "./uri-utils";
import { parseTurtle, buildModelFromTriples } from "./turtle-parser";
import { serializeToTurtle } from "./turtle-serializer";
import {
  getHandle,
  setHandle,
  removeHandle,
  hasHandle,
  writeToHandle,
  saveAsTurtleFile,
  supportsFileSystemAccess,
} from "./file-access";

interface EditorState {
  // ── Data ───────────────────────────────────────────────────────────
  ontologies: Ontology[];
  activeOntologyId: string | null;
  initialized: boolean;

  /** Timestamp of last successful file save (for UI indicator) */
  lastFileSaveTime: number | null;
  /** Whether a file save is in progress */
  fileSaveInProgress: boolean;

  // ── Undo / Redo ────────────────────────────────────────────────────
  _history: Ontology[][];
  _future: Ontology[][];
  canUndo: () => boolean;
  canRedo: () => boolean;
  undo: () => void;
  redo: () => void;

  // ── Import feedback ────────────────────────────────────────────────
  /** Warnings/errors from the most recent import (parse errors, blank nodes, etc.) */
  importWarnings: string[];
  clearImportWarnings: () => void;

  // ── Derived (convenience getters) ──────────────────────────────────
  getActiveOntology: () => Ontology | undefined;
  getPropertiesByDomain: () => Map<string, OntologyProperty[]>;
  getUnassignedProperties: () => OntologyProperty[];
  hasFileHandle: () => boolean;

  // ── Lifecycle ──────────────────────────────────────────────────────
  init: () => Promise<void>;
  createOntology: (meta: Partial<OntologyMetadata>) => string;
  importOntology: (turtleText: string, fileName: string) => string;
  importOntologyWithHandle: (
    turtleText: string,
    fileName: string,
    handle: FileSystemFileHandle
  ) => string;
  deleteOntology: (id: string) => void;
  setActiveOntology: (id: string | null) => void;
  updateMetadata: (patch: Partial<OntologyMetadata>) => void;

  // ── Class actions ──────────────────────────────────────────────────
  addClass: (cls: Partial<OntologyClass>) => string;
  updateClass: (id: string, patch: Partial<OntologyClass>) => void;
  deleteClass: (id: string) => void;

  // ── Property actions ───────────────────────────────────────────────
  addProperty: (prop: Partial<OntologyProperty>) => string;
  updateProperty: (id: string, patch: Partial<OntologyProperty>) => void;
  deleteProperty: (id: string) => void;

  // ── Individual actions ──────────────────────────────────────────────
  updateIndividualProperty: (
    individualId: string,
    propertyIndex: number,
    patch: Partial<IndividualPropertyValue>
  ) => void;
  addIndividualProperty: (
    individualId: string,
    propVal: IndividualPropertyValue
  ) => void;
  removeIndividualProperty: (individualId: string, propertyIndex: number) => void;

  // ── Export / Save ─────────────────────────────────────────────────
  exportTurtle: () => string;
  /** Save to the original file handle. If none, opens a "Save As" picker. */
  saveToFile: () => Promise<boolean>;
}

const genId = () => crypto.randomUUID().slice(0, 8);

function newOntology(meta: Partial<OntologyMetadata>): Ontology {
  const now = new Date().toISOString();
  const baseUri = meta.baseUri || "http://example.org/ontology/";
  return {
    id: genId(),
    metadata: {
      baseUri,
      ontologyUri: baseUri,
      ontologyLabel: meta.ontologyLabel || "New Ontology",
      ontologyComment: meta.ontologyComment || "",
      prefixes: { ...STANDARD_PREFIXES, ...meta.prefixes },
      defaultLanguage: meta.defaultLanguage || "en",
    },
    classes: [],
    properties: [],
    individuals: [],
    unmappedTriples: [],
    createdAt: now,
    updatedAt: now,
  };
}

/** Mutate the active ontology inside the ontologies array and return updated array */
function updateActive(
  ontologies: Ontology[],
  activeId: string | null,
  updater: (onto: Ontology) => Ontology
): Ontology[] {
  if (!activeId) return ontologies;
  return ontologies.map((o) => (o.id === activeId ? updater(o) : o));
}

export const useStore = create<EditorState>((set, get) => {
  // Debounced persistence: IndexedDB
  const persistToDb = debounce(async (..._args: unknown[]) => {
    const onto = get().getActiveOntology();
    if (onto) await saveOntology(onto);
  }, 500);

  // Debounced persistence: file on disk
  const persistToFile = debounce(async (..._args: unknown[]) => {
    const state = get();
    const onto = state.getActiveOntology();
    if (!onto) return;
    const handle = getHandle(onto.id);
    if (!handle) return;

    set({ fileSaveInProgress: true });
    const turtle = serializeToTurtle(onto);
    const ok = await writeToHandle(handle, turtle);
    set({
      fileSaveInProgress: false,
      lastFileSaveTime: ok ? Date.now() : state.lastFileSaveTime,
    });
    if (ok) console.log("[file-save] auto-saved to", handle.name);
  }, 1000);

  /** Persist to both IndexedDB and file (if handle exists) */
  const persist = () => {
    persistToDb();
    persistToFile();
  };

  return {
    ontologies: [],
    activeOntologyId: null,
    initialized: false,
    lastFileSaveTime: null,
    fileSaveInProgress: false,
    _history: [],
    _future: [],
    importWarnings: [],

    // ── Derived ────────────────────────────────────────────────────────
    getActiveOntology: () => {
      const { ontologies, activeOntologyId } = get();
      return ontologies.find((o) => o.id === activeOntologyId);
    },

    getPropertiesByDomain: () => {
      const onto = get().getActiveOntology();
      const map = new Map<string, OntologyProperty[]>();
      if (!onto) return map;
      for (const cls of onto.classes) {
        map.set(cls.id, []);
      }
      for (const prop of onto.properties) {
        if (prop.domainUri) {
          const cls = onto.classes.find((c) => c.uri === prop.domainUri);
          if (cls) {
            const list = map.get(cls.id) || [];
            list.push(prop);
            map.set(cls.id, list);
          }
        }
      }
      return map;
    },

    getUnassignedProperties: () => {
      const onto = get().getActiveOntology();
      if (!onto) return [];
      const classUris = new Set(onto.classes.map((c) => c.uri));
      return onto.properties.filter((p) => !p.domainUri || !classUris.has(p.domainUri));
    },

    hasFileHandle: () => {
      const id = get().activeOntologyId;
      return id ? hasHandle(id) : false;
    },

    // ── Undo / Redo ────────────────────────────────────────────────────
    canUndo: () => get()._history.length > 0,
    canRedo: () => get()._future.length > 0,

    undo: () => {
      set((s) => {
        if (s._history.length === 0) return {};
        const prev = s._history[s._history.length - 1]!;
        return {
          _history: s._history.slice(0, -1),
          _future: [...s._future, s.ontologies],
          ontologies: prev,
        };
      });
      persistToDb();
    },

    redo: () => {
      set((s) => {
        if (s._future.length === 0) return {};
        const next = s._future[s._future.length - 1]!;
        return {
          _history: [...s._history, s.ontologies],
          _future: s._future.slice(0, -1),
          ontologies: next,
        };
      });
      persistToDb();
    },

    // ── Import feedback ────────────────────────────────────────────────
    clearImportWarnings: () => set({ importWarnings: [] }),

    // ── Lifecycle ──────────────────────────────────────────────────────
    init: async () => {
      const ontologies = await loadAllOntologies();
      // Migrate older ontologies that lack newer fields
      for (const onto of ontologies) {
        if (!onto.individuals) onto.individuals = [];
        for (const cls of onto.classes) {
          if (!cls.extraTriples) cls.extraTriples = [];
        }
        for (const prop of onto.properties) {
          if (!prop.extraTriples) prop.extraTriples = [];
        }
      }
      set({
        ontologies,
        activeOntologyId: ontologies.length > 0 ? ontologies[0]!.id : null,
        initialized: true,
      });
    },

    createOntology: (meta) => {
      const onto = newOntology(meta);
      set((s) => ({
        ontologies: [...s.ontologies, onto],
        activeOntologyId: onto.id,
      }));
      saveOntology(onto);
      return onto.id;
    },

    importOntology: (turtleText, fileName) => {
      const parsed = parseTurtle(turtleText);
      const model = buildModelFromTriples(parsed);
      const now = new Date().toISOString();
      const fallbackLabel = fileName.replace(/\.ttl$/i, "");
      const onto: Ontology = {
        id: genId(),
        metadata: {
          ...model.metadata,
          ontologyLabel: model.metadata.ontologyLabel || fallbackLabel,
          prefixes: { ...STANDARD_PREFIXES, ...model.metadata.prefixes },
        },
        classes: model.classes,
        properties: model.properties,
        individuals: model.individuals,
        unmappedTriples: model.unmappedTriples,
        createdAt: now,
        updatedAt: now,
      };

      // Build user-visible warnings from parse errors and data-loss events
      const warnings: string[] = [];
      for (const err of parsed.errors) {
        warnings.push(err.line ? `Line ${err.line}: ${err.message}` : err.message);
      }
      if (parsed.blankNodeCount > 0) {
        warnings.push(
          `${parsed.blankNodeCount} blank-node statement${parsed.blankNodeCount > 1 ? "s" : ""} were skipped — blank nodes are not supported in v1.`
        );
      }

      set((s) => ({
        ontologies: [...s.ontologies, onto],
        activeOntologyId: onto.id,
        importWarnings: warnings,
      }));
      saveOntology(onto);
      return onto.id;
    },

    importOntologyWithHandle: (turtleText, fileName, handle) => {
      // Reuse the normal import, then associate the file handle
      const id = get().importOntology(turtleText, fileName);
      setHandle(id, handle);
      set({ lastFileSaveTime: Date.now() }); // file is "saved" because we just read it
      return id;
    },

    deleteOntology: (id) => {
      set((s) => {
        const remaining = s.ontologies.filter((o) => o.id !== id);
        return {
          ontologies: remaining,
          activeOntologyId:
            s.activeOntologyId === id
              ? remaining.length > 0
                ? remaining[0]!.id
                : null
              : s.activeOntologyId,
        };
      });
      dbDelete(id);
      removeHandle(id);
    },

    setActiveOntology: (id) => {
      set({
        activeOntologyId: id,
        lastFileSaveTime: id && hasHandle(id) ? Date.now() : null,
      });
    },

    updateMetadata: (patch) => {
      set((s) => ({
        _history: [...s._history.slice(-49), s.ontologies],
        _future: [],
        ontologies: updateActive(s.ontologies, s.activeOntologyId, (o) => ({
          ...o,
          metadata: { ...o.metadata, ...patch },
        })),
      }));
      persist();
    },

    // ── Class actions ────────────────────────────────────────────────────
    addClass: (partial) => {
      const id = genId();
      const onto = get().getActiveOntology();
      if (!onto) return id;

      const label = partial.labels?.[0]?.value || "NewClass";
      const localName = partial.localName || toPascalCase(label);
      const uri = partial.uri || buildUri(onto.metadata.baseUri, localName);

      const cls: OntologyClass = {
        id,
        localName,
        uri,
        labels: partial.labels || [{ value: label, lang: onto.metadata.defaultLanguage }],
        descriptions: partial.descriptions || [{ value: "", lang: onto.metadata.defaultLanguage }],
        subClassOf: partial.subClassOf || [],
        extraTriples: partial.extraTriples || [],
      };

      set((s) => ({
        _history: [...s._history.slice(-49), s.ontologies],
        _future: [],
        ontologies: updateActive(s.ontologies, s.activeOntologyId, (o) => ({
          ...o,
          classes: [...o.classes, cls],
        })),
      }));
      persist();
      return id;
    },

    updateClass: (id, patch) => {
      set((s) => ({
        _history: [...s._history.slice(-49), s.ontologies],
        _future: [],
        ontologies: updateActive(s.ontologies, s.activeOntologyId, (o) => ({
          ...o,
          classes: o.classes.map((c) => (c.id === id ? { ...c, ...patch } : c)),
        })),
      }));
      persist();
    },

    deleteClass: (id) => {
      set((s) => ({
        _history: [...s._history.slice(-49), s.ontologies],
        _future: [],
        ontologies: updateActive(s.ontologies, s.activeOntologyId, (o) => {
          const cls = o.classes.find((c) => c.id === id);
          return {
            ...o,
            classes: o.classes.filter((c) => c.id !== id),
            properties: o.properties.map((p) =>
              cls && p.domainUri === cls.uri ? { ...p, domainUri: "" } : p
            ),
          };
        }),
      }));
      persist();
    },

    // ── Property actions ─────────────────────────────────────────────────
    addProperty: (partial) => {
      const id = genId();
      const onto = get().getActiveOntology();
      if (!onto) return id;

      const label = partial.labels?.[0]?.value || "newProperty";
      const localName = partial.localName || toCamelCase(label);
      const uri = partial.uri || buildUri(onto.metadata.baseUri, localName);

      const prop: OntologyProperty = {
        id,
        localName,
        uri,
        type: partial.type || "owl:DatatypeProperty",
        labels: partial.labels || [{ value: label, lang: onto.metadata.defaultLanguage }],
        descriptions: partial.descriptions || [{ value: "", lang: onto.metadata.defaultLanguage }],
        domainUri: partial.domainUri || "",
        range: partial.range || "",
        subPropertyOf: partial.subPropertyOf || [],
        extraTriples: partial.extraTriples || [],
      };

      set((s) => ({
        _history: [...s._history.slice(-49), s.ontologies],
        _future: [],
        ontologies: updateActive(s.ontologies, s.activeOntologyId, (o) => ({
          ...o,
          properties: [...o.properties, prop],
        })),
      }));
      persist();
      return id;
    },

    updateProperty: (id, patch) => {
      set((s) => ({
        _history: [...s._history.slice(-49), s.ontologies],
        _future: [],
        ontologies: updateActive(s.ontologies, s.activeOntologyId, (o) => ({
          ...o,
          properties: o.properties.map((p) => (p.id === id ? { ...p, ...patch } : p)),
        })),
      }));
      persist();
    },

    deleteProperty: (id) => {
      set((s) => ({
        _history: [...s._history.slice(-49), s.ontologies],
        _future: [],
        ontologies: updateActive(s.ontologies, s.activeOntologyId, (o) => ({
          ...o,
          properties: o.properties.filter((p) => p.id !== id),
        })),
      }));
      persist();
    },

    // ── Individual actions ────────────────────────────────────────────────
    updateIndividualProperty: (individualId, propertyIndex, patch) => {
      set((s) => ({
        _history: [...s._history.slice(-49), s.ontologies],
        _future: [],
        ontologies: updateActive(s.ontologies, s.activeOntologyId, (o) => ({
          ...o,
          individuals: (o.individuals ?? []).map((ind) => {
            if (ind.id !== individualId) return ind;
            const newVals = [...ind.propertyValues];
            const existing = newVals[propertyIndex];
            if (existing) {
              newVals[propertyIndex] = { ...existing, ...patch };
            }
            return { ...ind, propertyValues: newVals };
          }),
        })),
      }));
      persist();
    },

    addIndividualProperty: (individualId, propVal) => {
      set((s) => ({
        _history: [...s._history.slice(-49), s.ontologies],
        _future: [],
        ontologies: updateActive(s.ontologies, s.activeOntologyId, (o) => ({
          ...o,
          individuals: (o.individuals ?? []).map((ind) =>
            ind.id === individualId
              ? { ...ind, propertyValues: [...ind.propertyValues, propVal] }
              : ind
          ),
        })),
      }));
      persist();
    },

    removeIndividualProperty: (individualId, propertyIndex) => {
      set((s) => ({
        _history: [...s._history.slice(-49), s.ontologies],
        _future: [],
        ontologies: updateActive(s.ontologies, s.activeOntologyId, (o) => ({
          ...o,
          individuals: (o.individuals ?? []).map((ind) =>
            ind.id === individualId
              ? { ...ind, propertyValues: ind.propertyValues.filter((_, i) => i !== propertyIndex) }
              : ind
          ),
        })),
      }));
      persist();
    },

    // ── Export / Save ────────────────────────────────────────────────────
    exportTurtle: () => {
      const onto = get().getActiveOntology();
      if (!onto) return "";
      return serializeToTurtle(onto);
    },

    saveToFile: async () => {
      const onto = get().getActiveOntology();
      if (!onto) return false;

      const turtle = serializeToTurtle(onto);
      const existing = getHandle(onto.id);

      if (existing) {
        // Write back to the original file
        set({ fileSaveInProgress: true });
        const ok = await writeToHandle(existing, turtle);
        set({
          fileSaveInProgress: false,
          lastFileSaveTime: ok ? Date.now() : get().lastFileSaveTime,
        });
        return ok;
      }

      // No handle — try "Save As" if the API is available
      if (supportsFileSystemAccess()) {
        const label = onto.metadata.ontologyLabel || "ontology";
        const suggestedName = `${label.toLowerCase().replace(/\s+/g, "-")}.ttl`;
        const handle = await saveAsTurtleFile(turtle, suggestedName);
        if (handle) {
          setHandle(onto.id, handle);
          set({ lastFileSaveTime: Date.now() });
          return true;
        }
        return false;
      }

      // Fallback: trigger download
      const blob = new Blob([turtle], { type: "text/turtle;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const label = onto.metadata.ontologyLabel ?? "ontology";
      a.href = url;
      a.download = `${label.toLowerCase().replace(/\s+/g, "-")}.ttl`;
      a.click();
      URL.revokeObjectURL(url);
      return true;
    },
  };
});
