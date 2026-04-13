import * as XLSX from "@e965/xlsx";
import JSZip from "jszip";

export type XlsxCellValue = string | number;
export type WorksheetCellChanges = Map<string, Map<string, XlsxCellValue>>;

const SPREADSHEET_NS = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
const DOCUMENT_REL_NS = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const XML_NS = "http://www.w3.org/XML/1998/namespace";

function getDescendantsByLocalName(parent: Document | Element, localName: string): Element[] {
  return Array.from(parent.getElementsByTagNameNS("*", localName));
}

function getChildElementsByLocalName(parent: Element, localName: string): Element[] {
  return Array.from(parent.childNodes).filter(
    (node): node is Element => node.nodeType === Node.ELEMENT_NODE && (node as Element).localName === localName
  );
}

function getFirstByLocalName(node: Document | Element, localName: string): Element | null {
  return getDescendantsByLocalName(node, localName)[0] ?? null;
}

function assertValidXml(doc: Document, filePath: string) {
  if (doc.getElementsByTagName("parsererror").length > 0) {
    throw new Error(`Não foi possível interpretar ${filePath}`);
  }
}

function resolveZipPath(baseDir: string, target: string): string {
  const parts = baseDir.split("/").filter(Boolean);
  for (const part of target.replace(/\\/g, "/").split("/")) {
    if (!part || part === ".") continue;
    if (part === "..") parts.pop();
    else parts.push(part);
  }
  return parts.join("/");
}

function getSheetPathByName(workbookDoc: Document, workbookRelsDoc: Document): Map<string, string> {
  const relTargetById = new Map<string, string>();

  for (const rel of getDescendantsByLocalName(workbookRelsDoc, "Relationship")) {
    const id = rel.getAttribute("Id");
    const target = rel.getAttribute("Target");
    if (!id || !target) continue;
    relTargetById.set(id, resolveZipPath("xl", target));
  }

  const sheetPathByName = new Map<string, string>();
  for (const sheet of getDescendantsByLocalName(workbookDoc, "sheet")) {
    const name = sheet.getAttribute("name");
    const relId = sheet.getAttributeNS(DOCUMENT_REL_NS, "id") ?? sheet.getAttribute("r:id");
    if (!name || !relId) continue;
    const target = relTargetById.get(relId);
    if (target) sheetPathByName.set(name, target);
  }

  return sheetPathByName;
}

function getColumnIndex(cellRef: string | null): number {
  if (!cellRef) return -1;
  try {
    return XLSX.utils.decode_cell(cellRef).c + 1;
  } catch {
    return -1;
  }
}

function getRowNumber(row: Element): number {
  return Number(row.getAttribute("r") ?? "0");
}

function getOrCreateSheetData(sheetDoc: Document): Element {
  const existing = getFirstByLocalName(sheetDoc, "sheetData");
  if (existing) return existing;

  const sheetData = sheetDoc.createElementNS(SPREADSHEET_NS, "sheetData");
  sheetDoc.documentElement.appendChild(sheetData);
  return sheetData;
}

function getOrCreateRow(sheetDoc: Document, sheetData: Element, rowNumber: number): Element {
  const rows = getChildElementsByLocalName(sheetData, "row");
  const existing = rows.find((row) => getRowNumber(row) === rowNumber);
  if (existing) return existing;

  const row = sheetDoc.createElementNS(SPREADSHEET_NS, "row");
  row.setAttribute("r", String(rowNumber));

  const nextRow = rows.find((candidate) => getRowNumber(candidate) > rowNumber);
  if (nextRow) sheetData.insertBefore(row, nextRow);
  else sheetData.appendChild(row);

  return row;
}

function inferStyleId(sheetData: Element, row: Element, rowNumber: number, columnIndex: number): string | null {
  const rowStyle = row.getAttribute("s");
  if (rowStyle && row.getAttribute("customFormat") === "1") return rowStyle;

  const sameRowCells = getChildElementsByLocalName(row, "c")
    .map((cell) => ({ cell, distance: Math.abs(getColumnIndex(cell.getAttribute("r")) - columnIndex) }))
    .sort((a, b) => a.distance - b.distance)
    .map(({ cell }) => cell.getAttribute("s"))
    .find(Boolean);

  if (sameRowCells) return sameRowCells;

  const nearbyRows = getChildElementsByLocalName(sheetData, "row")
    .map((candidate) => ({ candidate, distance: Math.abs(getRowNumber(candidate) - rowNumber) }))
    .sort((a, b) => a.distance - b.distance)
    .map(({ candidate }) => candidate);

  for (const candidateRow of nearbyRows) {
    const matchingCell = getChildElementsByLocalName(candidateRow, "c").find(
      (cell) => getColumnIndex(cell.getAttribute("r")) === columnIndex && cell.getAttribute("s")
    );
    if (matchingCell) return matchingCell.getAttribute("s");
  }

  return null;
}

