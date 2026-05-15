/**
 * Shows properties that have no domain class assigned.
 * Supports forwardRef so App.tsx can scroll this section into view (U8).
 */

import { forwardRef } from "react";
import { useStore } from "../../lib/store";
import PropertyRow from "./PropertyRow";

const UnassignedProperties = forwardRef<HTMLDivElement>((_, ref) => {
  // Select the function reference (stable), call it during render.
  // Don't call it inside the selector — .filter() returns a new array every time,
  // which causes Zustand to detect a "change" and infinite-loop.
  const getUnassignedProperties = useStore((s) => s.getUnassignedProperties);
  const unassigned = getUnassignedProperties();

  if (unassigned.length === 0) return null;

  return (
    <div ref={ref} className="mt-4 rounded border border-amber-900/40 bg-th-surface">
      <div className="border-b border-amber-900/40 px-3 py-1.5">
        <span className="text-xs font-medium text-amber-600">
          Unassigned Properties
        </span>
        <span className="ml-1.5 text-2xs text-th-fg-4">
          ({unassigned.length} without a domain class)
        </span>
      </div>
      <div className="py-1">
        {unassigned.map((prop) => (
          <PropertyRow key={prop.id} property={prop} />
        ))}
      </div>
    </div>
  );
});

UnassignedProperties.displayName = "UnassignedProperties";

export default UnassignedProperties;
