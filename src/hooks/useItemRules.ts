import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import type { ItemRule } from "@/lib/eventTemplate/itemRules";
import type { ServerGroup } from "@/lib/eventTemplate/serverGroups";

// Coluna nova (min_tiers): até a Lovable gerar os tipos dela, a gravação é sem tipos do banco.
const rulesTable = () => (supabase as unknown as SupabaseClient).from("event_item_categories");

/** Categorias permitidas/proibidas dos itens da base (antigos/novos): toda a equipe lê; ADM ou superior edita. */
export function useItemRules(group: ServerGroup | null) {
  const [rules, setRules] = useState<ItemRule[]>([]);
  const [loading, setLoading] = useState(true);
  /** false enquanto a coluna min_tiers (andar liberado) não existe no banco. */
  const [hasTiers, setHasTiers] = useState(true);

  const reload = useCallback(async () => {
    if (!group) return;
    const query = (columns: string) =>
      supabase.from("event_item_categories").select(columns).eq("server_group", group).order("item_name");
    let { data, error } = await query("id, item_id, item_name, allowed, forbidden, note, min_tiers");
    // Banco ainda sem a coluna dos andares: lê o cadastro sem ela.
    const withTiers = !error;
    if (error) ({ data, error } = await query("id, item_id, item_name, allowed, forbidden, note"));
    if (error) toast.error(`Categorias de itens: ${error.message}`);
    setHasTiers(withTiers);
    setRules(((data ?? []) as unknown as ItemRule[]).map((r) => ({ ...r, min_tiers: r.min_tiers ?? {} })));
    setLoading(false);
  }, [group]);

  useEffect(() => {
    reload();
  }, [reload]);

  const byItem = useMemo(() => new Map(rules.map((r) => [r.item_id, r])), [rules]);

  const save = useCallback(async (rule: Omit<ItemRule, "id"> & { id?: string }): Promise<boolean> => {
    if (!group) return false;
    const payload = {
      item_id: rule.item_id.trim(),
      item_name: rule.item_name.trim(),
      allowed: rule.allowed,
      forbidden: rule.forbidden,
      note: rule.note?.trim() || null,
      server_group: group,
      // Andar só vale em categoria permitida ou neutra.
      ...(hasTiers ? { min_tiers: Object.fromEntries(Object.entries(rule.min_tiers ?? {}).filter(([t, v]) => v && !rule.forbidden.includes(t))) } : {}),
    };
    if (!hasTiers && Object.values(rule.min_tiers ?? {}).some(Boolean)) {
      toast.error("O andar liberado ainda não existe no banco de dados. Peça para aplicar a migração dos andares.");
      return false;
    }
    const { error } = rule.id
      ? await rulesTable().update(payload).eq("id", rule.id)
      : await rulesTable().insert(payload);
    if (error) {
      toast.error(error.code === "23505" ? "Esse item já está cadastrado: edite o cadastro existente" : `Não foi possível salvar: ${error.message}`);
      return false;
    }
    toast.success(rule.id ? "Cadastro atualizado" : "Item cadastrado");
    await reload();
    return true;
  }, [group, reload, hasTiers]);

  const remove = useCallback(async (id: string) => {
    const { error } = await supabase.from("event_item_categories").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Cadastro excluído");
    await reload();
  }, [reload]);

  return { rules, byItem, loading, save, remove, hasTiers };
}