function getOrCreateCell(
  sheetDoc: Document,
  sheetData: Element,
  row: Element,
  rowNumber: number,
  cellRef: string
): Element {
  const cells = getChildElementsByLocalName(row, "c");
  const existing = cells.find((cell) => cell.getAttribute("r") === cellRef);
  if (existing) return existing;

  const cell = sheetDoc.createElementNS(SPREADSHEET_NS, "c");
  cell.setAttribute("r", cellRef);

  const columnIndex = getColumnIndex(cellRef);
  const styleId = inferStyleId(sheetData, row, rowNumber, columnIndex);
  if (styleId) cell.setAttribute("s", styleId);

  const nextCell = cells.find((candidate) => getColumnIndex(candidate.getAttribute("r")) > columnIndex);
  if (nextCell) row.insertBefore(cell, nextCell);
  else row.appendChild(cell);

  return cell;
}

/**
 * Detect if a string is an ID*amount pattern like "12656*500,46077*1,12212*500"
 * or "14654*2 OR 11412*10"
 */
function isIdAmountPattern(text: string): boolean {
  return /\d+\*\d+/.test(text) && /^[\d*,\s\w]+$/.test(text);
}

/**
 * Create a rich text run element: <r><rPr>...</rPr><t>text</t></r>
 */
function createRun(
  doc: Document,
  text: string,
  colorRgb: string | null,
  colorTheme: string | null
): Element {
  const r = doc.createElementNS(SPREADSHEET_NS, "r");
  const rPr = doc.createElementNS(SPREADSHEET_NS, "rPr");

  const sz = doc.createElementNS(SPREADSHEET_NS, "sz");
  sz.setAttribute("val", "11");
  rPr.appendChild(sz);

  const color = doc.createElementNS(SPREADSHEET_NS, "color");
  if (colorRgb) {
    color.setAttribute("rgb", colorRgb);
  } else if (colorTheme) {
    color.setAttribute("theme", colorTheme);
  }
  rPr.appendChild(color);

  const rFont = doc.createElementNS(SPREADSHEET_NS, "rFont");
  rFont.setAttribute("val", "Cambria");
  rPr.appendChild(rFont);

  r.appendChild(rPr);

  const t = doc.createElementNS(SPREADSHEET_NS, "t");
  if (/^\s|\s$/.test(text)) {
    t.setAttributeNS(XML_NS, "xml:space", "preserve");
  }
  t.textContent = text;
  r.appendChild(t);

  return r;
}

/**
 * Write a rich-text ID*amount value with colors:
 * ID (black/theme1), * (black/theme1), amount (red FF0000), separators (black/theme1)
 */
function writeRichIdAmount(sheetDoc: Document, cell: Element, text: string) {
  cell.setAttribute("t", "inlineStr");
  const is = sheetDoc.createElementNS(SPREADSHEET_NS, "is");

  // Split by comma or OR, keeping separators
  const segments = text.split(/(,\s*|\s+OR\s+)/i);

  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    if (!seg) continue;

    // Check if this is a separator (comma or OR)
    if (/^,\s*$/.test(seg) || /^\s+OR\s+$/i.test(seg)) {
      is.appendChild(createRun(sheetDoc, seg, null, "1"));
      continue;
    }

    // Parse ID*amount pattern
    const match = seg.match(/^(\d+)(\*)(\d+)$/);
    if (match) {
      is.appendChild(createRun(sheetDoc, match[1] + match[2], null, "1")); // ID* in black
      is.appendChild(createRun(sheetDoc, match[3], "FFFF0000", null));     // amount in red
    } else {
      // Fallback: just black
      is.appendChild(createRun(sheetDoc, seg, null, "1"));
    }
  }

  cell.appendChild(is);
}

