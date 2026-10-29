import { describe, expect, it } from "vitest";
import { byPeriod, filterSales, guideRows, leastSold, parseSales, sheetNumber, topSold, totals, validityLabel, weekItemRows } from "./sales";

const CSV = [
  "Data,Semana x Mês,Semana,Mês,Servidor,Item,Validade,Limitação,Pack por Compra,Quantidade Disponível,Quantidade Vendida,Valor / Venda,Venda por CPs e LCPs,Total em Cupons,Total em R$,Total em RMB,Total em TRY",
  '12/27/2025,January - Week 1,Week 1,January,"S(1-3,9-10,12-19,UOL):Ilha dos valentões",Árvore dos presentes,[30 Days - renewable],[Bound],1,20,19,25.000,Sim,  475.000 ," R$  237,50 "," ¥ 308,75 "," ₺ 2.225,38 "',
  '12/27/2025,January - Week 1,Week 1,January,"S(4-8,11,20-46):Vale dos Ouriços",Pacote despertar do pet,[Permanent],[Bound],1,99,0,1.000,Não, -,#VALUE!,#VALUE!,#VALUE!',
  "10/3/2026,october - Week 4,Week 4,october,S402: Segredos de Arcanis,Árvore dos presentes,[30 Days - renewable],[Bound],1,20,2,30.000,Não,  60.000 ,\" R$  30,00 \",x,y",
  ",,,,,,,,,,,,,,,,",
].join("\r\n");

describe("financeiro: planilha da Venda de Munição", () => {
  it("lê os números e as validades no formato da planilha", () => {
    expect(sheetNumber("  475.000 ")).toBe(475000);
    expect(sheetNumber(" R$  2.237,50 ")).toBe(2237.5);
    expect(sheetNumber(" -")).toBe(0);
    expect(sheetNumber("#VALUE!")).toBe(0);
    expect(validityLabel("[30 Days - renewable]")).toBe("30 dias (renovável)");
    expect(validityLabel("[120 Days - non renewable]")).toBe("120 dias (não renovável)");
    expect(validityLabel("[Permanente]")).toBe("Permanente");
  });

  it("lê as vendas e soma Cupons e L.Cupons como o relatório", () => {
    const sales = parseSales(CSV);
    expect(sales).toHaveLength(3);
    expect(sales[0]).toMatchObject({ date: "2025-12-27", period: "Janeiro - Semana 1", server: "S(1-3,9-10,12-19,UOL):Ilha dos valentões", sold: 19, price: 25000, cupons: true, totalCupons: 475000, totalBrl: 237.5 });
    expect(sales[2].period).toBe("Outubro - Semana 4");
    expect(totals(sales)).toEqual({ cupons: 475000, lcupons: 60000, all: 535000, brl: 267.5, sold: 21 });
    expect(byPeriod(sales).map((p) => p.period)).toEqual(["Janeiro - Semana 1", "Outubro - Semana 4"]);
  });

  it("monta o guia de preços e os mais e menos vendidos", () => {
    const sales = parseSales(CSV);
    const arvore = filterSales(sales, { item: "Árvore dos presentes" });
    expect(guideRows(arvore).map((g) => [g.server, g.minPrice, g.maxPrice])).toEqual([
      ["S(1-3,9-10,12-19,UOL):Ilha dos valentões", 25000, 25000],
      ["S402: Segredos de Arcanis", 30000, 30000],
    ]);
    const weeks = weekItemRows(sales);
    expect(topSold(weeks, 1)[0]).toMatchObject({ item: "Árvore dos presentes", sold: 19 });
    expect(leastSold(weeks, 1)[0]).toMatchObject({ item: "Pacote despertar do pet", sold: 0 });
    expect(filterSales(sales, { currency: "lcupons" })).toHaveLength(2);
  });
});
