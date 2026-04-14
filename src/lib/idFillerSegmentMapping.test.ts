import { describe, expect, it } from "vitest";

import { resolveSegmentNamesForMissingIds } from "@/lib/idFillerSegmentMapping";

describe("resolveSegmentNamesForMissingIds", () => {
  it("preserva o alinhamento quando a célula já tem IDs parciais", () => {
    const resolved = resolveSegmentNamesForMissingIds(
      ["201304*1", "*50", "*50"],
      [
        { row: 10, name: "Item A" },
        { row: 11, name: "Item B" },
        { row: 12, name: "Item C" },
      ],
      10
    );

    expect(resolved).toEqual([null, "Item B", "Item C"]);
  });

  it("mantém a ordem dos itens quando os nomes estão espaçados no bloco", () => {
    const resolved = resolveSegmentNamesForMissingIds(
      ["201304*1", "1121411*5", "*30", "*30"],
      [
        { row: 15, name: "Moeda" },
        { row: 18, name: "Envelope vermelho de ano novo" },
        { row: 21, name: "Pílulas de refino" },
        { row: 24, name: "Pedra" },
      ],
      14
    );

    expect(resolved).toEqual([null, null, "Pílulas de refino", "Pedra"]);
  });

  it("avança para a próxima linha disponível quando há lacunas", () => {
    const resolved = resolveSegmentNamesForMissingIds(
      ["*10", "*20"],
      [
        { row: 6, name: "Item A" },
        { row: 7, name: "Item B" },
      ],
      5
    );

    expect(resolved).toEqual(["Item A", "Item B"]);
  });

  it("não consome nomes de segmentos que já possuem ID", () => {
    const resolved = resolveSegmentNamesForMissingIds(
      ["*1", "201304*50", "*50"],
      [
        { row: 20, name: "Item A" },
        { row: 21, name: "Item B" },
        { row: 22, name: "Item C" },
      ],
      20
    );

    expect(resolved).toEqual(["Item A", null, "Item C"]);
  });
});