function writeCellValue(sheetDoc: Document, cell: Element, value: XlsxCellValue) {
  while (cell.firstChild) {
    cell.removeChild(cell.firstChild);
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    cell.removeAttribute("t");
    const v = sheetDoc.createElementNS(SPREADSHEET_NS, "v");
    v.textContent = String(value);
    cell.appendChild(v);
    return;
  }

  const text = String(value);

  // Use rich text for ID*amount patterns
  if (isIdAmountPattern(text)) {
    writeRichIdAmount(sheetDoc, cell, text);
    return;
  }

  cell.setAttribute("t", "inlineStr");
  const is = sheetDoc.createElementNS(SPREADSHEET_NS, "is");
  const t = sheetDoc.createElementNS(SPREADSHEET_NS, "t");

  if (/^\s|\s$|\n/.test(text)) {
    t.setAttributeNS(XML_NS, "xml:space", "preserve");
  }

  t.textContent = text;
  is.appendChild(t);
  cell.appendChild(is);
}

function updateDimension(sheetDoc: Document, changedRefs: string[]) {
  if (changedRefs.length === 0) return;

  const dimension = getFirstByLocalName(sheetDoc, "dimension");
  if (!dimension) return;

  let range;
  const currentRef = dimension.getAttribute("ref") ?? changedRefs[0];

  try {
    range = XLSX.utils.decode_range(currentRef.includes(":") ? currentRef : `${currentRef}:${currentRef}`);
  } catch {
    const firstCell = XLSX.utils.decode_cell(changedRefs[0]);
    range = { s: firstCell, e: firstCell };
  }

  for (const cellRef of changedRefs) {
    const cell = XLSX.utils.decode_cell(cellRef);
    range.s.r = Math.min(range.s.r, cell.r);
    range.s.c = Math.min(range.s.c, cell.c);
    range.e.r = Math.max(range.e.r, cell.r);
    range.e.c = Math.max(range.e.c, cell.c);
  }

  dimension.setAttribute("ref", XLSX.utils.encode_range(range));
}

export async function applyWorkbookChanges(
  originalBuffer: ArrayBuffer,
  changes: WorksheetCellChanges
): Promise<ArrayBuffer> {
  if (changes.size === 0) {
    return originalBuffer.slice(0);
  }

  const zip = await JSZip.loadAsync(originalBuffer);
  const workbookFile = zip.file("xl/workbook.xml");
  const workbookRelsFile = zip.file("xl/_rels/workbook.xml.rels");

  if (!workbookFile || !workbookRelsFile) {
    throw new Error("Estrutura XLSX inválida: workbook não encontrado");
  }

  const [workbookXml, workbookRelsXml] = await Promise.all([
    workbookFile.async("string"),
    workbookRelsFile.async("string"),
  ]);

  const parser = new DOMParser();
  const serializer = new XMLSerializer();
  const workbookDoc = parser.parseFromString(workbookXml, "application/xml");
  const workbookRelsDoc = parser.parseFromString(workbookRelsXml, "application/xml");

  assertValidXml(workbookDoc, "xl/workbook.xml");
  assertValidXml(workbookRelsDoc, "xl/_rels/workbook.xml.rels");

  const sheetPathByName = getSheetPathByName(workbookDoc, workbookRelsDoc);

  for (const [sheetName, sheetChanges] of changes) {
    const sheetPath = sheetPathByName.get(sheetName);
    if (!sheetPath) continue;

    const sheetFile = zip.file(sheetPath);
    if (!sheetFile) continue;

    const sheetXml = await sheetFile.async("string");
    const sheetDoc = parser.parseFromString(sheetXml, "application/xml");
    assertValidXml(sheetDoc, sheetPath);

    const sheetData = getOrCreateSheetData(sheetDoc);
    const changedRefs: string[] = [];

    for (const [cellRef, value] of sheetChanges) {
      const rowNumber = XLSX.utils.decode_cell(cellRef).r + 1;
      const row = getOrCreateRow(sheetDoc, sheetData, rowNumber);
      const cell = getOrCreateCell(sheetDoc, sheetData, row, rowNumber, cellRef);
      writeCellValue(sheetDoc, cell, value);
      changedRefs.push(cellRef);
    }

    updateDimension(sheetDoc, changedRefs);
    zip.file(sheetPath, serializer.serializeToString(sheetDoc));
  }

  return zip.generateAsync({ type: "arraybuffer", compression: "DEFLATE" });
}
