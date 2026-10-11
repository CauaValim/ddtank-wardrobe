// deno-lint-ignore-file no-explicit-any
// Conteúdo dos pacotes do jogo (LoadBoxTemp.xml) -> tabela package_contents (realm "br").

export const BOX_SOURCE = "http://quest132-ddt.337.com/LoadBoxTemp.xml";

export interface PackageRow {
  realm: string;
  package_id: number;
  content_item_id: number;
  quantity: number;
  valid_days: number;
  is_bind: boolean | null;
  content_name: string | null;
  position: number;
  source: "game";
}

/** Linhas do LoadBoxTemp.xml agrupadas por pacote, na ordem do jogo. */
export function packageRows(boxItems: Record<string, string>[], names: Map<number, string>): Map<number, PackageRow[]> {
  const byPackage = new Map<number, PackageRow[]>();
  for (const a of boxItems) {
    const pkg = Number(a.ID);
    const item = Number(a.TemplateId);
    if (!Number.isFinite(pkg) || !Number.isFinite(item) || !pkg || !item) continue;
    const list = byPackage.get(pkg) ?? [];
    list.push({
      realm: "br",
      package_id: pkg,
      content_item_id: item,
      quantity: Number(a.ItemCount) || 1,
      valid_days: Number(a.ItemValid) || 0,
      is_bind: a.IsBind == null ? null : a.IsBind === "true" || a.IsBind === "1",
      content_name: names.get(item) ?? null,
      position: list.length,
      source: "game",
    });
    byPackage.set(pkg, list);
  }
  return byPackage;
}

const signature = (rows: { content_item_id: number; quantity: number; valid_days: number; is_bind: boolean | null; content_name?: string | null }[]) =>
  rows.map((r) => `${r.content_item_id}*${r.quantity}*${r.valid_days}*${r.is_bind}*${r.content_name ?? ""}`).join("|");

/**
 * Substitui o conteúdo dos pacotes que mudaram no jogo (inclusive cadastros manuais desses
 * pacotes). Pacotes que o jogo não lista ficam como estão.
 */
export async function syncPackageContents(admin: any, byPackage: Map<number, PackageRow[]>) {
  const current = new Map<number, any[]>();
  for (let from = 0; ; from += 1000) {
    const { data, error } = await admin.from("package_contents")
      .select("package_id, content_item_id, quantity, valid_days, is_bind, content_name, position, source")
      .eq("realm", "br").order("package_id").order("position").range(from, from + 999);
    if (error) throw error;
    for (const r of data ?? []) current.set(r.package_id, [...(current.get(r.package_id) ?? []), r]);
    if (!data || data.length < 1000) break;
  }

  const changed = [...byPackage.keys()].filter((id) => {
    const old = current.get(id);
    return !old || old.some((r) => r.source !== "game") || signature(old) !== signature(byPackage.get(id)!);
  });

  for (let i = 0; i < changed.length; i += 200) {
    const chunk = changed.slice(i, i + 200);
    const { error } = await admin.from("package_contents").delete().eq("realm", "br").in("package_id", chunk);
    if (error) throw error;
  }
  const rows = changed.flatMap((id) => byPackage.get(id)!);
  for (let i = 0; i < rows.length; i += 1000) {
    const { error } = await admin.from("package_contents").insert(rows.slice(i, i + 1000));
    if (error) throw error;
  }
  return { packages: byPackage.size, updated: changed.length, rows: rows.length };
}
