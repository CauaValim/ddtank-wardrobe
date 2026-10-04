import { useMemo } from "react";
import type { ReactNode } from "react";
import { Package } from "lucide-react";
import { useGameData } from "@/hooks/useGameData";
import type { ItemLookup } from "@/components/GameDataModal";

type Row = Record<string, string>;

/** Shows official game data (equipped-set bonus + mount attributes) for one item. */
export function ItemGameExtras({
  itemId,
  lookup,
  fallback,
}: {
  itemId: string;
  suitId?: string;
  lookup?: ItemLookup;
  fallback?: ReactNode;
}) {
  const { data } = useGameData(["MountDrawTemplate", "SuitTemplateInfoList", "SuitPartEquipInfoList"]);

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
    const setParts = parts.filter((p) => p.ID === ownPart.ID);

    return { mount, suitName: suit?.SuitName, tiers, setParts, ownPart };
  }, [data, itemId]);

  if (!info) return null;
  const { mount, suitName, tiers, setParts, ownPart } = info as {
    mount?: Row;
    suitName?: string;
    tiers?: { count: number; text: string }[];
    setParts?: Row[];
    ownPart?: Row;
  };

  return (
    <>
      {mount && (
        <div className="w-full space-y-1.5">
          {mount.Name && (
            <div className="rounded-md bg-secondary px-2 py-1.5">
              <span className="text-[10px] text-muted-foreground">Descrição da montaria</span>
              <p className="text-xs text-card-foreground">{mount.Name}</p>
            </div>
          )}
          <div className="grid grid-cols-2 gap-1.5">
            {[["Dano", mount.AddHurt], ["Armadura", mount.AddGuard], ["Ataque Mágico", mount.MagicAttack], ["Resistência Mágica", mount.MagicDefence], ["Vida", mount.AddBlood]].map(([l, v]) => (
              <div key={l} className="rounded-md bg-secondary px-2 py-1">
                <span className="text-[10px] text-muted-foreground">{l}</span>
                <p className="text-xs font-medium text-card-foreground">{v || "0"}</p>
              </div>
            ))}
          </div>
        </div>
      )}
      {ownPart && tiers && tiers.length > 0 && (
        <div className="w-full rounded-md border border-primary/30 bg-primary/10 p-2">
          <p className="text-[10px] font-medium text-primary">Bônus de conjunto equipado{suitName ? ` — ${suitName}` : ""}</p>
          <div className="mt-1 space-y-1">
            {tiers.map((t) => (
              <div key={t.count} className="rounded bg-secondary px-2 py-1">
                <span className="text-[10px] text-muted-foreground">{t.count} peças equipadas</span>
                <p className="whitespace-pre-wrap text-xs leading-relaxed text-card-foreground">{t.text}</p>
              </div>
            ))}
          </div>
          {setParts && setParts.length > 0 && (
            <div className="mt-2 grid grid-cols-4 gap-1">
              {setParts.map((part) => {
                const ids = (part.ContainEquip ?? "").split(",").map((s) => s.trim()).filter(Boolean);
                const it = ids.map((id) => lookup?.(id)).find((x) => x?.image) ?? lookup?.(ids[0]);
                const isOwn = part === ownPart;
                return (
                  <div key={part.ContainEquip} title={part.PartName} className={`flex aspect-square items-center justify-center overflow-hidden rounded bg-secondary ${isOwn ? "ring-1 ring-primary" : ""}`}>
                    {it?.image ? <img src={it.image} alt={part.PartName} loading="lazy" className="h-full w-full object-contain" /> : <Package className="h-4 w-4 text-muted-foreground/40" />}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
      {!mount && fallback}
    </>
  );
}
