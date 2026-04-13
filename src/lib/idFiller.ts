import * as XLSX from "@e965/xlsx";
import JSZip from "jszip";

export interface IdFillerError {
  sheet: string;
  cell: string;
  itemName: string;
  reason: string;
}

export interface IdFillerResult {
  /** The modified xlsx as an ArrayBuffer, preserving all original formatting */
  outputBuffer: ArrayBuffer;
  errors: IdFillerError[];
  filled: number;
}

/** Strip suffixes like [Permanent] [Bound] [30 Days - renewable] etc. and trim */
function cleanItemName(raw: string): string {
  let name = raw.replace(/\n/g, " ");
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
      sheet, cell, itemName: cleaned,
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

function getRange(ws: XLSX.WorkSheet): { minR: number; maxR: number; minC: number; maxC: number } {
  const range = XLSX.utils.decode_range(ws["!ref"] || "A1");
  return { minR: range.s.r + 1, maxR: range.e.r + 1, minC: range.s.c + 1, maxC: range.e.c + 1 };
}

/** Collect all cell changes needed (cell ref → new value) without modifying the workbook */
function collectChanges(
  wb: XLSX.WorkBook,
  nameIndex: Map<string, number[]>
): { changes: Map<string, Map<string, string | number>>; errors: IdFillerError[]; filled: number } {
  const errors: IdFillerError[] = [];
  // sheetName → { cellRef → newValue }
  const changes = new Map<string, Map<string, string | number>>();
  let totalFilled = 0;

  for (const sheetName of wb.SheetNames) {
    const ws = wb.Sheets[sheetName];
    if (!ws || !ws["!ref"]) continue;
    const sheetChanges = new Map<string, string | number>();

    const filled1 = collectBareIdColumns(ws, sheetName, nameIndex, errors, sheetChanges);
    const filled2 = collectIdAmountColumns(ws, sheetName, nameIndex, errors, sheetChanges);
    const filled3 = collectExchangeColumns(ws, sheetName, nameIndex, errors, sheetChanges);
    const filled4 = collectStandaloneAmounts(ws, sheetName, nameIndex, errors, sheetChanges);

    const sheetFilled = filled1 + filled2 + filled3 + filled4;
    totalFilled += sheetFilled;
    if (sheetChanges.size > 0) {
      changes.set(sheetName, sheetChanges);
    }
  }

  return { changes, errors, filled: totalFilled };
}

function collectBareIdColumns(
  ws: XLSX.WorkSheet, sheetName: string, nameIndex: Map<string, number[]>,
  errors: IdFillerError[], out: Map<string, string | number>
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
        if (hv && /item\s*name/i.test(hv.trim())) { nameCol = nc; break; }
      }
      if (nameCol == null) continue;

      for (let dr = r + 1; dr <= maxR; dr++) {
        const existingId = getCellValue(ws, dr, c);
        if (existingId != null) continue;
        const name = getCellValue(ws, dr, nameCol);
        if (!name) continue;
        const id = lookupId(name, nameIndex, errors, sheetName, cellRef(dr, c));
        if (id != null) {
          out.set(cellRef(dr, c), id);
          filled++;
        }
      }
    }
  }
  return filled;
}

function collectIdAmountColumns(
  ws: XLSX.WorkSheet, sheetName: string, nameIndex: Map<string, number[]>,
  errors: IdFillerError[], out: Map<string, string | number>
): number {
  let filled = 0;
  const { minR, maxR, minC, maxC } = getRange(ws);

  for (let r = minR; r <= maxR; r++) {
    for (let c = minC; c <= maxC; c++) {
      const val = getCellValue(ws, r, c);
      if (!val) continue;
      const trimmed = val.trim();
      if (!/id\s*[\/&]\s*amount/i.test(trimmed) && !/id\s+and\s+amount/i.test(trimmed)) continue;

      let nameCol: number | null = null;
      for (let nc = minC; nc <= maxC; nc++) {
        if (nc === c) continue;
        const hv = getCellValue(ws, r, nc);
        if (!hv) continue;
        const ht = hv.trim().toLowerCase();
        if (ht.includes("item") || ht.includes("items")) { nameCol = nc; break; }
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
          errors.push({ sheet: sheetName, cell: cellRef(dr, c),
            itemName: `${amounts.length} quantidades vs ${names.length} nomes`,
            reason: "Quantidade de itens não corresponde" });
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
        if (newVal !== cellVal) { out.set(cellRef(dr, c), newVal); filled++; }
      }
    }
  }
  return filled;
}

