/**
 * Root application component.
 * Layout: sidebar (ontology list) + main panel (class/property editor)
 */

import { useEffect, useState, useCallback } from "react";
import { useStore } from "../../lib/store";
import OntologyList from "./OntologyList";
import ClassCard from "../core/ClassCard";
import ClassForm from "../forms/ClassForm";
import UnassignedProperties from "../core/UnassignedProperties";
import ImportExport from "../core/ImportExport";
import OntologyGraph from "../graph/OntologyGraph";
import EntityGraph from "../graph/EntityGraph";
import IndividualCard from "../core/IndividualCard";
import ValidationPanel from "../core/ValidationPanel";
import ClassBrowserPanel from "./ClassBrowserPanel";
import OntologyDiff from "../core/OntologyDiff";
import { validate } from "../../lib/validation";
import { Plus, Sun, Moon, Network, ChevronsDown, ChevronsUp, Layers, Users, ShieldCheck, Share2, PanelLeftClose, PanelLeftOpen, Clipboard, X, GitCompare } from "lucide-react";

function useTheme() {
  const [dark, setDark] = useState(() => {
    const stored = localStorage.getItem("theme");
    if (stored) return stored === "dark";
    return true; // default dark
  });

  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
    localStorage.setItem("theme", dark ? "dark" : "light");
  }, [dark]);

  return { dark, toggle: () => setDark((d) => !d) };
}

type ViewMode = "classes" | "individuals" | "graph" | "entity-graph" | "diff";

