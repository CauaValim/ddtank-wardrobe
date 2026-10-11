import { useEffect, useMemo, useState } from "react";
import { useGameData } from "@/hooks/useGameData";
import { supabase } from "@/integrations/supabase/client";
import type { GameItem } from "@/types/item";

type Row = Record<string, string>;

// Pulseiras (8) e anéis (9) evoluem em sequência (+1, +2...): Property4 aponta para o nível anterior,
// e o conjunto do jogo lista só o item base da sequência.
const LEVELED_TYPES = new Set(["8", "9"]);
const MAX_LEVELS = 20;

/** IDs da sequência do item, do próprio item até o base (+0). */
function useLevelChain(item: GameItem | null | undefined): string[] {
  const [chain, setChain] = useState<string[]>([]);
  const id = item?.id ?? "";
  const prev = item?.attributes.attribute4 ?? "0";
  const leveled = LEVELED_TYPES.has(String(item?.attributes.type ?? ""));
  useEffect(() => {
    setChain(id ? [id] : []);
    if (!id || !leveled || !(Number(prev) > 0)) return;
    let cancelled = false;
    (async () => {
      const ids = [id];
      let next = prev;
      while (Number(next) > 0 && !ids.includes(next) && ids.length < MAX_LEVELS) {
        ids.push(next);
        const { data } = await supabase.from("items").select("attribute4").eq("id", Number(next)).maybeSingle();
        if (cancelled) return;
        next = (data as { attribute4?: string } | null)?.attribute4 ?? "0";
      }
      setChain(ids);
    })();
    return () => {
      cancelled = true;
    };
  }, [id, prev, leveled]);
  return chain;
}

/** Dados oficiais do jogo de um item: montaria (atributos) e conjunto (bônus equipado). */
export function useItemGameExtras(item: GameItem | null | undefined) {
  const { data, isLoading } = useGameData(["MountDrawTemplate", "SuitTemplateInfoList", "SuitPartEquipInfoList"]);
  const chain = useLevelChain(item);
  const itemId = item?.id ?? "";
  const info = useMemo(() => {
    if (!data) return null;
    const mount = data.MountDrawTemplate?.find((m) => m.TemplateId === itemId) as Row | undefined;
    const parts = (data.SuitPartEquipInfoList ?? []) as Row[];
    const contains = (p: Row, id: string) => (p.ContainEquip ?? "").split(",").map((s) => s.trim()).includes(id);
    // O próprio item primeiro; depois os níveis anteriores da sequência, até o base.
    let ownPart: Row | undefined;
    for (const id of chain) {
      ownPart = parts.find((p) => contains(p, id));
      if (ownPart) break;
    }
    if (!ownPart) return { mount };
    const suit = (data.SuitTemplateInfoList ?? []).find((s) => s.SuitId === ownPart.ID) as Row | undefined;
    const tiers = [1, 2, 3, 4, 5]
      .map((i) => ({ count: Number(suit?.[`EqipCount${i}`] ?? 0), text: (suit?.[`SkillDescribe${i}`] ?? "").trim() }))
      .filter((t) => t.count > 0 && t.text);
    return { mount, suit: { name: suit?.SuitName, tiers, parts: parts.filter((p) => p.ID === ownPart.ID), ownPart } };
  }, [data, itemId, chain]);
  return { loading: isLoading, mount: info?.mount, suit: info?.suit };
}

export type ItemGameExtras = ReturnType<typeof useItemGameExtras>;
