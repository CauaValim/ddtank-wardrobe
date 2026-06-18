import * as XLSX from "@e965/xlsx";
import {
  resolveSegmentNamesForMissingIds,
  type SegmentNameCandidate,
} from "@/lib/idFillerSegmentMapping";
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
    return null;
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

function getMergedRangeEndRow(ws: XLSX.WorkSheet, r: number, c: number): number | null {
  const merges = ws["!merges"];
  if (!merges) return null;

  const mergedRange = merges.find((merge) => {
    const startRow = merge.s.r + 1;
    const endRow = merge.e.r + 1;
    const startCol = merge.s.c + 1;
    const endCol = merge.e.c + 1;
    return r >= startRow && r <= endRow && c >= startCol && c <= endCol;
  });

  return mergedRange ? mergedRange.e.r + 1 : null;
}

function collectSegmentNameCandidates(
  ws: XLSX.WorkSheet,
  nameCol: number,
  startRow: number,
  maxR: number,
  segmentCount: number,
  searchEndRow?: number
): SegmentNameCandidate[] {
  const candidates: SegmentNameCandidate[] = [];
  const searchLimit = Math.min(maxR, searchEndRow ?? startRow + Math.max(segmentCount * 4, 12));

  for (let row = startRow; row <= searchLimit; row++) {
    const name = getCellValue(ws, row, nameCol);
    if (!name) continue;

    candidates.push({ row, name });
    if (candidates.length >= segmentCount) break;
  }

  return candidates;
}

const NON_ITEM_TEXT_PATTERN = /^(?:item\s*name|id(?:\s*[/:&]|\s+and\s+amount)?|value|cannot be repeated|recharge(?:\s+of)?\b)/i;

function isLikelyItemName(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) return false;
  if (NON_ITEM_TEXT_PATTERN.test(trimmed)) return false;
  if (/^\*?\d+(?:\*\d+)?(?:\s*,\s*\*?\d+(?:\*\d+)?)*$/.test(trimmed)) return false;
  return /[A-Za-zÀ-ÿ]/.test(trimmed);
}

// Words that indicate a cell is a price/currency, not an item amount.
// Cells in these columns must NOT be prefixed with an item ID.
const PRICE_COLUMN_HEADER_PATTERN = /\b(value|price|cost|preço|preco|valor|custo)\b/i;
const CURRENCY_UNIT_PATTERN = /\b(coupons?|lcps|gold|diamond|diamante|cupons|cupom|ouro)\b/i;

function findColumnHeader(
  ws: XLSX.WorkSheet,
  row: number,
  col: number,
  minR: number
): string | null {
  // Walk upward from the row looking for a likely header (alphabetic text)
  for (let r = row - 1; r >= minR; r--) {
    const v = getCellValue(ws, r, col);
    if (!v) continue;
    const trimmed = v.trim();
    if (!/[A-Za-zÀ-ÿ]/.test(trimmed)) continue;
    return trimmed;
  }
  return null;
}

function collectLikelyNameCandidatesInColumn(
  ws: XLSX.WorkSheet,
  nameCol: number,
  startRow: number,
  endRow: number,
  segmentCount: number
): SegmentNameCandidate[] {
  const candidates: SegmentNameCandidate[] = [];

  for (let row = startRow; row <= endRow; row++) {
    const name = getCellValue(ws, row, nameCol);
    if (!name || !isLikelyItemName(name)) continue;

    candidates.push({ row, name });
    if (candidates.length >= segmentCount) break;
  }

  return candidates;
}

function collectLikelyNameCandidatesInRows(
  ws: XLSX.WorkSheet,
  startRow: number,
  endRow: number,
  startCol: number,
  endCol: number,
  segmentCount: number,
  requireBracketed = false
): SegmentNameCandidate[] {
  const candidates: SegmentNameCandidate[] = [];

  for (let row = startRow; row <= endRow; row++) {
    for (let col = startCol; col <= endCol; col++) {
      const name = getCellValue(ws, row, col);
      if (!name || !isLikelyItemName(name)) continue;
      if (requireBracketed && !/\[.*\]/.test(name)) continue;

      candidates.push({ row, name });
      if (candidates.length >= segmentCount) return candidates;
    }
  }

  return candidates;
}

