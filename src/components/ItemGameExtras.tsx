import { Package } from "lucide-react";
import type { ItemGameExtras } from "@/hooks/useItemGameExtras";
import type { ItemLookup } from "@/components/GameDataModal";

type Row = Record<string, string>;

/** Atributos de montaria (MountDrawTemplate). */
export function MountStats({ mount }: { mount: Row }) {
  return (
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
  );
}

/** Bônus do conjunto e as peças dele (a peça do item em destaque). */
export function SuitInfo({ suit, lookup }: { suit: NonNullable<ItemGameExtras["suit"]>; lookup?: ItemLookup }) {
  return (
    <div className="w-full rounded-md border border-primary/30 bg-primary/10 p-2">
      <p className="text-[10px] font-medium text-primary">Pertence ao conjunto{suit.name ? ` — ${suit.name}` : ""}</p>
      {suit.tiers.length > 0 && (
        <div className="mt-1 space-y-1">
          {suit.tiers.map((t) => (
            <div key={t.count} className="rounded bg-secondary px-2 py-1">
              <span className="text-[10px] text-muted-foreground">{t.count} peças equipadas</span>
              <p className="whitespace-pre-wrap text-xs leading-relaxed text-card-foreground">{t.text}</p>
            </div>
          ))}
        </div>
      )}
      {suit.parts.length > 0 && (
        <div className="mt-2 grid grid-cols-4 gap-1">
          {suit.parts.map((part) => {
            const ids = (part.ContainEquip ?? "").split(",").map((s) => s.trim()).filter(Boolean);
            const it = ids.map((id) => lookup?.(id)).find((x) => x?.image) ?? lookup?.(ids[0]);
            return (
              <div key={part.ContainEquip} title={part.PartName} className={`flex aspect-square items-center justify-center overflow-hidden rounded bg-secondary ${part === suit.ownPart ? "ring-1 ring-primary" : ""}`}>
                {it?.image ? <img src={it.image} alt={part.PartName} loading="lazy" className="h-full w-full object-contain" /> : <Package className="h-4 w-4 text-muted-foreground/40" />}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
