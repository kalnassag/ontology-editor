import fs from 'fs';
import path from 'path';

const file = path.join(process.cwd(), 'src/components/graph/OntologyGraph.tsx');
let code = fs.readFileSync(file, 'utf8');

// 1. Insert State Variables
code = code.replace(
  /const \[editPanelPos,\s*setEditPanelPos\]\s*=\s*useState\(\{ x: 0, y: 0 \}\);/,
  `const [editPanelPos,   setEditPanelPos]   = useState({ x: 0, y: 0 });\n  const [showDatatypes, setShowDatatypes] = useState(true);\n  const [showAnnotations, setShowAnnotations] = useState(true);`
);

// 2. Update datatype extraction
code = code.replace(
  /const dtypeUriSet = new Set<string>\(\);\n\s*for \(const prop of properties\) \{\n\s*if \(prop\.type === "owl:DatatypeProperty" && prop\.domainUri && prop\.range\) \{\n\s*dtypeUriSet\.add\(prop\.range\);\n\s*\}\n\s*\}/,
  `const dtypeUriSet = new Set<string>();\n    if (showDatatypes) {\n      for (const prop of properties) {\n        if (prop.type === "owl:DatatypeProperty" && prop.domainUri && prop.range) {\n          dtypeUriSet.add(prop.range);\n        }\n      }\n    }`
);

