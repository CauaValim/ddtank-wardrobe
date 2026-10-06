import { describe, expect, it } from "vitest";
import { getLayout, newItem, newSection } from "./model";
import { buildUsageIndex, visibleUsage, type UsageDoc } from "./usage";
import { applyPreset, isMissionBlock, presetFromBlock, presetSpec } from "./presets";
import { archiveDocument } from "./pastEvents";
import type { EventDocument } from "./types";

function exchangeDoc(): UsageDoc {
  const s = newSection(getLayout("exchange-11groups")!, "s1-s401");
  s.fields.start = "2026-09-01T00:00";
  s.sets.coins = [{ fields: {}, groups: { items: [newItem({ id: "11515", name: "Bolo" })] } }];
  s.sets.groups = [{
    fields: { title: "A", condition: "LIMIT OF 2 ITEMS PER EXCHANGE" }, groups: {},
    children: [{ fields: { value: "11515*2000", total: "2" }, groups: { items: [newItem({ id: "500", name: "Lança" })] } }],
  }];
  return { id: "d1", title: "Semana 1", start_date: null, sections: [s] };
}

function rankingDoc(): UsageDoc {
  const s = newSection(getLayout("ranking-recharge")!, "s1-s401");
  s.fields.start = "2026-08-01T00:00";
  s.sets.places = [1, 2, 3].map((p) => ({ fields: {}, groups: { items: p === 2 ? [newItem({ id: "700", name: "Runa" })] : [newItem({ id: "700", name: "Runa" }), newItem({ id: "701", name: "Ouro" })] } }));
  return { id: "d2", title: "Semana 2", start_date: null, sections: [s] };
}

function rechargeDoc(start: string): UsageDoc {
  const s = newSection(getLayout("recharge-13")!, "s1-s401");
  s.fields.start = `${start}T00:00`;
  s.sets.tiers = [{ fields: { value: "5.000", condition: "Cannot be repeated" }, groups: { items: [newItem({ id: "500", name: "Lança" })] } }];
  return { id: `r${start}`, title: `Recarga ${start}`, start_date: null, sections: [s] };
}

describe("uso dos itens", () => {
  const index = buildUsageIndex([exchangeDoc(), rankingDoc(), rechargeDoc("2026-09-20"), rechargeDoc("2026-07-01")]);

  it("troca: data, evento e custo", () => {
    const usage = visibleUsage(index.get("500"), null, new Date("2026-10-05T12:00:00Z"));
    expect(usage.exchange).toEqual([{ kind: "exchange", docId: "d1", docTitle: "Semana 1", date: "2026-09-01", detail: "Grupo A · custo 11515*2000 · LIMIT OF 2 ITEMS PER EXCHANGE" }]);
    expect(visibleUsage(index.get("11515"), null).exchange[0].detail).toBe("Moeda de troca");
  });

  it("ranking: posições juntas", () => {
    expect(index.get("700")?.[0].detail).toBe("Ranking de Recarga · 1º, 2º e 3º lugar");
    expect(index.get("701")?.[0].detail).toBe("Ranking de Recarga · 1º e 3º lugar");
  });

  it("vendas, recargas e consumos só dos últimos 30 dias, sem o documento atual", () => {
    const usage = visibleUsage(index.get("500"), null, new Date("2026-10-05T12:00:00Z"));
    expect(usage.sale.map((u) => [u.date, u.detail])).toEqual([["2026-09-20", "Recarga · piso 5.000"]]);
    expect(visibleUsage(index.get("500"), "d1", new Date("2026-10-05T12:00:00Z")).exchange).toEqual([]);
  });
});

describe("pré-definições", () => {
  const spec8 = getLayout("missions-8x5")!.sets[0].blocks[0];

  it("salva textos e itens sem imagem e aplica respeitando as vagas", () => {
    const preset = presetFromBlock({
      fields: { titleEn: "Kill 10", titlePt: "", descPt: "Derrote 10" },
      groups: { items: Array.from({ length: 6 }, (_, i) => newItem({ id: String(100 + i), name: `R${i}`, imageUrl: "data:x" })), choice: [newItem({ name: "Opção" })] },
    });
    expect(preset.fields).toEqual({ titleEn: "Kill 10", descPt: "Derrote 10" });
    expect(preset.groups.items[0].imageUrl).toBeUndefined();

    const { block, dropped } = applyPreset(spec8, { fields: { titlePt: "Minha missão" }, groups: { items: [] } }, preset);
    expect(block.fields).toEqual({ titlePt: "Minha missão", titleEn: "Kill 10", descPt: "Derrote 10" });
    expect(block.groups.items.length).toBe(5);
    expect(dropped).toBe(2); // 6ª recompensa e a opção de escolha (não existe nesse layout)
  });

  it("parte das recompensas: mantém os itens que já estavam", () => {
    const { block } = applyPreset(spec8, { fields: {}, groups: { items: [newItem({ id: "9", name: "Já estava" })] } }, { fields: {}, groups: { items: [newItem({ id: "1", name: "Fixo" })] } });
    expect(block.groups.items.map((i) => i.name)).toEqual(["Fixo", "Já estava"]);
  });

  it("editor de pré-definições aceita 4 exigidos, 6 recompensas e 4 opções", () => {
    const spec = presetSpec();
    expect(spec.groups.map((g) => [g.key, g.slots.length])).toEqual([["requirements", 4], ["items", 6], ["choice", 4]]);
    expect(isMissionBlock(spec)).toBe(true);
    expect(isMissionBlock(getLayout("recharge-13")!.sets[0].blocks[0])).toBe(false);
  });
});

it("evento anterior: sem imagens, datas das seções", () => {
  const s = newSection(getLayout("missions-8x5")!, "s1-s401");
  s.fields = { start: "2025-03-10T00:00", end: "2025-03-17T00:00" };
  s.sets.missions = [{ fields: {}, groups: { items: [newItem({ name: "x", imageUrl: "data:abc" })] } }];
  const doc: Omit<EventDocument, "id"> = { title: "x", theme: null, servers: "s1-s401", start_date: null, end_date: null, status: "draft", sections: [s] };
  const out = archiveDocument(doc, "Semana 10.xlsx");
  expect(out.title).toBe("Semana 10");
  expect([out.start_date, out.end_date, out.status]).toEqual(["2025-03-10", "2025-03-17", "final"]);
  expect(out.sections[0].sets.missions[0].groups.items[0].imageUrl).toBeUndefined();
});
