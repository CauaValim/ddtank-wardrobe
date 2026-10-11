/**
 * ID padrão de um item nos documentos:
 * - armas (tipos 7 e 27) sempre com o ID do nível +0: no jogo, os níveis +1 a +4 têm o ID da +0
 *   com um dígito a mais no fim e o mesmo nome (Lendaria• Fúria Ardente: 7240 → 72401…72404);
 * - todos os itens com a imagem da bolinha de EXP (pic "expmagicstone", ex.: Exp.Pedra Mágica)
 *   sempre como 1120218.
 */

export const EXP_STONE_ID = "1120218";
export const EXP_STONE_PIC = "expmagicstone";
const WEAPON_TYPES = new Set([7, 27]);

export interface CanonicalRow {
  id: number | string;
  name: string | null;
  type?: number | string | null;
  pic_path?: string | null;
}

const key = (name: string | null | undefined) =>
  (name ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();

const isWeapon = (row: CanonicalRow | undefined) => !!row && WEAPON_TYPES.has(Number(row.type));

/** ID da arma no nível +0 de onde este ID descende (ou null se não for nível de arma). */
export function weaponBaseId(id: string): string | null {
  return /^\d{5,}$/.test(id) ? id.slice(0, -1) : null;
}

/** IDs que precisam estar carregados para decidir o ID padrão de `id`. */
export function canonicalLookupIds(id: string): string[] {
  const ids = [id];
  for (let base = weaponBaseId(id); base; base = weaponBaseId(base)) ids.push(base);
  return ids;
}

/** ID padrão do item, a partir das linhas da tabela `items` (por ID). */
export function canonicalId(id: string, byId: (id: string) => CanonicalRow | undefined): string {
  const row = byId(id);
  if (!row) return id;
  if ((row.pic_path ?? "").trim().toLowerCase() === EXP_STONE_PIC) return EXP_STONE_ID;
  if (isWeapon(row)) {
    // Desce até a +0 enquanto o ID "pai" for uma arma com o mesmo nome.
    let current = id;
    let base = weaponBaseId(current);
    while (base) {
      const parent = byId(base);
      if (!isWeapon(parent) || key(parent?.name) !== key(row.name)) break;
      current = base;
      base = weaponBaseId(current);
    }
    return current;
  }
  return id;
}
