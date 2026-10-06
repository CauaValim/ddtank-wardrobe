import { describe, expect, it } from "vitest";
import { getLayout, newItem, newSection } from "./model";
import {
  applyDailyLength, dailyLength, editorBlockSpec, exchangeLimitText, highestStandardTier, isRenewable, normalizeSection,
  normalizeTier, paginateSection, parseExchangeLimit, sectionIssues, setCapacity, tierCondition, tierLadder, tiersUpTo,
} from "./rules";
import type { EventBlock } from "./types";

const mission = (name: string, choice = 0): EventBlock => ({
  fields: { titlePt: name },
  groups: { items: [newItem({ name: `${name} item` })], ...(choice ? { choice: Array.from({ length: choice }, (_, i) => newItem({ name: `${name} opção ${i + 1}` })) } : {}) },
});

describe("missões sem limite", () => {
  it("divide as missões em abas de 8", () => {
    const layout = getLayout("missions-8x5")!;
    const section = newSection(layout, "s1-s401");
    section.sets.missions = Array.from({ length: 19 }, (_, i) => mission(`M${i + 1}`));
    expect(setCapacity(layout, layout.sets[0])).toBe(Infinity);
    const pages = paginateSection(layout, section);
    expect(pages.map((p) => p.sets.missions.length)).toEqual([8, 8, 3]);
    expect(pages[2].sets.missions[0].fields.titlePt).toBe("M17");
    expect(new Set(pages.map((p) => p.id)).size).toBe(3);
  });

  it("até 8 missões continua em uma aba só", () => {
    const layout = getLayout("missions-8x5")!;
    const section = newSection(layout, "s1-s401");
    section.sets.missions = [mission("A"), mission("B")];
    expect(paginateSection(layout, section)).toEqual([section]);
  });

  it("missão com escolha ocupa a 3ª posição e fecha a aba, mantendo a ordem", () => {
    const layout = getLayout("missions-3x3-choice")!;
    const section = newSection(layout, "s1-s401");
    section.sets.missions = [mission("A"), mission("B", 4), mission("C"), mission("D"), mission("E"), mission("F", 1)];
    const pages = paginateSection(layout, section).map((p) => p.sets.missions.map((b) => b?.fields.titlePt ?? null));
    expect(pages).toEqual([["A", null, "B"], ["C", "D", "E"], [null, null, "F"]]);
    // Todas as missões do editor podem ter as 4 opções.
    expect(editorBlockSpec(layout, layout.sets[0], 0).groups.map((g) => g.key)).toEqual(["items", "choice"]);
  });

  it("missões com escolha nas posições certas não mudam", () => {
    const layout = getLayout("missions-3x3-choice")!;
    const section = newSection(layout, "s1-s401");
    section.sets.missions = [mission("A"), mission("B"), mission("C", 2)];
    expect(paginateSection(layout, section)).toEqual([section]);
  });
});

describe("Entrada Diária", () => {
  const layout = getLayout("daily-14d")!;

  it("14 dias: filas de 3, 7 e 14 dias", () => {
    const s = newSection(layout, "s1-s401");
    expect(dailyLength(s)).toBe(14);
    expect(s.sets.queues.map((q) => q.fields.label)).toEqual(["Queue 3", "Queue 7", "Queue 14"]);
  });

  it("7 dias: filas de 3 e 7 dias, mantendo os itens", () => {
    const s = newSection(layout, "s1-s401");
    s.sets.queues[1].groups.items = [newItem({ name: "Baú" })];
    const seven = applyDailyLength(layout, s, 7);
    expect(seven.sets.queues.map((q) => q.fields.label)).toEqual(["Queue 3", "Queue 7"]);
    expect(seven.sets.queues[1].groups.items[0].name).toBe("Baú");
    expect(applyDailyLength(layout, seven, 14).sets.queues.map((q) => q.fields.label)).toEqual(["Queue 3", "Queue 7", "Queue 14"]);
  });

  it("acusa lista de dias maior que a duração", () => {
    const s = applyDailyLength(layout, newSection(layout, "s1-s401"), 7);
    s.sets.days[0].groups.items = Array.from({ length: 8 }, () => newItem({ name: "x" }));
    expect(sectionIssues(layout, s, "1").map((i) => i.level)).toEqual(["error"]);
  });

  it("documentos antigos: duração deduzida pelas filas", () => {
    const s = newSection(layout, "s1-s401");
    delete s.fields.days;
    s.sets.queues = s.sets.queues.slice(0, 2);
    expect(normalizeSection(layout, s).fields.days).toBe("7");
  });
});

