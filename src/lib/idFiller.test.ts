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
});