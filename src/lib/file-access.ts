/**
 * File System Access API helpers.
 *
 * Allows the editor to read from and write back to the user's original .ttl
 * files on disk. Only works in Chromium browsers (Chrome, Edge). Falls back
 * to the classic <input type="file"> + download approach elsewhere.
 */

// ── Feature detection ──────────────────────────────────────────────────

export function supportsFileSystemAccess(): boolean {
  return typeof window !== "undefined" && "showOpenFilePicker" in window;
}

// ── In-memory handle registry ──────────────────────────────────────────
// FileSystemFileHandle is not serialisable (can't go into IndexedDB), so
// we keep handles in a plain Map keyed by ontology ID. They survive as long
// as the page is open; on refresh the user re-imports.

const handles = new Map<string, FileSystemFileHandle>();

export function setHandle(ontologyId: string, handle: FileSystemFileHandle): void {
  handles.set(ontologyId, handle);
}

export function getHandle(ontologyId: string): FileSystemFileHandle | undefined {
  return handles.get(ontologyId);
}

export function removeHandle(ontologyId: string): void {
  handles.delete(ontologyId);
}

export function hasHandle(ontologyId: string): boolean {
  return handles.has(ontologyId);
}

// ── Open file via picker ───────────────────────────────────────────────

export async function openTurtleFile(): Promise<{
  text: string;
  fileName: string;
  handle: FileSystemFileHandle;
} | null> {
  if (!supportsFileSystemAccess()) return null;

  try {
    const [handle] = await window.showOpenFilePicker({
      types: [
        {
          description: "Turtle files",
          accept: { "text/turtle": [".ttl", ".n3", ".turtle"] },
        },
      ],
      multiple: false,
    });
    if (!handle) return null;

    const file = await handle.getFile();
    const text = await file.text();
    return { text, fileName: file.name, handle };
  } catch (err) {
    // User cancelled the picker
    if (err instanceof DOMException && err.name === "AbortError") return null;
    throw err;
  }
}

// ── Write back to a handle ─────────────────────────────────────────────

export async function writeToHandle(
  handle: FileSystemFileHandle,
  content: string
): Promise<boolean> {
  try {
    // Use keepExistingData so the OS sees an in-place edit rather than
    // a delete-and-recreate. This prevents OneDrive (and similar cloud
    // sync tools) from sending the old file to the recycle bin on every save.
    const writable = await handle.createWritable({ keepExistingData: true });
    await writable.seek(0);
    await writable.write(content);
    await writable.truncate(new Blob([content]).size);
    await writable.close();
    return true;
  } catch (err) {
    console.error("[file-access] write failed:", err);
    return false;
  }
}

// ── Save via "Save As" picker (for new ontologies or fallback) ─────────

export async function saveAsTurtleFile(
  content: string,
  suggestedName: string
): Promise<FileSystemFileHandle | null> {
  if (!supportsFileSystemAccess()) return null;

  try {
    const handle = await window.showSaveFilePicker({
      suggestedName,
      types: [
        {
          description: "Turtle file",
          accept: { "text/turtle": [".ttl"] },
        },
      ],
    });
    await writeToHandle(handle, content);
    return handle;
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") return null;
    throw err;
  }
}
