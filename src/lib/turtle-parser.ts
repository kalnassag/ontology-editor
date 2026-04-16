/**
 * Turtle (.ttl) parser — character-level tokenizer + recursive-descent parser.
 *
 * Input:  raw Turtle text
 * Output: ParseResult { prefixes, baseUri, triples, errors }
 */

import type { ParseResult, ParsedTriple, ParseError, OntologyClass, OntologyProperty, OntologyMetadata, UnmappedTriple, Individual, IndividualPropertyValue, ExtraTriple } from "../types";
import { localName as extractLocalName, namespace } from "./uri-utils";

const RDF_TYPE = "http://www.w3.org/1999/02/22-rdf-syntax-ns#type";

// ── Token types ────────────────────────────────────────────────────────────

type Token =
  | { type: "IRI"; value: string; line: number }
  | { type: "PREFIXED"; prefix: string; local: string; line: number }
  | { type: "LITERAL"; value: string; lang?: string; datatypeRaw?: string; line: number }
  | { type: "PUNCT"; value: "." | ";" | ","; line: number }
  | { type: "AT_KW"; keyword: "prefix" | "base"; line: number }
  | { type: "BARE"; keyword: string; line: number };

// ── Tokenizer ──────────────────────────────────────────────────────────────

function tokenize(input: string): { tokens: Token[]; errors: ParseError[] } {
  const tokens: Token[] = [];
  const errors: ParseError[] = [];
  let pos = 0;
  let line = 1;

  const peek = (offset = 0): string => input[pos + offset] ?? "";
  const advance = (): string => {
    const ch = input[pos++] ?? "";
    if (ch === "\n") line++;
    return ch;
  };

  const skipWS = () => {
    for (;;) {
      const ch = peek();
      if (ch === " " || ch === "\t" || ch === "\r" || ch === "\n") {
        advance();
      } else if (ch === "#") {
        while (pos < input.length && peek() !== "\n") advance();
      } else {
        break;
      }
    }
  };

  const readIRI = (): string => {
    advance(); // consume '<'
    let value = "";
    while (pos < input.length) {
      const ch = peek();
      if (ch === ">") { advance(); break; }
      if (ch === "\\") {
        advance();
        const esc = advance();
        if (esc === "u") {
          let hex = "";
          for (let i = 0; i < 4; i++) hex += advance();
          value += String.fromCharCode(parseInt(hex, 16));
        } else {
          value += esc;
        }
      } else {
        value += advance();
      }
    }
    return value;
  };

  const readString = (): string => {
    const isTriple =
      peek(0) === '"' && peek(1) === '"' && peek(2) === '"';
    if (isTriple) {
      advance(); advance(); advance(); // consume """
      let value = "";
      while (pos < input.length) {
        if (peek(0) === '"' && peek(1) === '"' && peek(2) === '"') {
          advance(); advance(); advance();
          return value;
        }
        const ch = advance();
        if (ch === "\\") {
          const esc = advance();
          value += unescapeChar(esc);
        } else {
          value += ch;
        }
      }
      return value;
    } else {
      advance(); // consume '"'
      let value = "";
      while (pos < input.length) {
        const ch = advance();
        if (ch === '"') break;
        if (ch === "\\") {
          const esc = advance();
          value += unescapeChar(esc);
        } else {
          value += ch;
        }
      }
      return value;
    }
  };

  const unescapeChar = (esc: string): string => {
    switch (esc) {
      case "n": return "\n";
      case "t": return "\t";
      case "r": return "\r";
      case '"': return '"';
      case "'": return "'";
      case "\\": return "\\";
      default: return esc;
    }
  };

  // Read a local name (after ':' in a prefixed name).
  // Stops at whitespace, structural punctuation, or a trailing '.' that ends a statement.
  const readLocalName = (): string => {
    let local = "";
    while (pos < input.length) {
      const ch = peek();
      if (/\s/.test(ch)) break;
      if (ch === "<" || ch === ">" || ch === '"' || ch === "^" || ch === "(" || ch === ")") break;
      if (ch === "#") break;
      if (ch === ";" || ch === ",") break;
      // Don't consume a '.' that is followed by whitespace/end/comment — it's the statement terminator
      if (ch === ".") {
        const nxt = peek(1);
        if (!nxt || /\s/.test(nxt) || nxt === "#") break;
      }
      local += advance();
    }
    return local;
  };

  // Skip over a blank node property list [ ... ] or labeled blank node _:xxx
  const skipBlankNode = () => {
    if (peek() === "[") {
      advance(); // consume '['
      let depth = 1;
      while (pos < input.length && depth > 0) {
        const ch = advance();
        if (ch === "[") depth++;
        else if (ch === "]") depth--;
        else if (ch === '"') {
          // consume string to avoid treating [ or ] inside strings as brackets
          readString(); // already consumed opening "
        }
      }
    }
  };

  while (pos < input.length) {
    skipWS();
    if (pos >= input.length) break;

    const startLine = line;
    const ch = peek();

    if (ch === "<") {
      tokens.push({ type: "IRI", value: readIRI(), line: startLine });

    } else if (ch === '"') {
      const value = readString();
      let lang: string | undefined;
      let datatypeRaw: string | undefined;
      if (peek() === "@") {
        advance(); // consume '@'
        let tag = "";
        while (pos < input.length && /[a-zA-Z0-9\-]/.test(peek())) tag += advance();
        lang = tag;
      } else if (peek() === "^" && peek(1) === "^") {
        advance(); advance(); // consume '^^'
        if (peek() === "<") {
          datatypeRaw = "<" + readIRI() + ">";
        } else {
          // prefixed datatype name like xsd:string
          let dt = "";
          while (pos < input.length && !/\s/.test(peek()) && peek() !== ";" && peek() !== "," && peek() !== ".") {
            dt += advance();
          }
          datatypeRaw = dt;
        }
      }
      tokens.push({ type: "LITERAL", value, lang, datatypeRaw, line: startLine });

    } else if (ch === "@") {
      advance(); // consume '@'
      let kw = "";
      while (pos < input.length && /[a-zA-Z]/.test(peek())) kw += advance();
      if (kw === "prefix" || kw === "base") {
        tokens.push({ type: "AT_KW", keyword: kw, line: startLine });
      } else {
        errors.push({ line: startLine, message: `Unknown @keyword: @${kw}` });
      }

    } else if (ch === "." || ch === ";" || ch === ",") {
      advance();
      tokens.push({ type: "PUNCT", value: ch as "." | ";" | ",", line: startLine });

    } else if (ch === ":") {
      // Empty-prefix name like :Condition
      advance(); // consume ':'
      tokens.push({ type: "PREFIXED", prefix: "", local: readLocalName(), line: startLine });

    } else if (ch === "[") {
      // Blank node property list — skip entirely, emit nothing
      skipBlankNode();

    } else if (ch === "_" && peek(1) === ":") {
      // Labeled blank node _:xxx — skip, emit nothing
      advance(); advance(); // consume '_:'
      while (pos < input.length && !/\s/.test(peek()) && peek() !== ";" && peek() !== "," && peek() !== ".") {
        advance();
      }
      tokens.push({ type: "BARE", keyword: "_blank", line: startLine });

    } else if (/[a-zA-Z]/.test(ch)) {
      let word = "";
      while (pos < input.length && /[a-zA-Z0-9_\-]/.test(peek())) word += advance();
      if (peek() === ":") {
        advance(); // consume ':'
        tokens.push({ type: "PREFIXED", prefix: word, local: readLocalName(), line: startLine });
      } else {
        // Bare keyword: PREFIX, BASE, a, true, false, etc.
        tokens.push({ type: "BARE", keyword: word, line: startLine });
      }

    } else {
      // Unknown character — skip
      errors.push({ line: startLine, message: `Unexpected character: '${ch}' (U+${ch.charCodeAt(0).toString(16).padStart(4, "0")})` });
      advance();
    }
  }

  return { tokens, errors };
}

