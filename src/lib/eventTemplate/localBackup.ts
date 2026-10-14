import type { EventDocument } from "./types";

/**
 * Cópia de segurança dos documentos de evento no próprio computador (IndexedDB), para não perder
 * o trabalho quando a internet ou a energia cai antes de salvar. Sem IndexedDB (modo privado de
 * alguns navegadores), usa o localStorage.
 */

export interface DocumentBackup {
  doc: EventDocument;
  /** Quando a cópia foi feita (ISO). */
  savedAt: string;
  /** `updated_at` do documento no servidor quando a edição começou. */
  baseUpdatedAt: string | null;
}

const DB = "painel-event-backups";
const STORE = "documents";
const LS_PREFIX = "event-doc-backup:";

function openDb(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    try {
      if (typeof indexedDB === "undefined") return resolve(null);
      const req = indexedDB.open(DB, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

async function run<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T>): Promise<T | undefined> {
  const db = await openDb();
  if (!db) throw new Error("IndexedDB indisponível");
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const req = fn(tx.objectStore(STORE));
    tx.oncomplete = () => {
      db.close();
      resolve(req.result);
    };
    tx.onerror = () => {
      db.close();
      reject(tx.error);
    };
  });
}

/** Guarda qualquer cópia local pela chave (documentos usam o id; códigos, "code:<id>"). */
export async function writeLocal<T>(key: string, value: T): Promise<void> {
  try {
    await run("readwrite", (s) => s.put(value, key));
  } catch {
    try {
      localStorage.setItem(LS_PREFIX + key, JSON.stringify(value));
    } catch {
      // Sem espaço ou sem armazenamento: o salvamento no servidor continua valendo.
    }
  }
}

export async function readLocal<T>(key: string): Promise<T | null> {
  try {
    const found = await run<T | undefined>("readonly", (s) => s.get(key));
    if (found) return found;
  } catch {
    // segue para o localStorage
  }
  try {
    const raw = localStorage.getItem(LS_PREFIX + key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

export async function deleteLocal(key: string): Promise<void> {
  try {
    await run("readwrite", (s) => s.delete(key));
  } catch {
    // ignora
  }
  try {
    localStorage.removeItem(LS_PREFIX + key);
  } catch {
    // ignora
  }
}

export const writeBackup = (backup: DocumentBackup) => writeLocal(backup.doc.id, backup);
export const readBackup = (id: string) => readLocal<DocumentBackup>(id);
export const deleteBackup = (id: string) => deleteLocal(id);

/** Conteúdo que importa para comparar duas versões do documento. */
export function documentContent(doc: EventDocument): string {
  const { title, theme, servers, start_date, end_date, status, sections } = doc;
  return JSON.stringify({ title, theme, servers, start_date: start_date || null, end_date: end_date || null, status, sections });
}

/** A cópia local tem alterações que o servidor não tem. */
export function backupDiffers(backup: DocumentBackup | null, server: EventDocument): boolean {
  return !!backup && documentContent(backup.doc) !== documentContent(server);
}
