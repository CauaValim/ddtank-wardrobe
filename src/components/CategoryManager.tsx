import { useState } from "react";
import { Plus, Trash2, Tag } from "lucide-react";
import type { Category } from "@/hooks/useCategories";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

interface CategoryManagerProps {
  categories: Category[];
  selectedCategory: string | null;
  onSelectCategory: (id: string | null) => void;
  onAddCategory: (name: string, color: string) => Promise<unknown>;
  onDeleteCategory: (id: string) => Promise<unknown>;
}

const PRESET_COLORS = [
  "#6366f1", "#ec4899", "#f59e0b", "#10b981",
  "#3b82f6", "#ef4444", "#8b5cf6", "#14b8a6",
];

export function CategoryManager({
  categories,
  selectedCategory,
  onSelectCategory,
  onAddCategory,
  onDeleteCategory,
}: CategoryManagerProps) {
  const [open, setOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newColor, setNewColor] = useState(PRESET_COLORS[0]);

  const handleAdd = async () => {
    if (!newName.trim()) return;
    await onAddCategory(newName.trim(), newColor);
    setNewName("");
    setNewColor(PRESET_COLORS[0]);
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      {/* All button */}
      <button
        onClick={() => onSelectCategory(null)}
        className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-all ${
          selectedCategory === null
            ? "bg-primary text-primary-foreground"
            : "border border-border bg-secondary text-secondary-foreground hover:bg-muted"
        }`}
      >
        <Tag className="h-3 w-3" />
        Todos
      </button>

      {/* Category chips */}
      {categories.map((cat) => (
        <button
          key={cat.id}
          onClick={() =>
            onSelectCategory(selectedCategory === cat.id ? null : cat.id)
          }
          className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-all ${
            selectedCategory === cat.id
              ? "text-primary-foreground"
              : "border border-border bg-secondary text-secondary-foreground hover:bg-muted"
          }`}
          style={
            selectedCategory === cat.id
              ? { backgroundColor: cat.color }
              : undefined
          }
        >
          <span
            className="inline-block h-2 w-2 rounded-full"
            style={{ backgroundColor: cat.color }}
          />
          {cat.name}
        </button>
      ))}

      {/* Manage categories dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <button className="flex items-center gap-1 rounded-full border border-dashed border-border px-3 py-1.5 text-xs font-medium text-muted-foreground transition-all hover:border-primary hover:text-primary">
            <Plus className="h-3 w-3" />
            Gerenciar
          </button>
        </DialogTrigger>
        <DialogContent className="max-w-sm border-border bg-card">
          <DialogTitle className="text-base font-bold text-card-foreground">
            Gerenciar Categorias
          </DialogTitle>

          {/* Add new */}
          <div className="space-y-3">
            <input
              type="text"
              placeholder="Nome da categoria..."
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleAdd()}
              className="w-full rounded-lg border border-border bg-secondary px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            />
            <div className="flex items-center gap-2">
              {PRESET_COLORS.map((c) => (
                <button
                  key={c}
                  onClick={() => setNewColor(c)}
                  className={`h-6 w-6 rounded-full border-2 transition-all ${
                    newColor === c ? "border-foreground scale-110" : "border-transparent"
                  }`}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
            <button
              onClick={handleAdd}
              disabled={!newName.trim()}
              className="w-full rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground transition-all hover:opacity-90 disabled:opacity-40"
            >
              Adicionar Categoria
            </button>
          </div>

          {/* Existing categories */}
          {categories.length > 0 && (
            <div className="mt-4 space-y-2">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Categorias existentes
              </h4>
              {categories.map((cat) => (
                <div
                  key={cat.id}
                  className="flex items-center justify-between rounded-lg border border-border bg-secondary px-3 py-2"
                >
                  <div className="flex items-center gap-2">
                    <span
                      className="h-3 w-3 rounded-full"
                      style={{ backgroundColor: cat.color }}
                    />
                    <span className="text-sm text-secondary-foreground">
                      {cat.name}
                    </span>
                  </div>
                  <button
                    onClick={() => onDeleteCategory(cat.id)}
                    className="rounded p-1 text-muted-foreground transition-colors hover:bg-destructive/20 hover:text-destructive"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