function collectExchangeColumns(
  ws: XLSX.WorkSheet, sheetName: string, nameIndex: Map<string, number[]>,
  errors: IdFillerError[], out: Map<string, string | number>
): number {
  let filled = 0;
  const { minR, maxR, minC, maxC } = getRange(ws);

  let exchangeId: number | null = null;
  for (let r = minR; r <= maxR; r++) {
    for (let c = minC; c <= maxC; c++) {
      const val = getCellValue(ws, r, c);
      if (!val) continue;
      const match = val.match(/^ID:\s*(\d+)$/i);
      if (match) { exchangeId = parseInt(match[1]); break; }
    }
    if (exchangeId) break;
  }
  if (!exchangeId) return 0;

  // Fill "Value" columns
  for (let r = minR; r <= maxR; r++) {
    for (let c = minC; c <= maxC; c++) {
      const val = getCellValue(ws, r, c);
      if (!val || val.trim().toLowerCase() !== "value") continue;
      for (let dr = r + 1; dr <= maxR; dr++) {
        const cellVal = getCellValue(ws, dr, c);
        if (!cellVal) continue;
        if (cellVal.trim().toLowerCase() === "value") break;
        if (/^\*\d+$/.test(cellVal.trim())) {
          out.set(cellRef(dr, c), `${exchangeId}${cellVal.trim()}`);
          filled++;
        }
      }
    }
  }

  // Fill "ID/ Amount" columns
  for (let r = minR; r <= maxR; r++) {
    for (let c = minC; c <= maxC; c++) {
      const val = getCellValue(ws, r, c);
      if (!val || !/id\s*[\/&]\s*amount/i.test(val.trim())) continue;
      let nameCol: number | null = null;
      for (let nc = minC; nc <= maxC; nc++) {
        if (nc === c) continue;
        const hv = getCellValue(ws, r, nc);
        if (hv && /item\s*name/i.test(hv.trim())) { nameCol = nc; break; }
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
          if (id != null) { out.set(cellRef(dr, c), `${id}${cellVal.trim()}`); filled++; }
        }
      }
    }
  }

  return filled;
}

function collectStandaloneAmounts(
  ws: XLSX.WorkSheet, sheetName: string, nameIndex: Map<string, number[]>,
  errors: IdFillerError[], out: Map<string, string | number>
): number {
  let filled = 0;
  const { minR, maxR, minC, maxC } = getRange(ws);

  for (let r = minR; r <= maxR; r++) {
    for (let c = minC; c <= maxC; c++) {
      if (out.has(cellRef(r, c))) continue; // already handled
      const val = getCellValue(ws, r, c);
      if (!val) continue;
      const trimmed = val.trim();
      if (!/^\*\d+/.test(trimmed)) continue;
      if (/\d\*\d/.test(trimmed)) continue; // already has IDs

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
        errors.push({ sheet: sheetName, cell: cellRef(r, c),
          itemName: `${parts.length} qtd vs ${names.length} nomes`, reason: "Quantidade não corresponde (standalone)" });
      }

      const idAmounts: string[] = [];
      const count = Math.min(parts.length, names.length);
      for (let i = 0; i < count; i++) {
        const id = lookupId(names[i], nameIndex, errors, sheetName, cellRef(r, c));
        if (id != null) idAmounts.push(parts[i].replace("*", `${id}*`));
        else idAmounts.push(parts[i]);
      }
      for (let i = count; i < parts.length; i++) idAmounts.push(parts[i]);

      const newVal = idAmounts.join(",");
      if (newVal !== trimmed) { out.set(cellRef(r, c), newVal); filled++; }
    }
  }
  return filled;
}

