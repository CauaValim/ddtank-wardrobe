import * as XLSX from "@e965/xlsx";

export interface IdFillerError {
  sheet: string;
  cell: string;
  itemName: string;
  reason: string;
}

export interface IdFillerResult {
  workbook: XLSX.WorkBook;
  errors: IdFillerError[];
  filled: number;
}

/** Strip suffixes like [Permanent] [Bound] [30 Days - renewable] etc. and trim */
function cleanItemName(raw: string): string {
  // Remove newlines first
  let name = raw.replace(/\n/g, " ");
  // Remove all [...] suffixes
  name = name.replace(/\s*\[.*?\]/g, "");
  return name.trim();
}

/** Build a lookup map: lowercased name → item IDs */
export function buildNameIndex(
  items: { id: number; name: string | null }[]
): Map<string, number[]> {
  const index = new Map<string, number[]>();
  for (const item of items) {
    if (!item.name) continue;
    const key = item.name.trim().toLowerCase();
    const existing = index.get(key);
    if (existing) {
      existing.push(item.id);
    } else {
      index.set(key, [item.id]);
    }
  }
  return index;
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
    // Use first match anyway
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

function setCellValue(ws: XLSX.WorkSheet, r: number, c: number, value: string | number) {
  const ref = cellRef(r, c);
  if (!ws[ref]) {
    ws[ref] = { t: typeof value === "number" ? "n" : "s", v: value };
  } else {
    ws[ref].v = value;
    ws[ref].t = typeof value === "number" ? "n" : "s";
  }
}

function getRange(ws: XLSX.WorkSheet): { minR: number; maxR: number; minC: number; maxC: number } {
  const range = XLSX.utils.decode_range(ws["!ref"] || "A1");
  return {
    minR: range.s.r + 1,
    maxR: range.e.r + 1,
    minC: range.s.c + 1,
    maxC: range.e.c + 1,
  };
}

/**
 * Pattern 1: "ID" column header - bare ID fill
 * Looks for header row with "ID" column, then fills empty ID cells from item name column
 */
function fillBareIdColumns(
  ws: XLSX.WorkSheet,
  sheetName: string,
  nameIndex: Map<string, number[]>,
  errors: IdFillerError[]
): number {
  let filled = 0;
  const { minR, maxR, minC, maxC } = getRange(ws);

  for (let r = minR; r <= maxR; r++) {
    for (let c = minC; c <= maxC; c++) {
      const val = getCellValue(ws, r, c);
      if (!val) continue;
      const trimmed = val.trim().toUpperCase();
      if (trimmed !== "ID") continue;

      // Found an "ID" header at (r, c). Look for "Item Name" in same row
      let nameCol: number | null = null;
      for (let nc = minC; nc <= maxC; nc++) {
        const hv = getCellValue(ws, r, nc);
        if (hv && /item\s*name/i.test(hv.trim())) {
          nameCol = nc;
          break;
        }
      }
      if (nameCol == null) continue;

      // Fill rows below this header
      for (let dr = r + 1; dr <= maxR; dr++) {
        const existingId = getCellValue(ws, dr, c);
        if (existingId != null) continue; // already has ID

        const name = getCellValue(ws, dr, nameCol);
        if (!name) continue;

        // Check if next header row
        const checkHeader = getCellValue(ws, dr, c);
        if (checkHeader && checkHeader.trim().toUpperCase() === "ID") break;

        const id = lookupId(name, nameIndex, errors, sheetName, cellRef(dr, c));
        if (id != null) {
          setCellValue(ws, dr, c, id);
          filled++;
        }
      }
    }
  }
  return filled;
}

/**
 * Pattern 2: "ID / AMOUNT" or "ID/ Amount" or "ID and Amount" columns
 * Cells contain "*amt,*amt,*amt" → "ID*amt,ID*amt,ID*amt"
 * Item names are in a nearby column, spanning multiple rows (one name per amount)
 */
function fillIdAmountColumns(
  ws: XLSX.WorkSheet,
  sheetName: string,
  nameIndex: Map<string, number[]>,
  errors: IdFillerError[]
): number {
  let filled = 0;
  const { minR, maxR, minC, maxC } = getRange(ws);

  // Find header cells matching "ID" patterns in combination with "Amount"
  for (let r = minR; r <= maxR; r++) {
    for (let c = minC; c <= maxC; c++) {
      const val = getCellValue(ws, r, c);
      if (!val) continue;
      const trimmed = val.trim();
      if (!/id\s*[\/&]\s*amount/i.test(trimmed) && !/id\s+and\s+amount/i.test(trimmed)) continue;

      // Found ID/Amount header at (r, c). Find name column
      let nameCol: number | null = null;
      for (let nc = minC; nc <= maxC; nc++) {
        if (nc === c) continue;
        const hv = getCellValue(ws, r, nc);
        if (!hv) continue;
        const ht = hv.trim().toLowerCase();
        if (
          ht.includes("item name") ||
          ht.includes("items / validity") ||
          ht.includes("item") ||
          ht.includes("items")
        ) {
          nameCol = nc;
          break;
        }
      }
      if (nameCol == null) {
        // Try the column to the left of ID/Amount
        nameCol = c - 1;
      }

      // Process rows below
      for (let dr = r + 1; dr <= maxR; dr++) {
        const cellVal = getCellValue(ws, dr, c);
        if (!cellVal) continue;

        // Check if it's a new header row
        if (/id\s*[\/&]\s*amount/i.test(cellVal.trim()) || /id\s+and\s+amount/i.test(cellVal.trim())) break;

        // Only process cells that start with * (unfilled)
        if (!cellVal.trim().startsWith("*")) continue;

        // Split by comma to get amounts
        const amounts = cellVal.split(",").map((s: string) => s.trim());

        // Collect item names from nameCol starting at this row and going down
        const names: { name: string; row: number }[] = [];
        for (let nr = dr; nr < dr + amounts.length && nr <= maxR; nr++) {
          const n = getCellValue(ws, nr, nameCol);
          if (n) names.push({ name: n, row: nr });
        }

        if (names.length !== amounts.length) {
          // Try to match what we can
          errors.push({
            sheet: sheetName,
            cell: cellRef(dr, c),
            itemName: `${amounts.length} quantidades vs ${names.length} nomes`,
            reason: "Quantidade de itens não corresponde",
          });
        }

        const idAmounts: string[] = [];
        const count = Math.min(amounts.length, names.length);
        for (let i = 0; i < count; i++) {
          const amt = amounts[i]; // e.g. "*200"
          const id = lookupId(names[i].name, nameIndex, errors, sheetName, cellRef(dr, c));
          if (id != null) {
            // Replace *amount with ID*amount
            idAmounts.push(amt.replace("*", `${id}*`));
          } else {
            idAmounts.push(amt); // keep original
          }
        }
        // Add any remaining amounts that didn't have names
        for (let i = count; i < amounts.length; i++) {
          idAmounts.push(amounts[i]);
        }

        const newVal = idAmounts.join(",");
        if (newVal !== cellVal) {
          setCellValue(ws, dr, c, newVal);
          filled++;
        }
      }
    }
  }
  return filled;
}

/**
 * Pattern 3: Exchange "Value" column
 * Cells have "*1" in the Value column → "exchangeItemID*1"
 * Exchange item is defined above (look for "ID: NNNN" or "EXCHANGE ITEM" section)
 */
function fillExchangeValueColumn(
  ws: XLSX.WorkSheet,
  sheetName: string,
  nameIndex: Map<string, number[]>,
  errors: IdFillerError[]
): number {
  let filled = 0;
  const { minR, maxR, minC, maxC } = getRange(ws);

  // Find exchange item ID - look for "ID: NNNN" pattern
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

  // Find "Value" header columns
  for (let r = minR; r <= maxR; r++) {
    for (let c = minC; c <= maxC; c++) {
      const val = getCellValue(ws, r, c);
      if (!val || val.trim().toLowerCase() !== "value") continue;

      // Process rows below
      for (let dr = r + 1; dr <= maxR; dr++) {
        const cellVal = getCellValue(ws, dr, c);
        if (!cellVal) continue;
        const trimmed = cellVal.trim();
        if (trimmed.toLowerCase() === "value") break; // new section

        // Only process cells that are just "*N" (no ID yet)
        if (/^\*\d+$/.test(trimmed)) {
          setCellValue(ws, dr, c, `${exchangeId}${trimmed}`);
          filled++;
        }
      }
    }
  }

  // Also fill the "ID/ Amount" column for exchange items
  for (let r = minR; r <= maxR; r++) {
    for (let c = minC; c <= maxC; c++) {
      const val = getCellValue(ws, r, c);
      if (!val) continue;
      if (!/id\s*[\/&]\s*amount/i.test(val.trim())) continue;

      // Find item name column
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
            setCellValue(ws, dr, c, `${id}${cellVal.trim()}`);
            filled++;
          }
        }
      }
    }
  }

  return filled;
}

