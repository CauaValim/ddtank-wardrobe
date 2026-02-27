import { memo } from "react";
import { Package } from "lucide-react";
import type { GameItem } from "@/types/item";
import type { Category } from "@/hooks/useCategories";

interface ItemCardProps {
  item: GameItem;
  imageUrl?: string;
  onClick: (item: GameItem) => void;
  categories?: Category[];
}

export const ItemCard = memo(function ItemCard({ item, imageUrl, onClick, categories }: ItemCardProps) {
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
        <span className="text-sm font-medium text-card-foreground line-clamp-2 leading-tight">
          {item.name}
        </span>
        {categories && categories.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {categories.map((cat) => (
              <span
                key={cat.id}
                className="inline-block rounded-full px-1.5 py-0.5 text-[10px] font-medium text-primary-foreground"
                style={{ backgroundColor: cat.color }}
              >
                {cat.name}
              </span>
            ))}
          </div>
        )}
      </div>
    </button>
  );
});
