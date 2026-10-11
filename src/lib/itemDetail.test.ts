import { describe, expect, it } from "vitest";
import { accessoryExp, currencyLabel, isSoldByQuantity, itemStats, renewalOffers, sectionsFor } from "./itemDetail";

// Linhas reais do ShopItemList.xml (campos usados).
const shop = [
  { TemplateID: "1104", ShopID: "1", BuyType: "0", IsBind: "0", AUnit: "7", APrice1: "-1", AValue1: "200", BUnit: "30", BPrice1: "-1", BValue1: "400", CUnit: "0", CPrice1: "-1", CValue1: "1000" },
  { TemplateID: "11444", ShopID: "1", BuyType: "1", IsBind: "0", AUnit: "1", APrice1: "-8", AValue1: "300", BUnit: "0", BPrice1: "-1", BValue1: "0", CUnit: "0", CPrice1: "-1", CValue1: "0" },
  { TemplateID: "5000", ShopID: "135", BuyType: "1", IsBind: "1", AUnit: "1", APrice1: "-4100", APrice1Name: "Moeda da Mansão", AValue1: "50" },
];

describe("aba Renovação", () => {
  it("7 dias, 30 dias e permanente, como no jogo", () => {
    expect(renewalOffers(shop, "1104")).toEqual([
      { currency: "Cupons / L. Cupons", bound: false, options: [{ label: "7 dias", price: 200 }, { label: "30 dias", price: 400 }, { label: "Permanente", price: 1000 }] },
    ]);
  });
  it("itens vendidos por quantidade (fragmentos) são permanentes, sem renovação", () => {
    expect(renewalOffers(shop, "11444")).toEqual([]);
    expect(isSoldByQuantity(shop, "11444")).toBe(true);
    expect(isSoldByQuantity(shop, "1104")).toBe(false);
    expect(renewalOffers(shop, "5000")).toEqual([]);
    expect(renewalOffers(shop, "999")).toEqual([]);
    expect(currencyLabel(undefined)).toBe("Moeda desconhecida");
  });
});

describe("aba Atributos", () => {
  it("armadura nas roupas e dano nas armas", () => {
    const hat = { id: "1104", name: "Inverno Siberiano", attributes: { type: "1", attack: "5", defence: "5", agility: "5", luck: "5", attribute7: "60" } };
    expect(itemStats(hat).map((s) => `${s.label}:${s.value}`)).toEqual(["Ataque:5", "Defesa:5", "Agilidade:5", "Sorte:5", "Armadura:60"]);
    const gun = { id: "7071", name: "Faca", attributes: { type: "7", attribute7: "300" } };
    expect(itemStats(gun).at(-1)).toEqual({ label: "Dano", value: "300" });
  });
});

describe("EXP de anéis e pulseiras", () => {
  it("nível e EXP necessário", () => {
    const ring = { id: "95684", name: "Anel Flamejante de 16º Aniversário +10", attributes: { type: "9", attribute1: "10", attribute2: "194150000" } };
    expect(accessoryExp(ring)).toEqual({ level: 10, exp: 194150000 });
    expect(accessoryExp({ id: "1104", name: "Chapéu", attributes: { type: "1", attribute2: "5" } })).toBeNull();
  });
});

describe("filtro de categorias", () => {
  it("agrupa em seções e manda as desconhecidas para Outros", () => {
    const s = sectionsFor(["Chapéu", "Arma", "Tipo 999", "Pacotes"]);
    expect(s.map((x) => x.label)).toEqual(["Equipamentos & Vestuário", "Armas & Combate", "Baús & Cartas", "Eventos & Outros"]);
    expect(s.at(-1)!.categories).toEqual(["Tipo 999"]);
  });
});