// ── Token stream ───────────────────────────────────────────────────────────

class TokenStream {
  private pos = 0;
  constructor(private readonly tokens: Token[]) {}

  peek(): Token | undefined { return this.tokens[this.pos]; }
  next(): Token | undefined { return this.tokens[this.pos++]; }

  expectPunct(value: "." | ";" | ","): boolean {
    const tok = this.peek();
    if (tok?.type === "PUNCT" && tok.value === value) {
      this.next();
      return true;
    }
    return false;
  }

  done(): boolean { return this.pos >= this.tokens.length; }
  currentLine(): number { return this.peek()?.line ?? 0; }
}

// ── Parser ─────────────────────────────────────────────────────────────────

export function parseTurtle(input: string): ParseResult {
  const { tokens, errors: tokErrors } = tokenize(input);
  const stream = new TokenStream(tokens);
  const prefixes: Record<string, string> = {};
  let baseUri = "";
  const triples: ParsedTriple[] = [];
  const errors: ParseError[] = [...tokErrors];
  let blankNodeCount = 0;

  // Resolve a token to its full URI, or null if unresolvable
  const resolveNode = (tok: Token): string | null => {
    if (tok.type === "IRI") return tok.value;
    if (tok.type === "PREFIXED") {
      const ns = prefixes[tok.prefix];
      if (ns !== undefined) return ns + tok.local;
      errors.push({ line: tok.line, message: `Unknown prefix: "${tok.prefix}:"` });
      return `${tok.prefix}:${tok.local}`;
    }
    if (tok.type === "BARE") {
      if (tok.keyword === "a") return RDF_TYPE;
      if (tok.keyword === "_blank") return null; // blank node — skip
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

  // Skip forward to the next '.' to resync after a parse error
  const skipToNextStatement = () => {
    while (!stream.done()) {
      const tok = stream.next()!;
      if (tok.type === "PUNCT" && tok.value === ".") break;
    }
  };

  while (!stream.done()) {
    const tok = stream.peek()!;

    // ── @prefix directive ───────────────────────────────────────────────────
    if (tok.type === "AT_KW" && tok.keyword === "prefix") {
      stream.next();
      const nameTok = stream.next();
      if (!nameTok || nameTok.type !== "PREFIXED") {
        errors.push({ line: tok.line, message: "Invalid @prefix: expected prefix name" });
        skipToNextStatement();
        continue;
      }
      const iriTok = stream.next();
      if (!iriTok || iriTok.type !== "IRI") {
        errors.push({ line: tok.line, message: "Invalid @prefix: expected IRI" });
        skipToNextStatement();
        continue;
      }
      prefixes[nameTok.prefix] = iriTok.value;
      stream.expectPunct(".");
      continue;
    }

    // ── PREFIX directive (SPARQL style) ────────────────────────────────────
    if (tok.type === "BARE" && tok.keyword === "PREFIX") {
      stream.next();
      const nameTok = stream.next();
      if (!nameTok || nameTok.type !== "PREFIXED") {
        errors.push({ line: tok.line, message: "Invalid PREFIX: expected prefix name" });
        continue;
      }
      const iriTok = stream.next();
      if (!iriTok || iriTok.type !== "IRI") {
        errors.push({ line: tok.line, message: "Invalid PREFIX: expected IRI" });
        continue;
      }
      prefixes[nameTok.prefix] = iriTok.value;
      // No trailing '.' for SPARQL-style PREFIX
      continue;
    }

    // ── @base directive ─────────────────────────────────────────────────────
    if (tok.type === "AT_KW" && tok.keyword === "base") {
      stream.next();
      const iriTok = stream.next();
      if (iriTok?.type === "IRI") {
        baseUri = iriTok.value;
        prefixes[""] = iriTok.value;
      }
      stream.expectPunct(".");
      continue;
    }

    // ── BASE directive (SPARQL style) ───────────────────────────────────────
    if (tok.type === "BARE" && tok.keyword === "BASE") {
      stream.next();
      const iriTok = stream.next();
      if (iriTok?.type === "IRI") {
        baseUri = iriTok.value;
        prefixes[""] = iriTok.value;
      }
      continue;
    }

    // ── Blank node '_blank' token — skip ───────────────────────────────────
    if (tok.type === "BARE" && tok.keyword === "_blank") {
      stream.next();
      skipToNextStatement();
      blankNodeCount++;
      continue;
    }

    // ── Triple statement ────────────────────────────────────────────────────
    const subjectTok = stream.next()!;
    const subject = resolveNode(subjectTok);
    if (subject === null) {
      skipToNextStatement();
      continue;
    }

    // Parse predicate-object pairs for this subject
    let inStatement = true;
    while (inStatement) {
      const predTok = stream.peek();
      if (!predTok) { inStatement = false; break; }

      // Trailing ';' before '.' is valid (no predicate follows)
      if (predTok.type === "PUNCT" && predTok.value === ".") {
        stream.next();
        inStatement = false;
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
        // Skip to ';' or '.'
        while (!stream.done()) {
          const t = stream.peek()!;
          if (t.type === "PUNCT" && (t.value === ";" || t.value === ".")) break;
          stream.next();
        }
        continue;
      }

      // Parse one or more objects (separated by ',')
      let inObjectList = true;
      while (inObjectList) {
        const objTok = stream.peek();
        if (!objTok) { inStatement = false; inObjectList = false; break; }

        if (objTok.type === "PUNCT") {
          if (objTok.value === ".") { stream.next(); inStatement = false; inObjectList = false; break; }
          if (objTok.value === ";") { stream.next(); inObjectList = false; break; }
          if (objTok.value === ",") { stream.next(); continue; }
        }

        stream.next();

        if (objTok.type === "LITERAL") {
          triples.push({
            s: subject,
            p: predicate,
            o: objTok.value,
            isLiteral: true,
            lang: objTok.lang,
            datatype: objTok.datatypeRaw ? resolveDatatype(objTok.datatypeRaw) : undefined,
          });
        } else {
          const object = resolveNode(objTok);
          if (object !== null) {
            triples.push({ s: subject, p: predicate, o: object, isLiteral: false });
          }
        }

        // Peek at next token to decide what comes next
        const nxt = stream.peek();
        if (!nxt) { inStatement = false; inObjectList = false; break; }
        if (nxt.type === "PUNCT") {
          if (nxt.value === ",") { stream.next(); continue; }
          if (nxt.value === ";") { stream.next(); inObjectList = false; break; }
          if (nxt.value === ".") { stream.next(); inStatement = false; inObjectList = false; break; }
        }
        // No punctuation — implicitly end both loops (malformed but continue)
        inObjectList = false;
        inStatement = false;
      }
    }
  }

  // If no @base, derive baseUri from the empty prefix
  if (!baseUri && prefixes[""]) {
    baseUri = prefixes[""];
  }

  return { prefixes, baseUri, triples, errors, blankNodeCount };
}

// ── Model builder ──────────────────────────────────────────────────────────

const OWL = "http://www.w3.org/2002/07/owl#";
const RDF = "http://www.w3.org/1999/02/22-rdf-syntax-ns#";
const RDFS = "http://www.w3.org/2000/01/rdf-schema#";

const P = {
  type:             RDF + "type",
  label:            RDFS + "label",
  comment:          RDFS + "comment",
  domain:           RDFS + "domain",
  range:            RDFS + "range",
  subClassOf:       RDFS + "subClassOf",
  subPropertyOf:    RDFS + "subPropertyOf",
  ontology:         OWL + "Ontology",
  owlClass:         OWL + "Class",
  objProp:          OWL + "ObjectProperty",
  dataProp:         OWL + "DatatypeProperty",
  annotProp:        OWL + "AnnotationProperty",
  inverseOf:        OWL + "inverseOf",
  disjointWith:     OWL + "disjointWith",
  minCardinality:   OWL + "minCardinality",
  maxCardinality:   OWL + "maxCardinality",
  exactCardinality: OWL + "cardinality",
};

const genId = () => crypto.randomUUID().slice(0, 8);

export function buildModelFromTriples(parsed: ParseResult): {
  metadata: OntologyMetadata;
  classes: OntologyClass[];
  properties: OntologyProperty[];
  individuals: Individual[];
  unmappedTriples: UnmappedTriple[];
} {
  const { triples, prefixes } = parsed;

  // ── Step 1: classify subjects by rdf:type ──────────────────────────────
  // A subject can have multiple rdf:type values (e.g., an individual typed to a class)
  const typeMap = new Map<string, string>(); // subject URI → first owl type URI (for classes/props)
  const allTypes = new Map<string, string[]>(); // subject URI → all type URIs
  for (const t of triples) {
    if (t.p === P.type && !t.isLiteral) {
      if (!typeMap.has(t.s)) typeMap.set(t.s, t.o);
      const existing = allTypes.get(t.s) ?? [];
      existing.push(t.o);
      allTypes.set(t.s, existing);
    }
  }

  // ── Step 2: find ontology metadata ─────────────────────────────────────
  let ontologyUri = "";
  let ontologyLabel = "";
  let ontologyComment = "";

  for (const [subj, type] of typeMap) {
    if (type === P.ontology) {
      ontologyUri = subj;
      break;
    }
  }

  // ── Step 3: build class and property containers ─────────────────────────
  const classMap = new Map<string, OntologyClass>();
  const propMap = new Map<string, OntologyProperty>();

  // Collect all URIs that are used as rdf:type objects — these are class-like URIs
  const usedAsType = new Set<string>();
  for (const t of triples) {
    if (t.p === P.type && !t.isLiteral) {
      usedAsType.add(t.o);
    }
  }

  // Recognize owl:Class and rdfs:Class as class markers
  const classTypeUris = new Set([P.owlClass, RDFS + "Class"]);

  for (const [uri, type] of typeMap) {
    if (classTypeUris.has(type)) {
      const ln = extractLocalName(uri);
      classMap.set(uri, {
        id: genId(),
        localName: ln,
        uri,
        labels: [],
        descriptions: [],
        subClassOf: [],
        disjointWith: [],
        extraTriples: [],
      });
    } else if (type === P.objProp || type === P.dataProp || type === P.annotProp) {
      const ln = extractLocalName(uri);
      const propType =
        type === P.objProp
          ? "owl:ObjectProperty"
          : type === P.dataProp
          ? "owl:DatatypeProperty"
          : "owl:AnnotationProperty";
      propMap.set(uri, {
        id: genId(),
        localName: ln,
        uri,
        type: propType,
        labels: [],
        descriptions: [],
        domainUri: "",
        range: "",
        subPropertyOf: [],
        extraTriples: [],
      });
    }
  }

  // ── Step 3a: promote implicit classes ────────────────────────────────────
  // Entities that have rdfs:subClassOf triples, or are used as rdf:type objects
  // by other entities, are class-like even if typed as a custom metaclass
  // (e.g., `:EncodedNucleicAcidAntigen a :Class ; rdfs:subClassOf :AntigenType`).
  const subClassOfSubjects = new Set<string>();
  for (const t of triples) {
    if (t.p === P.subClassOf && !t.isLiteral) {
      subClassOfSubjects.add(t.s);
    }
  }

  for (const uri of subClassOfSubjects) {
    if (!classMap.has(uri) && !propMap.has(uri)) {
      const ln = extractLocalName(uri);
      classMap.set(uri, {
        id: genId(),
        localName: ln,
        uri,
        labels: [],
        descriptions: [],
        subClassOf: [],
        disjointWith: [],
        extraTriples: [],
      });
    }
  }

  // Also promote any entity used as an rdf:type object that isn't already a known
  // schema type — if something is used as a type, it's a class by definition.
  for (const uri of usedAsType) {
    if (!classMap.has(uri) && !propMap.has(uri) && uri !== P.ontology
        && uri !== P.owlClass && uri !== P.objProp && uri !== P.dataProp
        && uri !== P.annotProp && uri !== (RDFS + "Class")) {
      const ln = extractLocalName(uri);
      classMap.set(uri, {
        id: genId(),
        localName: ln,
        uri,
        labels: [],
        descriptions: [],
        subClassOf: [],
        disjointWith: [],
        extraTriples: [],
      });
    }
  }

  // ── Step 3b: identify individuals ───────────────────────────────────────
  // An individual is any typed subject that is NOT a class, property, or ontology.
  const schemaTypes = new Set([P.owlClass, RDFS + "Class", P.objProp, P.dataProp, P.annotProp, P.ontology]);
  const individualMap = new Map<string, Individual>();

  for (const [uri, types] of allTypes) {
    // Skip schema-level entities (explicitly typed as owl:Class, etc.)
    if (types.some((t) => schemaTypes.has(t))) continue;
    // Skip entities already promoted to classes (via rdfs:subClassOf or used as rdf:type)
    if (classMap.has(uri)) continue;
    // Skip properties
    if (propMap.has(uri)) continue;
    // At least one type should be a known class (or we still include it if it has types)
    const ln = extractLocalName(uri);
    individualMap.set(uri, {
      id: genId(),
      uri,
      localName: ln,
      typeUris: types,
      propertyValues: [],
    });
  }

  // ── Step 4: map all predicates onto the model ───────────────────────────
  const mappedTripleSet = new Set<number>();

  triples.forEach((t, idx) => {
    // rdf:type triples — mark as mapped; for promoted classes with non-standard
    // types (e.g., `:EncodedNucleicAcidAntigen a :Class`), preserve the original
    // type as an extra triple so it round-trips correctly.
    if (t.p === P.type) {
      const cls = classMap.get(t.s);
      if (cls && !classTypeUris.has(t.o) && !schemaTypes.has(t.o)) {
        cls.extraTriples.push({
          predicate: t.p,
          object: t.o,
          isLiteral: false,
        });
      }
      mappedTripleSet.add(idx);
      return;
    }

    // Ontology metadata
    if (t.s === ontologyUri) {
      if (t.p === P.label && t.isLiteral) {
        ontologyLabel = ontologyLabel || t.o; // take first label as the ontology label
        mappedTripleSet.add(idx);
        return;
      }
      if (t.p === P.comment && t.isLiteral) {
        ontologyComment = ontologyComment || t.o;
        mappedTripleSet.add(idx);
        return;
      }
    }

    // Class triples
    const cls = classMap.get(t.s);
    if (cls) {
      if (t.p === P.label && t.isLiteral) {
        cls.labels.push({ value: t.o, lang: t.lang ?? "" });
      } else if (t.p === P.comment && t.isLiteral) {
        cls.descriptions.push({ value: t.o, lang: t.lang ?? "" });
      } else if (t.p === P.subClassOf && !t.isLiteral) {
        if (!cls.subClassOf.includes(t.o)) cls.subClassOf.push(t.o);
      } else if (t.p === P.disjointWith && !t.isLiteral) {
        if (!cls.disjointWith.includes(t.o)) cls.disjointWith.push(t.o);
      } else {
        // Extra triple: prov:wasQuotedFrom, skos:*, dcterms:*, etc.
        const extra: ExtraTriple = {
          predicate: t.p,
          object: t.o,
          isLiteral: t.isLiteral,
          lang: t.lang,
          datatype: t.datatype,
        };
        cls.extraTriples.push(extra);
      }
      mappedTripleSet.add(idx);
      return;
    }

    // Property triples
    const prop = propMap.get(t.s);
    if (prop) {
      if (t.p === P.label && t.isLiteral) {
        prop.labels.push({ value: t.o, lang: t.lang ?? "" });
      } else if (t.p === P.comment && t.isLiteral) {
        prop.descriptions.push({ value: t.o, lang: t.lang ?? "" });
      } else if (t.p === P.domain && !t.isLiteral) {
        prop.domainUri = t.o;
      } else if (t.p === P.range && !t.isLiteral) {
        prop.range = t.o;
      } else if (t.p === P.subPropertyOf && !t.isLiteral) {
        if (!prop.subPropertyOf.includes(t.o)) prop.subPropertyOf.push(t.o);
      } else if (t.p === P.inverseOf && !t.isLiteral) {
        prop.inverseOf = t.o;
      } else if (t.p === P.minCardinality && t.isLiteral) {
        const n = parseInt(t.o, 10);
        if (!isNaN(n)) prop.minCardinality = n;
      } else if (t.p === P.maxCardinality && t.isLiteral) {
        const n = parseInt(t.o, 10);
        if (!isNaN(n)) prop.maxCardinality = n;
      } else if (t.p === P.exactCardinality && t.isLiteral) {
        const n = parseInt(t.o, 10);
        if (!isNaN(n)) prop.exactCardinality = n;
      } else {
        // Extra triple: any predicate not handled above
        const extra: ExtraTriple = {
          predicate: t.p,
          object: t.o,
          isLiteral: t.isLiteral,
          lang: t.lang,
          datatype: t.datatype,
        };
        prop.extraTriples.push(extra);
      }
      mappedTripleSet.add(idx);
      return;
    }

    // Individual triples
    const individual = individualMap.get(t.s);
    if (individual) {
      // rdf:type is already captured in typeUris
      if (t.p === P.type) {
        mappedTripleSet.add(idx);
        return;
      }
      const propVal: IndividualPropertyValue = {
        propertyUri: t.p,
        value: t.o,
        isLiteral: t.isLiteral,
        lang: t.lang,
        datatype: t.datatype,
      };
      individual.propertyValues.push(propVal);
      mappedTripleSet.add(idx);
      return;
    }
  });

  // ── Step 5: collect unmapped triples ───────────────────────────────────
  const unmappedTriples: UnmappedTriple[] = [];
  triples.forEach((t, idx) => {
    if (!mappedTripleSet.has(idx)) {
      unmappedTriples.push({
        subject: t.s,
        predicate: t.p,
        object: t.o,
        isLiteral: t.isLiteral,
        lang: t.lang,
        datatype: t.datatype,
      });
    }
  });

  // ── Step 6: derive baseUri ─────────────────────────────────────────────
  // Prefer @base, else empty prefix, else derive from ontologyUri namespace
  const baseUri =
    parsed.baseUri ||
    prefixes[""] ||
    (ontologyUri ? namespace(ontologyUri) : "");

  const metadata: OntologyMetadata = {
    baseUri: baseUri || "http://example.org/ontology/",
    ontologyUri,
    ontologyLabel,
    ontologyComment,
    prefixes,
    defaultLanguage: "en",
  };

  return {
    metadata,
    classes: Array.from(classMap.values()),
    properties: Array.from(propMap.values()),
    individuals: Array.from(individualMap.values()),
    unmappedTriples,
  };
}