/**
 * Apply collected changes to the raw xlsx zip, preserving all formatting, merges, images, etc.
 * We parse each sheet XML, find the target cells, and update only their values.
 */
async function applyChangesToZip(
  originalBuffer: ArrayBuffer,
  wb: XLSX.WorkBook,
  changes: Map<string, Map<string, string | number>>
): Promise<ArrayBuffer> {
  const zip = await JSZip.loadAsync(originalBuffer);

  // Read workbook.xml to get sheet→file mapping
  const wbXml = await zip.file("xl/workbook.xml")?.async("string");
  if (!wbXml) throw new Error("Invalid xlsx: no workbook.xml");

  // Get sheet rIds from workbook.xml
  const sheetEntries: { name: string; rId: string }[] = [];
  const sheetRegex = /<sheet[^>]*name="([^"]*)"[^>]*r:id="([^"]*)"[^>]*\/?>/gi;
  let m;
  while ((m = sheetRegex.exec(wbXml)) !== null) {
    sheetEntries.push({ name: m[1], rId: m[2] });
  }

  // Read rels to map rId → file path
  const relsXml = await zip.file("xl/_rels/workbook.xml.rels")?.async("string");
  if (!relsXml) throw new Error("Invalid xlsx: no rels");

  const relMap = new Map<string, string>();
  const relRegex = /<Relationship[^>]*Id="([^"]*)"[^>]*Target="([^"]*)"[^>]*\/?>/gi;
  while ((m = relRegex.exec(relsXml)) !== null) {
    relMap.set(m[1], m[2]);
  }

  // Read shared strings
  let sharedStrings: string[] = [];
  let sst: string | undefined;
  const sstFile = zip.file("xl/sharedStrings.xml");
  if (sstFile) {
    sst = await sstFile.async("string");
    const siRegex = /<si>([\s\S]*?)<\/si>/gi;
    while ((m = siRegex.exec(sst)) !== null) {
      // Extract text from <t> tags
      const tRegex = /<t[^>]*>([\s\S]*?)<\/t>/gi;
      let text = "";
      let tm;
      while ((tm = tRegex.exec(m[1])) !== null) {
        text += tm[1];
      }
      sharedStrings.push(text);
    }
  }

  // Track new shared strings we add
  const newStrings: string[] = [];

  function getOrAddSharedString(val: string): number {
    // Check existing
    const idx = sharedStrings.indexOf(val);
    if (idx >= 0) return idx;
    // Check newly added
    const newIdx = newStrings.indexOf(val);
    if (newIdx >= 0) return sharedStrings.length + newIdx;
    // Add new
    newStrings.push(val);
    return sharedStrings.length + newStrings.length - 1;
  }

  for (const [sheetName, cellChanges] of changes) {
    const entry = sheetEntries.find((s) => s.name === sheetName);
    if (!entry) continue;
    const target = relMap.get(entry.rId);
    if (!target) continue;
    const filePath = `xl/${target}`;
    const sheetFile = zip.file(filePath);
    if (!sheetFile) continue;

    let xml = await sheetFile.async("string");

    for (const [ref, value] of cellChanges) {
      const isNumber = typeof value === "number";
      const escapedRef = ref.replace(/\$/g, "\\$");

      // Try to find existing cell element
      const cellRegex = new RegExp(
        `(<c[^>]*\\br="${escapedRef}"[^>]*)(>(?:[\\s\\S]*?)<\\/c>|\\/>)`,
        "i"
      );
      const cellMatch = cellRegex.exec(xml);

      if (cellMatch) {
        // Cell exists - update it
        if (isNumber) {
          // Set type to number, replace value
          let attrs = cellMatch[1].replace(/\s+t="[^"]*"/, "");
          xml = xml.replace(cellMatch[0], `${attrs}><v>${value}</v></c>`);
        } else {
          // Use shared string for text values
          const ssIdx = getOrAddSharedString(String(value));
          let attrs = cellMatch[1].replace(/\s+t="[^"]*"/, "");
          attrs += ` t="s"`;
          xml = xml.replace(cellMatch[0], `${attrs}><v>${ssIdx}</v></c>`);
        }
      } else {
        // Cell doesn't exist - insert it into the correct row
        const colRow = XLSX.utils.decode_cell(ref);
        const rowNum = colRow.r + 1;
        const rowRegex = new RegExp(
          `(<row[^>]*\\br="${rowNum}"[^>]*>)([\\s\\S]*?)(<\\/row>)`,
          "i"
        );
        const rowMatch = rowRegex.exec(xml);
        if (rowMatch) {
          let newCell: string;
          if (isNumber) {
            newCell = `<c r="${ref}"><v>${value}</v></c>`;
          } else {
            const ssIdx = getOrAddSharedString(String(value));
            newCell = `<c r="${ref}" t="s"><v>${ssIdx}</v></c>`;
          }
          xml = xml.replace(rowMatch[0], `${rowMatch[1]}${rowMatch[2]}${newCell}${rowMatch[3]}`);
        }
      }
    }

    zip.file(filePath, xml);
  }

  // Update shared strings if we added new ones
  if (newStrings.length > 0 && sst) {
    // Update count and uniqueCount
    const totalCount = sharedStrings.length + newStrings.length;
    let updatedSst = sst.replace(
      /(<sst[^>]*)\bcount="(\d+)"/,
      `$1count="${totalCount}"`
    );
    updatedSst = updatedSst.replace(
      /(<sst[^>]*)\buniqueCount="(\d+)"/,
      `$1uniqueCount="${totalCount}"`
    );

    // Add new <si> entries before </sst>
    const newEntries = newStrings
      .map((s) => `<si><t>${escapeXml(s)}</t></si>`)
      .join("");
    updatedSst = updatedSst.replace("</sst>", `${newEntries}</sst>`);

    zip.file("xl/sharedStrings.xml", updatedSst);
  }

  return zip.generateAsync({ type: "arraybuffer", compression: "DEFLATE" });
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/**
 * Main function: analyze workbook and apply changes to raw xlsx preserving formatting
 */
export async function fillIds(
  originalBuffer: ArrayBuffer,
  nameIndex: Map<string, number[]>
): Promise<IdFillerResult> {
  // Read with XLSX for analysis only
  const wb = XLSX.read(new Uint8Array(originalBuffer), { type: "array" });

  // Collect changes without modifying the workbook
  const { changes, errors, filled } = collectChanges(wb, nameIndex);

  // Apply changes directly to the raw xlsx zip
  const outputBuffer = await applyChangesToZip(originalBuffer, wb, changes);

  return { outputBuffer, errors, filled };
}

/** Generate an error report as xlsx ArrayBuffer */
export function createErrorReport(errors: IdFillerError[]): ArrayBuffer {
  const wb = XLSX.utils.book_new();
  const data = [
    ["Sheet", "Célula", "Nome do Item", "Motivo"],
    ...errors.map((e) => [e.sheet, e.cell, e.itemName, e.reason]),
  ];
  const ws = XLSX.utils.aoa_to_sheet(data);
  ws["!cols"] = [{ wch: 30 }, { wch: 10 }, { wch: 40 }, { wch: 50 }];
  XLSX.utils.book_append_sheet(wb, ws, "Erros");
  return XLSX.write(wb, { type: "array", bookType: "xlsx" });
}
