import { useMemo } from "react";
import type { ReactNode } from "react";
import { Package } from "lucide-react";
import { useGameData } from "@/hooks/useGameData";
import type { ItemLookup } from "@/components/GameDataModal";

/** Shows official game data (clothing set + mount attributes) for one item. */
export function ItemGameExtras({
  itemId,
  suitId,
  lookup,
  fallback,
}: {
  itemId: string;
  suitId?: string;
  lookup?: ItemLookup;
  fallback?: ReactNode;
}) {
  const { data } = useGameData(["MountDrawTemplate", "TemplateAllList"]);

  const info = useMemo(() => {
    if (!data) return null;
    const mount = data.MountDrawTemplate?.find((m) => m.TemplateId === itemId);
    if (!suitId || suitId === "0") return { mount };

    const pieces = (data.TemplateAllList ?? []).filter((row) => row.SuitId === suitId);
    const bonusPattern = /(equipar|combin|atributo adicional|aumenta|reduz|ataque cr[ií]tico|prote[cç][aã]o)/i;
    const bonus = pieces
      .map((row) => row.Description?.trim() ?? "")
      .filter((description) => bonusPattern.test(description))
      .sort((a, b) => b.length - a.length)[0];

    return { mount, setBonus: bonus, setPieces: pieces };
  }, [data, itemId, suitId]);

  if (!info) return null;
  const { mount, setBonus, setPieces } = info as {
    mount?: Record<string, string>;
    setBonus?: string;
    setPieces?: Record<string, string>[];
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
      {setBonus && setPieces && (
        <div className="w-full rounded-md border border-primary/30 bg-primary/10 p-2">
          <p className="text-[10px] font-medium text-primary">Bônus por peças equipadas</p>
          <p className="mt-1 whitespace-pre-wrap text-xs leading-relaxed text-card-foreground">{setBonus}</p>
          <div className="mt-2 grid grid-cols-4 gap-1">
            {setPieces.map((piece) => {
              const id = piece.TemplateID;
              const it = lookup?.(id);
              return (
                <div key={id} title={it?.name ?? piece.Name ?? id} className={`flex aspect-square items-center justify-center overflow-hidden rounded bg-secondary ${id === itemId ? "ring-1 ring-primary" : ""}`}>
                  {it?.image ? <img src={it.image} alt="" loading="lazy" className="h-full w-full object-contain" /> : <Package className="h-4 w-4 text-muted-foreground/40" />}
                </div>
              );
            })}
          </div>
        </div>
      )}
      {!mount && fallback}
    </>
  );
}
