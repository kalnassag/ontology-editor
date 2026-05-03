/**
 * Shared force-directed layout engine used by both OntologyGraph and EntityGraph.
 *
 * Pipeline:
 * 1. BFS-ordered circular placement  — adjacent nodes land adjacent on the circle,
 *    which dramatically cuts the crossing count before forces even run.
 * 2. Spring-based force simulation   — Hooke-law edges (ideal rest length) +
 *    Coulomb repulsion + weak gravity.
 * 3. Hard minimum-distance post-pass — eliminates residual node overlap.
 * 4. Node-swap crossing reducer       — greedily swaps pairs of node positions
 *    whenever the swap reduces the count of crossing edge segments.
 */

export interface GraphNode {
  id: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
}

export interface GraphEdge {
  source: string;
  target: string;
}

export interface LayoutOptions {
  /** Preferred edge rest length in px. */
  idealEdgeLength?: number;
  /** Coulomb-style repulsion constant. */
  repulsion?: number;
  /** Hooke-style spring constant. */
  springK?: number;
  /** Number of simulation iterations. */
  iterations?: number;
  /** Minimum distance to enforce between nodes. */
  minDist?: number;
}

// ── Crossing geometry ────────────────────────────────────────────

function segmentsIntersect(
  ax: number, ay: number, bx: number, by: number,
  cx: number, cy: number, dx: number, dy: number,
): boolean {
  const d1x = bx - ax, d1y = by - ay;
  const d2x = dx - cx, d2y = dy - cy;
  const denom = d1x * d2y - d1y * d2x;
  if (Math.abs(denom) < 1e-9) return false; // parallel / collinear
  const t = ((cx - ax) * d2y - (cy - ay) * d2x) / denom;
  const u = ((cx - ax) * d1y - (cy - ay) * d1x) / denom;
  return t > 0.01 && t < 0.99 && u > 0.01 && u < 0.99;
}

function countCrossings(nodeMap: Map<string, GraphNode>, edges: GraphEdge[]): number {
  let count = 0;
  for (let i = 0; i < edges.length; i++) {
    for (let j = i + 1; j < edges.length; j++) {
      const e1 = edges[i]!, e2 = edges[j]!;
      // Skip edge pairs that share an endpoint — they can't "cross" meaningfully
      if (e1.source === e2.source || e1.source === e2.target ||
          e1.target === e2.source || e1.target === e2.target) continue;
      const a = nodeMap.get(e1.source), b = nodeMap.get(e1.target);
      const c = nodeMap.get(e2.source), d = nodeMap.get(e2.target);
      if (!a || !b || !c || !d) continue;
      if (segmentsIntersect(a.x, a.y, b.x, b.y, c.x, c.y, d.x, d.y)) count++;
    }
  }
  return count;
}

// ── Main export ──────────────────────────────────────────────────

