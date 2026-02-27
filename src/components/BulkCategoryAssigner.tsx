import { Tag, X, Check } from "lucide-react";
import type { Category } from "@/hooks/useCategories";

interface BulkCategoryAssignerProps {
  selectedCount: number;
  allCategories: Category[];
  onBulkAssign: (categoryId: string) => Promise<void>;
  onClearSelection: () => void;
}

export function BulkCategoryAssigner({
  selectedCount,
  allCategories,
  onBulkAssign,
  onClearSelection,
}: BulkCategoryAssignerProps) {
  if (selectedCount === 0) return null;

  return (
    <div className="sticky bottom-4 z-40 mx-auto max-w-xl animate-fade-in">
      <div className="flex items-center gap-3 rounded-xl border border-border bg-card p-3 shadow-lg backdrop-blur-md">
        <div className="flex items-center gap-2">
          <Tag className="h-4 w-4 text-primary" />
          <span className="text-sm font-semibold text-card-foreground">
            {selectedCount} {selectedCount === 1 ? "item" : "itens"}
          </span>
        </div>

        <div className="flex flex-1 flex-wrap gap-1.5">
          {allCategories.map((cat) => (
            <button
              key={cat.id}
              onClick={() => onBulkAssign(cat.id)}
              className="flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium text-primary-foreground transition-all hover:opacity-80"
              style={{ backgroundColor: cat.color }}
            >
              <span
                className="h-2 w-2 rounded-full border border-primary-foreground/30"
                style={{ backgroundColor: cat.color }}
              />
              {cat.name}
            </button>
          ))}
          {allCategories.length === 0 && (
            <span className="text-xs text-muted-foreground">
              Crie uma categoria primeiro
            </span>
          )}
        </div>

        <button
          onClick={onClearSelection}
          className="flex items-center gap-1 rounded-md border border-border bg-secondary px-2.5 py-1.5 text-xs font-medium text-secondary-foreground transition-all hover:bg-muted"
        >
          <X className="h-3.5 w-3.5" />
          Limpar
        </button>
      </div>
    </div>
  );
}
