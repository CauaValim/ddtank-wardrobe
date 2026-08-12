import { useState } from "react";
import { Package, Copy, Check, PackageOpen } from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { getTypeName } from "@/lib/itemTypes";
import type { GameItem } from "@/types/item";
import { ILUSTRACOES_ATTRIBUTES_BR, ILUSTRACOES_ATTRIBUTES_TR } from "@/data/ilustracoesAttributes";

interface ItemDetailModalProps {
  item: GameItem | null;
  imageUrl?: string;
  open: boolean;
  onClose: () => void;
  canViewId?: boolean;
  realm?: "br" | "turco";
  onViewPackageContents?: (item: GameItem) => void;
}

export function ItemDetailModal({
  item,
  imageUrl,
  open,
  onClose,
  canViewId = true,
  realm = "br",
}: ItemDetailModalProps) {
  const [copied, setCopied] = useState(false);

  if (!item) return null;

  const copyId = async () => {
    await navigator.clipboard.writeText(item.id);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const typeName = getTypeName(item.attributes.type != null ? Number(item.attributes.type) : null);
  const ilustracaoAttrs = (realm === "turco" ? ILUSTRACOES_ATTRIBUTES_TR : ILUSTRACOES_ATTRIBUTES_BR)[Number(item.id)];

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-xs border-border bg-card p-4">
        <DialogTitle className="sr-only">{item.name}</DialogTitle>
        <div className="flex flex-col items-center gap-3">
          <div className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-lg bg-secondary">
            {imageUrl ? (
              <img src={imageUrl} alt={item.name} className="h-full w-full object-contain" />
            ) : (
              <Package className="h-8 w-8 text-muted-foreground/40" />
            )}
          </div>

          <div className="text-center">
            <h2 className="text-sm font-bold text-card-foreground">{item.name}</h2>
            {canViewId && (
              <div className="mt-1 flex items-center justify-center gap-2">
                <span className="text-xs text-muted-foreground">ID: {item.id}</span>
                <button
                  onClick={copyId}
                  className="flex items-center gap-1 rounded-md border border-border bg-secondary px-1.5 py-0.5 text-[10px] text-secondary-foreground hover:bg-muted transition-colors"
                >
                  {copied ? <Check className="h-3 w-3 text-green-500" /> : <Copy className="h-3 w-3" />}
                  {copied ? "Copiado" : "Copiar"}
                </button>
              </div>
            )}
          </div>

          {item.attributes.desc && (
            <div className="w-full rounded-md bg-secondary px-2 py-1.5">
              <span className="text-[10px] text-muted-foreground">Descrição</span>
              <p className="text-xs text-card-foreground whitespace-pre-wrap">{item.attributes.desc}</p>
            </div>
          )}

          {ilustracaoAttrs ? (
            <div className="w-full grid grid-cols-2 gap-1.5">
              {[
                { label: "Dano", value: ilustracaoAttrs.dano },
                { label: "Armadura", value: ilustracaoAttrs.armadura },
                { label: "Ataque Mágico", value: ilustracaoAttrs.atkMag },
                { label: "Resistência Mágica", value: ilustracaoAttrs.resistMag },
                { label: "Vida", value: ilustracaoAttrs.vida },
              ].map((s) => (
                <div key={s.label} className="rounded-md bg-secondary px-2 py-1">
                  <span className="text-[10px] text-muted-foreground">{s.label}</span>
                  <p className="text-xs font-medium text-card-foreground">{s.value}</p>
                </div>
              ))}
            </div>
          ) : (
          <div className="w-full grid grid-cols-2 gap-1.5">
            {[
              { label: "Ataque", value: item.attributes.attack },
              { label: "Defesa", value: item.attributes.defence },
              { label: "Agilidade", value: item.attributes.agility },
              { label: "Sorte", value: item.attributes.luck },
              { label: "EXP", value: item.attributes.attribute2 },
            ]
              .filter((s) => s.value != null)
              .map((s) => (
                <div key={s.label} className="rounded-md bg-secondary px-2 py-1">
                  <span className="text-[10px] text-muted-foreground">{s.label}</span>
                  <p className="text-xs font-medium text-card-foreground">{s.value}</p>
                </div>
              ))}
          </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
