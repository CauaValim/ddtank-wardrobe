import { describe, expect, it } from "vitest";
import { getLayout, newItem, newSection } from "./model";
import { applyNameMatches, fuzzyMatches, nameKey, namesWithoutId, pickMatches } from "./nameMatch";

function section() {
  const s = newSection(getLayout("recharge-13")!, "s402");
  s.sets.tiers = [{
    fields: { value: "500" },
    groups: { items: [newItem({ id: "", name: "Poção de Energia" }), newItem({ id: "XXX", name: "Erva  Zamia" }), newItem({ id: "11165", name: "Já tem ID" }), newItem({ id: "", name: "Item que não existe" })] },
  }];
  return s;
}

describe("itens sem ID procurados pelo nome", () => {
  it("compara sem maiúsculas, acentos e espaços extras", () => {
    expect(nameKey("  Poção  de ENERGIA ")).toBe("pocao de energia");
  });

  it("lista só os nomes dos itens sem ID numérico", () => {
    expect(namesWithoutId([section()])).toEqual(["Poção de Energia", "Erva  Zamia", "Item que não existe"]);
  });

  it("nome repetido na base: prefere o que tem imagem e depois o ID mais novo", () => {
    const m = pickMatches([
      { id: 10, name: "Erva Zamia", image_url: null },
      { id: 11163, name: "erva zamia", image_url: "x.png" },
      { id: 20000, name: "Erva Zamia", image_url: null },
      { id: 1120435, name: "Poção de Energia", image_url: "y.png" },
    ]);
    expect(m.get("erva zamia")).toBe("11163");
    expect(m.get("pocao de energia")).toBe("1120435");
  });

  it("preenche os IDs encontrados e conta os que ficaram sem correspondência", () => {
    const s = section();
    const out = applyNameMatches([s], new Map([["pocao de energia", "1120435"], ["erva zamia", "11163"]]));
    expect(out.sections[0].sets.tiers[0].groups.items.map((i) => i.id)).toEqual(["1120435", "11163", "11165", ""]);
    expect([out.resolved, out.missing]).toEqual([2, 1]);
    expect(s.sets.tiers[0].groups.items[0].id).toBe(""); // não altera o original
  });
});

describe("itens com ID que não existe no painel e nomes parecidos", () => {
  it("ID que não existe no painel também é procurado pelo nome", () => {
    const s = section();
    expect(namesWithoutId([s], new Set())).toContain("Já tem ID");
    expect(namesWithoutId([s], new Set(["11165"]))).not.toContain("Já tem ID");
    const out = applyNameMatches([s], new Map([["ja tem id", "999"]]), new Set());
    expect(out.sections[0].sets.tiers[0].groups.items[2].id).toBe("999");
  });

  it("aceita nome pelo menos 90% parecido e escolhe o mais parecido", () => {
    const rows = [
      { id: 1, name: "Poção de Energia Grande", image_url: null },
      { id: 2, name: "Pocao de Energiaa", image_url: "x.png" },
      { id: 3, name: "Erva Zamba", image_url: "y.png" },
    ];
    const m = fuzzyMatches(["Poção de Energia", "Erva Zamia", "Item que não existe"], rows);
    expect(m.get("pocao de energia")).toBe("2");
    expect(m.has("erva zamia")).toBe(true); // 1 letra diferente em 10: 90%
    expect(m.has("item que nao existe")).toBe(false);
    expect(fuzzyMatches(["Ouro"], [{ id: 5, name: "Ouros", image_url: null }]).size).toBe(0); // 80%: fica de fora
  });
});
