import * as XLSX from "@e965/xlsx";
import { describe, expect, it } from "vitest";

import { fillIds } from "@/lib/idFiller";

function getCellText(cell: XLSX.CellObject | undefined): string {
  if (!cell) return "";
  return String(cell.w ?? cell.v ?? "");
}

describe("fillIds", () => {
  it("salva IDs faltantes em células mescladas com conteúdo parcial", async () => {
    const wb = XLSX.utils.book_new();
    const ws: XLSX.WorkSheet = {} as XLSX.WorkSheet;

    ws["A13"] = { t: "s", v: "ITEM NAME" };
    ws["C13"] = { t: "s", v: "ID / AMOUNT" };
    ws["A15"] = { t: "s", v: "Moeda [Permanent] [Bound]" };
    ws["A18"] = { t: "s", v: "Envelope vermelho de ano novo [Permanent] [Bound]" };
    ws["A21"] = { t: "s", v: "pílulas de refino [Permanent] [Bound]" };
    ws["A24"] = { t: "s", v: "Pedra [Permanent] [Bound]" };
    ws["C14"] = { t: "s", v: "201304*1,1121411*5,*30,*30" };
    ws["!merges"] = [XLSX.utils.decode_range("C14:C25")];
    ws["!ref"] = "A13:C25";

    XLSX.utils.book_append_sheet(wb, ws, "Missões");

    const originalBuffer = XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
    const nameIndex = new Map<string, number[]>([
      ["moeda", [201304]],
      ["envelope vermelho de ano novo", [1121411]],
      ["pílulas de refino", [555]],
      ["pedra", [777]],
    ]);

    const result = await fillIds(originalBuffer, nameIndex);
    const output = XLSX.read(new Uint8Array(result.outputBuffer), { type: "array" });

    expect(result.errors).toEqual([]);
    expect(result.filled).toBe(1);
    expect(getCellText(output.Sheets["Missões"]["C14"])).toBe(
      "201304*1,1121411*5,555*30,777*30"
    );
  });

  it("não reutiliza nomes do bloco anterior em células de quantia isolada", async () => {
    const wb = XLSX.utils.book_new();
    const ws: XLSX.WorkSheet = {} as XLSX.WorkSheet;

    ws["A2"] = { t: "s", v: "Bracelete Furioso Dragonfire +7 [30 Days - renewable] [Bound]" };
    ws["A3"] = { t: "s", v: "Esfera Mágica-Super Dano Lv21 [Permanent] [Bound]" };
    ws["A4"] = { t: "s", v: "Pedra de Fusão Transcendental [Permanent] [Bound]" };
    ws["C2"] = { t: "s", v: "*1,*1,*1" };

    ws["A5"] = { t: "s", v: "Pulseira do 12° Aniversário +5 [30 Days - renewable] [Bound]" };
    ws["A6"] = { t: "s", v: "Deus - Faca do Balkufu [30 Days - renewable] [Unbound]" };
    ws["A7"] = {
      t: "s",
      v: "Pedra Mág.Imagem 4 [lenda] [Atk, Agi, Atq Mgc, Def Mgc] [Permanent] [Bound]",
    };
    ws["C5"] = { t: "s", v: "*1,*1,*1" };

    ws["!merges"] = [XLSX.utils.decode_range("C2:C4"), XLSX.utils.decode_range("C5:C7")];
    ws["!ref"] = "A2:C7";

    XLSX.utils.book_append_sheet(wb, ws, "Recarga");

    const originalBuffer = XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
    const nameIndex = new Map<string, number[]>([
      ["bracelete furioso dragonfire +7", [85151]],
      ["esfera mágica-super dano lv21", [313622]],
      ["pedra de fusão transcendental", [12269]],
      ["pulseira do 12° aniversário +5", [94101]],
      ["deus - faca do balkufu", [94102]],
      ["pedra mág.imagem 4", [94103]],
    ]);

    const result = await fillIds(originalBuffer, nameIndex);
    const output = XLSX.read(new Uint8Array(result.outputBuffer), { type: "array" });

    expect(result.errors).toEqual([]);
    expect(result.filled).toBe(2);
    expect(getCellText(output.Sheets["Recarga"]["C2"])).toBe("85151*1,313622*1,12269*1");
    expect(getCellText(output.Sheets["Recarga"]["C5"])).toBe("94101*1,94102*1,94103*1");
  });

  it("preenche quantias isoladas quando os nomes estão distribuídos horizontalmente acima", async () => {
    const wb = XLSX.utils.book_new();
    const ws: XLSX.WorkSheet = {} as XLSX.WorkSheet;

    ws["A1"] = { t: "s", v: "Queue 3" };
    ws["B1"] = { t: "s", v: "Fragmentos brocas [Permanent] [Bound]" };
    ws["C1"] = { t: "s", v: "Figurinos ilustrados com cupons [Permanent] [Bound]" };
    ws["D1"] = { t: "s", v: "Amor permanente [Permanent] [Bound]" };
    ws["B2"] = { t: "s", v: "*30,*100,*2" };

    ws["A3"] = { t: "s", v: "Queue 14" };
    ws["B3"] = { t: "s", v: "Pontos de atualização do Totem [Permanent] [Bound]" };
    ws["C3"] = { t: "s", v: "Comprar caixa de soldados 5 deuse [Permanent] [Bound]" };
    ws["D3"] = { t: "s", v: "Pérola Mágica-DanoLv19 [Permanent] [Bound]" };
    ws["B4"] = { t: "s", v: "*6000,*3,*1" };

    ws["!merges"] = [XLSX.utils.decode_range("B2:D2"), XLSX.utils.decode_range("B4:D4")];
    ws["!ref"] = "A1:D4";

    XLSX.utils.book_append_sheet(wb, ws, "Entrada Diária");

    const originalBuffer = XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
    const nameIndex = new Map<string, number[]>([
      ["fragmentos brocas", [7001]],
      ["figurinos ilustrados com cupons", [7002]],
      ["amor permanente", [7003]],
      ["pontos de atualização do totem", [8001]],
      ["comprar caixa de soldados 5 deuse", [8002]],
      ["pérola mágica-danolv19", [313511]],
    ]);

    const result = await fillIds(originalBuffer, nameIndex);
    const output = XLSX.read(new Uint8Array(result.outputBuffer), { type: "array" });

    expect(result.errors).toEqual([]);
    expect(result.filled).toBe(2);
    expect(getCellText(output.Sheets["Entrada Diária"]["B2"])).toBe("7001*30,7002*100,7003*2");
    expect(getCellText(output.Sheets["Entrada Diária"]["B4"])).toBe(
      "8001*6000,8002*3,313511*1"
    );
  });
});