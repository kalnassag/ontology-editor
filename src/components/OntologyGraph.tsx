/**
 * Interactive SVG graph visualisation of the ontology.
 * Shows classes as nodes and relationships (subClassOf, objectProperty ranges) as edges.
 * Uses a force-directed layout computed on mount.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { X, ZoomIn, ZoomOut, Maximize2 } from "lucide-react";
import { useStore } from "../lib/store";
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
  type: "subClassOf" | "objectProperty";
}

interface Props {
  onClose: () => void;
}

/* ── Force-directed layout helpers ────────────────────────────── */

function computeLayout(
  nodes: Node[],
  edges: Edge[],
  width: number,
  height: number,
  iterations = 200
): void {
  // Initial positions: spread in a circle
  const cx = width / 2;
  const cy = height / 2;
  const radius = Math.min(width, height) * 0.35;
  nodes.forEach((n, i) => {
    const angle = (2 * Math.PI * i) / nodes.length;
    n.x = cx + radius * Math.cos(angle);
    n.y = cy + radius * Math.sin(angle);
    n.vx = 0;
    n.vy = 0;
  });

  const nodeMap = new Map<string, Node>();
  for (const n of nodes) nodeMap.set(n.id, n);

  for (let iter = 0; iter < iterations; iter++) {
    const alpha = 1 - iter / iterations; // cooling
    const repulsion = 8000;
    const attraction = 0.005;
    const damping = 0.85;

    // Repulsion between all pairs
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const a = nodes[i]!;
        const b = nodes[j]!;
        let dx = b.x - a.x;
        let dy = b.y - a.y;
        const dist = Math.sqrt(dx * dx + dy * dy) || 1;
        const force = (repulsion * alpha) / (dist * dist);
        dx = (dx / dist) * force;
        dy = (dy / dist) * force;
        a.vx -= dx;
        a.vy -= dy;
        b.vx += dx;
        b.vy += dy;
      }
    }

    // Attraction along edges
    for (const edge of edges) {
      const a = nodeMap.get(edge.source);
      const b = nodeMap.get(edge.target);
      if (!a || !b) continue;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const dist = Math.sqrt(dx * dx + dy * dy) || 1;
      const force = dist * attraction * alpha;
      const fx = (dx / dist) * force;
      const fy = (dy / dist) * force;
      a.vx += fx;
      a.vy += fy;
      b.vx -= fx;
      b.vy -= fy;
    }

    // Gravity towards centre
    for (const n of nodes) {
      n.vx += (cx - n.x) * 0.001 * alpha;
      n.vy += (cy - n.y) * 0.001 * alpha;
    }

    // Apply velocities
    for (const n of nodes) {
      n.vx *= damping;
      n.vy *= damping;
      n.x += n.vx;
      n.y += n.vy;
      // Keep in bounds
      n.x = Math.max(80, Math.min(width - 80, n.x));
      n.y = Math.max(40, Math.min(height - 40, n.y));
    }
  }
}

/* ── Component ────────────────────────────────────────────────── */

export default function OntologyGraph({ onClose }: Props) {
  const activeOntology = useStore((s) => s.getActiveOntology());
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Pan/zoom state
  const [viewBox, setViewBox] = useState({ x: 0, y: 0, w: 1200, h: 800 });
  const [dragging, setDragging] = useState<{ nodeId: string } | { pan: true; startX: number; startY: number; startVB: typeof viewBox } | null>(null);
  const [dragNodePos, setDragNodePos] = useState<{ id: string; x: number; y: number } | null>(null);

  // Build nodes & edges from ontology
  const classes = activeOntology?.classes ?? [];
  const properties = activeOntology?.properties ?? [];

  const [nodes, setNodes] = useState<Node[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const [hoveredNode, setHoveredNode] = useState<string | null>(null);

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

    // ObjectProperty domain→range edges
    for (const prop of properties) {
      if (prop.type === "owl:ObjectProperty" && prop.domainUri && prop.range) {
        const domainCls = classes.find((c) => c.uri === prop.domainUri);
        const rangeCls = classes.find((c) => c.uri === prop.range);
        if (domainCls && rangeCls) {
          newEdges.push({
            source: domainCls.id,
            target: rangeCls.id,
            label: prop.labels[0]?.value || prop.localName,
            type: "objectProperty",
          });
        }
      }
    }

    const w = 1200;
    const h = 800;
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

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!dragging) return;
    if ("pan" in dragging) {
      const dx = (e.clientX - dragging.startX) / (containerRef.current?.clientWidth ?? 1) * dragging.startVB.w;
      const dy = (e.clientY - dragging.startY) / (containerRef.current?.clientHeight ?? 1) * dragging.startVB.h;
      setViewBox({
        ...dragging.startVB,
        x: dragging.startVB.x - dx,
        y: dragging.startVB.y - dy,
      });
    } else if ("nodeId" in dragging) {
      const pt = svgPoint(e.clientX, e.clientY);
      setDragNodePos({ id: dragging.nodeId, x: pt.x, y: pt.y });
    }
  };

  const handleMouseUp = () => {
    if (dragging && "nodeId" in dragging && dragNodePos) {
      setNodes((prev) =>
        prev.map((n) =>
          n.id === dragNodePos.id ? { ...n, x: dragNodePos.x, y: dragNodePos.y } : n
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

    // Count parallel edges between same pair
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
    // Perpendicular offset
    const px = -dy / len;
    const py = dx / len;
    const cx2 = mx + px * offset;
    const cy2 = my + py * offset;

    const isSubClass = edge.type === "subClassOf";
    const color = isSubClass ? "var(--th-fg-4)" : "#3b82f6";
    const dash = isSubClass ? "6,3" : "none";

    return (
      <g key={`edge-${index}`}>
        <path
          d={`M ${s.x} ${s.y} Q ${cx2} ${cy2} ${t.x} ${t.y}`}
          fill="none"
          stroke={color}
          strokeWidth={1.5}
          strokeDasharray={dash}
          markerEnd={`url(#arrow-${isSubClass ? "sub" : "obj"})`}
          opacity={0.7}
        />
        {/* Edge label */}
        <text
          x={cx2}
          y={cy2 - 6}
          textAnchor="middle"
          fill={color}
          fontSize={10}
          fontFamily="IBM Plex Sans, sans-serif"
          opacity={0.9}
        >
          {edge.label}
        </text>
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
          style={{ cursor: dragging && "pan" in dragging ? "grabbing" : "default" }}
        >
          <defs>
            {/* Arrowhead markers */}
            <marker id="arrow-sub" viewBox="0 0 10 10" refX="10" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse" fill="var(--th-fg-4)">
              <path d="M 0 2 L 10 5 L 0 8 z" />
            </marker>
            <marker id="arrow-obj" viewBox="0 0 10 10" refX="10" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse" fill="#3b82f6">
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
    </div>
  );
}
