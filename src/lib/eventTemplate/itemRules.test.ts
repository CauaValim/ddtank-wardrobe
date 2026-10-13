import { describe, expect, it } from "vitest";
import { getLayout, newItem, newSection } from "./model";
import { TIER_CATEGORIES, categoryLabel, ruleIssues, ruleStatus, tierAllowed, type ItemRule } from "./itemRules";
import { recentText, usageSummary } from "./usage";
import type { EventDocument } from "./types";

const rule: ItemRule = { id: "r1", item_id: "500", item_name: "Lança", allowed: ["recharge", "exchange"], forbidden: ["ammo", "exchange"], note: "só em datas especiais" };

describe("categorias de itens", () => {
  it("permitido, proibido (vence) ou sem cadastro", () => {
    expect(ruleStatus(rule, "recharge")).toBe("allowed");
    expect(ruleStatus(rule, "exchange")).toBe("forbidden");
    expect(ruleStatus(rule, "consume")).toBeNull();
    expect(ruleStatus(undefined, "recharge")).toBeNull();
    expect(categoryLabel("ammo")).toBe("Venda de Munição");
  });

  it("avisa uma vez por item usado em seção proibida", () => {
    const ammo = newSection(getLayout("ammo-7x6")!, "s1-s401");
    ammo.sets.blocks = [{ fields: {}, groups: { items: [newItem({ id: "500", name: "Lança" }), newItem({ id: "500", name: "Lança" })] } }];
    const recharge = newSection(getLayout("recharge-13")!, "s1-s401");
    recharge.sets.tiers = [{ fields: { value: "500" }, groups: { items: [newItem({ id: "500", name: "Lança" })] } }];
    const doc: EventDocument = { id: "d", title: "t", theme: null, servers: "s1-s401", start_date: null, end_date: null, status: "draft", sections: [ammo, recharge] };
    const issues = ruleIssues(doc, new Map([["500", rule]]));
    expect(issues).toEqual([{ level: "warning", where: "1. Venda de Munição", message: "Lança (ID 500) está proibido em Venda de Munição (só em datas especiais)" }]);
  });
});

it("texto de entradas recentes", () => {
  expect(recentText(1)).toBe("Entrou 1 vez nos últimos 30 dias");
  expect(recentText(3)).toBe("Entrou 3 vezes nos últimos 30 dias");
  const u = { kind: "sale" as const, docId: "x", docTitle: "", date: "2026-10-01", detail: "" };
  expect(usageSummary({ exchange: [], ranking: [], sale: [u, u] })).toBe("Entrou 2 vezes nos últimos 30 dias");
});

describe("andar liberado na Recarga/Consumo", () => {
  const tiered: ItemRule = { id: "r2", item_id: "600", item_name: "Asa", allowed: ["recharge"], forbidden: [], note: null, min_tiers: { recharge: "8.000" } };

  it("lista os andares e compara com o andar mínimo", () => {
    expect(TIER_CATEGORIES.recharge[0]).toBe("500");
    expect(TIER_CATEGORIES.consume).toContain("400.000");
    expect(tierAllowed(tiered, "recharge", "5000")).toBe(false);
    expect(tierAllowed(tiered, "recharge", "8.000")).toBe(true);
    expect(tierAllowed(tiered, "recharge", "15.000")).toBe(true);
    expect(tierAllowed(tiered, "consume", "1.000")).toBe(true);
  });

  it("avisa o item colocado abaixo do andar liberado", () => {
    const recharge = newSection(getLayout("recharge-13")!, "s1-s401");
    recharge.sets.tiers = [
      { fields: { value: "5.000" }, groups: { items: [newItem({ id: "600", name: "Asa" })] } },
      { fields: { value: "8.000" }, groups: { items: [newItem({ id: "600", name: "Asa" })] } },
    ];
    const doc: EventDocument = { id: "d", title: "t", theme: null, servers: "s1-s401", start_date: null, end_date: null, status: "draft", sections: [recharge] };
    expect(ruleIssues(doc, new Map([["600", tiered]]))).toEqual([
      { level: "warning", where: "1. " + getLayout("recharge-13")!.label, message: "Asa (ID 600) só está liberado a partir do andar 8.000 em Recarga (está no andar 5.000)" },
    ]);
  });
});
