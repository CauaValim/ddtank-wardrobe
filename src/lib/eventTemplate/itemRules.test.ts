import { describe, expect, it } from "vitest";
import { getLayout, newItem, newSection } from "./model";
import { categoryLabel, ruleIssues, ruleStatus, type ItemRule } from "./itemRules";
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
