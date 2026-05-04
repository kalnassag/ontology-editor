import { useEffect, useState, useRef } from "react";
import Editor, { useMonaco } from "@monaco-editor/react";
import { useStore } from "../../lib/store";
import { serializeToTurtle } from "../../lib/turtle-serializer";
import { Save, AlertCircle, CheckCircle2 } from "lucide-react";

export default function RawEditor() {
  const activeOntology = useStore((s) => s.getActiveOntology());
  const updateOntologyFromTurtle = useStore((s) => s.updateOntologyFromTurtle);
  
  const [code, setCode] = useState("");
  const [isDirty, setIsDirty] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const monaco = useMonaco();
  
  // Track the generated turtle of the CURRENT ontology state, so we know if the user edited it
  const originalCodeRef = useRef("");

  useEffect(() => {
    if (activeOntology && !isDirty) {
      const turtle = serializeToTurtle(activeOntology);
      setCode(turtle);
      originalCodeRef.current = turtle;
    }
  }, [activeOntology, isDirty]);

  // Autocomplete provider for prefixes, classes, and properties
  useEffect(() => {
    if (!monaco || !activeOntology) return;

    const provider = monaco.languages.registerCompletionItemProvider("sparql", {
      provideCompletionItems: (model, position) => {
        const word = model.getWordUntilPosition(position);
        const range = {
          startLineNumber: position.lineNumber,
          endLineNumber: position.lineNumber,
          startColumn: word.startColumn,
          endColumn: word.endColumn,
        };

        const suggestions: any[] = [];
        
        // Suggest prefixes
        for (const [prefix, uri] of Object.entries(activeOntology.metadata.prefixes)) {
          suggestions.push({
            label: prefix + ":",
            kind: monaco.languages.CompletionItemKind.Module,
            insertText: prefix + ":",
            detail: `Prefix for ${uri}`,
            range,
          });
        }

        // Suggest Classes
        for (const cls of activeOntology.classes) {
          const pref = Object.entries(activeOntology.metadata.prefixes).find(([, uri]) => cls.uri.startsWith(uri));
          if (pref) {
            const shortName = `${pref[0]}:${cls.uri.slice(pref[1].length)}`;
            suggestions.push({
              label: shortName,
              kind: monaco.languages.CompletionItemKind.Class,
              insertText: shortName,
              detail: cls.labels[0]?.value || "Class",
              range,
            });
          }
        }

        // Suggest Properties
        for (const prop of activeOntology.properties) {
          const pref = Object.entries(activeOntology.metadata.prefixes).find(([, uri]) => prop.uri.startsWith(uri));
          if (pref) {
            const shortName = `${pref[0]}:${prop.uri.slice(pref[1].length)}`;
            suggestions.push({
              label: shortName,
              kind: monaco.languages.CompletionItemKind.Property,
              insertText: shortName,
              detail: prop.labels[0]?.value || "Property",
              range,
            });
          }
        }

        return { suggestions };
      },
    });

    return () => provider.dispose();
  }, [monaco, activeOntology]);

  const handleApply = () => {
    setError(null);
    setSuccess(false);
    
    const result = updateOntologyFromTurtle(code);
    if (result.errors && result.errors.length > 0) {
      const firstErr = result.errors[0];
      setError(firstErr.line ? `Line ${firstErr.line}: ${firstErr.message}` : firstErr.message);
    } else {
      setSuccess(true);
      setIsDirty(false);
      originalCodeRef.current = code;
      setTimeout(() => setSuccess(false), 3000);
    }
  };

  const handleEditorChange = (value: string | undefined) => {
    const val = value || "";
    setCode(val);
    setIsDirty(val !== originalCodeRef.current);
    setError(null);
    setSuccess(false);
  };

  if (!activeOntology) return null;

  return (
    <div className="flex h-full flex-col bg-th-base">
      <div className="flex items-center justify-between border-b border-th-border px-4 py-2">
        <h3 className="text-xs font-semibold text-th-fg">Raw Turtle Editor</h3>
        
        <div className="flex items-center gap-4">
          {error && (
            <div className="flex items-center gap-1.5 text-xs text-red-400">
              <AlertCircle size={14} />
              <span>{error}</span>
            </div>
          )}
          {success && (
            <div className="flex items-center gap-1.5 text-xs text-emerald-400">
              <CheckCircle2 size={14} />
              <span>Applied successfully</span>
            </div>
          )}
          
          <button
            onClick={handleApply}
            disabled={!isDirty}
            className={`flex items-center gap-1.5 rounded px-3 py-1.5 text-xs font-medium transition-colors ${
              isDirty 
                ? "bg-blue-600 text-white hover:bg-blue-500" 
                : "bg-th-surface text-th-fg-4 cursor-not-allowed"
            }`}
          >
            <Save size={14} />
            Apply Changes
          </button>
        </div>
      </div>
      
      <div className="flex-1 overflow-hidden relative">
        <Editor
          height="100%"
          language="sparql" // SPARQL syntax highlighting works beautifully for Turtle
          theme="vs-dark"
          value={code}
          onChange={handleEditorChange}
          options={{
            minimap: { enabled: false },
            fontSize: 13,
            fontFamily: "var(--font-mono, monospace)",
            wordWrap: "on",
            scrollBeyondLastLine: false,
            padding: { top: 16 },
            formatOnType: true,
          }}
        />
      </div>
    </div>
  );
}
