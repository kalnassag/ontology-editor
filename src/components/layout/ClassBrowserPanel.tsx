/**
 * Side panel for browsing the class hierarchy.
 */

import { useState } from "react";
import { Search, X } from "lucide-react";
import ClassHierarchyTree from "../core/ClassHierarchyTree";

interface Props {
  onSelectClass: (id: string | null) => void;
  onDoubleClickClass: (id: string) => void;
  selectedClassId: string | null;
}

export default function ClassBrowserPanel({ onSelectClass, onDoubleClickClass, selectedClassId }: Props) {
  const [search, setSearch] = useState("");

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Header + search */}
      <div className="flex-shrink-0 border-b border-th-border px-3 py-2">
        <div className="text-2xs font-semibold uppercase tracking-wide text-th-fg-3">
          Jump to class
        </div>
        <div className="mb-1.5 text-2xs text-th-fg-4">Double-click to navigate</div>
        <div className="relative">
          <Search size={11} className="absolute left-2 top-1/2 -translate-y-1/2 text-th-fg-4" />
          <input
            type="text"
            placeholder="Filter classes…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="input-base w-full py-1 pl-6 pr-6 text-xs"
          />
          {search && (
            <button
              onClick={() => setSearch("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-th-fg-4 hover:text-th-fg"
            >
              <X size={11} />
            </button>
          )}
        </div>
      </div>

      {/* Tree — scrollable */}
      <div className="flex-1 overflow-y-auto px-1 py-1">
        <ClassHierarchyTree
          onSelectClass={onSelectClass}
          onDoubleClickClass={onDoubleClickClass}
          selectedClassId={selectedClassId}
          search={search}
        />
      </div>
    </div>
  );
}
