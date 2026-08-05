import { describe, it, expect } from "vitest";
import { buildItemIndex, validateRows, normalizeName, summarize } from "./itemValidator";

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
