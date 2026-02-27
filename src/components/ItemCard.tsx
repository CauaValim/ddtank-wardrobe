import { memo } from "react";
import { Package, Check } from "lucide-react";
import type { GameItem } from "@/types/item";
import type { Category } from "@/hooks/useCategories";

interface ItemCardProps {
  item: GameItem;
  imageUrl?: string;
  onClick: (item: GameItem) => void;
  categories?: Category[];
  selectionMode?: boolean;
  isSelected?: boolean;
  onToggleSelect?: (item: GameItem) => void;
}

export const ItemCard = memo(function ItemCard({
  item,
  imageUrl,
  onClick,
  categories,
  selectionMode,
  isSelected,
  onToggleSelect,
}: ItemCardProps) {
  const handleClick = () => {
    if (selectionMode && onToggleSelect) {
      onToggleSelect(item);
    } else {
      onClick(item);
    }
  };

  return (
    <button
      onClick={handleClick}
      className={`group relative flex flex-col overflow-hidden rounded-lg border text-left transition-all animate-fade-in ${
        isSelected
          ? "border-primary ring-2 ring-primary/30 bg-primary/5"
          : "border-border bg-card hover:border-primary/40"
      }`}
    >
      {/* Selection checkbox */}
      {selectionMode && (
        <div
          className={`absolute top-2 left-2 z-10 flex h-5 w-5 items-center justify-center rounded border transition-all ${
            isSelected
              ? "border-primary bg-primary"
              : "border-muted-foreground/40 bg-card/80"
          }`}
        >
          {isSelected && <Check className="h-3.5 w-3.5 text-primary-foreground" />}
        </div>
      )}

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