function findStandaloneNameCandidates(
  ws: XLSX.WorkSheet,
  r: number,
  c: number,
  segmentCount: number,
  minR: number,
  maxR: number,
  minC: number,
  maxC: number
): SegmentNameCandidate[] {
  const blockEndRow =
    getMergedRangeEndRow(ws, r, c) ?? Math.min(maxR, r + Math.max(segmentCount * 4, 12));

  let bestCandidates: SegmentNameCandidate[] = [];
  let bestDistance = Number.POSITIVE_INFINITY;

  for (let nameCol = minC; nameCol < c; nameCol++) {
    const candidates = collectLikelyNameCandidatesInColumn(
      ws,
      nameCol,
      r,
      blockEndRow,
      segmentCount
    );
    const distance = c - nameCol;

    if (
      candidates.length > bestCandidates.length ||
      (candidates.length > 0 &&
        candidates.length === bestCandidates.length &&
        distance < bestDistance)
    ) {
      bestCandidates = candidates;
      bestDistance = distance;
    }
  }

  if (bestCandidates.length >= segmentCount) return bestCandidates;

  const currentBlockRowCandidates = collectLikelyNameCandidatesInRows(
    ws,
    r,
    blockEndRow,
    minC,
    c - 1,
    segmentCount,
    true
  );
  if (currentBlockRowCandidates.length >= segmentCount) return currentBlockRowCandidates;
  if (currentBlockRowCandidates.length > bestCandidates.length) {
    bestCandidates = currentBlockRowCandidates;
  }

  const immediateAboveStartRow = Math.max(minR, r - 2);
  const immediateAboveCandidates = collectLikelyNameCandidatesInRows(
    ws,
    immediateAboveStartRow,
    r - 1,
    minC,
    maxC,
    segmentCount,
    true
  );
  if (immediateAboveCandidates.length >= segmentCount) return immediateAboveCandidates;
  if (immediateAboveCandidates.length > bestCandidates.length) {
    bestCandidates = immediateAboveCandidates;
  }

  const looseAboveCandidates = collectLikelyNameCandidatesInRows(
    ws,
    immediateAboveStartRow,
    r - 1,
    minC,
    maxC,
    segmentCount
  );
  if (looseAboveCandidates.length >= segmentCount) return looseAboveCandidates;
  if (looseAboveCandidates.length > bestCandidates.length) {
    bestCandidates = looseAboveCandidates;
  }

  const fallbackStartRow = Math.max(minR, r - Math.max(segmentCount * 2, 4));

  for (let nameCol = minC; nameCol < c; nameCol++) {
    const candidates = collectLikelyNameCandidatesInColumn(
      ws,
      nameCol,
      fallbackStartRow,
      r - 1,
      segmentCount
    );
    const distance = c - nameCol;

    if (
      candidates.length > bestCandidates.length ||
      (candidates.length > 0 &&
        candidates.length === bestCandidates.length &&
        distance < bestDistance)
    ) {
      bestCandidates = candidates;
      bestDistance = distance;
    }
  }

  return bestCandidates;
}