// 3. Update datatype edges
code = code.replace(
  /for \(const prop of properties\) \{\n\s*if \(prop\.type !== "owl:DatatypeProperty" \|\| !prop\.domainUri \|\| !prop\.range\) continue;\n\s*const dom = classes\.find\(\(c\) => c\.uri === prop\.domainUri\);\n\s*if \(!dom\) continue;\n\s*links\.push\(\{ id: \`dtype-\$\{prop\.id\}\`, source: dom\.id, target: \`dtype:\$\{prop\.range\}\`, label: prop\.labels\[0\]\?\.value \|\| prop\.localName, type: "datatypeProperty" \}\);\n\s*\}/,
  `if (showDatatypes) {\n      for (const prop of properties) {\n        if (prop.type !== "owl:DatatypeProperty" || !prop.domainUri || !prop.range) continue;\n        const dom = classes.find((c) => c.uri === prop.domainUri);\n        if (!dom) continue;\n        links.push({ id: \`dtype-\$\{prop.id\}\`, source: dom.id, target: \`dtype:\$\{prop.range\}\`, label: prop.labels[0]?.value || prop.localName, type: "datatypeProperty" });\n      }\n    }`
);

// 4. Update annotation edges
code = code.replace(
  /for \(const prop of properties\) \{\n\s*if \(prop\.type !== "owl:AnnotationProperty" \|\| !prop\.domainUri \|\| !prop\.range\) continue;\n\s*const dom = classes\.find\(\(c\) => c\.uri === prop\.domainUri\);\n\s*const rng = classes\.find\(\(c\) => c\.uri === prop\.range\);\n\s*if \(!dom \|\| !rng\) continue;\n\s*links\.push\(\{ id: \`annot-\$\{prop\.id\}\`, source: dom\.id, target: rng\.id, label: prop\.labels\[0\]\?\.value \|\| prop\.localName, type: "annotationProperty" \}\);\n\s*\}/,
  `if (showAnnotations) {\n      for (const prop of properties) {\n        if (prop.type !== "owl:AnnotationProperty" || !prop.domainUri || !prop.range) continue;\n        const dom = classes.find((c) => c.uri === prop.domainUri);\n        const rng = classes.find((c) => c.uri === prop.range);\n        if (!dom || !rng) continue;\n        links.push({ id: \`annot-\$\{prop.id\}\`, source: dom.id, target: rng.id, label: prop.labels[0]?.value || prop.localName, type: "annotationProperty" });\n      }\n    }`
);

// 5. Update force parameters and add depth calculation
const forceBlockRegex = /\/\/ Compute degree so orphan nodes can get stronger gravity[\s\S]*?simRef\.current = sim;\n\s*forceRedraw\(\(n\) => n \+ 1\);\n\s*\}, \[classes, properties, activeOntology, scheduleTick\]\);/;

const newForceBlock = `// Hierarchical depth computation
    const childrenMap = new Map<string, string[]>();
    for (const cls of classes) {
      if (!childrenMap.has(cls.uri)) childrenMap.set(cls.uri, []);
      for (const parentUri of cls.subClassOf) {
        if (!childrenMap.has(parentUri)) childrenMap.set(parentUri, []);
        childrenMap.get(parentUri)!.push(cls.uri);
      }
    }
    const roots = classes.filter((c) => c.subClassOf.length === 0);
    const depthMap = new Map<string, number>();
    const queue = roots.map((c) => ({ uri: c.uri, depth: 0 }));
    const visited = new Set<string>();
    
    while (queue.length > 0) {
      const { uri, depth } = queue.shift()!;
      if (visited.has(uri)) continue;
      visited.add(uri);
      depthMap.set(uri, Math.max(depthMap.get(uri) ?? 0, depth));
      const children = childrenMap.get(uri) ?? [];
      for (const childUri of children) {
        queue.push({ uri: childUri, depth: depth + 1 });
      }
    }

    // Compute degree so orphan nodes can get stronger gravity
    const degree = new Map<string, number>(allNodes.map((n) => [n.id, 0]));
    for (const l of links) {
      const s = typeof l.source === "object" ? (l.source as SimNode).id : l.source;
      const t = typeof l.target === "object" ? (l.target as SimNode).id : l.target;
      degree.set(s, (degree.get(s) ?? 0) + 1);
      degree.set(t, (degree.get(t) ?? 0) + 1);
    }
    
    const N = allNodes.length;
    // Base repulsion increases with node count
    const baseRepulsion = -800 - N * 40;
    // Distance max scales up so distant clusters don't collapse inward
    const distanceMax = Math.max(2000, N * 100);

    // Gravity weakens slightly for very large graphs
    const gravityForce = N > 50 ? 0.03 : 0.06;
    const orphanGravity = 0.14;
    const getGravity = (n: SimNode) => (degree.get(n.id) ?? 0) === 0 ? orphanGravity : gravityForce;

    const maxDepth = Math.max(0, ...Array.from(depthMap.values()));
    const ySpacing = 200;
    const yOffset = -(maxDepth * ySpacing) / 2;

    simNodesRef.current = allNodes;
    simLinksRef.current = links;
    nodeMapRef.current  = newMap;

    const sim = forceSimulation<SimNode>(allNodes)
      .force("charge",  forceManyBody<SimNode>().strength(baseRepulsion).distanceMax(distanceMax))
      .force("link",    d3ForceLink<SimNode, D3Link>(links)
        .id((d) => d.id)
        .distance((l) => {
          let dist = l.type === "subClassOf" ? 140 : l.type === "datatypeProperty" ? 210 : 230;
          return dist + (N > 50 ? 50 : 0); // extra distance for big graphs
        })
        .strength((l)  => l.type === "subClassOf" ? 0.8 : 0.35))
      .force("x",       forceX<SimNode>(0).strength(getGravity))
      .force("y",       forceY<SimNode>((n) => {
         if (n.kind === "class") {
           const d = depthMap.get(n.uri) ?? 0;
           return yOffset + d * ySpacing;
         }
         return 0; // Datatypes drift
      }).strength((n) => {
         const g = getGravity(n);
         return n.kind === "class" ? Math.max(g, 0.4) : g; // Strongly pull classes into top-down bands
      }))
      .force("collide", forceCollide<SimNode>((n) => (n.kind === "class" ? classR(n) + 30 : 58) + (N > 50 ? 20 : 0)).strength(0.85))
      .alphaDecay(0.015)
      .velocityDecay(0.4)
      .on("tick", scheduleTick);

    simRef.current = sim;
    forceRedraw((n) => n + 1);
  }, [classes, properties, activeOntology, scheduleTick, showDatatypes, showAnnotations]);`;

code = code.replace(forceBlockRegex, newForceBlock);

// 6. Update Toolbar UI
const toolbarRegex = /<span className="mr-2 text-2xs text-th-fg-4" title="Drag to pin a node in place\. Shift\+click to unpin\. Reheat unpins all\.">\n\s*drag=pin · ⇧click=unpin\n\s*<\/span>/;

const newToolbar = `<label className="mr-3 flex items-center gap-1.5 text-2xs text-th-fg-3">
            <input type="checkbox" checked={showDatatypes} onChange={(e) => setShowDatatypes(e.target.checked)} className="accent-th-fg" />
            Datatypes
          </label>
          <label className="mr-3 flex items-center gap-1.5 text-2xs text-th-fg-3">
            <input type="checkbox" checked={showAnnotations} onChange={(e) => setShowAnnotations(e.target.checked)} className="accent-th-fg" />
            Annotations
          </label>
          <span className="mr-2 text-2xs text-th-fg-4" title="Drag to pin a node in place. Shift+click to unpin. Reheat unpins all.">
            drag=pin · ⇧click=unpin
          </span>`;

code = code.replace(toolbarRegex, newToolbar);

fs.writeFileSync(file, code);
console.log("Patched OntologyGraph successfully.");
