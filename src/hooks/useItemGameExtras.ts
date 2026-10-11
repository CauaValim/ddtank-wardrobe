import { useMemo } from "react";
import { useGameData } from "@/hooks/useGameData";

type Row = Record<string, string>;

/** Dados oficiais do jogo de um item: montaria (atributos) e conjunto (bônus equipado). */
export function useItemGameExtras(itemId: string) {
  const { data, isLoading } = useGameData(["MountDrawTemplate", "SuitTemplateInfoList", "SuitPartEquipInfoList"]);
  const info = useMemo(() => {
    if (!data) return null;
    const mount = data.MountDrawTemplate?.find((m) => m.TemplateId === itemId) as Row | undefined;
    const parts = (data.SuitPartEquipInfoList ?? []) as Row[];
    const ownPart = parts.find((p) => (p.ContainEquip ?? "").split(",").map((s) => s.trim()).includes(itemId));
    if (!ownPart) return { mount };
    const suit = (data.SuitTemplateInfoList ?? []).find((s) => s.SuitId === ownPart.ID) as Row | undefined;
    const tiers = [1, 2, 3, 4, 5]
      .map((i) => ({ count: Number(suit?.[`EqipCount${i}`] ?? 0), text: (suit?.[`SkillDescribe${i}`] ?? "").trim() }))
      .filter((t) => t.count > 0 && t.text);
    return { mount, suit: { name: suit?.SuitName, tiers, parts: parts.filter((p) => p.ID === ownPart.ID), ownPart } };
  }, [data, itemId]);
  return { loading: isLoading, mount: info?.mount, suit: info?.suit };
}

export type ItemGameExtras = ReturnType<typeof useItemGameExtras>;

