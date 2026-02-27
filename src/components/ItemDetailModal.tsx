import { useState } from "react";
import { Package, Copy, Check } from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { getTypeName } from "@/lib/itemTypes";
import type { GameItem } from "@/types/item";

interface ItemDetailModalProps {
  item: GameItem | null;
  imageUrl?: string;
  open: boolean;
  onClose: () => void;
}

export function ItemDetailModal({
  item,
  imageUrl,
  open,
  onClose,
}: ItemDetailModalProps) {
  const [copied, setCopied] = useState(false);

  if (!item) return null;

  const copyId = async () => {
    await navigator.clipboard.writeText(item.id);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const typeName = getTypeName(item.attributes.type != null ? Number(item.attributes.type) : null);

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md border-border bg-card">
        <DialogTitle className="sr-only">{item.name}</DialogTitle>
        <div className="flex flex-col items-center gap-4">
          <div className="flex h-32 w-32 items-center justify-center overflow-hidden rounded-xl bg-secondary">
            {imageUrl ? (
              <img src={imageUrl} alt={item.name} className="h-full w-full object-contain" />
            ) : (
              <Package className="h-12 w-12 text-muted-foreground/40" />
            )}
          </div>

          <div className="text-center">
            <h2 className="text-lg font-bold text-card-foreground">{item.name}</h2>
            <div className="mt-1 flex items-center justify-center gap-2">
              <span className="text-sm text-muted-foreground">ID: {item.id}</span>
              <button
                onClick={copyId}
                className="flex items-center gap-1 rounded-md border border-border bg-secondary px-2 py-0.5 text-xs text-secondary-foreground hover:bg-muted transition-colors"
              >
                {copied ? <Check className="h-3 w-3 text-green-500" /> : <Copy className="h-3 w-3" />}
                {copied ? "Copiado" : "Copiar ID"}
              </button>
            </div>
          </div>

          {typeName && (
            <span className="rounded-full bg-secondary px-3 py-1 text-xs font-medium text-muted-foreground">
              {typeName}
            </span>
          )}

          {Object.keys(item.attributes).length > 0 && (
            <div className="w-full space-y-1.5">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Atributos</p>
              <div className="grid grid-cols-2 gap-1.5">
                {Object.entries(item.attributes).map(([key, val]) => (
                  <div key={key} className="rounded-md bg-secondary px-2 py-1">
                    <span className="text-[10px] text-muted-foreground">{key}</span>
                    <p className="truncate text-xs font-medium text-card-foreground">{val}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
