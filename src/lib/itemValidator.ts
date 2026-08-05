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
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
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
