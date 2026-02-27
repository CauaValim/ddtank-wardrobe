import { ArrowRightLeft, X } from "lucide-react";
import { getTypeGroups, ITEM_TYPE_MAP } from "@/lib/itemTypes";

interface BulkTypeMoverProps {
  selectedCount: number;
  onBulkMove: (targetTypeNumber: number) => Promise<void>;
  onClearSelection: () => void;
}

export function BulkTypeMover({
  selectedCount,
  onBulkMove,
  onClearSelection,
}: BulkTypeMoverProps) {
  if (selectedCount === 0) return null;

  // Get all type groups for the move target list
  const allTypes = new Set(Object.keys(ITEM_TYPE_MAP).map(Number));
  const typeGroups = getTypeGroups(allTypes);

  return (
    <div className="sticky bottom-4 z-40 mx-auto max-w-2xl animate-fade-in">
      <div className="flex items-center gap-3 rounded-xl border border-border bg-card p-3 shadow-lg backdrop-blur-md">
        <div className="flex items-center gap-2">
          <ArrowRightLeft className="h-4 w-4 text-primary" />
          <span className="text-sm font-semibold text-card-foreground">
            {selectedCount} {selectedCount === 1 ? "item" : "itens"}
          </span>
        </div>

        <div className="flex flex-1 flex-wrap gap-1.5 max-h-32 overflow-y-auto">
          {typeGroups.map(([label, typeNumbers]) => (
            <button
              key={label}
              onClick={() => onBulkMove(typeNumbers[0])}
              className="flex items-center gap-1.5 rounded-full border border-border bg-secondary px-3 py-1 text-xs font-medium text-secondary-foreground transition-all hover:bg-primary hover:text-primary-foreground"
            >
              {label}
            </button>
          ))}
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
