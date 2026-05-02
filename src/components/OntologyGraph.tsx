/**
 * WebVOWL-style ontology graph visualisation.
 * Classes → blue circles, XSD datatypes → green rectangles.
 * Edge labels in colored boxes, lines trimmed to node boundaries.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { X, ZoomIn, ZoomOut, Maximize2 } from "lucide-react";
import { useStore } from "../lib/store";
import { computeLayout } from "../lib/graph-utils";
import { compact } from "../lib/uri-utils";
import ClassForm from "./ClassForm";

// ── VOWL visual constants ─────────────────────────────────────────
const V = {
  classFill:   "#aaccff",
  classStroke: "#7799cc",
  classText:   "#0a0a1a",
  dtypeFill:   "#99cc66",
  dtypeStroke: "#558833",
  dtypeText:   "#0a1a00",
  subLine:  "#999",
  obj:   { line: "#7799cc", box: "#335599", text: "#fff" },
  dtype: { line: "#558833", box: "#336611", text: "#fff" },
  annot: { line: "#aaaaaa", box: "#555555", text: "#fff" },
  inv:   { line: "#cc88cc", box: "#774477", text: "#fff" },
} as const;

const FONT         = "Helvetica, Arial, sans-serif";
const CLASS_R_BASE = 44;
const DTYPE_W      = 86;
const DTYPE_H      = 26;

// ── Node types ────────────────────────────────────────────────────
interface ClassNode {
  kind: "class";
  id: string;
  label: string;
  uri: string;
  propertyCount: number;
  x: number; y: number; vx: number; vy: number;
}
interface DatatypeNode {
  kind: "datatype";
  id: string;
  label: string;
  uri: string;
  x: number; y: number; vx: number; vy: number;
}
type VisNode = ClassNode | DatatypeNode;

interface Edge {
  id: string;
  source: string;
  target: string;
  label: string;
  type: "subClassOf" | "objectProperty" | "datatypeProperty" | "annotationProperty" | "inverseOf";
}

interface Props { onClose: () => void; }

// ── Helpers ───────────────────────────────────────────────────────
function classRadius(node: ClassNode): number {
  return CLASS_R_BASE + Math.min(node.propertyCount * 2, 12);
}

function nodeAnchor(
  node: VisNode,
  nodePos: { x: number; y: number },
  targetX: number,
  targetY: number,
): { x: number; y: number } {
  const dx = targetX - nodePos.x;
  const dy = targetY - nodePos.y;
  const len = Math.sqrt(dx * dx + dy * dy) || 1;
  const ux = dx / len, uy = dy / len;
  if (node.kind === "class") {
    const r = classRadius(node as ClassNode);
    return { x: nodePos.x + ux * r, y: nodePos.y + uy * r };
  }
  const hw = DTYPE_W / 2, hh = DTYPE_H / 2;
  const tx = ux !== 0 ? hw / Math.abs(ux) : Infinity;
  const ty = uy !== 0 ? hh / Math.abs(uy) : Infinity;
  const t  = Math.min(tx, ty);
  return { x: nodePos.x + ux * t, y: nodePos.y + uy * t };
}

// ── Component ─────────────────────────────────────────────────────
export default function OntologyGraph({ onClose }: Props) {
  const activeOntology = useStore((s) => s.getActiveOntology());
  const svgRef       = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  type ViewBox = { x: number; y: number; w: number; h: number };
  const [viewBox, setViewBox] = useState<ViewBox>({ x: 0, y: 0, w: 1600, h: 1000 });
  const [dragging, setDragging] = useState<
    | { nodeId: string }
    | { pan: true; startX: number; startY: number; startVB: ViewBox }
    | null
  >(null);
  const [dragNodePos, setDragNodePos] = useState<{ id: string; x: number; y: number } | null>(null);

  const rafRef         = useRef<number | null>(null);
  const pendingDragPos = useRef<{ id: string; x: number; y: number } | null>(null);
  const pendingViewBox = useRef<ViewBox | null>(null);

  const classes    = activeOntology?.classes    ?? [];
  const properties = activeOntology?.properties ?? [];

  const [classNodes,     setClassNodes]     = useState<ClassNode[]>([]);
  const [dtypeNodes,     setDtypeNodes]     = useState<DatatypeNode[]>([]);
  const [edges,          setEdges]          = useState<Edge[]>([]);
  const [hoveredId,      setHoveredId]      = useState<string | null>(null);
  const [editingClassId, setEditingClassId] = useState<string | null>(null);
  const [editPanelPos,   setEditPanelPos]   = useState({ x: 0, y: 0 });

  // ── Build graph ──────────────────────────────────────────────────
  useEffect(() => {
    if (classes.length === 0) { setClassNodes([]); setDtypeNodes([]); setEdges([]); return; }
    const prefixes = activeOntology?.metadata.prefixes ?? {};

    const propCount = new Map<string, number>();
    for (const prop of properties) {
      if (prop.domainUri) propCount.set(prop.domainUri, (propCount.get(prop.domainUri) ?? 0) + 1);
    }

    const newClassNodes: ClassNode[] = classes.map((cls) => ({
      kind: "class",
      id: cls.id,
      label: cls.labels[0]?.value || cls.localName,
      uri: cls.uri,
      propertyCount: propCount.get(cls.uri) ?? 0,
      x: 0, y: 0, vx: 0, vy: 0,
    }));

    const dtypeUriSet = new Set<string>();
    for (const prop of properties) {
      if (prop.type === "owl:DatatypeProperty" && prop.domainUri && prop.range) {
        dtypeUriSet.add(prop.range);
      }
    }
    const newDtypeNodes: DatatypeNode[] = [...dtypeUriSet].map((uri) => ({
      kind: "datatype",
      id: `dtype:${uri}`,
      label: compact(uri, prefixes),
      uri,
      x: 0, y: 0, vx: 0, vy: 0,
    }));

    const newEdges: Edge[] = [];

    // subClassOf
    for (const cls of classes) {
      for (const parentUri of cls.subClassOf) {
        const parent = classes.find((c) => c.uri === parentUri);
        if (parent) {
          newEdges.push({
            id: `sub-${cls.id}-${parent.id}`,
            source: cls.id, target: parent.id,
            label: "subClassOf", type: "subClassOf",
          });
        }
      }
    }

    // ObjectProperty (with inverseOf merging)
    const seenInverse = new Set<string>();
    for (const prop of properties) {
      if (prop.type !== "owl:ObjectProperty" || !prop.domainUri || !prop.range) continue;
      const dom = classes.find((c) => c.uri === prop.domainUri);
      const rng = classes.find((c) => c.uri === prop.range);
      if (!dom || !rng) continue;

      if (prop.inverseOf) {
        const key = [prop.uri, prop.inverseOf].sort().join("|");
        if (seenInverse.has(key)) continue;
        seenInverse.add(key);
        const invP   = properties.find((p) => p.uri === prop.inverseOf);
        const invLbl = invP ? (invP.labels[0]?.value || invP.localName) : "inverse";
        newEdges.push({
          id: `inv-${key}`, source: dom.id, target: rng.id,
          label: `${prop.labels[0]?.value || prop.localName} ⇌ ${invLbl}`,
          type: "inverseOf",
        });
      } else {
        const alreadyDone = properties.some(
          (p) => p.inverseOf === prop.uri && seenInverse.has([p.uri, prop.uri].sort().join("|")),
        );
        if (alreadyDone) continue;
        newEdges.push({
          id: `obj-${prop.id}`, source: dom.id, target: rng.id,
          label: prop.labels[0]?.value || prop.localName, type: "objectProperty",
        });
      }
    }

    // DatatypeProperty
    for (const prop of properties) {
      if (prop.type !== "owl:DatatypeProperty" || !prop.domainUri || !prop.range) continue;
      const dom = classes.find((c) => c.uri === prop.domainUri);
      if (!dom) continue;
      newEdges.push({
        id: `dtype-${prop.id}`, source: dom.id, target: `dtype:${prop.range}`,
        label: prop.labels[0]?.value || prop.localName, type: "datatypeProperty",
      });
    }

    // AnnotationProperty (only when range is a known class)
    for (const prop of properties) {
      if (prop.type !== "owl:AnnotationProperty" || !prop.domainUri || !prop.range) continue;
      const dom = classes.find((c) => c.uri === prop.domainUri);
      const rng = classes.find((c) => c.uri === prop.range);
      if (!dom || !rng) continue;
      newEdges.push({
        id: `annot-${prop.id}`, source: dom.id, target: rng.id,
        label: prop.labels[0]?.value || prop.localName, type: "annotationProperty",
      });
    }

    const allVis: VisNode[] = [...newClassNodes, ...newDtypeNodes];
    const w = Math.max(1600, 280 * Math.sqrt(allVis.length));
    const h = Math.max(1000, 220 * Math.sqrt(allVis.length));
    computeLayout(allVis, newEdges, w, h);

    setClassNodes(newClassNodes);
    setDtypeNodes(newDtypeNodes);
    setEdges(newEdges);
    setViewBox({ x: 0, y: 0, w, h });
  }, [classes, properties, activeOntology]);

  // ── Position resolution ──────────────────────────────────────────
  const getPos = useCallback(
    (id: string): { x: number; y: number } => {
      if (dragNodePos?.id === id) return dragNodePos;
      const n = (classNodes as VisNode[]).concat(dtypeNodes).find((n) => n.id === id);
      return n ? { x: n.x, y: n.y } : { x: 0, y: 0 };
    },
    [classNodes, dtypeNodes, dragNodePos],
  );

  // ── Zoom ─────────────────────────────────────────────────────────
  const zoom = (factor: number) =>
    setViewBox((vb) => ({
      x: vb.x + (vb.w - vb.w * factor) / 2,
      y: vb.y + (vb.h - vb.h * factor) / 2,
      w: vb.w * factor,
      h: vb.h * factor,
    }));

  const fitToView = () => {
    const all = (classNodes as VisNode[]).concat(dtypeNodes);
    if (all.length === 0) return;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const n of all) {
      const pos = getPos(n.id);
      const pad = n.kind === "class" ? classRadius(n as ClassNode) : Math.max(DTYPE_W, DTYPE_H) / 2;
      if (pos.x - pad < minX) minX = pos.x - pad;
      if (pos.y - pad < minY) minY = pos.y - pad;
      if (pos.x + pad > maxX) maxX = pos.x + pad;
      if (pos.y + pad > maxY) maxY = pos.y + pad;
    }
    const m = 60;
    setViewBox({ x: minX - m, y: minY - m, w: maxX - minX + m * 2, h: maxY - minY + m * 2 });
  };

  // ── SVG coords ───────────────────────────────────────────────────
  const svgPoint = (clientX: number, clientY: number) => {
    const svg = svgRef.current;
    if (!svg) return { x: 0, y: 0 };
    const r = svg.getBoundingClientRect();
    return {
      x: viewBox.x + ((clientX - r.left) / r.width)  * viewBox.w,
      y: viewBox.y + ((clientY - r.top)  / r.height) * viewBox.h,
    };
  };

  // ── rAF flush ────────────────────────────────────────────────────
  const flushPending = useCallback(() => {
    rafRef.current = null;
    if (pendingDragPos.current) { setDragNodePos(pendingDragPos.current); pendingDragPos.current = null; }
    if (pendingViewBox.current)  { setViewBox(pendingViewBox.current);     pendingViewBox.current = null; }
  }, []);
  const scheduleFlush = useCallback(() => {
    if (rafRef.current == null) rafRef.current = requestAnimationFrame(flushPending);
  }, [flushPending]);

  // ── Mouse handlers ───────────────────────────────────────────────
  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    const nodeId = (e.target as SVGElement).closest("[data-node-id]")?.getAttribute("data-node-id");
    if (nodeId) { setDragging({ nodeId }); e.preventDefault(); }
    else { setDragging({ pan: true, startX: e.clientX, startY: e.clientY, startVB: { ...viewBox } }); e.preventDefault(); }
  };

  const handleDoubleClick = (e: React.MouseEvent) => {
    const nodeId = (e.target as SVGElement).closest("[data-node-id]")?.getAttribute("data-node-id");
    if (!nodeId) return;
    const node = classNodes.find((n) => n.id === nodeId);
    if (!node) return;
    const container = containerRef.current;
    if (!container) return;
    const cr = container.getBoundingClientRect();
    const pos = getPos(nodeId);
    const sx = ((pos.x - viewBox.x) / viewBox.w) * cr.width;
    const sy = ((pos.y - viewBox.y) / viewBox.h) * cr.height;
    setEditPanelPos({
      x: Math.min(Math.max(sx + 20, 8), cr.width  - 368),
      y: Math.min(Math.max(sy - 40, 40), cr.height - 488),
    });
    setEditingClassId(nodeId);
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!dragging) return;
    if ("pan" in dragging) {
      const cw = containerRef.current?.clientWidth  ?? 1;
      const ch = containerRef.current?.clientHeight ?? 1;
      pendingViewBox.current = {
        ...dragging.startVB,
        x: dragging.startVB.x - (e.clientX - dragging.startX) / cw * dragging.startVB.w,
        y: dragging.startVB.y - (e.clientY - dragging.startY) / ch * dragging.startVB.h,
      };
    } else {
      const pt = svgPoint(e.clientX, e.clientY);
      pendingDragPos.current = { id: dragging.nodeId, x: pt.x, y: pt.y };
    }
    scheduleFlush();
  };

  const handleMouseUp = () => {
    if (rafRef.current != null) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
    const finalPos = pendingDragPos.current ?? dragNodePos;
    pendingDragPos.current = null;
    pendingViewBox.current = null;
    if (dragging && "nodeId" in dragging && finalPos) {
      const { id, x, y } = finalPos;
      setClassNodes((prev) => prev.map((n) => n.id === id ? { ...n, x, y } : n));
      setDtypeNodes((prev) => prev.map((n) => n.id === id ? { ...n, x, y } : n));
      setDragNodePos(null);
    }
    setDragging(null);
  };

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const factor = e.deltaY > 0 ? 1.1 : 0.9;
    const svg = svgRef.current;
    if (!svg) return;
    const r  = svg.getBoundingClientRect();
    const mx = viewBox.x + ((e.clientX - r.left) / r.width)  * viewBox.w;
    const my = viewBox.y + ((e.clientY - r.top)  / r.height) * viewBox.h;
    setViewBox((vb) => ({
      x: mx - (mx - vb.x) * factor,
      y: my - (my - vb.y) * factor,
      w: vb.w * factor,
      h: vb.h * factor,
    }));
  };

  // ── Edge rendering ────────────────────────────────────────────────
  const renderEdge = (edge: Edge, idx: number) => {
    if (edge.source === edge.target) return null;
    const allNodes = (classNodes as VisNode[]).concat(dtypeNodes);
    const srcNode  = allNodes.find((n) => n.id === edge.source);
    const tgtNode  = allNodes.find((n) => n.id === edge.target);
    if (!srcNode || !tgtNode) return null;

    const sPos = getPos(srcNode.id);
    const tPos = getPos(tgtNode.id);

    // Parallel-edge offset
    const parallels = edges.filter((e) =>
      (e.source === edge.source && e.target === edge.target) ||
      (e.source === edge.target && e.target === edge.source),
    );
    const pIdx    = parallels.indexOf(edge);
    const pOffset = parallels.length > 1 ? (pIdx - (parallels.length - 1) / 2) * 32 : 0;

    const midX  = (sPos.x + tPos.x) / 2;
    const midY  = (sPos.y + tPos.y) / 2;
    const edLen = Math.sqrt((tPos.x - sPos.x) ** 2 + (tPos.y - sPos.y) ** 2) || 1;
    const ctrlX = midX + (-(tPos.y - sPos.y) / edLen) * pOffset;
    const ctrlY = midY + ( (tPos.x - sPos.x) / edLen) * pOffset;

    // Trim path to node boundaries
    const src = nodeAnchor(srcNode, sPos, tPos.x, tPos.y);
    const tgt = nodeAnchor(tgtNode, tPos, sPos.x, sPos.y);

    // Bezier midpoint for label
    const lx = 0.25 * src.x + 0.5 * ctrlX + 0.25 * tgt.x;
    const ly = 0.25 * src.y + 0.5 * ctrlY + 0.25 * tgt.y;

    let lineColor: string, dash: string, boxBg: string, boxText: string;
    let mEnd: string, mStart: string | undefined;

    switch (edge.type) {
      case "subClassOf":
        lineColor = V.subLine; dash = "none";
        boxBg = "transparent"; boxText = V.subLine;
        mEnd = "url(#arr-sub)"; break;
      case "objectProperty":
        lineColor = V.obj.line; dash = "none";
        boxBg = V.obj.box; boxText = V.obj.text;
        mEnd = "url(#arr-obj)"; break;
      case "datatypeProperty":
        lineColor = V.dtype.line; dash = "6,3";
        boxBg = V.dtype.box; boxText = V.dtype.text;
        mEnd = "url(#arr-dtype)"; break;
      case "annotationProperty":
        lineColor = V.annot.line; dash = "2,4";
        boxBg = V.annot.box; boxText = V.annot.text;
        mEnd = "url(#arr-annot)"; break;
      case "inverseOf":
        lineColor = V.inv.line; dash = "none";
        boxBg = V.inv.box; boxText = V.inv.text;
        mEnd = "url(#arr-inv)"; mStart = "url(#arr-inv-s)"; break;
    }

    const trunc = (s: string, max: number) => s.length > max ? s.slice(0, max - 1) + "…" : s;

    let labelEl: React.ReactNode = null;
    if (edge.type !== "subClassOf") {
      if (edge.type === "inverseOf") {
        const parts = edge.label.split(" ⇌ ");
        const fwd   = trunc(parts[0] ?? "", 16);
        const inv   = trunc(parts[1] ?? "", 16);
        const bgW   = Math.max(fwd.length, inv.length + 2) * 5.2 + 12;
        labelEl = (
          <g>
            <rect x={lx - bgW / 2} y={ly - 15} width={bgW} height={22} rx={3} fill={boxBg} opacity={0.93} />
            <text textAnchor="middle" fill={boxText} fontSize={9} fontFamily={FONT} fontWeight={500}>
              <tspan x={lx} y={ly - 5}>{fwd}</tspan>
              <tspan x={lx} dy={11}>⇌ {inv}</tspan>
            </text>
          </g>
        );
      } else {
        const lbl = trunc(edge.label, 18);
        const bgW = lbl.length * 5.2 + 10;
        labelEl = (
          <g>
            <rect x={lx - bgW / 2} y={ly - 10} width={bgW} height={13} rx={3} fill={boxBg} opacity={0.93} />
            <text x={lx} y={ly - 1} textAnchor="middle" fill={boxText} fontSize={9} fontFamily={FONT} fontWeight={500}>
              {lbl}
            </text>
          </g>
        );
      }
    }

    return (
      <g key={edge.id}>
        <path
          d={`M ${src.x} ${src.y} Q ${ctrlX} ${ctrlY} ${tgt.x} ${tgt.y}`}
          fill="none"
          stroke={lineColor}
          strokeWidth={edge.type === "subClassOf" ? 1.5 : 1.8}
          strokeDasharray={dash}
          markerEnd={mEnd}
          markerStart={mStart}
          opacity={0.85}
        />
        {labelEl}
      </g>
    );
  };

  // ── Class node ────────────────────────────────────────────────────
  const renderClassNode = (node: ClassNode) => {
    const pos    = getPos(node.id);
    const r      = classRadius(node);
    const isHov  = hoveredId === node.id;
    const isDrag = dragging && "nodeId" in dragging && dragging.nodeId === node.id;
    const lbl    = node.label.length > 14 ? node.label.slice(0, 13) + "…" : node.label;

    return (
      <g
        key={node.id}
        data-node-id={node.id}
        style={{ cursor: isDrag ? "grabbing" : "grab" }}
        onMouseEnter={() => setHoveredId(node.id)}
        onMouseLeave={() => setHoveredId(null)}
      >
        {isHov && (
          <circle cx={pos.x} cy={pos.y} r={r + 7}
            fill="none" stroke={V.classStroke} strokeWidth={1.5} opacity={0.4} />
        )}
        <circle
          cx={pos.x} cy={pos.y} r={r}
          fill={V.classFill}
          stroke={isHov ? V.classStroke : "#5577aa"}
          strokeWidth={isHov ? 2.5 : 2}
        />
        <text
          x={pos.x} y={pos.y - (node.propertyCount > 0 ? 6 : 0)}
          textAnchor="middle" dominantBaseline="middle"
          fill={V.classText} fontSize={12} fontWeight={600} fontFamily={FONT}
          pointerEvents="none"
        >
          {lbl}
        </text>
        {node.propertyCount > 0 && (
          <text
            x={pos.x} y={pos.y + 10}
            textAnchor="middle" dominantBaseline="middle"
            fill="#3355aa" fontSize={9} fontFamily={FONT}
            pointerEvents="none"
          >
            {node.propertyCount} prop{node.propertyCount !== 1 ? "s" : ""}
          </text>
        )}
      </g>
    );
  };

  // ── Datatype node ─────────────────────────────────────────────────
  const renderDtypeNode = (node: DatatypeNode) => {
    const pos   = getPos(node.id);
    const isHov = hoveredId === node.id;
    const hw    = DTYPE_W / 2, hh = DTYPE_H / 2;
    const lbl   = node.label.length > 14 ? node.label.slice(0, 13) + "…" : node.label;

    return (
      <g
        key={node.id}
        data-node-id={node.id}
        style={{ cursor: "grab" }}
        onMouseEnter={() => setHoveredId(node.id)}
        onMouseLeave={() => setHoveredId(null)}
      >
        {isHov && (
          <rect x={pos.x - hw - 4} y={pos.y - hh - 4} width={DTYPE_W + 8} height={DTYPE_H + 8}
            rx={5} fill="none" stroke={V.dtypeStroke} strokeWidth={1.5} opacity={0.4} />
        )}
        <rect
          x={pos.x - hw} y={pos.y - hh} width={DTYPE_W} height={DTYPE_H} rx={4}
          fill={V.dtypeFill}
          stroke={isHov ? V.dtypeStroke : "#447722"}
          strokeWidth={isHov ? 2.5 : 2}
        />
        <text
          x={pos.x} y={pos.y}
          textAnchor="middle" dominantBaseline="middle"
          fill={V.dtypeText} fontSize={11} fontFamily={FONT} fontWeight={500}
          pointerEvents="none"
        >
          {lbl}
        </text>
      </g>
    );
  };

  if (!activeOntology) return null;

  return (
    <div
      className="flex h-full flex-col bg-th-base"
      ref={containerRef}
      style={{ position: "relative" }}
    >
      {/* Toolbar */}
      <div className="flex items-center gap-2 border-b border-th-border px-3 py-2">
        <h3 className="text-xs font-semibold text-th-fg">Ontology Graph</h3>

        {/* Legend */}
        <div className="ml-4 flex items-center gap-3 text-2xs text-th-fg-3">
          <span className="flex items-center gap-1.5">
            <svg width="14" height="14">
              <circle cx="7" cy="7" r="6" fill={V.classFill} stroke={V.classStroke} strokeWidth="1.5" />
            </svg>
            Class
          </span>
          <span className="flex items-center gap-1.5">
            <svg width="22" height="14">
              <rect x="1" y="2" width="20" height="10" rx="2" fill={V.dtypeFill} stroke={V.dtypeStroke} strokeWidth="1.5" />
            </svg>
            Datatype
          </span>
          <span className="flex items-center gap-1.5">
            <svg width="26" height="8">
              <line x1="0" y1="4" x2="18" y2="4" stroke={V.subLine} strokeWidth="1.5" />
              <polygon points="14,1 24,4 14,7" fill="white" stroke={V.subLine} strokeWidth="1" />
            </svg>
            subClassOf
          </span>
          <span className="flex items-center gap-1.5">
            <svg width="26" height="8">
              <line x1="0" y1="4" x2="18" y2="4" stroke={V.obj.line} strokeWidth="1.8" />
              <polygon points="14,1 24,4 14,7" fill={V.obj.line} />
            </svg>
            Object
          </span>
          <span className="flex items-center gap-1.5">
            <svg width="26" height="8">
              <line x1="0" y1="4" x2="18" y2="4" stroke={V.dtype.line} strokeWidth="1.8" strokeDasharray="4,2" />
              <polygon points="14,1 24,4 14,7" fill={V.dtype.line} />
            </svg>
            Datatype
          </span>
          <span className="flex items-center gap-1.5">
            <svg width="26" height="8">
              <line x1="0" y1="4" x2="18" y2="4" stroke={V.inv.line} strokeWidth="1.8" />
              <polygon points="2,1 12,4 2,7" fill={V.inv.line} />
              <polygon points="14,1 24,4 14,7" fill={V.inv.line} />
            </svg>
            Inverse
          </span>
        </div>

        <div className="ml-auto flex items-center gap-1">
          <button onClick={() => zoom(0.8)}  className="rounded p-1 text-th-fg-3 hover:bg-th-hover hover:text-th-fg" title="Zoom in"><ZoomIn  size={14} /></button>
          <button onClick={() => zoom(1.25)} className="rounded p-1 text-th-fg-3 hover:bg-th-hover hover:text-th-fg" title="Zoom out"><ZoomOut size={14} /></button>
          <button onClick={fitToView}        className="rounded p-1 text-th-fg-3 hover:bg-th-hover hover:text-th-fg" title="Fit to view"><Maximize2 size={14} /></button>
          <button onClick={onClose}          className="ml-2 rounded p-1 text-th-fg-3 hover:bg-th-hover hover:text-th-fg" title="Close"><X size={14} /></button>
        </div>
      </div>

      {/* Graph canvas */}
      {classNodes.length === 0 ? (
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
            {/* subClassOf — hollow triangle (VOWL 2 style) */}
            <marker id="arr-sub" viewBox="0 0 12 10" refX="11" refY="5"
              markerWidth="8" markerHeight="7" orient="auto">
              <path d="M 0 0 L 10 5 L 0 10 Z" fill="var(--th-base, #fff)" stroke={V.subLine} strokeWidth="1.5" />
            </marker>
            {/* objectProperty */}
            <marker id="arr-obj" viewBox="0 0 10 10" refX="9" refY="5"
              markerWidth="6" markerHeight="6" orient="auto">
              <path d="M 0 1 L 9 5 L 0 9 Z" fill={V.obj.line} />
            </marker>
            {/* datatypeProperty */}
            <marker id="arr-dtype" viewBox="0 0 10 10" refX="9" refY="5"
              markerWidth="6" markerHeight="6" orient="auto">
              <path d="M 0 1 L 9 5 L 0 9 Z" fill={V.dtype.line} />
            </marker>
            {/* annotationProperty */}
            <marker id="arr-annot" viewBox="0 0 10 10" refX="9" refY="5"
              markerWidth="6" markerHeight="6" orient="auto">
              <path d="M 0 1 L 9 5 L 0 9 Z" fill={V.annot.line} />
            </marker>
            {/* inverseOf — both ends */}
            <marker id="arr-inv" viewBox="0 0 10 10" refX="9" refY="5"
              markerWidth="6" markerHeight="6" orient="auto">
              <path d="M 0 1 L 9 5 L 0 9 Z" fill={V.inv.line} />
            </marker>
            <marker id="arr-inv-s" viewBox="0 0 10 10" refX="1" refY="5"
              markerWidth="6" markerHeight="6" orient="auto-start-reverse">
              <path d="M 0 1 L 9 5 L 0 9 Z" fill={V.inv.line} />
            </marker>
          </defs>

          {/* Edges (rendered behind nodes) */}
          {edges.map((edge, i) => renderEdge(edge, i))}

          {/* Class nodes */}
          {classNodes.map(renderClassNode)}

          {/* Datatype nodes */}
          {dtypeNodes.map(renderDtypeNode)}
        </svg>
      )}

      {/* Hover tooltip */}
      {hoveredId && (() => {
        const cn = classNodes.find((n) => n.id === hoveredId);
        const dn = dtypeNodes.find((n) => n.id === hoveredId);
        const tooltipContent = cn
          ? (() => {
              const cls = classes.find((c) => c.id === cn.id);
              return (
                <>
                  <div className="text-xs font-semibold text-th-fg">{cn.label}</div>
                  <div className="font-mono text-2xs text-th-fg-3">{cn.uri}</div>
                  {cls?.descriptions[0]?.value && (
                    <div className="mt-1 max-w-xs text-2xs text-th-fg-2">{cls.descriptions[0].value}</div>
                  )}
                </>
              );
            })()
          : dn
          ? (
              <>
                <div className="text-xs font-semibold text-th-fg">{dn.label}</div>
                <div className="font-mono text-2xs text-th-fg-3">{dn.uri}</div>
              </>
            )
          : null;

        return tooltipContent ? (
          <div
            className="absolute bottom-3 left-3 rounded border border-th-border bg-th-surface px-3 py-2 shadow-lg"
            style={{ pointerEvents: "none" }}
          >
            {tooltipContent}
          </div>
        ) : null;
      })()}

      {/* Floating class editor (double-click a node) */}
      {editingClassId && (() => {
        const cls = classes.find((c) => c.id === editingClassId);
        if (!cls) return null;
        return (
          <div
            style={{ position: "absolute", left: editPanelPos.x, top: editPanelPos.y, width: 360, zIndex: 50 }}
            className="rounded border border-th-border shadow-2xl"
          >
            <div className="flex items-center justify-between rounded-t border-b border-th-border-muted bg-th-surface px-3 py-1.5">
              <span className="text-xs font-semibold text-th-fg">
                Edit: {cls.labels[0]?.value || cls.localName}
              </span>
              <button
                onClick={() => setEditingClassId(null)}
                className="rounded p-0.5 text-th-fg-4 hover:text-th-fg"
              >
                <X size={13} />
              </button>
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
