// DDTank item type mapping
export const ITEM_TYPE_MAP: Record<number, string> = {
  1: "Chapéu",
  2: "Rosto",
  3: "Olhos",
  4: "Cabelo",
  5: "Roupa",
  6: "Arma",
  7: "Costas",
  8: "Pés",
  9: "Mão",
  10: "Pescoço",
  11: "Anel",
  12: "Asa",
  13: "Mascote",
  14: "Título",
  15: "Consumível",
  16: "Material",
  17: "Caixa",
  18: "Especial",
};

export function getTypeName(type: number | null | undefined): string {
  if (type == null) return "Outros";
  return ITEM_TYPE_MAP[type] ?? `Tipo ${type}`;
}
