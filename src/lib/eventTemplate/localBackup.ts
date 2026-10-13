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

export async function writeBackup(backup: DocumentBackup): Promise<void> {
  try {
    await run("readwrite", (s) => s.put(backup, backup.doc.id));
  } catch {
    try {
      localStorage.setItem(LS_PREFIX + backup.doc.id, JSON.stringify(backup));
    } catch {
      // Sem espaço ou sem armazenamento: o salvamento no servidor continua valendo.
    }
  }
}

export async function readBackup(id: string): Promise<DocumentBackup | null> {
  try {
    const found = await run<DocumentBackup | undefined>("readonly", (s) => s.get(id));
    if (found) return found;
  } catch {
    // segue para o localStorage
  }
  try {
    const raw = localStorage.getItem(LS_PREFIX + id);
    return raw ? (JSON.parse(raw) as DocumentBackup) : null;
  } catch {
    return null;
  }
}

export async function deleteBackup(id: string): Promise<void> {
  try {
    await run("readwrite", (s) => s.delete(id));
  } catch {
    // ignora
  }
  try {
    localStorage.removeItem(LS_PREFIX + id);
  } catch {
    // ignora
  }
}

/** Conteúdo que importa para comparar duas versões do documento. */
export function documentContent(doc: EventDocument): string {
  const { title, theme, servers, start_date, end_date, status, sections } = doc;
  return JSON.stringify({ title, theme, servers, start_date: start_date || null, end_date: end_date || null, status, sections });
}

/** A cópia local tem alterações que o servidor não tem. */
export function backupDiffers(backup: DocumentBackup | null, server: EventDocument): boolean {
  return !!backup && documentContent(backup.doc) !== documentContent(server);
}
