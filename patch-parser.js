import fs from 'fs';
import path from 'path';

const parserPath = path.join(process.cwd(), 'src/lib/turtle-parser.ts');
let code = fs.readFileSync(parserPath, 'utf8');

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
      stream.expectPunct(".");
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
      stream.expectPunct(".");
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
       if (stream.peek()?.type === "PUNCT" && stream.peek()?.value === ".") {
           stream.next();
       }
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
}`;

// Find export function parseTurtle up to // ── Model builder
const regex = /export function parseTurtle\([\s\S]+?\/\/\s*──\s*Model builder/;
if (!regex.test(code)) {
  console.log('Regex did not match!');
  process.exit(1);
}

const updatedCode = code.replace(regex, newParseTurtle + '\n\n// ── Model builder');
fs.writeFileSync(parserPath, updatedCode);
console.log('Patched turtle-parser.ts successfully');
