import { describe, expect, it } from "vitest";
import { capacitySummary, convertLegacySection, getLayout, manifest, normalizeSections } from "./model";

describe("documentos do editor antigo", () => {
  it("converte cada tipo para o layout equivalente", () => {
    const types = ["daily", "mission", "doit", "tribe", "exchange", "ammo", "recharge", "consume", "recharge_extra", "consume_extra", "ranking_recharge", "ranking_consume"];
    for (const type of types) {
      const s = convertLegacySection({
        type, servers: "s1-s401", start: "2026-09-28T00:00", end: "2026-10-04T23:59", titleEn: "Title", titlePt: "Título",
        exchangeItem: "Moeda - ID 12345",
        groups: [{ label: "RECHARGE OF 500", value: "XXX*10", items: [{ id: "11510", name: "Espada", qty: 2, validity: "[30 Days - renewable] [Unbound]", price: "*10.000 Coupons", condition: "Limit 5" }] }],
      });
      expect(s, type).not.toBeNull();
      expect(getLayout(s!.layoutId), type).toBeDefined();
      if (type === "exchange") expect(s!.sets.coins[0].groups.items[0]).toMatchObject({ id: "12345", name: "Moeda" });
      const sets = type === "exchange" ? [s!.sets.groups] : Object.values(s!.sets);
      const first = sets.flat().find((b) => Object.values(b.groups).some((g) => g.length) || b.children?.length);
      const item = first?.children?.[0]?.groups.items[0] ?? Object.values(first?.groups ?? {}).flat()[0];
      expect(item, type).toMatchObject({ id: "11510", name: "Espada", qty: 2, duration: "30 Days - renewable", bind: "Unbound" });
    }
  });

  it("mantém seções novas e descarta tipos sem layout", () => {
    const r = normalizeSections([{ type: "desconhecido" }, { id: "a", layoutId: "tribe", servers: "s1-s401", fields: {}, sets: {} }]);
    expect(r.sections.map((s) => s.layoutId)).toEqual(["tribe"]);
    expect(r.dropped).toBe(1);
  });

  it("descreve a capacidade de cada layout", () => {
    for (const l of manifest.layouts) expect(capacitySummary(l).length).toBeGreaterThan(0);
    expect(capacitySummary(getLayout("missions-8x5")!)).toBe("8 × 5 itens");
  });
});
