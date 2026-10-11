import { describe, expect, it } from "vitest";
import { isOpenablePackage, parsePackageDescription } from "./packageDescParser";

// Descrições reais do jogo (TemplateAllList.xml).
describe("conteúdo do pacote pela descrição", () => {
  it("ignora a frase de introdução antes dos dois-pontos", () => {
    const desc = "Recompensas da atividade “Alfaiataria Mágica”. Ao abrir, você receberá: Cartão de Título de Gerente Interno *1 (todos os atributos +60, validade de 60 dias), Pulseira do 10º Aniversário +5 *1, Pulseira de EXP + 3 *5";
    expect(parsePackageDescription(desc)).toEqual([
      { name: "Cartão de Título de Gerente Interno", quantity: 1 },
      { name: "Pulseira do 10º Aniversário +5", quantity: 1 },
      { name: "Pulseira de EXP + 3", quantity: 5 },
    ]);
  });

  it("separa a parte fixa e a aleatória", () => {
    const desc = "Abra para obter: Pedra extraterrestre *150, Areia de poeira estelar *600 e tambem obterá aleatoriamente: Pergaminho nobre • Armas *1, Pergaminho nobre • Secundário *1";
    expect(parsePackageDescription(desc)).toEqual([
      { name: "Pedra extraterrestre", quantity: 150 },
      { name: "Areia de poeira estelar", quantity: 600 },
      { name: "Pergaminho nobre • Armas", quantity: 1 },
      { name: "Pergaminho nobre • Secundário", quantity: 1 },
    ]);
  });

  it("não inventa itens em descrições sem lista", () => {
    expect(parsePackageDescription("Abra para obter uma arma do livro de mão. Tem a chance de ganhar uma arma especial.")).toEqual([]);
  });

  it("continua lendo o formato antigo", () => {
    expect(parsePackageDescription("Inclui: Pedra da Vida x10, Cristal *5")).toEqual([
      { name: "Pedra da Vida", quantity: 10 },
      { name: "Cristal", quantity: 5 },
    ]);
  });
});

describe("o que não é item", () => {
  it("bônus de título e prazos não viram itens", () => {
    expect(parsePackageDescription("Após usar você ganhará o título 'Monge'. Ao usar o título você ganhará: Ataque+5, Agilidade+10.")).toEqual([]);
    expect(parsePackageDescription("Use para obter o título. Disponível: permanente")).toEqual([]);
    expect(parsePackageDescription("Uma das partes de \"Reino Élfico\", fonte: evento")).toEqual([]);
  });
  it("só baús (attribute1 = 6) usam a descrição", () => {
    expect(isOpenablePackage({ attribute1: "6" })).toBe(true);
    expect(isOpenablePackage({ attribute1: "0" })).toBe(false);
  });
});
