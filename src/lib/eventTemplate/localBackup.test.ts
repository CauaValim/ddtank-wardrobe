import { describe, expect, it } from "vitest";
import { backupDiffers, deleteBackup, readBackup, writeBackup } from "./localBackup";
import type { EventDocument } from "./types";

const doc: EventDocument = { id: "doc-1", title: "Semana 1", theme: null, servers: "s1-s401", start_date: null, end_date: null, status: "draft", sections: [], updated_at: "2026-10-13T10:00:00Z" };

describe("cópia de segurança local dos documentos", () => {
  it("guarda, lê e apaga (sem IndexedDB usa o localStorage)", async () => {
    await writeBackup({ doc: { ...doc, title: "Semana 1 (editado)" }, savedAt: "2026-10-13T10:05:00Z", baseUpdatedAt: doc.updated_at ?? null });
    const backup = await readBackup("doc-1");
    expect(backup?.doc.title).toBe("Semana 1 (editado)");
    expect(backupDiffers(backup, doc)).toBe(true);
    await deleteBackup("doc-1");
    expect(await readBackup("doc-1")).toBeNull();
  });

  it("só oferece restaurar quando o conteúdo é diferente do servidor", () => {
    const same = { doc: { ...doc, updated_at: "outra" }, savedAt: "", baseUpdatedAt: null };
    expect(backupDiffers(same, doc)).toBe(false);
    expect(backupDiffers(null, doc)).toBe(false);
  });
});
