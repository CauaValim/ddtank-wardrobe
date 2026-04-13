import * as XLSX from "@e965/xlsx";
import { applyWorkbookChanges, type WorksheetCellChanges } from "@/lib/xlsxPreservation";

export interface IdFillerError {
  sheet: string;
  cell: string;
  itemName: string;
  reason: string;
}

export interface IdFillerResult {
  outputBuffer: ArrayBuffer;
  errors: IdFillerError[];
  filled: number;
}

function cleanItemName(raw: string): string {
  let name = raw.replace(/\n/g, " ");
  name = name.replace(/\s*\[.*?\]/g, "");
  return name.trim();
}

export function buildNameIndex(
  items: { id: number; name: string | null }[]
): Map<string, number[]> {
  const index = new Map<string, number[]>();
  for (const item of items) {
    if (!item.name) continue;
    const key = item.name.trim().toLowerCase();
    const existing = index.get(key);
    if (existing) existing.push(item.id);
    else index.set(key, [item.id]);
  }
  return index;
}

function recordCellChange(
  changes: WorksheetCellChanges,
  sheetName: string,
  cell: string,
  value: string | number
) {
  const sheetChanges = changes.get(sheetName) ?? new Map<string, string | number>();
  sheetChanges.set(cell, value);
  changes.set(sheetName, sheetChanges);
}

function lookupId(
  name: string,
  nameIndex: Map<string, number[]>,
  errors: IdFillerError[],
  sheet: string,
  cell: string
): number | null {
  const cleaned = cleanItemName(name);
  const key = cleaned.toLowerCase();
  const ids = nameIndex.get(key);
  if (!ids || ids.length === 0) {
    errors.push({ sheet, cell, itemName: cleaned, reason: "Não encontrado no banco" });
    return null;
  }
  if (ids.length > 1) {
    errors.push({
      sheet,
      cell,
      itemName: cleaned,
      reason: `Múltiplos IDs encontrados: ${ids.join(", ")}`,
    });
  }
  return ids[0];
}

function cellRef(r: number, c: number): string {
  return XLSX.utils.encode_cell({ r: r - 1, c: c - 1 });
}

function getCellValue(ws: XLSX.WorkSheet, r: number, c: number): string | null {
  const ref = cellRef(r, c);
  const cell = ws[ref];
  if (!cell) return null;
  const v = cell.v;
  if (v == null || v === "") return null;
  return String(v);
}

function setCellValue(
  ws: XLSX.WorkSheet,
  r: number,
  c: number,
  value: string | number,
  sheetName: string,
  changes: WorksheetCellChanges
) {
  const ref = cellRef(r, c);
  if (!ws[ref]) {
    ws[ref] = { t: typeof value === "number" ? "n" : "s", v: value };
  } else {
    ws[ref].v = value;
    ws[ref].t = typeof value === "number" ? "n" : "s";
  }
  recordCellChange(changes, sheetName, ref, value);
}

function getRange(ws: XLSX.WorkSheet): { minR: number; maxR: number; minC: number; maxC: number } {
  const range = XLSX.utils.decode_range(ws["!ref"] || "A1");
  return { minR: range.s.r + 1, maxR: range.e.r + 1, minC: range.s.c + 1, maxC: range.e.c + 1 };
}

function fillBareIdColumns(
  ws: XLSX.WorkSheet,
  sheetName: string,
  nameIndex: Map<string, number[]>,
  errors: IdFillerError[],
  changes: WorksheetCellChanges
): number {
  let filled = 0;
  const { minR, maxR, minC, maxC } = getRange(ws);
  for (let r = minR; r <= maxR; r++) {
    for (let c = minC; c <= maxC; c++) {
      const val = getCellValue(ws, r, c);
      if (!val || val.trim().toUpperCase() !== "ID") continue;
      let nameCol: number | null = null;
      for (let nc = minC; nc <= maxC; nc++) {
        const hv = getCellValue(ws, r, nc);
        if (hv && /item\s*name/i.test(hv.trim())) {
          nameCol = nc;
          break;
        }
      }
      if (nameCol == null) continue;
      for (let dr = r + 1; dr <= maxR; dr++) {
        const existingId = getCellValue(ws, dr, c);
        if (existingId != null) continue;
        const name = getCellValue(ws, dr, nameCol);
        if (!name) continue;
        const id = lookupId(name, nameIndex, errors, sheetName, cellRef(dr, c));
        if (id != null) {
          setCellValue(ws, dr, c, id, sheetName, changes);
          filled++;
        }
      }
    }
  }
  return filled;
}