/**
 * Pattern 4: Standalone "*amount" cells that aren't in ID/Amount headers
 * Used in Daily Entry queues, Missions, etc.
 * Look for cells with "*N,*N,*N" pattern and item names in nearby cells
 */
function fillStandaloneAmountCells(
  ws: XLSX.WorkSheet,
  sheetName: string,
  nameIndex: Map<string, number[]>,
  errors: IdFillerError[]
): number {
  let filled = 0;
  const { minR, maxR, minC, maxC } = getRange(ws);

  for (let r = minR; r <= maxR; r++) {
    for (let c = minC; c <= maxC; c++) {
      const val = getCellValue(ws, r, c);
      if (!val) continue;
      const trimmed = val.trim();

      // Match comma-separated *amounts pattern (already unfilled)
      if (!/^\*\d+/.test(trimmed)) continue;
      // Skip if already has IDs (digit before *)
      if (/\d\*\d/.test(trimmed)) continue;

      // Split amounts
      const parts = trimmed.split(",").map((s: string) => s.trim());
      const amountCount = parts.length;

      // Find item names - look in adjacent columns at same row and rows above
      // The pattern is: names appear in a row above or at same row, in nearby columns
      const names: string[] = [];

      // Check rows above for item names (typically 2 rows above for queues)
      for (let searchR = Math.max(minR, r - 3); searchR < r; searchR++) {
        for (let nc = c - 1; nc <= c + 10 && nc <= maxC; nc++) {
          const n = getCellValue(ws, searchR, nc);
          if (n && /\[.*\]/.test(n)) {
            // Has bracket suffixes → likely item name
            names.push(n);
          }
        }
        if (names.length >= amountCount) break;
      }

      if (names.length === 0) continue;
      if (names.length !== amountCount) {
        errors.push({
          sheet: sheetName,
          cell: cellRef(r, c),
          itemName: `${amountCount} quantidades vs ${names.length} nomes`,
          reason: "Quantidade de nomes não corresponde (standalone)",
        });
      }

      const idAmounts: string[] = [];
      const count = Math.min(parts.length, names.length);
      for (let i = 0; i < count; i++) {
        const id = lookupId(names[i], nameIndex, errors, sheetName, cellRef(r, c));
        if (id != null) {
          idAmounts.push(parts[i].replace("*", `${id}*`));
        } else {
          idAmounts.push(parts[i]);
        }
      }
      for (let i = count; i < parts.length; i++) {
        idAmounts.push(parts[i]);
      }

      const newVal = idAmounts.join(",");
      if (newVal !== trimmed) {
        setCellValue(ws, r, c, newVal);
        filled++;
      }
    }
  }
  return filled;
}

