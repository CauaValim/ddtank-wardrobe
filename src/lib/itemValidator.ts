export type ValidationStatus =
  | "valid"
  | "no_image"
  | "name_mismatch"
  | "id_not_found"
  | "invalid_row";

export interface DbItem {
  id: number;
  name: string | null;
  image_url: string | null;
}

export interface ValidationRow {
  rowNumber: number;
  rawId: string;
  rawName: string;
  status: ValidationStatus;
  dbName: string | null;
  suggestedId: string | null;
  imageUrl: string | null;
  hasImage: boolean;
  original: Record<string, unknown>;
}

export interface ItemIndex {
  byId: Map<string, DbItem>;
  byName: Map<string, DbItem[]>;
}

export function normalizeName(value: string): string {
  return value
    .replace(/\r?\n/g, " ")
    .replace(/\s*\[[^\]]*\]/g, "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/** Removes line breaks and "[Permanent] [Bound]"-style tags for display. */
export function cleanDisplayName(value: string): string {
  return value.replace(/\r?\n/g, " ").replace(/\s*\[[^\]]*\]/g, "").replace(/\s+/g, " ").trim();
}

export interface ExtractedPair {
  sheet: string;
  cell: string;
  name: string;
  id: string;
}

export type Grid = (string | null)[][];

function cellAt(grid: Grid, r: number, c: number): string | null {
  const v = grid[r]?.[c];
  if (v == null) return null;
  const s = String(v).trim();
  return s === "" ? null : s;
}

function colName(c: number): string {
  let s = "";
  let n = c;
  while (n >= 0) {
    s = String.fromCharCode((n % 26) + 65) + s;
    n = Math.floor(n / 26) - 1;
  }
  return s;
}

function ref(r: number, c: number): string {
  return `${colName(c)}${r + 1}`;
}

function isBracketedName(v: string): boolean {
  return /\[[^\]]*\]/.test(v) && /[A-Za-zÀ-ÿ]/.test(v);
}

const ID_AMOUNT_CELL = /^\d+\*\d+(?:\s*,\s*\d+\*\d+)*$/;

const VALUE_HEADER = /\bvalue\b|\bcost\b|valor|custo|pre[çc]o/i;

function headerAbove(grid: Grid, r: number, c: number): string | null {
  for (let rr = r - 1; rr >= 0 && rr >= r - 12; rr--) {
    const v = cellAt(grid, rr, c);
    if (!v) continue;
    if (!/[A-Za-zÀ-ÿ]/.test(v)) continue;
    return v;
  }
  return null;
}

/**
 * Finds the N item names that belong to a multi-id cell:
 *  - vertically: names stacked in a column to the left, starting at the same row
 *  - horizontally: names in the row(s) above, starting at the same column
 */
function matchMultiNames(
  grid: Grid,
  r: number,
  c: number,
  count: number,
  maxRow: number,
  maxCol: number
): string[] {
  for (let nameCol = c - 1; nameCol >= 0; nameCol--) {
    const found: string[] = [];
    for (let rr = r; rr < Math.min(maxRow, r + count * 2); rr++) {
      const v = cellAt(grid, rr, nameCol);
      if (v && isBracketedName(v)) found.push(v);
      if (found.length === count) return found;
    }
  }

  for (const rr of [r - 1, r - 2]) {
    if (rr < 0) continue;
    const found: string[] = [];
    for (let cc = c; cc < maxCol; cc++) {
      const v = cellAt(grid, rr, cc);
      if (v && isBracketedName(v)) found.push(v);
      if (found.length === count) return found;
    }
  }

  return [];
}

/**
 * Extracts (name, id) pairs from an event spreadsheet sheet.
 * Supports two layouts:
 *  - tables with "Item Name" + "ID" headers (value on the same row)
 *  - "ID*Amount" cells (single or comma separated) whose names sit in the
 *    nearby rows above/at the same row, tagged with [Permanent]/[Bound] etc.
 */
