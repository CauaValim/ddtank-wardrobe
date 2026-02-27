import { X, Copy, CheckCircle2 } from "lucide-react";
import { useState } from "react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Package } from "lucide-react";
import type { GameItem } from "@/types/item";

interface ItemDetailModalProps {
  item: GameItem | null;
  imageUrl?: string;
  open: boolean;
  onClose: () => void;
}

export function ItemDetailModal({ item, imageUrl, open, onClose }: ItemDetailModalProps) {
  const [copied, setCopied] = useState(false);

  if (!item) return null;

  const copyId = async () => {
    await navigator.clipboard.writeText(item.id);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md border-border bg-card p-0 overflow-hidden">
        <DialogTitle className="sr-only">{item.name}</DialogTitle>

        <div className="flex items-center justify-center bg-secondary/50 p-8">
          {imageUrl ? (
            <img
              src={imageUrl}
              alt={item.name}
              className="max-h-48 object-contain animate-scale-in"
            />
          ) : (
            <Package className="h-20 w-20 text-muted-foreground/30" />
          )}
        </div>

        <div className="flex flex-col gap-4 p-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold text-card-foreground">{item.name}</h2>
              <span className="font-mono text-sm text-primary">ID: {item.id}</span>
            </div>
            <button
              onClick={copyId}
              className="flex items-center gap-1.5 rounded-md border border-border bg-secondary px-3 py-1.5 text-xs font-medium text-secondary-foreground transition-all hover:bg-muted"
            >
              {copied ? (
                <>
                  <CheckCircle2 className="h-3.5 w-3.5 text-success" />
                  Copiado!
                </>
              ) : (
                <>
                  <Copy className="h-3.5 w-3.5" />
                  Copiar ID
                </>
              )}
            </button>
          </div>

          {Object.keys(item.attributes).length > 0 && (
            <div className="rounded-md border border-border bg-muted/50 p-3">
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Atributos
              </h3>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
                {Object.entries(item.attributes).map(([key, val]) => (
                  <div key={key} className="flex justify-between text-sm">
                    <span className="text-muted-foreground">{key}</span>
                    <span className="font-mono text-card-foreground">{val}</span>
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
