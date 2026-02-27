import { memo } from "react";
import { Package } from "lucide-react";
import type { GameItem } from "@/types/item";

interface ItemCardProps {
  item: GameItem;
  imageUrl?: string;
  onClick: (item: GameItem) => void;
}

export const ItemCard = memo(function ItemCard({ item, imageUrl, onClick }: ItemCardProps) {
  return (
    <button
      onClick={() => onClick(item)}
      className="group flex flex-col overflow-hidden rounded-lg border border-border bg-card text-left transition-all hover:border-primary/40 hover:glow-primary animate-fade-in"
    >
      <div className="flex aspect-square items-center justify-center bg-secondary/50 p-3">
        {imageUrl ? (
          <img
            src={imageUrl}
            alt={item.name}
            className="h-full w-full object-contain transition-transform group-hover:scale-110"
            loading="lazy"
          />
        ) : (
          <Package className="h-10 w-10 text-muted-foreground/40" />
        )}
      </div>
      <div className="flex flex-col gap-1 p-3">
        <span className="font-mono text-xs font-semibold text-primary">
          #{item.id}
        </span>
        <span className="text-sm font-medium text-card-foreground line-clamp-2 leading-tight">
          {item.name}
        </span>
      </div>
    </button>
  );
});
