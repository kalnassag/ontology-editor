/**
 * Interactive SVG graph visualisation of the ontology.
 * Shows classes as nodes and relationships (subClassOf, objectProperty ranges) as edges.
 * Uses a force-directed layout computed on mount.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { X, ZoomIn, ZoomOut, Maximize2 } from "lucide-react";
import { useStore } from "../lib/store";
import { computeLayout } from "../lib/graph-utils";
import ClassForm from "./ClassForm";
import type { OntologyClass } from "../types";

interface Node {
  id: string;
  label: string;
  uri: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  propertyCount: number;
}

interface Edge {
  source: string;
  target: string;
  label: string;
  type: "subClassOf" | "objectProperty" | "inverseOf";
}

interface Props {
  onClose: () => void;
}

/* ── Component ────────────────────────────────────────────────── */

export default function OntologyGraph({ onClose }: Props) {
  const activeOntology = useStore((s) => s.getActiveOntology());
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Pan/zoom state
  type ViewBox = { x: number; y: number; w: number; h: number };
  const [viewBox, setViewBox] = useState<ViewBox>({ x: 0, y: 0, w: 1600, h: 1000 });
  const [dragging, setDragging] = useState<{ nodeId: string } | { pan: true; startX: number; startY: number; startVB: ViewBox } | null>(null);
  const [dragNodePos, setDragNodePos] = useState<{ id: string; x: number; y: number } | null>(null);

  // rAF-throttled drag updates — avoids a full re-render on every mousemove
  const rafRef = useRef<number | null>(null);
  const pendingDragPos = useRef<{ id: string; x: number; y: number } | null>(null);
  const pendingViewBox = useRef<ViewBox | null>(null);

  // Build nodes & edges from ontology
  const classes = activeOntology?.classes ?? [];
  const properties = activeOntology?.properties ?? [];

  const [nodes, setNodes] = useState<Node[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const [hoveredNode, setHoveredNode] = useState<string | null>(null);
  const [editingClassId, setEditingClassId] = useState<string | null>(null);
  const [editPanelPos, setEditPanelPos] = useState({ x: 0, y: 0 });

  useEffect(() => {
    if (classes.length === 0) return;

    const classMap = new Map<string, OntologyClass>();
    for (const cls of classes) classMap.set(cls.uri, cls);

    // Count properties per class
    const propCount = new Map<string, number>();
    for (const prop of properties) {
      if (prop.domainUri) {
        propCount.set(prop.domainUri, (propCount.get(prop.domainUri) ?? 0) + 1);
      }
    }

    const newNodes: Node[] = classes.map((cls) => ({
      id: cls.id,
      label: cls.labels[0]?.value || cls.localName,
      uri: cls.uri,
      x: 0,
      y: 0,
      vx: 0,
      vy: 0,
      propertyCount: propCount.get(cls.uri) ?? 0,
    }));

    const newEdges: Edge[] = [];

    // subClassOf edges
    for (const cls of classes) {
      for (const parentUri of cls.subClassOf) {
        const parent = classes.find((c) => c.uri === parentUri);
        if (parent) {
          newEdges.push({
            source: cls.id,
            target: parent.id,
            label: "subClassOf",
            type: "subClassOf",
          });
        }
      }
    }

    // ObjectProperty domain→range edges — collapse inverse pairs into bidirectional edges
    const seenInverse = new Set<string>();
    for (const prop of properties) {
      if (prop.type !== "owl:ObjectProperty" || !prop.domainUri || !prop.range) continue;
      const domainCls = classes.find((c) => c.uri === prop.domainUri);
      const rangeCls = classes.find((c) => c.uri === prop.range);
      if (!domainCls || !rangeCls) continue;

      if (prop.inverseOf) {
        const pairKey = [prop.uri, prop.inverseOf].sort().join("|");
        if (seenInverse.has(pairKey)) continue;
        seenInverse.add(pairKey);
        const invProp = properties.find((p) => p.uri === prop.inverseOf);
        const invLabel = invProp ? (invProp.labels[0]?.value || invProp.localName) : "inverse";
        newEdges.push({
          source: domainCls.id,
          target: rangeCls.id,
          label: `${prop.labels[0]?.value || prop.localName} ⇌ ${invLabel}`,
          type: "inverseOf",
        });
      } else {
        // Skip if this prop is the target of an already-rendered inverse pair
        const alreadyRendered = properties.some(
          (p) => p.inverseOf === prop.uri && seenInverse.has([p.uri, prop.uri].sort().join("|"))
        );
        if (alreadyRendered) continue;
        newEdges.push({
          source: domainCls.id,
          target: rangeCls.id,
          label: prop.labels[0]?.value || prop.localName,
          type: "objectProperty",
        });
      }
    }

    const w = Math.max(1600, 280 * Math.sqrt(classes.length));
    const h = Math.max(1000, 220 * Math.sqrt(classes.length));
    computeLayout(newNodes, newEdges, w, h);
    setNodes(newNodes);
    setEdges(newEdges);
    setViewBox({ x: 0, y: 0, w, h });
  }, [classes, properties]);

  const getNodePos = useCallback(
    (id: string) => {
      if (dragNodePos && dragNodePos.id === id) {
        return { x: dragNodePos.x, y: dragNodePos.y };
      }
      const node = nodes.find((n) => n.id === id);
      return node ? { x: node.x, y: node.y } : { x: 0, y: 0 };
    },
    [nodes, dragNodePos]
  );

  /* ── Zoom ────────────────────────────────────────────────────── */
  const zoom = (factor: number) => {
    setViewBox((vb) => {
      const newW = vb.w * factor;
      const newH = vb.h * factor;
      return {
        x: vb.x + (vb.w - newW) / 2,
        y: vb.y + (vb.h - newH) / 2,
        w: newW,
        h: newH,
      };
    });
  };

  const fitToView = () => {
    if (nodes.length === 0) return;
    const padding = 100;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const n of nodes) {
      if (n.x < minX) minX = n.x;
      if (n.y < minY) minY = n.y;
      if (n.x > maxX) maxX = n.x;
      if (n.y > maxY) maxY = n.y;
    }
    setViewBox({
      x: minX - padding,
      y: minY - padding,
      w: maxX - minX + padding * 2,
      h: maxY - minY + padding * 2,
    });
  };

  /* ── Mouse handling ──────────────────────────────────────────── */
  const svgPoint = (clientX: number, clientY: number) => {
    const svg = svgRef.current;
    if (!svg) return { x: 0, y: 0 };
    const rect = svg.getBoundingClientRect();
    return {
      x: viewBox.x + ((clientX - rect.left) / rect.width) * viewBox.w,
      y: viewBox.y + ((clientY - rect.top) / rect.height) * viewBox.h,
    };
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    // Only pan on background click (left button)
    if (e.button !== 0) return;
    const target = e.target as SVGElement;
    const nodeId = target.closest("[data-node-id]")?.getAttribute("data-node-id");
    if (nodeId) {
      setDragging({ nodeId });
      e.preventDefault();
    } else {
      setDragging({ pan: true, startX: e.clientX, startY: e.clientY, startVB: { ...viewBox } });
      e.preventDefault();
    }
  };

  const handleDoubleClick = (e: React.MouseEvent) => {
    const target = e.target as SVGElement;
    const nodeId = target.closest("[data-node-id]")?.getAttribute("data-node-id");
    if (!nodeId) return;
    const node = nodes.find((n) => n.id === nodeId);
    if (!node) return;
    // Convert SVG node position to container-relative screen position
    const container = containerRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    const screenX = ((node.x - viewBox.x) / viewBox.w) * rect.width;
    const screenY = ((node.y - viewBox.y) / viewBox.h) * rect.height;
    // Clamp so panel stays inside the container
    const panelW = 360;
    const panelH = 480;
    setEditPanelPos({
      x: Math.min(Math.max(screenX + 20, 8), rect.width - panelW - 8),
      y: Math.min(Math.max(screenY - 40, 40), rect.height - panelH - 8),
    });
    setEditingClassId(nodeId);
  };

  const flushPending = useCallback(() => {
    rafRef.current = null;
    if (pendingDragPos.current) {
      setDragNodePos(pendingDragPos.current);
      pendingDragPos.current = null;
    }
    if (pendingViewBox.current) {
      setViewBox(pendingViewBox.current);
      pendingViewBox.current = null;
    }
  }, []);

  const scheduleFlush = useCallback(() => {
    if (rafRef.current != null) return;
    rafRef.current = requestAnimationFrame(flushPending);
  }, [flushPending]);

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!dragging) return;
    if ("pan" in dragging) {
      const dx = (e.clientX - dragging.startX) / (containerRef.current?.clientWidth ?? 1) * dragging.startVB.w;
      const dy = (e.clientY - dragging.startY) / (containerRef.current?.clientHeight ?? 1) * dragging.startVB.h;
      pendingViewBox.current = {
        ...dragging.startVB,
        x: dragging.startVB.x - dx,
        y: dragging.startVB.y - dy,
      };
      scheduleFlush();
    } else if ("nodeId" in dragging) {
      const pt = svgPoint(e.clientX, e.clientY);
      pendingDragPos.current = { id: dragging.nodeId, x: pt.x, y: pt.y };
      scheduleFlush();
    }
  };

  const handleMouseUp = () => {
    // Flush any in-flight rAF so the final position below is the latest
    if (rafRef.current != null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    const finalPos = pendingDragPos.current ?? dragNodePos;
    pendingDragPos.current = null;
    pendingViewBox.current = null;
    if (dragging && "nodeId" in dragging && finalPos) {
      setNodes((prev) =>
        prev.map((n) =>
          n.id === finalPos.id ? { ...n, x: finalPos.x, y: finalPos.y } : n
        )
      );
      setDragNodePos(null);
    }
    setDragging(null);
  };

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const factor = e.deltaY > 0 ? 1.1 : 0.9;
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const mx = viewBox.x + ((e.clientX - rect.left) / rect.width) * viewBox.w;
    const my = viewBox.y + ((e.clientY - rect.top) / rect.height) * viewBox.h;
    setViewBox((vb) => {
      const newW = vb.w * factor;
      const newH = vb.h * factor;
      return {
        x: mx - (mx - vb.x) * factor,
        y: my - (my - vb.y) * factor,
        w: newW,
        h: newH,
      };
    });
  };

  /* ── Edge path with curvature for parallel edges ─────────────── */
  const renderEdge = (edge: Edge, index: number) => {
    const s = getNodePos(edge.source);
    const t = getNodePos(edge.target);

    const parallelEdges = edges.filter(
      (e) =>
        (e.source === edge.source && e.target === edge.target) ||
        (e.source === edge.target && e.target === edge.source)
    );
    const parallelIndex = parallelEdges.indexOf(edge);
    const offset = parallelEdges.length > 1 ? (parallelIndex - (parallelEdges.length - 1) / 2) * 30 : 0;

    const mx = (s.x + t.x) / 2;
    const my = (s.y + t.y) / 2;
    const dx = t.x - s.x;
    const dy = t.y - s.y;
    const len = Math.sqrt(dx * dx + dy * dy) || 1;
    const px = -dy / len;
    const py = dx / len;
    const cx2 = mx + px * offset;
    const cy2 = my + py * offset;

    // Bezier midpoint (t=0.5) is a better label anchor than the control point
    const lx = 0.25 * s.x + 0.5 * cx2 + 0.25 * t.x;
    const ly = 0.25 * s.y + 0.5 * cy2 + 0.25 * t.y;

    const color =
      edge.type === "subClassOf" ? "var(--th-fg-4)"
      : edge.type === "inverseOf" ? "#a855f7"
      : "#3b82f6";
    const dash = edge.type === "subClassOf" ? "6,3" : "none";
    const markerEnd = edge.type === "subClassOf" ? "url(#arrow-sub)" : edge.type === "inverseOf" ? "url(#arrow-inv)" : "url(#arrow-obj)";
    const markerStart = edge.type === "inverseOf" ? "url(#arrow-inv)" : undefined;

    const trunc = (s: string, max: number) => s.length > max ? s.slice(0, max - 1) + "…" : s;
    const FONT = "IBM Plex Sans, sans-serif";

    let labelEl: React.ReactNode;
    if (edge.type === "inverseOf") {
      const parts = edge.label.split(" ⇌ ");
      const fwd = trunc(parts[0] ?? "", 15);
      const inv = trunc(parts[1] ?? "", 15);
      const maxChars = Math.max(fwd.length, inv.length + 2);
      const bgW = maxChars * 5.2 + 12;
      const bgH = 27;
      labelEl = (
        <g>
          <rect x={lx - bgW / 2} y={ly - bgH / 2} width={bgW} height={bgH} rx={3}
            fill="var(--th-surface)" stroke="#a855f7" strokeWidth={0.5} opacity={0.95} />
          <text textAnchor="middle" fill={color} fontSize={9} fontFamily={FONT} fontWeight={500}>
            <tspan x={lx} y={ly - 4}>{fwd}</tspan>
            <tspan x={lx} dy={12}>⇌ {inv}</tspan>
          </text>
        </g>
      );
    } else {
      const lbl = trunc(edge.label, 20);
      const bgW = lbl.length * 5.2 + 10;
      const bgH = 14;
      labelEl = (
        <g>
          <rect x={lx - bgW / 2} y={ly - bgH} width={bgW} height={bgH} rx={3}
            fill="var(--th-surface)" opacity={0.85} />
          <text x={lx} y={ly - 4} textAnchor="middle" fill={color} fontSize={9} fontFamily={FONT}>
            {lbl}
          </text>
        </g>
      );
    }

    return (
      <g key={`edge-${index}`}>
        <path
          d={`M ${s.x} ${s.y} Q ${cx2} ${cy2} ${t.x} ${t.y}`}
          fill="none"
          stroke={color}
          strokeWidth={1.5}
          strokeDasharray={dash}
          markerEnd={markerEnd}
          markerStart={markerStart}
          opacity={0.7}
        />
        {labelEl}
      </g>
    );
  };

  /* ── Node rendering ──────────────────────────────────────────── */
  const renderNode = (node: Node) => {
    const pos = getNodePos(node.id);
    const isHovered = hoveredNode === node.id;
    const baseRadius = 28 + Math.min(node.propertyCount * 3, 20);
    const r = isHovered ? baseRadius + 4 : baseRadius;

    return (
      <g
        key={node.id}
        data-node-id={node.id}
        style={{ cursor: "grab" }}
        onMouseEnter={() => setHoveredNode(node.id)}
        onMouseLeave={() => setHoveredNode(null)}
      >
        {/* Glow */}
        {isHovered && (
          <circle
            cx={pos.x}
            cy={pos.y}
            r={r + 6}
            fill="none"
            stroke="#3b82f6"
            strokeWidth={2}
            opacity={0.3}
          />
        )}
        {/* Node circle */}
        <circle
          cx={pos.x}
          cy={pos.y}
          r={r}
          fill="var(--th-surface)"
          stroke={isHovered ? "#3b82f6" : "var(--th-border)"}
          strokeWidth={isHovered ? 2 : 1.5}
        />
        {/* Label */}
        <text
          x={pos.x}
          y={pos.y - 2}
          textAnchor="middle"
          dominantBaseline="middle"
          fill="var(--th-fg)"
          fontSize={12}
          fontWeight={600}
          fontFamily="IBM Plex Sans, sans-serif"
          pointerEvents="none"
        >
          {node.label.length > 16 ? node.label.slice(0, 14) + "…" : node.label}
        </text>
        {/* Property count */}
        {node.propertyCount > 0 && (
          <text
            x={pos.x}
            y={pos.y + 14}
            textAnchor="middle"
            dominantBaseline="middle"
            fill="var(--th-fg-3)"
            fontSize={9}
            fontFamily="IBM Plex Sans, sans-serif"
            pointerEvents="none"
          >
            {node.propertyCount} prop{node.propertyCount !== 1 ? "s" : ""}
          </text>
        )}
      </g>
    );
  };

  if (!activeOntology) return null;

  return (
    <div className="flex h-full flex-col bg-th-base" ref={containerRef}>
      {/* Toolbar */}
      <div className="flex items-center gap-2 border-b border-th-border px-3 py-2">
        <h3 className="text-xs font-semibold text-th-fg">Class Graph</h3>

        {/* Legend */}
        <div className="ml-4 flex items-center gap-4 text-2xs text-th-fg-3">
          <span className="flex items-center gap-1">
            <svg width="20" height="8"><line x1="0" y1="4" x2="20" y2="4" stroke="var(--th-fg-4)" strokeWidth="1.5" strokeDasharray="4,2" /></svg>
            subClassOf
          </span>
          <span className="flex items-center gap-1">
            <svg width="20" height="8"><line x1="0" y1="4" x2="20" y2="4" stroke="#3b82f6" strokeWidth="1.5" /></svg>
            Object Property
          </span>
          <span className="flex items-center gap-1">
            <svg width="20" height="8"><line x1="0" y1="4" x2="20" y2="4" stroke="#a855f7" strokeWidth="1.5" /></svg>
            Inverse Pair
          </span>
        </div>

        <div className="ml-auto flex items-center gap-1">
          <button
            onClick={() => zoom(0.8)}
            className="rounded p-1 text-th-fg-3 hover:bg-th-hover hover:text-th-fg"
            title="Zoom in"
          >
            <ZoomIn size={14} />
          </button>
          <button
            onClick={() => zoom(1.25)}
            className="rounded p-1 text-th-fg-3 hover:bg-th-hover hover:text-th-fg"
            title="Zoom out"
          >
            <ZoomOut size={14} />
          </button>
          <button
            onClick={fitToView}
            className="rounded p-1 text-th-fg-3 hover:bg-th-hover hover:text-th-fg"
            title="Fit to view"
          >
            <Maximize2 size={14} />
          </button>
          <button
            onClick={onClose}
            className="ml-2 rounded p-1 text-th-fg-3 hover:bg-th-hover hover:text-th-fg"
            title="Close graph"
          >
            <X size={14} />
          </button>
        </div>
      </div>

      {/* Graph area */}
      {nodes.length === 0 ? (
        <div className="flex flex-1 items-center justify-center">
          <p className="text-sm text-th-fg-3">No classes to visualise.</p>
        </div>
      ) : (
        <svg
          ref={svgRef}
          className="flex-1"
          viewBox={`${viewBox.x} ${viewBox.y} ${viewBox.w} ${viewBox.h}`}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          onWheel={handleWheel}
          onDoubleClick={handleDoubleClick}
          style={{ cursor: dragging && "pan" in dragging ? "grabbing" : "default" }}
        >
          <defs>
            <marker id="arrow-sub" viewBox="0 0 10 10" refX="10" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse" fill="var(--th-fg-4)">
              <path d="M 0 2 L 10 5 L 0 8 z" />
            </marker>
            <marker id="arrow-obj" viewBox="0 0 10 10" refX="10" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse" fill="#3b82f6">
              <path d="M 0 2 L 10 5 L 0 8 z" />
            </marker>
            <marker id="arrow-inv" viewBox="0 0 10 10" refX="10" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse" fill="#a855f7">
              <path d="M 0 2 L 10 5 L 0 8 z" />
            </marker>
          </defs>

          {/* Edges */}
          {edges.map((edge, i) => renderEdge(edge, i))}

          {/* Nodes (rendered last so they're on top) */}
          {nodes.map(renderNode)}
        </svg>
      )}

      {/* Hover tooltip */}
      {hoveredNode && (
        <div className="absolute bottom-3 left-3 rounded border border-th-border bg-th-surface px-3 py-2 shadow-lg">
          {(() => {
            const node = nodes.find((n) => n.id === hoveredNode);
            if (!node) return null;
            const cls = classes.find((c) => c.id === node.id);
            return (
              <div>
                <div className="text-xs font-semibold text-th-fg">{node.label}</div>
                <div className="font-mono text-2xs text-th-fg-3">{node.uri}</div>
                {cls?.descriptions[0]?.value && (
                  <div className="mt-1 max-w-xs text-2xs text-th-fg-2">
                    {cls.descriptions[0].value}
                  </div>
                )}
              </div>
            );
          })()}
        </div>
      )}

      {/* Floating class edit panel — opened by double-clicking a node */}
      {editingClassId && (() => {
        const cls = classes.find((c) => c.id === editingClassId);
        if (!cls) return null;
        return (
          <div
            style={{ position: "absolute", left: editPanelPos.x, top: editPanelPos.y, width: 360, zIndex: 50 }}
            className="rounded border border-th-border shadow-2xl"
          >
            <div className="flex items-center justify-between rounded-t border-b border-th-border-muted bg-th-surface px-3 py-1.5">
              <span className="text-xs font-semibold text-th-fg">Edit: {cls.labels[0]?.value || cls.localName}</span>
              <button onClick={() => setEditingClassId(null)} className="rounded p-0.5 text-th-fg-4 hover:text-th-fg"><X size={13} /></button>
            </div>
            <div className="max-h-[440px] overflow-y-auto">
              <ClassForm existing={cls} onDone={() => setEditingClassId(null)} />
            </div>
          </div>
        );
      })()}
    </div>
  );
}
