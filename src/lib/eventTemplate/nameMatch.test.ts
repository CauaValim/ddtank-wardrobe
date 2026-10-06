import { describe, expect, it } from "vitest";
import { getLayout, newItem, newSection } from "./model";
import { applyNameMatches, nameKey, namesWithoutId, pickMatches } from "./nameMatch";

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
