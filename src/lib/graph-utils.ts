/**
 * Shared force-directed layout engine used by both OntologyGraph and EntityGraph.
 *
 * Uses a spring model (Hooke's law) for edge attraction instead of distance-proportional
 * pull, so connected nodes settle at an "ideal" length instead of collapsing into a clump.
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
  /** Preferred edge rest length in px. Increase to spread connected nodes further. */
  idealEdgeLength?: number;
  /** Coulomb-style repulsion constant. Increase to push unconnected nodes further apart. */
  repulsion?: number;
  /** Hooke-style spring constant. Higher = stiffer edges that enforce ideal length harder. */
  springK?: number;
  /** Number of simulation iterations. */
  iterations?: number;
}

/**
 * Runs a force-directed layout simulation in-place on the given nodes.
 * Mutates the x, y, vx, vy fields directly.
 */
export function computeLayout(
  nodes: GraphNode[],
  edges: GraphEdge[],
  width: number,
  height: number,
  options: LayoutOptions = {}
): void {
  const {
    idealEdgeLength = 220,
    repulsion = 28000,
    springK = 0.04,
    iterations = 300,
  } = options;

  // Initial positions: spread in a circle sized to node count
  const cx = width / 2;
  const cy = height / 2;
  const radius = Math.min(width, height) * 0.4;
  nodes.forEach((n, i) => {
    const angle = (2 * Math.PI * i) / Math.max(nodes.length, 1);
    n.x = cx + radius * Math.cos(angle);
    n.y = cy + radius * Math.sin(angle);
    n.vx = 0;
    n.vy = 0;
  });

  const nodeMap = new Map<string, GraphNode>();
  for (const n of nodes) nodeMap.set(n.id, n);

  // Minimum inter-node distance — prevents visible overlap of 60-80px radius circles
  const MIN_DIST = 150;
  const damping = 0.85;
  const gravity = 0.0008;

  for (let iter = 0; iter < iterations; iter++) {
    const alpha = 1 - iter / iterations; // cooling

    // Repulsion between all pairs (inverse-square, with min-distance floor)
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const a = nodes[i]!;
        const b = nodes[j]!;
        let dx = b.x - a.x;
        let dy = b.y - a.y;
        let dist = Math.sqrt(dx * dx + dy * dy) || 0.01;
        // Clamp so we never divide by a distance smaller than MIN_DIST — keeps blow-up in check
        const effective = Math.max(dist, MIN_DIST * 0.5);
        const force = (repulsion * alpha) / (effective * effective);
        dx = (dx / dist) * force;
        dy = (dy / dist) * force;
        a.vx -= dx;
        a.vy -= dy;
        b.vx += dx;
        b.vy += dy;
      }
    }

    // Spring attraction along edges — pulls towards idealEdgeLength (not distance-proportional)
    for (const edge of edges) {
      const a = nodeMap.get(edge.source);
      const b = nodeMap.get(edge.target);
      if (!a || !b) continue;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const dist = Math.sqrt(dx * dx + dy * dy) || 1;
      const displacement = dist - idealEdgeLength;
      const force = springK * displacement * alpha;
      const fx = (dx / dist) * force;
      const fy = (dy / dist) * force;
      a.vx += fx;
      a.vy += fy;
      b.vx -= fx;
      b.vy -= fy;
    }

    // Weak gravity towards centre (prevents drifting off into infinity)
    for (const n of nodes) {
      n.vx += (cx - n.x) * gravity * alpha;
      n.vy += (cy - n.y) * gravity * alpha;
    }

    // Apply velocities
    for (const n of nodes) {
      n.vx *= damping;
      n.vy *= damping;
      n.x += n.vx;
      n.y += n.vy;
    }
  }

  // Post-pass: enforce hard minimum separation for any residual overlap
  for (let pass = 0; pass < 8; pass++) {
    let moved = false;
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const a = nodes[i]!;
        const b = nodes[j]!;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const dist = Math.sqrt(dx * dx + dy * dy) || 0.01;
        if (dist < MIN_DIST) {
          const overlap = (MIN_DIST - dist) / 2;
          const ux = dx / dist;
          const uy = dy / dist;
          a.x -= ux * overlap;
          a.y -= uy * overlap;
          b.x += ux * overlap;
          b.y += uy * overlap;
          moved = true;
        }
      }
    }
    if (!moved) break;
  }
}
