import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { normalizeSections } from "@/lib/eventTemplate/model";
import { buildUsageIndex, visibleUsage, type ItemUsage, type UsageKind } from "@/lib/eventTemplate/usage";
import type { ServerGroup } from "@/lib/eventTemplate/serverGroups";

// Índice de uso dos itens por base (antigos/novos), montado a partir de todos os documentos
// e eventos anteriores dessa base. Fica em memória por alguns minutos entre as telas.
const TTL_MS = 3 * 60 * 1000;
const cache: Partial<Record<ServerGroup, { at: number; index: Promise<Map<string, ItemUsage[]>> }>> = {};

async function loadIndex(group: ServerGroup): Promise<Map<string, ItemUsage[]>> {
  const { data, error } = await supabase
    .from("event_documents")
    .select("id, title, theme, start_date, sections")
    .eq("server_group", group);
  if (error) throw error;
  return buildUsageIndex((data ?? []).map((row) => ({ ...row, sections: normalizeSections(row.sections).sections })));
}

export function invalidateItemUsage(group: ServerGroup) {
  delete cache[group];
}

export function useItemUsage(group: ServerGroup | null, currentDocId: string | null) {
  const [index, setIndex] = useState<Map<string, ItemUsage[]> | null>(null);

  useEffect(() => {
    if (!group) return;
    let cancelled = false;
    const hit = cache[group];
    if (!hit || Date.now() - hit.at > TTL_MS) cache[group] = { at: Date.now(), index: loadIndex(group) };
    cache[group]!.index
      .then((idx) => !cancelled && setIndex(idx))
      .catch((err) => {
        console.warn("Falha ao carregar o histórico de uso dos itens:", err);
        delete cache[group];
      });
    return () => {
      cancelled = true;
    };
  }, [group]);

  const getUsage = useCallback(
    (id: string): Record<UsageKind, ItemUsage[]> => visibleUsage(index?.get(id.trim()), currentDocId),
    [index, currentDocId],
  );

  return { getUsage, ready: index != null };
}
