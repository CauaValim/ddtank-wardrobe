import { Check, Tag } from "lucide-react";
import type { Category } from "@/hooks/useCategories";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

interface ItemCategoryAssignerProps {
  itemId: number;
  allCategories: Category[];
  assignedCategories: Category[];
  onAssign: (itemId: number, categoryId: string) => Promise<unknown>;
  onUnassign: (itemId: number, categoryId: string) => Promise<unknown>;
}

export function ItemCategoryAssigner({
  itemId,
  allCategories,
  assignedCategories,
  onAssign,
  onUnassign,
}: ItemCategoryAssignerProps) {
  const assignedIds = new Set(assignedCategories.map((c) => c.id));

  const toggleCategory = async (catId: string) => {
    if (assignedIds.has(catId)) {
      await onUnassign(itemId, catId);
    } else {
      await onAssign(itemId, catId);
    }
  };

  if (allCategories.length === 0) return null;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button className="flex items-center gap-1.5 rounded-md border border-border bg-secondary px-3 py-1.5 text-xs font-medium text-secondary-foreground transition-all hover:bg-muted">
          <Tag className="h-3.5 w-3.5" />
          Categorias
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-56 border-border bg-card p-2" align="start">
        <p className="mb-2 px-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Vincular categorias
        </p>
        {allCategories.map((cat) => {
          const isAssigned = assignedIds.has(cat.id);
          return (
            <button
              key={cat.id}
              onClick={() => toggleCategory(cat.id)}
              className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm text-card-foreground transition-colors hover:bg-muted"
            >
              <span
                className="h-3 w-3 rounded-full"
                style={{ backgroundColor: cat.color }}
              />
              <span className="flex-1 text-left">{cat.name}</span>
              {isAssigned && (
                <Check className="h-3.5 w-3.5 text-primary" />
              )}
            </button>
          );
        })}
      </PopoverContent>
    </Popover>
  );
}