export function extractPairsFromGrid(grid: Grid, sheet: string): ExtractedPair[] {
  const pairs: ExtractedPair[] = [];
  const maxRow = grid.length;
  const maxCol = grid.reduce((m, row) => Math.max(m, row?.length ?? 0), 0);

  // 1) Header tables: "Item Name" ... "ID"
  for (let r = 0; r < maxRow; r++) {
    let nameCol = -1;
    let idCol = -1;
    for (let c = 0; c < maxCol; c++) {
      const v = cellAt(grid, r, c);
      if (!v) continue;
      if (/^item\s*name$/i.test(v)) nameCol = c;
      else if (/^id$/i.test(v)) idCol = c;
    }
    if (nameCol < 0 || idCol < 0) continue;

    for (let dr = r + 1; dr < maxRow; dr++) {
      const name = cellAt(grid, dr, nameCol);
      if (name && /^item\s*name$/i.test(name)) break;
      const id = cellAt(grid, dr, idCol);
      if (!name || !id) continue;
      if (!/^\d+$/.test(id.replace(/\D/g, "") || "x")) continue;
      pairs.push({ sheet, cell: ref(dr, idCol), name, id: id.replace(/[^\d]/g, "") });
    }
  }

  // 2) "ID*Amount" cells
  for (let r = 0; r < maxRow; r++) {
    for (let c = 0; c < maxCol; c++) {
      const v = cellAt(grid, r, c);
      if (!v || !ID_AMOUNT_CELL.test(v)) continue;
      const header = headerAbove(grid, r, c);
      // Cost/price columns hold the currency item, not the reward — skip them.
      if (header && VALUE_HEADER.test(header)) continue;
      const ids = v.split(",").map((s) => s.trim().split("*")[0]);

      const candidates: { name: string; row: number; col: number }[] = [];
      for (let rr = Math.max(0, r - 3); rr <= r; rr++) {
        for (let cc = 0; cc < maxCol; cc++) {
          const cv = cellAt(grid, rr, cc);
          if (cv && isBracketedName(cv)) candidates.push({ name: cv, row: rr, col: cc });
        }
      }
      let names: string[];
      if (ids.length === 1) {
        // pick the closest name (same row wins, then nearest column)
        const nearest = candidates
          .slice()
          .sort(
            (a, b) =>
              (r - a.row) * 100 + Math.abs(a.col - c) - ((r - b.row) * 100 + Math.abs(b.col - c))
          )[0];
        names = nearest ? [nearest.name] : [];
      } else {
        names = matchMultiNames(grid, r, c, ids.length, maxRow, maxCol);
        if (names.length < ids.length) {
          names = candidates.slice(-ids.length).map((x) => x.name);
        }
      }
      ids.forEach((id, i) => {
        const name = names[i];
        if (!name) return;
        pairs.push({ sheet, cell: ref(r, c), name, id });
      });
    }
  }

  return pairs;
}

export function buildItemIndex(items: DbItem[]): ItemIndex {
  const byId = new Map<string, DbItem>();
  const byName = new Map<string, DbItem[]>();
  for (const item of items) {
    byId.set(String(item.id), item);
    const key = normalizeName(item.name ?? "");
    if (!key) continue;
    const list = byName.get(key);
    if (list) list.push(item);
    else byName.set(key, [item]);
  }
  return { byId, byName };
}

const ID_KEYS = ["ID", "id", "Id", "iD", "Código", "Codigo"];
const NAME_KEYS = ["Nome", "nome", "Name", "name", "NOME"];

function pick(row: Record<string, unknown>, keys: string[]): string {
  for (const k of keys) {
    const v = row[k];
    if (v != null && String(v).trim() !== "") return String(v).trim();
  }
  return "";
}

export function validateRows(
  rows: Record<string, unknown>[],
  index: ItemIndex
): ValidationRow[] {
  return rows.map((row, i) => {
    const rawId = pick(row, ID_KEYS);
    const rawName = pick(row, NAME_KEYS);
    const base = {
      rowNumber: i + 2,
      rawId,
      rawName,
      original: row,
    };

    if (!rawId || !rawName) {
      return {
        ...base,
        status: "invalid_row" as const,
        dbName: null,
        suggestedId: null,
        imageUrl: null,
        hasImage: false,
      };
    }

    const normalizedId = String(Number(rawId.replace(/[^\d-]/g, "")) || rawId);
    const dbItem = index.byId.get(normalizedId) ?? index.byId.get(rawId);

    if (!dbItem) {
      const matches = index.byName.get(normalizeName(rawName)) ?? [];
      return {
        ...base,
        status: "id_not_found" as const,
        dbName: null,
        suggestedId: matches.length > 0 ? String(matches[0].id) : null,
        imageUrl: matches.length > 0 ? matches[0].image_url : null,
        hasImage: matches.length > 0 ? !!matches[0].image_url : false,
      };
    }

    const hasImage = !!dbItem.image_url;
    const nameMatches = normalizeName(dbItem.name ?? "") === normalizeName(rawName);

    if (!nameMatches) {
      const matches = index.byName.get(normalizeName(rawName)) ?? [];
      return {
        ...base,
        status: "name_mismatch" as const,
        dbName: dbItem.name,
        suggestedId: matches.length > 0 ? String(matches[0].id) : null,
        imageUrl: dbItem.image_url,
        hasImage,
      };
    }

    return {
      ...base,
      status: hasImage ? ("valid" as const) : ("no_image" as const),
      dbName: dbItem.name,
      suggestedId: null,
      imageUrl: dbItem.image_url,
      hasImage,
    };
  });
}

export const STATUS_LABELS: Record<ValidationStatus, string> = {
  valid: "Válido",
  no_image: "Sem imagem",
  name_mismatch: "Nome divergente",
  id_not_found: "ID não encontrado",
  invalid_row: "Linha inválida",
};

export function summarize(rows: ValidationRow[]): Record<ValidationStatus, number> {
  const acc: Record<ValidationStatus, number> = {
    valid: 0,
    no_image: 0,
    name_mismatch: 0,
    id_not_found: 0,
    invalid_row: 0,
  };
  rows.forEach((r) => { acc[r.status] += 1; });
  return acc;
}
