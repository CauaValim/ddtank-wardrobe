// DDTank item type mapping
export const ITEM_TYPE_MAP: Record<number, string> = {
  1: "Chapéu",
  2: "Óculos",
  3: "Cabelo",
  4: "Face",
  5: "Roupa",
  6: "Rosto",
  7: "Arma",
  8: "Pulseira",
  9: "Anel",
};

export function getTypeName(type: number | null | undefined): string {
  if (type == null) return "Outros";
  return ITEM_TYPE_MAP[type] ?? `Tipo ${type}`;
}
