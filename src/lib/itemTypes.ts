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
  10: "Itens Gerais",
  11: "Ilustração de Montaria / Pacotes",
  12: "Itens de Evento",
  13: "Ternos",
  14: "Colares",
  15: "Asas",
  16: "Balão de Fala",
  17: "Armas Secundárias",
  18: "Caixa de Cartões Normal",
  19: "Outros",
  20: "Itens de Up",
  21: "Outros",
  22: "Outros",
  23: "Outros",
  24: "Títulos",
  25: "Outros",
  26: "Outros",
  27: "Arma",
  28: "Outros",
  29: "Outros",
  30: "Itens de Evento",
  31: "Armas Secundárias",
  32: "Outros",
  33: "Outros",
  34: "Comida Pets",
  35: "Pets",
  36: "Itens de Evento",
  40: "Medalhas",
  43: "Bordas",
  50: "Equip de Pet",
  51: "Equip de Pet",
  52: "Equip de Pet",
  53: "Itens de Up",
  60: "Outros",
  61: "Pedra Mágica",
  62: "Formas de Pet",
  63: "Outros",
  64: "Armas Concha",
  66: "Caixa de Cartões - Ouro ou Prata",
  68: "Runas de Montaria",
  69: "Runas de Montaria",
  70: "Outros",
  71: "Outros",
  72: "Manuais",
  73: "Bordas",
  74: "Contra-Marca",
  78: "Itens de Up",
  81: "Outros",
  82: "Pergaminhos Elementais",
  83: "Outros",
  84: "Itens de Evento",
  85: "Pets Elementais",
  86: "Habilidades Elementais",
  87: "Itens de Evento",
  88: "Itens de Up",
  89: "Inserir Jade",
  90: "Pedra Mágica",
  91: "Pets Elementais",
  92: "Selo Contra-Marca",
  93: "Selo Contra-Marca",
  94: "Outros",
  180: "Itens de Up",
};

// Types that should be hidden from the filter list
export const HIDDEN_TYPES = new Set([37, 38]);

export function getTypeName(type: number | null | undefined): string {
  if (type == null) return "Outros";
  return ITEM_TYPE_MAP[type] ?? `Tipo ${type}`;
}

/** Group type numbers by their display name, excluding hidden types */
export function getTypeGroups(existingTypes: Set<number>): [string, number[]][] {
  const groups = new Map<string, number[]>();
  for (const [typeStr, name] of Object.entries(ITEM_TYPE_MAP)) {
    const type = Number(typeStr);
    if (HIDDEN_TYPES.has(type) || !existingTypes.has(type)) continue;
    const existing = groups.get(name) ?? [];
    existing.push(type);
    groups.set(name, existing);
  }
  return Array.from(groups.entries()).sort((a, b) => a[0].localeCompare(b[0]));
}