export function computeLayout(
  nodes: GraphNode[],
  edges: GraphEdge[],
  width: number,
  height: number,
  options: LayoutOptions = {},
): void {
  if (nodes.length === 0) return;

  const {
    idealEdgeLength = 220,
    repulsion = 28000,
    springK = 0.04,
    iterations = 300,
    minDist = 150,
  } = options as LayoutOptions & { minDist?: number };

  const cx = width / 2;
  const cy = height / 2;
  const radius = Math.min(width, height) * 0.4;

  // ── Step 1: BFS-ordered circular placement ──────────────────────
  // Building an adjacency list lets us order neighbors by degree so
  // high-hub nodes end up in the interior of the BFS tree, which
  // naturally reduces how many edges cross each other.
  const adjList = new Map<string, Set<string>>();
  for (const n of nodes) adjList.set(n.id, new Set());
  for (const e of edges) {
    adjList.get(e.source)?.add(e.target);
    adjList.get(e.target)?.add(e.source);
  }

  // BFS from the node with the highest degree
  const startNode = [...nodes].sort(
    (a, b) => (adjList.get(b.id)?.size ?? 0) - (adjList.get(a.id)?.size ?? 0),
  )[0] ?? nodes[0]!;

  const bfsOrder: GraphNode[] = [];
  const visited = new Set<string>([startNode.id]);
  const queue: GraphNode[] = [startNode];

  while (queue.length > 0) {
    const cur = queue.shift()!;
    bfsOrder.push(cur);
    const neighbors = [...(adjList.get(cur.id) ?? [])]
      .map(id => nodes.find(n => n.id === id))
      .filter((n): n is GraphNode => !!n && !visited.has(n.id))
      .sort((a, b) => (adjList.get(b.id)?.size ?? 0) - (adjList.get(a.id)?.size ?? 0));
    for (const nb of neighbors) {
      visited.add(nb.id);
      queue.push(nb);
    }
  }
  // Append any disconnected nodes
  for (const n of nodes) if (!visited.has(n.id)) bfsOrder.push(n);

  // Place around circle in BFS order, starting at top (−π/2)
  bfsOrder.forEach((n, i) => {
    const angle = (2 * Math.PI * i) / nodes.length - Math.PI / 2;
    n.x = cx + radius * Math.cos(angle);
    n.y = cy + radius * Math.sin(angle);
    n.vx = 0;
    n.vy = 0;
  });

  const nodeMap = new Map<string, GraphNode>(nodes.map(n => [n.id, n]));

  // ── Step 2: Force simulation ────────────────────────────────────
  const damping = 0.85;
  const gravity = 0.0008;

  for (let iter = 0; iter < iterations; iter++) {
    const alpha = 1 - iter / iterations;

    // Coulomb repulsion between every pair
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const a = nodes[i]!, b = nodes[j]!;
        let dx = b.x - a.x;
        let dy = b.y - a.y;
        const dist = Math.sqrt(dx * dx + dy * dy) || 0.01;
        const eff = Math.max(dist, minDist * 0.5);
        const force = (repulsion * alpha) / (eff * eff);
        dx = (dx / dist) * force;
        dy = (dy / dist) * force;
        a.vx -= dx; a.vy -= dy;
        b.vx += dx; b.vy += dy;
      }
    }

    // Hooke spring along each edge (pulls toward idealEdgeLength, not proportional)
    for (const e of edges) {
      const a = nodeMap.get(e.source), b = nodeMap.get(e.target);
      if (!a || !b) continue;
      const dx = b.x - a.x, dy = b.y - a.y;
      const dist = Math.sqrt(dx * dx + dy * dy) || 1;
      const force = springK * (dist - idealEdgeLength) * alpha;
      const fx = (dx / dist) * force, fy = (dy / dist) * force;
      a.vx += fx; a.vy += fy;
      b.vx -= fx; b.vy -= fy;
    }

    // Weak gravity toward centre
    for (const n of nodes) {
      n.vx += (cx - n.x) * gravity * alpha;
      n.vy += (cy - n.y) * gravity * alpha;
    }

    // Integrate
    for (const n of nodes) {
      n.vx *= damping; n.vy *= damping;
      n.x += n.vx;    n.y += n.vy;
    }
  }

  // ── Step 3: Hard minimum-distance enforcement ───────────────────
  for (let pass = 0; pass < 8; pass++) {
    let moved = false;
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const a = nodes[i]!, b = nodes[j]!;
        const dx = b.x - a.x, dy = b.y - a.y;
        const dist = Math.sqrt(dx * dx + dy * dy) || 0.01;
        if (dist < minDist) {
          const push = (minDist - dist) / 2;
          const ux = dx / dist, uy = dy / dist;
          a.x -= ux * push; a.y -= uy * push;
          b.x += ux * push; b.y += uy * push;
          moved = true;
        }
      }
    }
    if (!moved) break;
  }

  // ── Step 4: Node-swap crossing reducer ─────────────────────────
  // For every pair of nodes, try swapping their positions.
  // Keep the swap when it strictly reduces the crossing count.
  // One pass = one sweep over all O(n²) pairs; repeat until no improvement.
  for (let pass = 0; pass < 12; pass++) {
    let crossings = countCrossings(nodeMap, edges);
    if (crossings === 0) break;
    let improved = false;

    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const a = nodes[i]!, b = nodes[j]!;
        // Swap positions
        [a.x, b.x] = [b.x, a.x];
        [a.y, b.y] = [b.y, a.y];
        const newCrossings = countCrossings(nodeMap, edges);
        if (newCrossings < crossings) {
          crossings = newCrossings; // keep swap
          improved = true;
        } else {
          // Revert
          [a.x, b.x] = [b.x, a.x];
          [a.y, b.y] = [b.y, a.y];
        }
      }
    }
    if (!improved) break;
  }
}
