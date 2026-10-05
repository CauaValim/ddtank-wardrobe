import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { collectItemIds, isPanelId, lookupItems, type IdStatus, type ItemLookup } from "@/lib/eventTemplate/itemLookup";
import type { EventSection } from "@/lib/eventTemplate/types";

// Verifica no banco do painel os IDs usados no documento aberto. Os IDs já
// consultados ficam em memória; os que deram "não existe" são consultados de
// novo ao validar ou exportar (`ensure`), caso o item tenha sido cadastrado depois.
export function useEventItemLookup(doc: { sections: EventSection[] } | null) {
  const [lookup, setLookup] = useState<ItemLookup>(() => new Map());
  const lookupRef = useRef(lookup);
  lookupRef.current = lookup;

  const ids = useMemo(() => (doc ? collectItemIds(doc) : []), [doc]);
  const missingKey = ids.filter((id) => !lookup.has(id)).join(",");

  useEffect(() => {
    if (!missingKey) return;
    let cancelled = false;
    const handle = setTimeout(async () => {
      try {
        const found = await lookupItems(missingKey.split(","));
        if (!cancelled) setLookup((prev) => new Map([...prev, ...found]));
      } catch (err) {
        console.warn("Falha ao verificar IDs no painel:", err);
      }
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [missingKey]);

  const idStatus = useCallback((id: string): IdStatus => {
    if (!isPanelId(id)) return "unknown";
    const hit = lookup.get(id.trim());
    return hit === undefined ? "checking" : hit ? "known" : "unknown";
  }, [lookup]);

  const getImage = useCallback((id: string) => lookup.get(id.trim())?.imageUrl ?? "", [lookup]);

  const ensure = useCallback(async (target: { sections: EventSection[] }): Promise<ItemLookup> => {
    const current = lookupRef.current;
    const need = collectItemIds(target).filter((id) => !current.get(id));
    if (need.length === 0) return current;
    const found = await lookupItems(need);
    const merged = new Map([...lookupRef.current, ...found]);
    setLookup(merged);
    return merged;
  }, []);

  return { idStatus, getImage, ensure };
}