export default function App() {
  const init = useStore((s) => s.init);
  const initialized = useStore((s) => s.initialized);
  const activeOntology = useStore((s) => s.getActiveOntology());
  const undo = useStore((s) => s.undo);
  const redo = useStore((s) => s.redo);
  const canUndo = useStore((s) => s.canUndo);
  const canRedo = useStore((s) => s.canRedo);
  const clipboard = useStore((s) => s.clipboard);
  const pasteClipboard = useStore((s) => s.pasteClipboard);
  const clearClipboard = useStore((s) => s.clearClipboard);
  const [addingClass, setAddingClass] = useState(false);
  const [search, setSearch] = useState("");
  const [viewMode, setViewMode] = useState<ViewMode>("classes");
  const [allExpanded, setAllExpanded] = useState(true);
  const [expandKey, setExpandKey] = useState(0); // forces re-render of cards with new default
  const [showValidation, setShowValidation] = useState(false);
  const [selectedClassId, setSelectedClassId] = useState<string | null>(null);
  const [classBrowserCollapsed, setClassBrowserCollapsed] = useState(() => {
    return localStorage.getItem("classBrowserCollapsed") === "true";
  });
  const theme = useTheme();

  const toggleClassBrowser = useCallback(() => {
    setClassBrowserCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem("classBrowserCollapsed", String(next));
      return next;
    });
  }, []);

  useEffect(() => { init(); }, [init]);

  // Global keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const ctrl = e.ctrlKey || e.metaKey;
      if (!ctrl) return;
      if (e.key === "z" && !e.shiftKey) {
        e.preventDefault();
        if (canUndo()) undo();
      } else if ((e.key === "y") || (e.key === "z" && e.shiftKey)) {
        e.preventDefault();
        if (canRedo()) redo();
      } else if (e.key === "n" && !e.shiftKey) {
        // Only trigger new class if not in an input
        if (document.activeElement?.tagName !== "INPUT" && document.activeElement?.tagName !== "TEXTAREA") {
          e.preventDefault();
          setAddingClass(true);
          setViewMode("classes");
        }
      } else if (e.key === "v") {
        if (document.activeElement?.tagName !== "INPUT" && document.activeElement?.tagName !== "TEXTAREA") {
          if (clipboard) {
            e.preventDefault();
            pasteClipboard();
            setViewMode("classes");
          }
        }
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [undo, redo, canUndo, canRedo, clipboard, pasteClipboard]);

  const toggleExpandAll = useCallback(() => {
    setAllExpanded((prev) => {
      const next = !prev;
      setExpandKey((k) => k + 1);
      return next;
    });
  }, []);

  if (!initialized) {
    return (
      <div className="flex h-screen items-center justify-center bg-th-base">
        <p className="text-sm text-th-fg-3">Loading…</p>
      </div>
    );
  }

  const classes = activeOntology?.classes ?? [];
  const individuals = activeOntology?.individuals ?? [];
  const filteredClasses = search.trim()
    ? classes.filter((cls) =>
        cls.labels.some((l) => l.value.toLowerCase().includes(search.toLowerCase())) ||
        cls.localName.toLowerCase().includes(search.toLowerCase())
      )
    : classes;

  const sortedClasses = [...filteredClasses].sort((a, b) =>
    a.localName.localeCompare(b.localName)
  );

  const filteredIndividuals = search.trim()
    ? individuals.filter((ind) =>
        ind.localName.toLowerCase().includes(search.toLowerCase()) ||
        ind.uri.toLowerCase().includes(search.toLowerCase())
      )
    : individuals;

  const sortedIndividuals = [...filteredIndividuals].sort((a, b) =>
    a.localName.localeCompare(b.localName)
  );

  return (
    <div className="flex h-screen overflow-hidden bg-th-base font-sans text-th-fg">
      {/* Panel 1: Ontology list */}
      <aside className="flex w-48 flex-shrink-0 flex-col border-r border-th-border">
        <div className="flex items-center gap-2 border-b border-th-border px-3 py-2.5">
          <div className="h-2 w-2 rounded-full bg-blue-500" />
          <h1 className="text-xs font-semibold tracking-tight text-th-fg-2">
            Ontology Editor
          </h1>
          <button
            onClick={theme.toggle}
            className="ml-auto rounded p-1 text-th-fg-3 hover:text-th-fg"
            title={theme.dark ? "Switch to light mode" : "Switch to dark mode"}
          >
            {theme.dark ? <Sun size={13} /> : <Moon size={13} />}
          </button>
        </div>
        <div className="flex-1 overflow-y-auto">
          <OntologyList />
        </div>
      </aside>

      {/* Panel 2: Class browser (only when an ontology is loaded) */}
      {activeOntology && !classBrowserCollapsed && (
        <aside className="flex w-60 flex-shrink-0 flex-col border-r border-th-border">
          <ClassBrowserPanel
            onSelectClass={setSelectedClassId}
            selectedClassId={selectedClassId}
            onEditClass={(id) => {
              setSelectedClassId(id);
              setViewMode("classes");
            }}
          />
        </aside>
      )}

      {/* Main panel */}
      <main className="flex min-w-0 flex-1 flex-col overflow-hidden">
        {activeOntology ? (
          <>
            {/* Top bar */}
            <div className="flex items-center gap-3 border-b border-th-border px-4 py-2">
              <div className="min-w-0 flex-1">
                <h2 className="truncate text-sm font-semibold text-th-fg">
                  {activeOntology.metadata.ontologyLabel}
                </h2>
                <p className="truncate font-mono text-2xs text-th-fg-3">
                  {activeOntology.metadata.baseUri}
                </p>
              </div>

              {/* Search */}
              <input
                type="search"
                placeholder={viewMode === "individuals" ? "Filter individuals…" : "Filter classes…"}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-48 rounded bg-th-input px-2 py-1 text-xs text-th-fg placeholder-th-fg-4 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />

              {/* Class browser toggle */}
              <button
                onClick={toggleClassBrowser}
                className="rounded p-1 text-th-fg-3 hover:bg-th-hover hover:text-th-fg"
                title={classBrowserCollapsed ? "Show class browser" : "Hide class browser"}
              >
                {classBrowserCollapsed ? <PanelLeftOpen size={14} /> : <PanelLeftClose size={14} />}
              </button>

              {/* View mode tabs */}
              <div className="flex rounded border border-th-border-muted">
                <button
                  onClick={() => setViewMode("classes")}
                  className={`flex items-center gap-1 rounded-l px-2 py-1 text-2xs font-medium ${
                    viewMode === "classes"
                      ? "bg-blue-600 text-white"
                      : "text-th-fg-3 hover:bg-th-hover hover:text-th-fg"
                  }`}
                  title="Classes view"
                >
                  <Layers size={12} />
                  Classes
                </button>
                <button
                  onClick={() => setViewMode("individuals")}
                  className={`flex items-center gap-1 border-l border-th-border-muted px-2 py-1 text-2xs font-medium ${
                    viewMode === "individuals"
                      ? "bg-blue-600 text-white"
                      : "text-th-fg-3 hover:bg-th-hover hover:text-th-fg"
                  }`}
                  title="Individuals view"
                >
                  <Users size={12} />
                  Individuals
                  {individuals.length > 0 && (
                    <span className={`ml-0.5 text-2xs ${
                      viewMode === "individuals" ? "text-blue-200" : "text-th-fg-4"
                    }`}>
                      ({individuals.length})
                    </span>
                  )}
                </button>
                <button
                  onClick={() => setViewMode("graph")}
                  className={`flex items-center gap-1 border-l border-th-border-muted px-2 py-1 text-2xs font-medium ${
                    viewMode === "graph"
                      ? "bg-blue-600 text-white"
                      : "text-th-fg-3 hover:bg-th-hover hover:text-th-fg"
                  }`}
                  title="Class graph view"
                >
                  <Network size={12} />
                  Graph
                </button>
                <button
                  onClick={() => setViewMode("entity-graph")}
                  className={`flex items-center gap-1 border-l border-th-border-muted px-2 py-1 text-2xs font-medium ${
                    viewMode === "entity-graph"
                      ? "bg-blue-600 text-white"
                      : "text-th-fg-3 hover:bg-th-hover hover:text-th-fg"
                  }`}
                  title="Entity graph view"
                >
                  <Share2 size={12} />
                  Entities
                </button>
                <button
                  onClick={() => setViewMode("diff")}
                  className={`flex items-center gap-1 rounded-r border-l border-th-border-muted px-2 py-1 text-2xs font-medium ${
                    viewMode === "diff"
                      ? "bg-blue-600 text-white"
                      : "text-th-fg-3 hover:bg-th-hover hover:text-th-fg"
                  }`}
                  title="Diff / merge view"
                >
                  <GitCompare size={12} />
                  Diff
                </button>
              </div>

              {/* Expand/Collapse all (only in classes or individuals view) */}
              {viewMode !== "graph" && viewMode !== "entity-graph" && viewMode !== "diff" && (
                <button
                  onClick={toggleExpandAll}
                  className="flex items-center gap-1 rounded px-2 py-1 text-2xs text-th-fg-3 hover:bg-th-hover hover:text-th-fg"
                  title={allExpanded ? "Collapse all" : "Expand all"}
                >
                  {allExpanded ? <ChevronsUp size={13} /> : <ChevronsDown size={13} />}
                  {allExpanded ? "Collapse" : "Expand"}
                </button>
              )}

              {/* Undo / Redo */}
              <div className="flex items-center gap-0.5">
                <button
                  onClick={undo}
                  disabled={!canUndo()}
                  className="rounded px-1.5 py-1 text-2xs text-th-fg-3 hover:bg-th-hover hover:text-th-fg disabled:cursor-not-allowed disabled:opacity-30"
                  title="Undo (Ctrl+Z)"
                >
                  ↩
                </button>
                <button
                  onClick={redo}
                  disabled={!canRedo()}
                  className="rounded px-1.5 py-1 text-2xs text-th-fg-3 hover:bg-th-hover hover:text-th-fg disabled:cursor-not-allowed disabled:opacity-30"
                  title="Redo (Ctrl+Y)"
                >
                  ↪
                </button>
              </div>

              {/* Clipboard indicator + paste */}
              {clipboard && (
                <div className="flex items-center gap-0.5 rounded border border-purple-700/50 bg-purple-950/40 pl-1.5 pr-0.5 py-0.5">
                  <button
                    onClick={() => { pasteClipboard(); setViewMode("classes"); }}
                    className="flex items-center gap-1 text-2xs text-purple-300 hover:text-purple-200"
                    title="Paste (Ctrl+V)"
                  >
                    <Clipboard size={11} />
                    {clipboard.type === "class"
                      ? `${clipboard.cls.labels[0]?.value || clipboard.cls.localName}${clipboard.properties.length > 0 ? ` +${clipboard.properties.length}` : ""}`
                      : (clipboard.property.labels[0]?.value || clipboard.property.localName)}
                  </button>
                  <button
                    onClick={clearClipboard}
                    className="ml-0.5 rounded p-0.5 text-purple-500 hover:text-purple-300"
                    title="Clear clipboard"
                  >
                    <X size={10} />
                  </button>
                </div>
              )}

              {/* Validate */}
              <button
                onClick={() => setShowValidation((v) => !v)}
                className={`flex items-center gap-1 rounded px-2 py-1 text-2xs font-medium ${
                  showValidation
                    ? "bg-th-hover text-th-fg"
                    : "text-th-fg-3 hover:bg-th-hover hover:text-th-fg"
                }`}
                title="Toggle validation panel"
              >
                <ShieldCheck size={12} />
                Validate
              </button>

              <ImportExport />
            </div>

            {/* Validation panel */}
            {showValidation && activeOntology && (
              <ValidationPanel
                issues={validate(activeOntology)}
                onClose={() => setShowValidation(false)}
              />
            )}

            {/* Content: graph, entity-graph, diff, classes, or individuals */}
            {viewMode === "diff" ? (
              <div className="relative flex-1 overflow-hidden">
                <OntologyDiff />
              </div>
            ) : viewMode === "graph" ? (
              <div className="relative flex-1 overflow-hidden">
                <OntologyGraph onClose={() => setViewMode("classes")} />
              </div>
            ) : viewMode === "entity-graph" ? (
              <div className="relative flex-1 overflow-hidden">
                <EntityGraph />
              </div>
            ) : viewMode === "individuals" ? (
              <div className="flex-1 overflow-y-auto px-4 py-3">
                <div className="mx-auto w-full max-w-5xl">
                  {/* Stats */}
                  <div className="mb-3 flex items-center gap-3 text-2xs text-th-fg-3">
                    <span>{individuals.length} individuals</span>
                    <span>{classes.length} classes</span>
                  </div>

                  {/* Individual cards */}
                  <div className="space-y-2">
                    {sortedIndividuals.map((ind) => (
                      <IndividualCard
                        key={`${ind.id}-${expandKey}`}
                        individual={ind}
                        defaultExpanded={allExpanded}
                      />
                    ))}
                  </div>

                  {sortedIndividuals.length === 0 && (
                    <p className="mt-8 text-center text-sm text-th-fg-4">
                      {search
                        ? "No individuals match that filter."
                        : "No individuals found. Import a .ttl file with instance data to see them here."}
                    </p>
                  )}
                </div>
              </div>
            ) : (
              <div className="flex-1 overflow-y-auto px-4 py-3">
                <div className="mx-auto w-full max-w-5xl">
                  {/* Stats */}
                  <div className="mb-3 flex items-center gap-3 text-2xs text-th-fg-3">
                    <span>{classes.length} classes</span>
                    <span>{activeOntology.properties.length} properties</span>
                    {individuals.length > 0 && (
                      <span className="text-purple-500">
                        {individuals.length} individuals
                      </span>
                    )}
                    {activeOntology.unmappedTriples.length > 0 && (
                      <span className="text-amber-600">
                        {activeOntology.unmappedTriples.length} unmapped triples preserved
                      </span>
                    )}
                  </div>

                  {/* Add class form or button */}
                  {addingClass ? (
                    <div className="mb-3">
                      <ClassForm onDone={() => setAddingClass(false)} />
                    </div>
                  ) : (
                    <button
                      onClick={() => setAddingClass(true)}
                      className="mb-3 flex items-center gap-1 text-xs text-th-fg-3 hover:text-blue-400"
                    >
                      <Plus size={13} />
                      Add class
                    </button>
                  )}

                  {/* Class cards */}
                  <div className="space-y-2">
                    {sortedClasses.map((cls) => (
                      <ClassCard key={`${cls.id}-${expandKey}`} cls={cls} defaultExpanded={allExpanded} />
                    ))}
                  </div>

                  {sortedClasses.length === 0 && !addingClass && (
                    <p className="mt-8 text-center text-sm text-th-fg-4">
                      {search ? "No classes match that filter." : "No classes yet. Add one above."}
                    </p>
                  )}

                  {/* Unassigned properties */}
                  <UnassignedProperties />
                </div>
              </div>
            )}
          </>
        ) : (
          <div className="flex flex-1 items-center justify-center">
            <div className="text-center">
              <p className="text-sm text-th-fg-3">Create or import an ontology to get started.</p>
              <p className="mt-1 text-2xs text-th-fg-4">Use the sidebar controls on the left.</p>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
