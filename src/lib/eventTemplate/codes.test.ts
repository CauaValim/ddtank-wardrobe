import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { exportDocument } from "./exporter";
import { codesManifest, getLayout, newItem, newSection } from "./model";
import { XlsxPackage } from "./ooxml";
import type { EventDocument } from "./types";

const codesPath = process.env.CODES_TEMPLATE_PATH ?? path.resolve(__dirname, "__fixtures__/codes.xlsx");
const hasTemplate = existsSync(codesPath);
const PNG = Uint8Array.from(Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64"));

function buffer(file: string): ArrayBuffer {
  const b = readFileSync(file);
  const ab = new ArrayBuffer(b.byteLength);
  new Uint8Array(ab).set(b);
  return ab;
}

describe.skipIf(!hasTemplate)("modelo de solicitação de códigos", () => {
  const template = hasTemplate ? buffer(codesPath) : new ArrayBuffer(0);

  it("é a versão descrita no manifesto", () => {
    expect(createHash("sha256").update(Buffer.from(template)).digest("hex")).toBe(codesManifest.sha256);
  });

  it("exporta KickSub e Torneio com datas, quantidade, nome da aba e itens", async () => {
    const kick = newSection(getLayout("code-kicksub")!, "s1-s402");
    kick.fields = { ...kick.fields, start: "2026-11-01T00:00", end: "2026-11-30T23:59" };
    kick.sets.prizes[0].fields = { activity: "Kick Subs - November", quantity: "500", tabName: "Kick Subs - Novembro" };
    kick.sets.prizes[0].groups.items = [newItem({ id: "123180", name: "Runa excelente de posição aleatória", qty: 1 })];

    const tour = newSection(getLayout("code-tournament-5")!, "s1-s402");
    expect(tour.sets.prizes).toHaveLength(5);
    expect(tour.sets.prizes[4].fields.activity).toBe("Participação - Evento Mídias");
    tour.fields = { ...tour.fields, start: "2026-11-02T00:00", end: "2026-11-15T23:59" };
    tour.sets.prizes[0].fields = { ...tour.sets.prizes[0].fields, activity: "TOP 1 - Torneio X", quantity: "2" };
    tour.sets.prizes[0].groups.items = [newItem({ id: "14914", name: "Cartão de Ilustração Sagrado Trono Grego", qty: 1 })];

    const doc: EventDocument = { id: "t", title: "Códigos Novembro", theme: null, servers: "s1-s402", start_date: null, end_date: null, status: "draft", sections: [kick, tour] };
    const result = await exportDocument(template, codesManifest, doc, { loadImage: async () => ({ data: PNG, width: 60, height: 60 }) });
    const out = await XlsxPackage.load(result.data);
    expect((await out.sheets()).map((s) => s.name)).toEqual(["Solicitação Código KickSub", "Código Torneio Top1-3,4-16,Part"]);

    const k = await out.worksheet("Solicitação Código KickSub");
    expect(await k.getText("D4")).toBe("Social Media Activity – Kick Subs - November | S1-S402");
    expect(await k.getText("D6")).toBe("DATE ENTRY: (11/01/2026) - 00:00");
    expect(await k.getText("D9")).toBe('QUANTITY OF "Kick Subs - November" CODES: [500].');
    expect(await k.getText("F12")).toBe("Kick Subs - Novembro");
    expect(await k.getText("I15")).toBe("123180");
    expect(k.isNumeric("I15")).toBe(true); // ID como número: sem o aviso "número armazenado como texto"
    expect(await k.getText("J15")).toBe("*1");
    expect(await k.getText("D17")).toBe(""); // vagas sem item ficam vazias
    expect(await k.getText("L29")).toContain("Kick"); // justificativa do modelo

    const t = await out.worksheet("Código Torneio Top1-3,4-16,Part");
    expect(await t.getText("D4")).toBe("Projects Activity – TOP 1 - Torneio X | S1-S402");
    expect(await t.getText("L6")).toBe("DATE ENTRY: (11/02/2026) - 00:00"); // datas repetidas em cada premiação
    expect(await t.getText("AJ7")).toBe("DATE END: (11/15/2026) - 23:59");
    expect(await t.getText("AJ4")).toBe("Projects Activity – Participação - Evento Mídias | S1-S402");
    expect(await t.getText("D9")).toBe('QUANTITY OF "TOP 1 - Torneio X" CODES: [2].');
    expect(await t.getText("I15")).toBe("14914");
  }, 120_000);
});