/**
 * Main function: process a workbook and fill IDs
 */
export function fillIds(
  wb: XLSX.WorkBook,
  nameIndex: Map<string, number[]>
): IdFillerResult {
  const errors: IdFillerError[] = [];
  let totalFilled = 0;

  for (const sheetName of wb.SheetNames) {
    const ws = wb.Sheets[sheetName];
    if (!ws || !ws["!ref"]) continue;

    // Apply patterns in order of specificity
    totalFilled += fillBareIdColumns(ws, sheetName, nameIndex, errors);
    totalFilled += fillIdAmountColumns(ws, sheetName, nameIndex, errors);
    totalFilled += fillExchangeValueColumn(ws, sheetName, nameIndex, errors);
    totalFilled += fillStandaloneAmountCells(ws, sheetName, nameIndex, errors);
  }

  return { workbook: wb, errors, filled: totalFilled };
}

/** Generate an error report as a new workbook */
export function createErrorReport(errors: IdFillerError[]): XLSX.WorkBook {
  const wb = XLSX.utils.book_new();
  const data = [
    ["Sheet", "Célula", "Nome do Item", "Motivo"],
    ...errors.map((e) => [e.sheet, e.cell, e.itemName, e.reason]),
  ];
  const ws = XLSX.utils.aoa_to_sheet(data);
  // Set column widths
  ws["!cols"] = [{ wch: 30 }, { wch: 10 }, { wch: 40 }, { wch: 50 }];
  XLSX.utils.book_append_sheet(wb, ws, "Erros");
  return wb;
}
