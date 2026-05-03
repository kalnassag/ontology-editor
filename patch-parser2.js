import fs from 'fs';
import path from 'path';

const parserPath = path.join(process.cwd(), 'src/lib/turtle-parser.ts');
let code = fs.readFileSync(parserPath, 'utf8');

// 1. Update Types
code = code.replace(
  /ExtraTriple \} from "\.\.\/types";/,
  'ExtraTriple, OntologyRestriction } from "../types";'
);

code = code.replace(
  /\| \{ type: "PUNCT"; value: "\." \| ";" \| ","; line: number \}/,
  '| { type: "PUNCT"; value: "." | ";" | "," | "[" | "]"; line: number }'
);

code = code.replace(
  /subPropertyOf:    RDFS \+ "subPropertyOf",/,
  'subPropertyOf:    RDFS + "subPropertyOf",\n  equivalentClass:  OWL + "equivalentClass",'
);

// 2. Tokenizer updates
const skipBlankNodeRegex = /\/\/ Skip over a blank node property list[\s\S]*?const skipBlankNode = \(\) => \{[\s\S]*?\n  \};\n/;
code = code.replace(skipBlankNodeRegex, '// Blank nodes are emitted as punctuation tokens for \'[\' and \']\'\n');

code = code.replace(
  /\} else if \(ch === "\["\) \{[\s\S]*?skipBlankNode\(\);/,
  `} else if (ch === "[" || ch === "]") {
      advance();
      tokens.push({ type: "PUNCT", value: ch as "[" | "]", line: startLine });`
);

code = code.replace(
  /\} else if \(ch === "_" && peek\(1\) === ":"\) \{[\s\S]*?_blank", line: startLine \}\);/,
  `} else if (ch === "_" && peek(1) === ":") {
      advance(); advance(); // consume '_:'
      let label = "";
      while (pos < input.length && !/\\s/.test(peek()) && peek() !== ";" && peek() !== "," && peek() !== "." && peek() !== "]" && peek() !== "[") {
        label += advance();
      }
      tokens.push({ type: "BARE", keyword: "_:" + label, line: startLine });`
);

