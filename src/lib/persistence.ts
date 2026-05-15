/**
 * IndexedDB persistence for ontologies using the `idb` library.
 *
 * Schema:
 *   Database: "ontology-editor" (legacy name, retained to preserve existing user data)
 *   Object store: "ontologies" (keyPath: "id")
 *
 * All operations are async. The store should call saveOntology() on every
 * state change (debounced) and loadAll() on startup.
 */

import { openDB, type IDBPDatabase } from "idb";
import type { Ontology } from "../types";

const DB_NAME = "ontology-editor";
const DB_VERSION = 1;
const STORE_NAME = "ontologies";

let dbPromise: Promise<IDBPDatabase> | null = null;

function getDb(): Promise<IDBPDatabase> {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: "id" });
        }
      },
    });
  }
  return dbPromise;
}

/** Load all saved ontologies */
export async function loadAllOntologies(): Promise<Ontology[]> {
  const db = await getDb();
  return db.getAll(STORE_NAME);
}

/** Save or update a single ontology */
export async function saveOntology(ontology: Ontology): Promise<void> {
  const db = await getDb();
  await db.put(STORE_NAME, {
    ...ontology,
    updatedAt: new Date().toISOString(),
  });
}

/** Delete an ontology by ID */
export async function deleteOntology(id: string): Promise<void> {
  const db = await getDb();
  await db.delete(STORE_NAME, id);
}

/** Utility: debounce a function */
export function debounce<T extends (...args: unknown[]) => void>(
  fn: T,
  ms: number
): (...args: Parameters<T>) => void {
  let timer: ReturnType<typeof setTimeout>;
  return (...args: Parameters<T>) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
}