describe("pisos", () => {
  it("escadas padrão", () => {
    expect(tierLadder(getLayout("recharge-13")!)!.values).toEqual(["500", "1.000", "2.000", "5.000", "8.000", "15.000", "30.000", "50.000", "100.000", "150.000", "200.000", "300.000", "400.000"]);
    expect(tierLadder(getLayout("consume-10")!)!.values).toEqual(["1.000", "5.000", "10.000", "30.000", "50.000", "100.000", "150.000", "200.000", "300.000", "400.000"]);
  });

  it("condição pelo piso", () => {
    const recharge = tierLadder(getLayout("recharge-13")!)!;
    const consume = tierLadder(getLayout("consume-10")!)!;
    expect(["500", "1000", "2.000", "5.000"].map((v) => tierCondition(recharge, v))).toEqual(["Can be repeated", "Can be repeated", "Can be repeated", "Cannot be repeated"]);
    expect(["1.000", "5.000"].map((v) => tierCondition(consume, v))).toEqual(["Can be repeated", "Cannot be repeated"]);
    expect(normalizeTier("25000")).toBe("25.000");
  });

  it("gera as faixas até o piso escolhido, mantendo itens e pisos manuais", () => {
    const layout = getLayout("recharge-13")!;
    const s = newSection(layout, "s1-s401");
    s.sets.tiers = [
      { fields: { value: "1.000", condition: "Can be repeated" }, groups: { items: [newItem({ name: "Ouros" })] } },
      { fields: { value: "12.000", condition: "Cannot be repeated" }, groups: { items: [] } },
    ];
    const out = tiersUpTo(layout, s, "15.000");
    expect(out.sets.tiers.map((t) => t.fields.value)).toEqual(["500", "1.000", "2.000", "5.000", "8.000", "12.000", "15.000"]);
    expect(out.sets.tiers[1].groups.items[0].name).toBe("Ouros");
    expect(out.sets.tiers.map((t) => t.fields.condition).slice(0, 4)).toEqual(["Can be repeated", "Can be repeated", "Can be repeated", "Cannot be repeated"]);
    expect(highestStandardTier(layout, out)).toBe("15.000");
    // Nunca passa da capacidade do modelo.
    expect(tiersUpTo(layout, out, "400.000").sets.tiers.length).toBe(13);
  });
});

describe("limite de troca", () => {
  it("textos", () => {
    expect(exchangeLimitText(3)).toBe("LIMIT OF 3 ITEMS PER EXCHANGE");
    expect(parseExchangeLimit("No limit")).toBeNull();
    expect(parseExchangeLimit("LIMIT OF 1 ITEM PER EXCHANGE")).toBe(1);
    expect(parseExchangeLimit("algo livre")).toBeUndefined();
  });

  it("documentos antigos passam para o plural", () => {
    const layout = getLayout("exchange-11groups")!;
    const s = newSection(layout, "s1-s401");
    s.sets.groups = [{ fields: { title: "A", condition: "LIMIT OF 2 ITEM PER EXCHANGE" }, groups: {}, children: [] }];
    expect(normalizeSection(layout, s).sets.groups[0].fields.condition).toBe("LIMIT OF 2 ITEMS PER EXCHANGE");
  });
});

it("validade renovável", () => {
  expect(["30 Days - renewable", "30 Days - non-renewable", "Permanent", "7 Days"].map(isRenewable)).toEqual([true, true, false, false]);
});