// 3. Replace parseTurtle
const parseTurtleRegex = /export function parseTurtle\([\s\S]+?\/\/\s*──\s*Model builder/;

const newParseTurtle = `export function parseTurtle(input: string): ParseResult {
  const { tokens, errors: tokErrors } = tokenize(input);
  const stream = new TokenStream(tokens);
  const prefixes: Record<string, string> = {};
  let baseUri = "";
  const triples: ParsedTriple[] = [];
  const errors: ParseError[] = [...tokErrors];
  let blankNodeCount = 0;
  let bnodeCounter = 0;

  const generateBNode = () => "_:b" + (bnodeCounter++);

  const resolveNode = (tok: Token): string | null => {
    if (tok.type === "IRI") return tok.value;
    if (tok.type === "PREFIXED") {
      const ns = prefixes[tok.prefix];
      if (ns !== undefined) return ns + tok.local;
      errors.push({ line: tok.line, message: "Unknown prefix: " + tok.prefix + ":" });
      return tok.prefix + ":" + tok.local;
    }
    if (tok.type === "BARE") {
      if (tok.keyword === "a") return RDF_TYPE;
      if (tok.keyword.startsWith("_:")) return tok.keyword; // labeled blank node
    }
    return null;
  };

  const resolveDatatype = (raw: string): string => {
    if (raw.startsWith("<") && raw.endsWith(">")) return raw.slice(1, -1);
    const colonIdx = raw.indexOf(":");
    if (colonIdx >= 0) {
      const pfx = raw.slice(0, colonIdx);
      const local = raw.slice(colonIdx + 1);
      const ns = prefixes[pfx];
      if (ns) return ns + local;
    }
    return raw;
  };

  const parsePropertyList = (subject: string, endToken: "]" | ".") => {
    let inStatement = true;
    while (inStatement && !stream.done()) {
      const predTok = stream.peek();
      if (!predTok) break;

      if (predTok.type === "PUNCT" && predTok.value === endToken) {
        stream.next();
        break;
      }
      if (predTok.type === "PUNCT" && predTok.value === ";") {
        stream.next();
        continue;
      }

      stream.next();
      const predicate = resolveNode(predTok);
      if (predicate === null) {
        errors.push({ line: predTok.line, message: "Cannot resolve predicate" });
        while (!stream.done()) {
          const t = stream.peek()!;
          if (t.type === "PUNCT" && (t.value === ";" || t.value === endToken)) break;
          stream.next();
        }
        continue;
      }

      let inObjectList = true;
      while (inObjectList && !stream.done()) {
        const objTok = stream.peek();
        if (!objTok) break;

        if (objTok.type === "PUNCT") {
          if (objTok.value === endToken) {
            stream.next();
            inStatement = false;
            inObjectList = false;
            break;
          }
          if (objTok.value === ";") { stream.next(); break; }
          if (objTok.value === ",") { stream.next(); continue; }
        }

        stream.next();

        if (objTok.type === "LITERAL") {
          triples.push({
            s: subject, p: predicate, o: objTok.value,
            isLiteral: true, lang: objTok.lang,
            datatype: objTok.datatypeRaw ? resolveDatatype(objTok.datatypeRaw) : undefined
          });
        } else if (objTok.type === "PUNCT" && objTok.value === "[") {
          const bnode = generateBNode();
          triples.push({ s: subject, p: predicate, o: bnode, isLiteral: false });
          parsePropertyList(bnode, "]");
        } else {
          const object = resolveNode(objTok);
          if (object !== null) {
            triples.push({ s: subject, p: predicate, o: object, isLiteral: false });
          }
        }

        const nxt = stream.peek();
        if (!nxt) break;
        if (nxt.type === "PUNCT") {
          if (nxt.value === ",") { stream.next(); continue; }
          if (nxt.value === ";") { stream.next(); break; }
          if (nxt.value === endToken) {
            stream.next();
            inStatement = false;
            inObjectList = false;
            break;
          }
        }
        inObjectList = false;
        inStatement = false;
      }
    }
  };

  const skipToNextStatement = () => {
    while (!stream.done()) {
      const tok = stream.next()!;
      if (tok.type === "PUNCT" && tok.value === ".") break;
    }
  };

  while (!stream.done()) {
    const tok = stream.peek()!;
    if (tok.type === "AT_KW" && tok.keyword === "prefix") {
      stream.next();
      const nameTok = stream.next();
      if (!nameTok || nameTok.type !== "PREFIXED") { errors.push({ line: tok.line, message: "Invalid @prefix: expected prefix name" }); skipToNextStatement(); continue; }
      const iriTok = stream.next();
      if (!iriTok || iriTok.type !== "IRI") { errors.push({ line: tok.line, message: "Invalid @prefix: expected IRI" }); skipToNextStatement(); continue; }
      prefixes[nameTok.prefix] = iriTok.value;
      if (stream.peek()?.type === "PUNCT" && (stream.peek() as any)?.value === ".") stream.next();
      continue;
    }
    if (tok.type === "BARE" && tok.keyword === "PREFIX") {
      stream.next();
      const nameTok = stream.next();
      if (!nameTok || nameTok.type !== "PREFIXED") { errors.push({ line: tok.line, message: "Invalid PREFIX" }); continue; }
      const iriTok = stream.next();
      if (!iriTok || iriTok.type !== "IRI") { errors.push({ line: tok.line, message: "Invalid PREFIX" }); continue; }
      prefixes[nameTok.prefix] = iriTok.value;
      continue;
    }
    if (tok.type === "AT_KW" && tok.keyword === "base") {
      stream.next();
      const iriTok = stream.next();
      if (iriTok?.type === "IRI") { baseUri = iriTok.value; prefixes[""] = iriTok.value; }
      if (stream.peek()?.type === "PUNCT" && (stream.peek() as any)?.value === ".") stream.next();
      continue;
    }
    if (tok.type === "BARE" && tok.keyword === "BASE") {
      stream.next();
      const iriTok = stream.next();
      if (iriTok?.type === "IRI") { baseUri = iriTok.value; prefixes[""] = iriTok.value; }
      continue;
    }

    if (tok.type === "PUNCT" && tok.value === "[") {
       stream.next(); // consume '['
       const bnode = generateBNode();
       parsePropertyList(bnode, "]");
       if (stream.peek()?.type === "PUNCT" && (stream.peek() as any)?.value === ".") stream.next();
       continue;
    }

    const subjectTok = stream.next()!;
    const subject = resolveNode(subjectTok);
    if (subject === null) {
      skipToNextStatement();
      continue;
    }

    parsePropertyList(subject, ".");
  }

  if (!baseUri && prefixes[""]) {
    baseUri = prefixes[""];
  }

  return { prefixes, baseUri, triples, errors, blankNodeCount };
}
`;

code = code.replace(parseTurtleRegex, newParseTurtle + "\n// ── Model builder");

// 4. Update buildModelFromTriples
const bmtRegex = /export function buildModelFromTriples\(parsed: ParseResult\): Ontology \{([\s\S]*?)\/\/ ── Step 1: initial scan/;

const restrictionLogic = `export function buildModelFromTriples(parsed: ParseResult): Ontology {$1
  // ── Step 0: Extract Restrictions ─────────────────────────────────────────
  const mappedTripleSet = new Set<number>();
  const restrictionNodes = new Map<string, Partial<OntologyRestriction>>();
  const restrictionsByBNode = new Map<string, OntologyRestriction>();

  parsed.triples.forEach((t, idx) => {
    if (t.p === P.type && t.o === OWL + "Restriction") {
      restrictionNodes.set(t.s, {});
      mappedTripleSet.add(idx);
    }
  });

  parsed.triples.forEach((t, idx) => {
    const r = restrictionNodes.get(t.s);
    if (r) {
      if (t.p === OWL + "onProperty") { r.propertyUri = t.o; mappedTripleSet.add(idx); }
      else if (t.p === OWL + "someValuesFrom") { r.type = "someValuesFrom"; r.value = t.o; mappedTripleSet.add(idx); }
      else if (t.p === OWL + "allValuesFrom") { r.type = "allValuesFrom"; r.value = t.o; mappedTripleSet.add(idx); }
      else if (t.p === OWL + "hasValue") { r.type = "hasValue"; r.value = t.o; mappedTripleSet.add(idx); }
      else if (t.p === P.minCardinality) { r.type = "minCardinality"; r.value = t.o; mappedTripleSet.add(idx); }
      else if (t.p === P.maxCardinality) { r.type = "maxCardinality"; r.value = t.o; mappedTripleSet.add(idx); }
      else if (t.p === OWL + "exactCardinality") { r.type = "exactCardinality"; r.value = t.o; mappedTripleSet.add(idx); }
    }
  });

  for (const [id, r] of restrictionNodes.entries()) {
    if (r.propertyUri && r.type && r.value) {
      restrictionsByBNode.set(id, r as OntologyRestriction);
    }
  }

  // ── Step 1: initial scan`;

code = code.replace(bmtRegex, restrictionLogic);

// Remove mappedTripleSet from step 4
code = code.replace(/const mappedTripleSet = new Set<number>\(\);\n/, '');

const classMappingRegex = /\} else if \(t\.p === P\.subClassOf && !t\.isLiteral\) \{[\s\S]*?\} else if \(t\.p === P\.disjointWith && !t\.isLiteral\) \{/;

const newClassMapping = `} else if (t.p === P.subClassOf && !t.isLiteral) {
        if (restrictionsByBNode.has(t.o)) {
          cls.restrictions.push(restrictionsByBNode.get(t.o)!);
          mappedTripleSet.add(idx);
        } else if (!cls.subClassOf.includes(t.o)) {
          cls.subClassOf.push(t.o);
        }
      } else if (t.p === P.equivalentClass && !t.isLiteral) {
        if (restrictionsByBNode.has(t.o)) {
          cls.restrictions.push(restrictionsByBNode.get(t.o)!);
          mappedTripleSet.add(idx);
        } else {
          cls.extraTriples.push({ predicate: t.p, object: t.o, isLiteral: false });
        }
      } else if (t.p === P.disjointWith && !t.isLiteral) {`;

code = code.replace(classMappingRegex, newClassMapping);

// Add restrictions: [] to the 4 places where classes are created
code = code.replace(/disjointWith: \[\],\n\s*extraTriples: \[\],/g, 'disjointWith: [],\n        restrictions: [],\n        extraTriples: [],');

fs.writeFileSync(parserPath, code);
console.log("Patched parser successfully.");
