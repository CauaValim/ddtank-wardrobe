import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { ItemRule } from "@/lib/eventTemplate/itemRules";
import type { ServerGroup } from "@/lib/eventTemplate/serverGroups";

/** Categorias permitidas/proibidas dos itens da base (antigos/novos): toda a equipe lê; ADM ou superior edita. */
export function useItemRules(group: ServerGroup | null) {
  const [rules, setRules] = useState<ItemRule[]>([]);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    if (!group) return;
    const { data, error } = await supabase
      .from("event_item_categories")
      .select("id, item_id, item_name, allowed, forbidden, note")
      .eq("server_group", group)
      .order("item_name");
    if (error) toast.error(`Categorias de itens: ${error.message}`);
    setRules((data ?? []) as ItemRule[]);
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
    };
    const { error } = rule.id
      ? await supabase.from("event_item_categories").update(payload).eq("id", rule.id)
      : await supabase.from("event_item_categories").insert(payload);
    if (error) {
      toast.error(error.code === "23505" ? "Esse item já está cadastrado: edite o cadastro existente" : `Não foi possível salvar: ${error.message}`);
      return false;
    }
    toast.success(rule.id ? "Cadastro atualizado" : "Item cadastrado");
    await reload();
    return true;
  }, [group, reload]);

  const remove = useCallback(async (id: string) => {
    const { error } = await supabase.from("event_item_categories").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Cadastro excluído");
    await reload();
  }, [reload]);

  return { rules, byItem, loading, save, remove };
}
