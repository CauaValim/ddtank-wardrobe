import { describe, expect, it } from "vitest";
import { canonicalId, canonicalLookupIds } from "./canonicalItem";
import { ItemResolver, nameVariants, type FillerItemRow } from "./idFillerResolver";

// Linhas reais do jogo (TemplateAllList.xml).
const rows: FillerItemRow[] = [
  { id: 7240, name: "Lendaria• Fúria Ardente", type: 7, pic_path: "13401", image_url: "w0" },
  { id: 72401, name: "Lendaria• Fúria Ardente", type: 7, pic_path: "13401", image_url: "w1" },
  { id: 72404, name: "Lendaria• Fúria Ardente", type: 7, pic_path: "13404", image_url: "w4" },
  { id: 70016, name: "Arco de ouro", type: 7, pic_path: "x" },
  { id: 7001, name: "Machado de pedra", type: 7, pic_path: "y" },
  { id: 1120218, name: "Exp.Pedra Mágica", type: 11, pic_path: "expmagicstone" },
  { id: 101001, name: "Exp.Pedra Mágica", type: 61, pic_path: "expmagicstone" },
  { id: 101007, name: "Exp pedra mágica Iniciante", type: 61, pic_path: "expmagicstone" },
  { id: 1124504, name: "Pedra Mág.Imagem 4 (lenda) [Atk, Agi, Sorte, Def]", type: 61, pic_path: "p", image_url: "a" },
  { id: 500, name: "Poção Azul", type: 11, image_url: "azul" },
  { id: 501, name: "Poção Azul", type: 11, image_url: "verde" },
];
const byId = (id: string) => rows.find((r) => String(r.id) === id);

describe("ID padrão", () => {
  it("arma sempre no nível +0", () => {
    expect(canonicalId("72401", byId)).toBe("7240");
    expect(canonicalId("72404", byId)).toBe("7240");
    expect(canonicalId("7240", byId)).toBe("7240");
    // Arma com outro nome no ID "pai" não é nível dela.
    expect(canonicalId("70016", byId)).toBe("70016");
    expect(canonicalLookupIds("721471")).toEqual(["721471", "72147", "7214"]);
  });

  it("bolinha de EXP sempre 1120218", () => {
    expect(canonicalId("101001", byId)).toBe("1120218");
    expect(canonicalId("101007", byId)).toBe("1120218");
  });
});

describe("busca pelo nome e pela imagem", () => {
  const hashes: Record<string, bigint> = { w0: 0n, w1: 0n, w4: 0n, a: 1n, azul: 0b1111n, verde: 0xffffffffn };
  const hasher = async (src: Uint8Array | string) =>
    typeof src === "string" ? hashes[src] ?? null : BigInt(new TextDecoder().decode(src));
  const resolver = new ItemResolver(rows, hasher);

  it("nome com validade e colchetes do próprio nome", async () => {
    expect(nameVariants("Pedra Mág.Imagem 4 (lenda) [Atk, Agi, Sorte, Def] [Permanent] [Bound]")[0]).toBe("pedra mag.imagem 4 (lenda) [atk, agi, sorte, def]");
    expect(await resolver.resolve("Pedra Mág.Imagem 4 (lenda) [Atk, Agi, Sorte, Def] [Permanent] [Bound]")).toEqual({ id: 1124504, how: "name" });
  });

  it("arma de vários níveis vira a +0 em vez de erro de IDs múltiplos", async () => {
    expect(await resolver.resolve("Lendaria• Fúria Ardente [30 Days - renewable] [Bound]")).toEqual({ id: 7240, how: "name" });
  });

  it("Exp.Pedra Mágica sempre 1120218", async () => {
    expect(await resolver.resolve("EXP.PEDRA MAGICA [Permanent]")).toEqual({ id: 1120218, how: "name" });
  });

  it("nome pelo menos 90% parecido", async () => {
    expect(await resolver.resolve("Lendaria• Furia Ardentes")).toEqual({ id: 7240, how: "similar" });
    expect(await resolver.resolve("Poção")).toEqual({ error: "Não encontrado no banco" });
  });

  it("nomes iguais com IDs diferentes: a imagem do documento escolhe", async () => {
    expect(await resolver.resolve("Poção Azul")).toEqual({ error: "Múltiplos IDs encontrados: 500, 501" });
    const docImage = new TextEncoder().encode(String(0b1110n)); // 1 bit de diferença da "azul"
    expect(await resolver.resolve("Poção Azul", docImage)).toEqual({ id: 500, how: "image" });
  });
});

describe("exportação de eventos com ID padrão", () => {
  it("troca arma +N pela +0 e a bolinha de EXP por 1120218", async () => {
    const { applyCanonicalIds } = await import("./eventTemplate/canonicalDoc");
    const { getLayout, newItem, newSection } = await import("./eventTemplate/model");
    const s = newSection(getLayout("recharge-13")!, "s402");
    s.sets.tiers = [{ fields: { value: "500" }, groups: { items: [newItem({ id: "72401", name: "Fúria" }), newItem({ id: "101001", name: "Exp" }), newItem({ id: "XXX", name: "Sem ID" })] } }];
    const doc = { id: "d", title: "T", theme: "", servers: "s402", start_date: null, end_date: null, status: "draft" as const, sections: [s] };
    const out = applyCanonicalIds(doc, new Map(rows.map((r) => [String(r.id), r])));
    expect(out.changed).toBe(2);
    expect(out.doc.sections[0].sets.tiers[0].groups.items.map((i) => i.id)).toEqual(["7240", "1120218", "XXX"]);
  });
});

describe("imagens do documento", () => {
  it("lê as imagens das abas com a célula onde estão", async () => {
    const { existsSync, readFileSync } = await import("node:fs");
    const path = await import("node:path");
    const file = path.resolve(__dirname, "eventTemplate/__fixtures__/requests.xlsx");
    if (!existsSync(file)) return;
    const { readSheetImages, imageNear } = await import("./xlsxImages");
    const b = readFileSync(file);
    const ab = new ArrayBuffer(b.byteLength);
    new Uint8Array(ab).set(b);
    const images = await readSheetImages(ab);
    const all = [...images.values()].flat();
    expect(all.length).toBeGreaterThan(0);
    const first = all[0];
    expect(first.data.byteLength).toBeGreaterThan(0);
    const sheet = [...images.values()].find((list) => list.includes(first));
    expect(imageNear(sheet, first.row, first.col)).toBe(first.data);
    expect(imageNear(sheet, first.row + 50, first.col + 50)).not.toBe(first.data);
  }, 60000);
});