function fillBareIdColumns(
  ws: XLSX.WorkSheet,
  sheetName: string,
  nameIndex: Map<string, number[]>,
  errors: IdFillerError[],
  changes: WorksheetCellChanges,
  alreadyFilled: Set<string>
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
        const ref = cellRef(dr, c);
        const existingId = getCellValue(ws, dr, c);
        if (existingId != null) continue;
        const name = getCellValue(ws, dr, nameCol);
        if (!name) continue;
        alreadyFilled.add(ref);
        const id = lookupId(name, nameIndex, errors, sheetName, ref);
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
  changes: WorksheetCellChanges,
  alreadyFilled: Set<string>
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
        // Check if cell contains any *amount pattern (with or without existing IDs)
        if (!/\*\d/.test(cellVal.trim())) continue;
        const ref = cellRef(dr, c);
        const segments = cellVal.split(",").map((s: string) => s.trim());
        // A segment "needs an ID" if it starts with "*" (e.g. "*5") OR if it's a
        // bare number alongside other "*N" segments — the cell rich-text often
        // hides the first "*" inside a separator run, so "10,*1,*5" is really
        // three amounts (*10, *1, *5) all needing IDs.
        const hasStar = segments.some((s: string) => s.startsWith("*"));
        if (!hasStar) continue;
        const bareNumberNeedsId = (s: string) => /^\d+$/.test(s);
        const names = collectSegmentNameCandidates(
          ws,
          nameCol,
          dr,
          maxR,
          segments.length,
          getMergedRangeEndRow(ws, dr, c) ?? undefined
        );
        const resolvedNames = resolveSegmentNamesForMissingIds(segments, names, dr);
        const idAmounts: string[] = [];
        for (let i = 0; i < segments.length; i++) {
          const seg = segments[i];
          if (seg.startsWith("*")) {
            const name = resolvedNames[i];
            if (name) {
              const id = lookupId(name, nameIndex, errors, sheetName, cellRef(dr, c));
              if (id != null) idAmounts.push(seg.replace("*", `${id}*`));
              else idAmounts.push(seg);
            } else {
              idAmounts.push(seg);
            }
          } else if (bareNumberNeedsId(seg)) {
            const name = resolvedNames[i];
            if (name) {
              const id = lookupId(name, nameIndex, errors, sheetName, cellRef(dr, c));
              if (id != null) idAmounts.push(`${id}*${seg}`);
              else idAmounts.push(seg);
            } else {
              idAmounts.push(seg);
            }
          } else {
            idAmounts.push(seg);
          }
        }
        const newVal = idAmounts.join(",");
        if (newVal !== cellVal) {
          setCellValue(ws, dr, c, newVal, sheetName, changes);
          alreadyFilled.add(ref);
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
  changes: WorksheetCellChanges,
  alreadyFilled: Set<string>
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
          alreadyFilled.add(cellRef(dr, c));
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
            alreadyFilled.add(cellRef(dr, c));
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
      const names = findStandaloneNameCandidates(ws, r, c, parts.length, minR, maxR, minC, maxC);
      if (names.length === 0) continue;
      if (names.length !== parts.length) {
        errors.push({
          sheet: sheetName,
          cell: ref,
          itemName: `${parts.length} qtd vs ${names.length} nomes`,
          reason: "Quantidade não corresponde",
        });
      }
      const resolvedNames = resolveSegmentNamesForMissingIds(parts, names, r);
      const idAmounts: string[] = [];
      for (let i = 0; i < parts.length; i++) {
        const name = resolvedNames[i];
        if (!name) {
          idAmounts.push(parts[i]);
          continue;
        }

        const id = lookupId(name, nameIndex, errors, sheetName, ref);
        if (id != null) idAmounts.push(parts[i].replace("*", `${id}*`));
        else idAmounts.push(parts[i]);
      }
      const newVal = idAmounts.join(",");
      if (newVal !== trimmed) {
        setCellValue(ws, r, c, newVal, sheetName, changes);
        alreadyFilled.add(ref);
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
    const f1 = fillBareIdColumns(ws, sheetName, nameIndex, errors, changes, alreadyFilled);
    const f2 = fillIdAmountColumns(ws, sheetName, nameIndex, errors, changes, alreadyFilled);
    const f3 = fillExchangeColumns(ws, sheetName, nameIndex, errors, changes, alreadyFilled);
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