function fillIdAmountColumns(
  ws: XLSX.WorkSheet,
  sheetName: string,
  nameIndex: Map<string, number[]>,
  errors: IdFillerError[],
  changes: WorksheetCellChanges
): number {
  let filled = 0;
  const { minR, maxR, minC, maxC } = getRange(ws);
  for (let r = minR; r <= maxR; r++) {
    for (let c = minC; c <= maxC; c++) {
      const val = getCellValue(ws, r, c);
      if (!val) continue;
      if (!/id\s*[\/&]\s*amount/i.test(val.trim()) && !/id\s+and\s+amount/i.test(val.trim())) continue;
      let nameCol: number | null = null;
      for (let nc = minC; nc <= maxC; nc++) {
        if (nc === c) continue;
        const hv = getCellValue(ws, r, nc);
        if (!hv) continue;
        const ht = hv.trim().toLowerCase();
        if (ht.includes("item") || ht.includes("items")) {
          nameCol = nc;
          break;
        }
      }
      if (nameCol == null) nameCol = c - 1;
      for (let dr = r + 1; dr <= maxR; dr++) {
        const cellVal = getCellValue(ws, dr, c);
        if (!cellVal) continue;
        if (/id\s*[\/&]\s*amount/i.test(cellVal.trim())) break;
        if (!cellVal.trim().startsWith("*")) continue;
        const amounts = cellVal.split(",").map((s: string) => s.trim());
        const names: { name: string; row: number }[] = [];
        for (let nr = dr; nr < dr + amounts.length && nr <= maxR; nr++) {
          const n = getCellValue(ws, nr, nameCol);
          if (n) names.push({ name: n, row: nr });
        }
        if (names.length !== amounts.length) {
          errors.push({
            sheet: sheetName,
            cell: cellRef(dr, c),
            itemName: `${amounts.length} quantidades vs ${names.length} nomes`,
            reason: "Quantidade não corresponde",
          });
        }
        const idAmounts: string[] = [];
        const count = Math.min(amounts.length, names.length);
        for (let i = 0; i < count; i++) {
          const id = lookupId(names[i].name, nameIndex, errors, sheetName, cellRef(dr, c));
          if (id != null) idAmounts.push(amounts[i].replace("*", `${id}*`));
          else idAmounts.push(amounts[i]);
        }
        for (let i = count; i < amounts.length; i++) idAmounts.push(amounts[i]);
        const newVal = idAmounts.join(",");
        if (newVal !== cellVal) {
          setCellValue(ws, dr, c, newVal, sheetName, changes);
          filled++;
        }
      }
    }
  }
  return filled;
}

function fillExchangeColumns(
  ws: XLSX.WorkSheet,
  sheetName: string,
  nameIndex: Map<string, number[]>,
  errors: IdFillerError[],
  changes: WorksheetCellChanges
): number {
  let filled = 0;
  const { minR, maxR, minC, maxC } = getRange(ws);
  let exchangeId: number | null = null;
  for (let r = minR; r <= maxR; r++) {
    for (let c = minC; c <= maxC; c++) {
      const val = getCellValue(ws, r, c);
      if (!val) continue;
      const match = val.match(/^ID:\s*(\d+)$/i);
      if (match) {
        exchangeId = parseInt(match[1]);
        break;
      }
    }
    if (exchangeId) break;
  }
  if (!exchangeId) return 0;
  for (let r = minR; r <= maxR; r++) {
    for (let c = minC; c <= maxC; c++) {
      const val = getCellValue(ws, r, c);
      if (!val || val.trim().toLowerCase() !== "value") continue;
      for (let dr = r + 1; dr <= maxR; dr++) {
        const cellVal = getCellValue(ws, dr, c);
        if (!cellVal) continue;
        if (cellVal.trim().toLowerCase() === "value") break;
        if (/^\*\d+$/.test(cellVal.trim())) {
          setCellValue(ws, dr, c, `${exchangeId}${cellVal.trim()}`, sheetName, changes);
          filled++;
        }
      }
    }
  }
  for (let r = minR; r <= maxR; r++) {
    for (let c = minC; c <= maxC; c++) {
      const val = getCellValue(ws, r, c);
      if (!val || !/id\s*[\/&]\s*amount/i.test(val.trim())) continue;
      let nameCol: number | null = null;
      for (let nc = minC; nc <= maxC; nc++) {
        if (nc === c) continue;
        const hv = getCellValue(ws, r, nc);
        if (hv && /item\s*name/i.test(hv.trim())) {
          nameCol = nc;
          break;
        }
      }
      if (nameCol == null) continue;
      for (let dr = r + 1; dr <= maxR; dr++) {
        const cellVal = getCellValue(ws, dr, c);
        if (!cellVal) continue;
        if (/id\s*[\/&]\s*amount/i.test(cellVal.trim())) break;
        if (/^\*\d+$/.test(cellVal.trim())) {
          const name = getCellValue(ws, dr, nameCol);
          if (!name) continue;
          const id = lookupId(name, nameIndex, errors, sheetName, cellRef(dr, c));
          if (id != null) {
            setCellValue(ws, dr, c, `${id}${cellVal.trim()}`, sheetName, changes);
            filled++;
          }
        }
      }
    }
  }
  return filled;
}

