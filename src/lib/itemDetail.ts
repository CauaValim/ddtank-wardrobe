import type { GameItem } from "@/types/item";

// ------------------------------------------------------------------ renovação (ShopItemList.xml)

export interface RenewalOption {
  /** "7 dias", "30 dias", "Permanente", "x10"... */
  label: string;
  price: number;
}

export interface RenewalOffer {
  currency: string;
  bound: boolean;
  options: RenewalOption[];
}

/** Moedas da loja: -1 é pago com Cupons ou L. Cupons; os outros códigos pequenos o jogo não nomeia. */
export function currencyLabel(code: string | undefined, name?: string): string {
  if (name) return name;
  if (code === "-1") return "Cupons / L. Cupons";
  return code ? `Moeda especial (código ${code})` : "Moeda desconhecida";
}

function optionLabel(unit: string | undefined): string {
  const n = Number(unit ?? 0);
  return n === 0 ? "Permanente" : `${n} ${n === 1 ? "dia" : "dias"}`;
}

/** Vendido por quantidade (BuyType 1): fragmentos e outros itens que sempre entram como permanentes. */
export function isSoldByQuantity(rows: Record<string, string>[] | undefined, templateId: string): boolean {
  return (rows ?? []).some((r) => r.TemplateID === templateId && r.BuyType === "1");
}

/** Preços de renovação de um item na loja do jogo (uma oferta por moeda/loja); só itens com prazo (BuyType 0). */
export function renewalOffers(rows: Record<string, string>[] | undefined, templateId: string): RenewalOffer[] {
  const offers: RenewalOffer[] = [];
  for (const r of rows ?? []) {
    if (r.TemplateID !== templateId || r.BuyType === "1") continue;
    const options: RenewalOption[] = [];
    for (const k of ["A", "B", "C"]) {
      const price = Number(r[`${k}Value1`] ?? 0);
      if (price > 0) options.push({ label: optionLabel(r[`${k}Unit`]), price });
    }
    if (options.length === 0) continue;
    const offer = { currency: currencyLabel(r.APrice1, r.APrice1Name), bound: r.IsBind === "1" || r.IsBind === "true", options };
    // A mesma oferta pode aparecer em mais de uma aba da loja.
    if (!offers.some((o) => JSON.stringify(o) === JSON.stringify(offer))) offers.push(offer);
  }
  return offers;
}

// ------------------------------------------------------------------ atributos

const WEAPON_TYPES = new Set([7, 27]);
const ARMOR_TYPES = new Set([1, 2, 3, 4, 5, 6, 13, 15]);

/** Atributos do item; o 7º valor do jogo é a armadura das roupas ou o dano das armas. */
export function itemStats(item: GameItem): { label: string; value: string }[] {
  const a = item.attributes;
  const type = Number(a.type);
  const stats = [
    { label: "Ataque", value: a.attack },
    { label: "Defesa", value: a.defence },
    { label: "Agilidade", value: a.agility },
    { label: "Sorte", value: a.luck },
  ];
  if (WEAPON_TYPES.has(type)) stats.push({ label: "Dano", value: a.attribute7 });
  else if (ARMOR_TYPES.has(type)) stats.push({ label: "Armadura", value: a.attribute7 });
  return stats.map((s) => ({ label: s.label, value: s.value ?? "0" }));
}

const LEVELED_ACCESSORY_TYPES = new Set([8, 9]);

/** Pulseiras e anéis: Property1 é o nível (+N) e Property2 o EXP necessário para chegar nele. */
export function accessoryExp(item: GameItem): { level: number; exp: number } | null {
  const a = item.attributes;
  if (!LEVELED_ACCESSORY_TYPES.has(Number(a.type))) return null;
  const exp = Number(a.attribute2 ?? 0);
  if (!(exp > 0)) return null;
  return { level: Number(a.attribute1 ?? 0), exp };
}

// ------------------------------------------------------------------ filtro de categorias

/** Seções do filtro de categorias (como no outro painel); o que não estiver aqui cai em "Outros". */
export const CATEGORY_SECTIONS: { label: string; icon: string; categories: string[] }[] = [
  { label: "Equipamentos & Vestuário", icon: "👕", categories: ["Chapéu", "Óculos", "Cabelo", "Face", "Roupa", "Rosto", "Ternos", "Asas", "Balão de Fala", "Bordas"] },
  { label: "Armas & Combate", icon: "⚔️", categories: ["Arma", "Armas Secundárias", "Armas Concha"] },
  { label: "Acessórios & Joias", icon: "💍", categories: ["Pulseira", "Anel", "Colares", "Medalhas", "Títulos", "Contra-Marca", "Selo Contra-Marca", "Pérolas", "Inserir Jade"] },
  { label: "Pets & Montarias", icon: "🐾", categories: ["Pets", "Equip de Pet", "Comida Pets", "Formas de Pet", "Pets Elementais", "Habilidades Elementais", "Runas de Montaria", "Ilustração de Montaria"] },
  { label: "Evolução & Materiais", icon: "💎", categories: ["Itens de Up", "Pedra Mágica", "Pergaminhos Elementais", "Fragmentos", "Manuais"] },
  { label: "Baús & Cartas", icon: "🎁", categories: ["Pacotes", "Caixa de Cartões Normal", "Caixa de Cartões - Ouro ou Prata"] },
  { label: "Eventos & Outros", icon: "📦", categories: ["Itens de Evento", "Itens Gerais", "Itens Bagunçados", "Cadastros Manuais", "Outros"] },
];

/** Agrupa as categorias existentes nas seções, na ordem acima; as desconhecidas vão para a última. */
export function sectionsFor(categories: string[]): { label: string; icon: string; categories: string[] }[] {
  const known = new Set(CATEGORY_SECTIONS.flatMap((s) => s.categories));
  const present = new Set(categories);
  const sections = CATEGORY_SECTIONS.map((s) => ({ ...s, categories: s.categories.filter((c) => present.has(c)) }));
  const rest = categories.filter((c) => !known.has(c)).sort((a, b) => a.localeCompare(b));
  if (rest.length) sections[sections.length - 1].categories.push(...rest);
  return sections.filter((s) => s.categories.length > 0);
}
