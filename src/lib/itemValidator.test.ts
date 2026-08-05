import { describe, it, expect } from "vitest";
import { buildItemIndex, validateRows, normalizeName, summarize, extractPairsFromGrid } from "./itemValidator";

const db = [
  { id: 1, name: "Espada de Fogo", image_url: "http://x/1.png" },
  { id: 2, name: "Escudo", image_url: null },
  { id: 3, name: "Vak vak ördek", image_url: "http://x/3.png" },
];

const index = buildItemIndex(db);

describe("normalizeName", () => {
  it("ignora acentos, caixa e espaços", () => {
    expect(normalizeName("  ESPADA  de   Fogo ")).toBe("espada de fogo");
    expect(normalizeName("Vak vak ördek")).toBe("vak vak ordek");
  });

  it("ignora tags [Permanent] [Bound] e quebras de linha", () => {
    expect(normalizeName("Escudo\n[Permanent] [Bound]")).toBe("escudo");
  });
});

describe("extractPairsFromGrid", () => {
  it("lê tabelas com cabeçalho Item Name / ID", () => {
    const grid = [
      ["Item Name", "Image", "Value", "ID"],
      ["Escudo\n[Permanent] [Bound]", null, "*300 Coupons", "12269"],
    ];
    expect(extractPairsFromGrid(grid, "S")).toEqual([
      { sheet: "S", cell: "D2", name: "Escudo\n[Permanent] [Bound]", id: "12269" },
    ]);
  });

  it("lê célula ID*Amount usando o nome mais próximo", () => {
    const grid = [
      [null, "ITEM", null, "ID and Amount"],
      [null, "Escudo\n[Permanent] [Bound]", null, "12269*100"],
    ];
    const pairs = extractPairsFromGrid(grid, "S");
    expect(pairs).toHaveLength(1);
    expect(pairs[0].id).toBe("12269");
  });

  it("pareia vários IDs com nomes empilhados na coluna", () => {
    const grid = [
      ["VALUE", "ITEMS", "ID AND AMOUNT"],
      ["10.000", "A [Bound]", "1*50,2*6,3*2000"],
      [null, "B [Bound]", null],
      [null, "C [Bound]", null],
    ];
    const pairs = extractPairsFromGrid(grid, "S");
    expect(pairs.map((p) => `${p.id}:${p.name}`)).toEqual(["1:A [Bound]", "2:B [Bound]", "3:C [Bound]"]);
  });

  it("ignora colunas de custo (ID / Value)", () => {
    const grid = [
      ["ID / Value", null, "Item Name", "ID / Amount"],
      ["11804*8", null, "Escudo [Bound]", "45213*1"],
    ];
    const pairs = extractPairsFromGrid(grid, "S");
    expect(pairs.map((p) => p.id)).toEqual(["45213"]);
  });
});

describe("validateRows", () => {
  it("marca válido quando id, nome e imagem batem", () => {
    const [r] = validateRows([{ ID: 1, Nome: "espada de fogo" }], index);
    expect(r.status).toBe("valid");
  });

  it("marca sem imagem", () => {
    const [r] = validateRows([{ ID: 2, Nome: "Escudo" }], index);
    expect(r.status).toBe("no_image");
  });

  it("marca nome divergente com nome do banco", () => {
    const [r] = validateRows([{ ID: 1, Nome: "Escudo" }], index);
    expect(r.status).toBe("name_mismatch");
    expect(r.dbName).toBe("Espada de Fogo");
    expect(r.suggestedId).toBe("2");
  });

  it("marca id não encontrado e sugere id pelo nome", () => {
    const [r] = validateRows([{ ID: 999, Nome: "Escudo" }], index);
    expect(r.status).toBe("id_not_found");
    expect(r.suggestedId).toBe("2");
  });

  it("marca linha inválida", () => {
    const [r] = validateRows([{ ID: "", Nome: "" }], index);
    expect(r.status).toBe("invalid_row");
  });

  it("resume as contagens", () => {
    const rows = validateRows(
      [{ ID: 1, Nome: "Espada de Fogo" }, { ID: 2, Nome: "Escudo" }],
      index
    );
    expect(summarize(rows).valid).toBe(1);
    expect(summarize(rows).no_image).toBe(1);
  });
});
