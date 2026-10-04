import { useEffect, useState } from "react";
import { Package, Copy, Check, PackageOpen } from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { getTypeName } from "@/lib/itemTypes";
import type { GameItem } from "@/types/item";
import { hasParsableContents } from "@/lib/packageDescParser";
import { ItemGameExtras } from "@/components/ItemGameExtras";
import type { ItemLookup } from "@/components/GameDataModal";

interface ItemDetailModalProps {
  item: GameItem | null;
  imageUrl?: string;
  open: boolean;
  onClose: () => void;
  canViewId?: boolean;
  realm?: "br" | "turco";
  onViewPackageContents?: (item: GameItem) => void;
  lookup?: ItemLookup;
}

export function ItemDetailModal({
  item,
  imageUrl,
  open,
  onClose,
  canViewId = true,
  realm = "br",
  onViewPackageContents,
  lookup,
}: ItemDetailModalProps) {
  const [copied, setCopied] = useState(false);
  const [hasContents, setHasContents] = useState(false);

  const itemId = item?.id;

  useEffect(() => {
    if (!itemId || !open) {
      setHasContents(false);
      return;
    }
    let cancelled = false;
    (async () => {
      const { count, error } = await supabase
        .from("package_contents")
        .select("*", { count: "exact", head: true })
        .eq("realm", realm)
        .eq("package_id", Number(itemId));
      if (cancelled) return;
      if (!error && count && count > 0) {
        setHasContents(true);
      } else {
        setHasContents(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [itemId, open, realm]);

  if (!item) return null;

  const copyId = async () => {
    await navigator.clipboard.writeText(item.id);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const typeName = getTypeName(item.attributes.type != null ? Number(item.attributes.type) : null);
  const showContentsButton = hasContents || hasParsableContents(item.attributes.desc);

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
            {showContentsButton && onViewPackageContents && (
              <button
                onClick={() => onViewPackageContents(item)}
                className="mt-2 flex items-center gap-1.5 rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 transition-colors"
              >
                <PackageOpen className="h-3.5 w-3.5" />
                Ver Conteúdo
              </button>
            )}
          </div>

          {item.attributes.desc && (
            <div className="w-full rounded-md bg-secondary px-2 py-1.5">
              <span className="text-[10px] text-muted-foreground">Descrição</span>
              <p className="text-xs text-card-foreground whitespace-pre-wrap">{item.attributes.desc}</p>
            </div>
          )}

          <ItemGameExtras
            itemId={String(item.id)}
            lookup={lookup}
            fallback={(
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
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}