function fillStandaloneAmounts(
  ws: XLSX.WorkSheet,
  sheetName: string,
  nameIndex: Map<string, number[]>,
  errors: IdFillerError[],
  alreadyFilled: Set<string>,
  changes: WorksheetCellChanges
): number {
  let filled = 0;
  const { minR, maxR, minC, maxC } = getRange(ws);
  for (let r = minR; r <= maxR; r++) {
    for (let c = minC; c <= maxC; c++) {
      const ref = cellRef(r, c);
      if (alreadyFilled.has(ref)) continue;
      const val = getCellValue(ws, r, c);
      if (!val) continue;
      const trimmed = val.trim();
      if (!/^\*\d+/.test(trimmed)) continue;
      if (/\d\*\d/.test(trimmed)) continue;
      const parts = trimmed.split(",").map((s: string) => s.trim());
      const names: string[] = [];
      for (let searchR = Math.max(minR, r - 3); searchR < r; searchR++) {
        for (let nc = c - 1; nc <= c + 10 && nc <= maxC; nc++) {
          const n = getCellValue(ws, searchR, nc);
          if (n && /\[.*\]/.test(n)) names.push(n);
        }
        if (names.length >= parts.length) break;
      }
      if (names.length === 0) continue;
      if (names.length !== parts.length) {
        errors.push({
          sheet: sheetName,
          cell: ref,
          itemName: `${parts.length} qtd vs ${names.length} nomes`,
          reason: "Quantidade não corresponde",
        });
      }
      const idAmounts: string[] = [];
      const count = Math.min(parts.length, names.length);
      for (let i = 0; i < count; i++) {
        const id = lookupId(names[i], nameIndex, errors, sheetName, ref);
        if (id != null) idAmounts.push(parts[i].replace("*", `${id}*`));
        else idAmounts.push(parts[i]);
      }
      for (let i = count; i < parts.length; i++) idAmounts.push(parts[i]);
      const newVal = idAmounts.join(",");
      if (newVal !== trimmed) {
        setCellValue(ws, r, c, newVal, sheetName, changes);
        filled++;
      }
    }
  }
  return filled;
}

export async function fillIds(
  originalBuffer: ArrayBuffer,
  nameIndex: Map<string, number[]>
): Promise<IdFillerResult> {
  const wb = XLSX.read(new Uint8Array(originalBuffer), {
    type: "array",
    cellStyles: true,
    cellNF: true,
    cellDates: true,
  });

  const errors: IdFillerError[] = [];
  const changes: WorksheetCellChanges = new Map();
  let totalFilled = 0;

  for (const sheetName of wb.SheetNames) {
    const ws = wb.Sheets[sheetName];
    if (!ws || !ws["!ref"]) continue;

    const alreadyFilled = new Set<string>();
    const f1 = fillBareIdColumns(ws, sheetName, nameIndex, errors, changes);
    const f2 = fillIdAmountColumns(ws, sheetName, nameIndex, errors, changes);
    const f3 = fillExchangeColumns(ws, sheetName, nameIndex, errors, changes);
    const f4 = fillStandaloneAmounts(ws, sheetName, nameIndex, errors, alreadyFilled, changes);
    totalFilled += f1 + f2 + f3 + f4;
  }

  const outputBuffer = await applyWorkbookChanges(originalBuffer, changes);
  return { outputBuffer, errors, filled: totalFilled };
}

export function createErrorReport(errors: IdFillerError[]): ArrayBuffer {
  const wb = XLSX.utils.book_new();
  const data = [
    ["Sheet", "Célula", "Nome do Item", "Motivo"],
    ...errors.map((e) => [e.sheet, e.cell, e.itemName, e.reason]),
  ];
  const ws = XLSX.utils.aoa_to_sheet(data);
  ws["!cols"] = [{ wch: 30 }, { wch: 10 }, { wch: 40 }, { wch: 50 }];
  XLSX.utils.book_append_sheet(wb, ws, "Erros");
  const out = XLSX.write(wb, { type: "array", bookType: "xlsx" });
  return out as ArrayBuffer;
}
