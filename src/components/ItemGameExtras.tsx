import { useMemo } from "react";
import type { ReactNode } from "react";
import { Package } from "lucide-react";
import { useGameData, n } from "@/hooks/useGameData";
import type { ItemLookup } from "@/components/GameDataModal";

/** Shows official game data (clothing set + mount attributes) for one item. */
export function ItemGameExtras({
  itemId,
  itemDescription,
  suitId,
  lookup,
  fallback,
}: {
  itemId: string;
  itemDescription?: string;
  suitId?: string;
  lookup?: ItemLookup;
  fallback?: ReactNode;
}) {
  const { data } = useGameData(["ClothPropertyTemplateInfo", "ClothGroupTemplateInfo", "MountDrawTemplate"]);

  const progressiveBonus = useMemo(() => {
    if (!suitId || suitId === "0" || !itemDescription) return null;
    const describesBonus = /(equipar|combin|atributo adicional|aumenta|reduz|ataque cr[ií]tico|prote[cç][aã]o)/i.test(itemDescription);
    return describesBonus ? itemDescription.trim() : null;
  }, [itemDescription, suitId]);

  const info = useMemo(() => {
    if (!data) return null;
    const mount = data.MountDrawTemplate?.find((m) => m.TemplateId === itemId);
    const g = data.ClothGroupTemplateInfo?.find((x) => x.TemplateID === itemId);
    if (!g) return { mount };
    const set = data.ClothPropertyTemplateInfo?.find((p) => p.ID === g.ID && p.Sex === g.Sex);
    const pieces = (data.ClothGroupTemplateInfo ?? []).filter((x) => x.ID === g.ID && x.Sex === g.Sex).map((x) => x.TemplateID);
    return { mount, set, pieces };
  }, [data, itemId]);

  if (!info) return null;
  const { mount, set, pieces } = info as { mount?: Record<string, string>; set?: Record<string, string>; pieces?: string[] };

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
      {set && pieces && (
        <div className="w-full rounded-md border border-border p-2">
          <p className="text-[10px] text-muted-foreground">Conjunto</p>
          <p className="text-xs font-bold text-card-foreground">{set.Name}</p>
          <p className="mt-1 text-[10px] font-medium text-muted-foreground">Bônus do conjunto completo</p>
          <div className="mt-1 flex flex-wrap gap-1">
            {[["Atq", set.Attack], ["Def", set.Defend], ["Agi", set.Agility], ["Sorte", set.Luck], ["Vida", set.Blood], ["Dano", set.Damage], ["Armadura", set.Guard]]
              .filter(([, v]) => n(v))
              .map(([k, v]) => (
                <span key={k} className="rounded bg-primary/15 px-1.5 py-0.5 text-[10px] font-medium text-primary">{k} +{v}</span>
              ))}
          </div>
          <div className="mt-2 grid grid-cols-4 gap-1">
            {pieces.map((id) => {
              const it = lookup?.(id);
              return (
                <div key={id} title={it?.name ?? id} className={`flex aspect-square items-center justify-center overflow-hidden rounded bg-secondary ${id === itemId ? "ring-1 ring-primary" : ""}`}>
                  {it?.image ? <img src={it.image} alt="" loading="lazy" className="h-full w-full object-contain" /> : <Package className="h-4 w-4 text-muted-foreground/40" />}
                </div>
              );
            })}
          </div>
        </div>
      )}
      {progressiveBonus && (
        <div className="w-full rounded-md border border-primary/30 bg-primary/10 p-2">
          <p className="text-[10px] font-medium text-primary">Bônus por peças equipadas</p>
          <p className="mt-1 whitespace-pre-wrap text-xs leading-relaxed text-card-foreground">{progressiveBonus}</p>
        </div>
      )}
      {!mount && fallback}
    </>
  );
}
