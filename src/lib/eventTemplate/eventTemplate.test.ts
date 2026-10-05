import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import manifestJson from "./manifest.json";
import { exportDocument } from "./exporter";
import { readSection } from "./importer";
import { XlsxPackage, descendants, parseRange } from "./ooxml";
import { Drawing } from "./drawing";
import type { BlockSpec, EventBlock, EventDocument, LayoutSpec, SetSpec, TemplateManifest } from "./types";
import { getLayout, newItem, newSection } from "./model";
import { parseFormat, parseIdLine, parseItemLabel, renderFormat, richRuns } from "./format";

/**
 * Teste de ida e volta com o modelo oficial: cada aba é lida para um documento
 * e exportada de novo; o conteúdo de todas as células mapeadas precisa sair igual.
 *
 * O modelo (18 MB) não fica no repositório. Para rodar:
 *   EVENT_TEMPLATE_PATH=/caminho/do/modelo.xlsx npm test
 */
const manifest = manifestJson as TemplateManifest;
const templatePath = process.env.EVENT_TEMPLATE_PATH ?? path.resolve(__dirname, "__fixtures__/template.xlsx");
const hasTemplate = existsSync(templatePath);

// 1×1 PNG
const PNG = Uint8Array.from(Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64"));
const fakeImage = async () => ({ data: PNG, width: 60, height: 60 });

const norm = (s: string) => s.replace(/\s+/g, " ").replace(/\[\s+/g, "[").replace(/\s+\]/g, "]").trim();

/**
 * Diferenças intencionais em relação ao modelo de 16 anos:
 * - "Missão com itens exigidos" tem uma cópia antiga das datas em B4/B5, que passa a acompanhar as datas da seção;
 * - o texto dos itens exigidos do "Faça se Puder" tinha espaços dentro das aspas (" Prêmio da Guilda "), que o painel não reproduz;
 * - "A lâmina do exílio [30 Days - renewable [Bound]" estava sem um colchete, que o painel completa.
 */
const INTENTIONAL: Record<string, string[]> = {
  "missions-requirements": ["B4", "B5"],
  "doit-requirements": ["M21"],
  "exchange-two-coins": ["F23"],
};

function bufferOf(file: string): ArrayBuffer {
  // Copy into an ArrayBuffer of the test realm (jsdom replaces the global constructors).
  const b = readFileSync(file);
  const ab = new ArrayBuffer(b.byteLength);
  new Uint8Array(ab).set(b);
  return ab;
}

function mappedCells(spec: BlockSpec, block: EventBlock | undefined, out: string[]) {
  if (!block) return;
  for (const f of spec.fields) out.push(f.cell);
  spec.groups.forEach((g) => {
    const n = (block.groups[g.key] ?? []).length;
    g.slots.slice(0, n).forEach((s) => s.cells.forEach((c) => out.push(c.cell)));
  });
  if (spec.children) collect(spec.children, block.children ?? [], out);
}

function collect(set: SetSpec, blocks: EventBlock[], out: string[]) {
  set.blocks.forEach((spec, i) => mappedCells(spec, blocks[i], out));
}

function docWith(section: EventDocument["sections"][number]): EventDocument {
  return { id: "t", title: "Teste", theme: "16th Birthday Week 1", servers: "s1-s401", start_date: null, end_date: null, status: "draft", sections: [section] };
}

describe("formatos", () => {
  it("gera e lê de volta datas e linhas de ID", () => {
    const fmt = "DATE ENTRY: ({date}) - {time}";
    const text = renderFormat(fmt, { value: "2026-09-28T00:00", servers: "s1-s401", docTitle: "", docServers: "", sectionFields: {} });
    expect(text).toBe("DATE ENTRY: (09/28/2026) - 00:00");
    expect(parseFormat(fmt, "DATE ENTRY:  (09/28/2026) - 00:00")).toEqual({ date: "09/28/2026", time: "00:00" });
    expect(parseIdLine("1124504*300,XXX*1,12327*100")).toEqual([{ id: "1124504", qty: 300 }, { id: "XXX", qty: 1 }, { id: "12327", qty: 100 }]);
    expect(richRuns("idLine", "12*5 OR 13*2").map((r) => r.text).join("")).toBe("12*5 OR 13*2");
    expect(richRuns("itemLabel", "Ouros\n[Permanent] [Bound]").find((r) => r.text === "[Bound]")?.color).toBe("red");
    expect(parseItemLabel("Pedra Mág.Imagem 4 (lenda) [Atk, Agi, Sorte, Def] [Permanent] [Bound]")).toEqual({ name: "Pedra Mág.Imagem 4 (lenda) [Atk, Agi, Sorte, Def]", duration: "Permanent", bind: "Bound" });
    expect(parseItemLabel("A lâmina do exílio\n[30 Days - renewable [Bound]")).toEqual({ name: "A lâmina do exílio", duration: "30 Days - renewable", bind: "Bound" });
  });
});

describe.skipIf(!hasTemplate)("modelo oficial de eventos", () => {
  const template = hasTemplate ? bufferOf(templatePath) : new ArrayBuffer(0);

  it("é a versão descrita no manifesto", () => {
    expect(createHash("sha256").update(Buffer.from(template)).digest("hex")).toBe(manifest.sha256);
  });

  for (const layout of manifest.layouts as LayoutSpec[]) {
    it(`ida e volta: ${layout.label}`, async () => {
      const original = await XlsxPackage.load(template);
      const section = await readSection(original, layout);
      const doc = docWith(section);
      // Every block that has content in the template must be read.
      const counts = layout.sets.map((s) => (section.sets[s.key] ?? []).length);
      expect(counts.some((n) => n > 0)).toBe(true);

      const result = await exportDocument(template, manifest, doc, { loadImage: fakeImage });
      const out = await XlsxPackage.load(result.data);
      const sheets = await out.sheets();
      const isCover = layout.id === manifest.coverLayout;
      expect(sheets.length).toBe(isCover ? 1 : 2);
      const exportedName = sheets[sheets.length - 1].name;

      // Package hygiene.
      expect(out.paths().some((p) => p.includes("externalLink"))).toBe(false);
      expect(out.paths().some((p) => p.includes("calcChain"))).toBe(false);
      const wb = await out.xml("xl/workbook.xml");
      expect(descendants(wb, "definedName").some((d) => (d.textContent ?? "").includes("#REF!"))).toBe(false);

      // Same text in every mapped cell.
      const cells: string[] = [];
      for (const f of layout.fields) cells.push(f.cell);
      for (const set of layout.sets) collect(set, section.sets[set.key] ?? [], cells);
      const src = await original.worksheet(layout.sheet);
      const dst = await out.worksheet(exportedName);
      const diffs: string[] = [];
      for (const cell of Array.from(new Set(cells)).filter((c) => !(INTENTIONAL[layout.id] ?? []).includes(c))) {
        const a = norm(await src.getText(cell));
        const b = norm(await dst.getText(cell));
        if (a !== b && !(src.isNumeric(cell) && /^\d{2}\/\d{2}\/\d{4}$/.test(b))) diffs.push(`${cell}: "${a}" -> "${b}"`);
      }
      expect(diffs).toEqual([]);

      // One picture per used slot with image.
      const drawing = await Drawing.open(dst);
      const missing: string[] = [];
      const checkBlock = async (spec: BlockSpec, block: EventBlock | undefined) => {
        if (!block || !drawing) return;
        for (const g of spec.groups) {
          const n = (block.groups[g.key] ?? []).length;
          const boxes = new Map<string, number>();
          g.slots.slice(0, n).forEach((s) => s.image && boxes.set(s.image, (boxes.get(s.image) ?? 0) + 1));
          for (const [box, expected] of boxes) {
            const found = (await drawing.inBox(parseRange(box))).length;
            if (found !== expected) missing.push(`${box}: ${found}/${expected}`);
          }
        }
        if (spec.children) for (const [i, c] of spec.children.blocks.entries()) await checkBlock(c, block.children?.[i]);
      };
      for (const set of layout.sets) for (const [i, spec] of set.blocks.entries()) await checkBlock(spec, section.sets[set.key]?.[i]);
      expect(missing).toEqual([]);
    }, 120_000);
  }

  it("cenário: menos itens que vagas, layout repetido e capa sem Entrada Diária", async () => {
    const pkg = await XlsxPackage.load(template);
    const missions = await readSection(pkg, getLayout("missions-8x5")!);
    missions.sets.missions = missions.sets.missions.slice(0, 3);
    missions.sets.missions[2].groups.items = missions.sets.missions[2].groups.items.slice(0, 2);
    missions.servers = "s1-s402";
    const ammo = await readSection(pkg, getLayout("ammo-7x6")!);
    ammo.sets.blocks = ammo.sets.blocks.slice(0, 2);
    ammo.sets.blocks[1].groups.items = ammo.sets.blocks[1].groups.items.slice(0, 3);
    ammo.sets.blocks[0].groups.items[0].extra = { ...ammo.sets.blocks[0].groups.items[0].extra, currency: "Coupons / Lcps" };
    const recharge = newSection(getLayout("recharge-13")!, "s1-s401");
    recharge.sets.tiers = [1, 2].map((k) => ({ fields: { value: `${k}.000`, condition: "Can be repeated" }, groups: { items: [newItem({ id: "12262", name: `Ouros ${k}`, qty: k })] } }));
    const missions2 = await readSection(pkg, getLayout("missions-8x5")!);
    missions2.sets.missions = missions2.sets.missions.slice(0, 1);
    const doc: EventDocument = { ...docWith(missions), theme: "Panel Test Week 1", sections: [missions, ammo, recharge, missions2] };

    const result = await exportDocument(template, manifest, doc, { loadImage: fakeImage });
    const out = await XlsxPackage.load(result.data);
    expect((await out.sheets()).map((x) => x.name)).toEqual([
      "BR-Daily Entry - 14D s1-s401", "BR-Missions s1-s402", "BR - Ammunitions sale s1-s401", "BR - Recharge s1-s401", "BR-Missions s1-s401",
    ]);
    expect(result.data.byteLength).toBeLessThan(2_000_000);

    const cover = await out.worksheet("BR-Daily Entry - 14D s1-s401");
    expect(await cover.getText("B17")).toBe("EVENT FOR THE SERVERS: Panel Test Week 1 - s1-s401");
    expect(cover.isColHidden(16)).toBe(true); // área da Entrada Diária oculta

    const m = await out.worksheet("BR-Missions s1-s402");
    expect(await m.getText("P2")).toBe("ACTIVE MISSIONS s1-s402");
    expect(m.isRowHidden(72)).toBe(true); // missão D em diante
    expect(m.isRowHidden(62)).toBe(true); // 3º item da missão C (linhas 62–64)
    expect(m.isRowHidden(61)).toBe(false); // 2º item continua visível

    const a = await out.worksheet("BR - Ammunitions sale s1-s401");
    const drawing = await Drawing.open(a);
    const lcps = (await drawing!.inBox(parseRange("E8:E8"))).filter((u) => u.media?.endsWith("image29.png"));
    expect(lcps.length).toBe(1);
    expect(a.isRowHidden(19)).toBe(true);
    expect(a.isRowHidden(23)).toBe(true);

    const r = await out.worksheet("BR - Recharge s1-s401");
    expect(await r.getText("B8")).toBe("RECHARGE OF 2.000 COUPONS");
    expect(await r.getText("N5")).toBe(""); // colunas auxiliares limpas
    expect(r.isRowHidden(11)).toBe(true);
  }, 120_000);
});
