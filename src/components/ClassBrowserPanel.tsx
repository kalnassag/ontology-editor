/**
 * Side panel for browsing the class hierarchy and viewing class details.
 * Shows a collapsible subClassOf tree in the upper section and a detail
 * pane for the selected class in the lower section.
 */

import { useState } from "react";
import { Search, X } from "lucide-react";
import ClassHierarchyTree from "./ClassHierarchyTree";
import ClassDetailPane from "./ClassDetailPane";

interface Props {
  onSelectClass: (id: string | null) => void;
  selectedClassId: string | null;
  onEditClass: (id: string) => void;
}

export default function ClassBrowserPanel({ onSelectClass, selectedClassId, onEditClass }: Props) {
  const [search, setSearch] = useState("");

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Header + search */}
      <div className="flex-shrink-0 border-b border-th-border px-3 py-2">
        <div className="mb-1.5 text-2xs font-semibold uppercase tracking-wide text-th-fg-4">
          Class Browser
        </div>
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

      {/* Tree — scrollable, takes remaining space above detail pane */}
      <div className={`overflow-y-auto px-1 py-1 ${selectedClassId ? "flex-1" : "flex-1"}`}>
        <ClassHierarchyTree
          onSelectClass={onSelectClass}
          selectedClassId={selectedClassId}
          search={search}
        />
      </div>

      {/* Detail pane — shown below tree when a class is selected */}
      {selectedClassId && (
        <div className="flex-shrink-0 overflow-hidden">
          <ClassDetailPane
            classId={selectedClassId}
            onEditClass={onEditClass}
            onSelectClass={onSelectClass}
          />
        </div>
      )}
    </div>
  );
}
