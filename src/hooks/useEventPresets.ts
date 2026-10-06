import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { EventPreset, PresetData } from "@/lib/eventTemplate/presets";
import type { ServerGroup } from "@/lib/eventTemplate/serverGroups";
import type { Json } from "@/integrations/supabase/types";

/** Pré-definições de missão da base (antigos/novos): toda a equipe lê; ADM ou superior edita. */
export function useEventPresets(group: ServerGroup | null) {
  const [presets, setPresets] = useState<EventPreset[]>([]);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    if (!group) return;
    const { data, error } = await supabase
      .from("event_presets")
      .select("id, name, server_group, data, updated_at")
      .eq("server_group", group)
      .order("name");
    if (error) toast.error(`Pré-definições: ${error.message}`);
    setPresets(((data ?? []) as unknown as EventPreset[]).map((p) => ({ ...p, data: { fields: p.data?.fields ?? {}, groups: p.data?.groups ?? {} } })));
    setLoading(false);
  }, [group]);

  useEffect(() => {
    reload();
  }, [reload]);

  const save = useCallback(async (name: string, data: PresetData, id?: string): Promise<boolean> => {
    if (!group) return false;
    const payload = { name: name.trim(), data: data as unknown as Json, server_group: group };
    const { error } = id
      ? await supabase.from("event_presets").update(payload).eq("id", id)
      : await supabase.from("event_presets").insert(payload);
    if (error) {
      toast.error(`Não foi possível salvar a pré-definição: ${error.message}`);
      return false;
    }
    toast.success(id ? "Pré-definição atualizada" : "Pré-definição criada");
    await reload();
    return true;
  }, [group, reload]);

  const remove = useCallback(async (id: string) => {
    const { error } = await supabase.from("event_presets").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Pré-definição excluída");
    await reload();
  }, [reload]);

  return { presets, loading, save, remove, reload };
}
