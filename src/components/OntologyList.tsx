/**
 * Sidebar: list of saved ontologies with create/import/delete controls.
 */

import { useRef, useState } from "react";
import { Plus, Upload, Trash2, ChevronRight } from "lucide-react";
import { useStore } from "../lib/store";
import { supportsFileSystemAccess, openTurtleFile } from "../lib/file-access";

interface NewOntologyForm {
  label: string;
  baseUri: string;
}

export default function OntologyList() {
  const ontologies = useStore((s) => s.ontologies);
  const activeOntologyId = useStore((s) => s.activeOntologyId);
  const setActiveOntology = useStore((s) => s.setActiveOntology);
  const createOntology = useStore((s) => s.createOntology);
  const deleteOntology = useStore((s) => s.deleteOntology);
  const importOntology = useStore((s) => s.importOntology);
  const importOntologyWithHandle = useStore((s) => s.importOntologyWithHandle);

  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState<NewOntologyForm>({ label: "", baseUri: "" });
  const fileRef = useRef<HTMLInputElement>(null);

  const handleCreate = () => {
    if (!form.label.trim()) return;
    createOntology({
      ontologyLabel: form.label.trim(),
      baseUri: form.baseUri.trim() || `http://example.org/${form.label.toLowerCase().replace(/\s+/g, "-")}/`,
    });
    setForm({ label: "", baseUri: "" });
    setCreating(false);
  };

  const handleImport = async () => {
    // Try the File System Access API first (Chrome/Edge) — gives us a writable handle
    if (supportsFileSystemAccess()) {
      try {
        const result = await openTurtleFile();
        if (!result) return; // user cancelled
        const id = importOntologyWithHandle(result.text, result.fileName, result.handle);
        console.log("[import] success with file handle, ontology id:", id);
        return;
      } catch (err) {
        console.error("[import] File System Access API failed, falling back:", err);
      }
    }

    // Fallback: classic <input type="file">
    fileRef.current?.click();
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const text = ev.target?.result;
        if (typeof text === "string") {
          const id = importOntology(text, file.name);
          console.log("[import] success (no file handle), ontology id:", id);
        } else {
          console.error("[import] FileReader result was not a string");
        }
      } catch (err) {
        console.error("[import] error during import:", err);
        alert(`Import failed: ${err instanceof Error ? err.message : String(err)}`);
      }
    };
    reader.onerror = () => console.error("[import] FileReader error");
    reader.readAsText(file);
    e.target.value = "";
  };

  return (
    <div className="flex h-full flex-col">
      {/* Action bar */}
      <div className="flex items-center gap-1 border-b border-th-border-muted px-2 py-2">
        <button
          onClick={() => setCreating((c) => !c)}
          className="flex items-center gap-1 rounded px-2 py-1 text-2xs text-th-fg-3 hover:bg-th-hover hover:text-th-fg"
          title="New ontology"
        >
          <Plus size={12} />
          New
        </button>
        <button
          onClick={handleImport}
          className="flex items-center gap-1 rounded px-2 py-1 text-2xs text-th-fg-3 hover:bg-th-hover hover:text-th-fg"
          title="Import .ttl file"
        >
          <Upload size={12} />
          Import
        </button>
        <input
          ref={fileRef}
          type="file"
          accept=".ttl,.n3,.turtle"
          className="hidden"
          onChange={handleFileInputChange}
        />
      </div>

      {/* New ontology form */}
      {creating && (
        <div className="border-b border-th-border-muted p-2 space-y-1.5">
          <input
            type="text"
            placeholder="Label"
            value={form.label}
            onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))}
            onKeyDown={(e) => { if (e.key === "Enter") handleCreate(); if (e.key === "Escape") setCreating(false); }}
            autoFocus
            className="w-full rounded bg-th-input px-2 py-1 text-xs text-th-fg placeholder-th-fg-4 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
          <input
            type="text"
            placeholder="Base URI (optional)"
            value={form.baseUri}
            onChange={(e) => setForm((f) => ({ ...f, baseUri: e.target.value }))}
            onKeyDown={(e) => { if (e.key === "Enter") handleCreate(); if (e.key === "Escape") setCreating(false); }}
            className="w-full rounded bg-th-input px-2 py-1 font-mono text-xs text-th-fg placeholder-th-fg-4 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
          <div className="flex gap-1">
            <button
              onClick={handleCreate}
              className="rounded bg-blue-600 px-2 py-0.5 text-2xs font-medium text-white hover:bg-blue-500"
            >
              Create
            </button>
            <button
              onClick={() => setCreating(false)}
              className="rounded bg-th-hover px-2 py-0.5 text-2xs text-th-fg-2 hover:bg-th-border"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Ontology list */}
      <div className="flex-1 overflow-y-auto">
        {ontologies.length === 0 ? (
          <p className="p-3 text-2xs text-th-fg-4">No ontologies yet. Create or import one.</p>
        ) : (
          ontologies.map((onto) => (
            <div
              key={onto.id}
              onClick={() => setActiveOntology(onto.id)}
              className={`group flex cursor-pointer items-center gap-1 px-2 py-2 ${
                onto.id === activeOntologyId
                  ? "bg-th-hover text-th-fg"
                  : "text-th-fg-3 hover:bg-th-surface hover:text-th-fg"
              }`}
            >
              <ChevronRight
                size={12}
                className={`flex-shrink-0 ${onto.id === activeOntologyId ? "text-blue-400" : "text-th-fg-4"}`}
              />
              <div className="min-w-0 flex-1">
                <div className="truncate text-xs">{onto.metadata.ontologyLabel || "Untitled"}</div>
                <div className="truncate font-mono text-2xs text-th-fg-4">
                  {onto.metadata.baseUri}
                </div>
              </div>
              <button
                onClick={(e) => { e.stopPropagation(); deleteOntology(onto.id); }}
                className="flex-shrink-0 rounded p-1 opacity-0 text-th-fg-4 hover:text-red-400 group-hover:opacity-100"
                title="Delete"
              >
                <Trash2 size={11} />
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
