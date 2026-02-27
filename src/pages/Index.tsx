import { useState, useMemo, useCallback, useRef } from "react";
import { Search, Package, Gamepad2, MousePointerClick, CheckSquare } from "lucide-react";
import { useItemStore } from "@/hooks/useItemStore";
import { useCategories } from "@/hooks/useCategories";
import { FileImporter } from "@/components/FileImporter";
import { ItemCard } from "@/components/ItemCard";
import { ItemDetailModal } from "@/components/ItemDetailModal";
import { CategoryManager } from "@/components/CategoryManager";
import { BulkCategoryAssigner } from "@/components/BulkCategoryAssigner";
import { getTypeName } from "@/lib/itemTypes";
import type { GameItem } from "@/types/item";

const Index = () => {
  const {
    items,
    totalCount,
    searchQuery,
    setSearchQuery,
    addItems,
    addImages,
    getItemImage,
    loading,
  } = useItemStore();

  const {
    categories,
    addCategory,
    deleteCategory,
    assignItem,
    unassignItem,
    getItemCategories,
    itemCategoryMap,
  } = useCategories();

  const [selectedItem, setSelectedItem] = useState<GameItem | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [selectedType, setSelectedType] = useState<number | null>(null);

  // Multi-select state
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Get unique types from items
  const itemTypes = useMemo(() => {
    const types = new Map<number, string>();
    items.forEach((item) => {
      const t = item.attributes.type != null ? Number(item.attributes.type) : null;
      if (t != null && !isNaN(t)) {
        types.set(t, getTypeName(t));
      }
    });
    return Array.from(types.entries()).sort((a, b) => a[0] - b[0]);
  }, [items]);

  // Filter items by type and category
  const filteredItems = useMemo(() => {
    let result = items;
    if (selectedType != null) {
      result = result.filter((item) => Number(item.attributes.type) === selectedType);
    }
    if (selectedCategory) {
      result = result.filter((item) => {
        const catIds = itemCategoryMap.get(Number(item.id)) ?? [];
        return catIds.includes(selectedCategory);
      });
    }
    return result;
  }, [items, selectedType, selectedCategory, itemCategoryMap]);

  const lastSelectedIndex = useRef<number | null>(null);

  const toggleSelect = useCallback((item: GameItem, shiftKey?: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (shiftKey && lastSelectedIndex.current != null) {
        const currentIndex = filteredItems.findIndex((i) => i.id === item.id);
        if (currentIndex >= 0) {
          const start = Math.min(lastSelectedIndex.current, currentIndex);
          const end = Math.max(lastSelectedIndex.current, currentIndex);
          for (let i = start; i <= end; i++) {
            next.add(filteredItems[i].id);
          }
          return next;
        }
      }
      if (next.has(item.id)) {
        next.delete(item.id);
      } else {
        next.add(item.id);
      }
      return next;
    });
    const idx = filteredItems.findIndex((i) => i.id === item.id);
    if (idx >= 0) lastSelectedIndex.current = idx;
  }, [filteredItems]);

  const selectAllVisible = useCallback(() => {
    setSelectedIds(new Set(filteredItems.map((i) => i.id)));
    setSelectionMode(true);
  }, [filteredItems]);

  const selectAllOfType = useCallback((type: number) => {
    const ids = filteredItems
      .filter((item) => Number(item.attributes.type) === type)
      .map((i) => i.id);
    setSelectedIds((prev) => {
      const next = new Set(prev);
      ids.forEach((id) => next.add(id));
      return next;
    });
    setSelectionMode(true);
  }, [filteredItems]);

  const clearSelection = useCallback(() => {
    setSelectedIds(new Set());
    setSelectionMode(false);
  }, []);

  const handleBulkAssign = useCallback(async (categoryId: string) => {
    const ids = Array.from(selectedIds);
    await Promise.all(ids.map((id) => assignItem(Number(id), categoryId)));
    clearSelection();
  }, [selectedIds, assignItem, clearSelection]);

  return (
    <div className="flex min-h-screen flex-col bg-background">
      {/* Header */}
      <header className="sticky top-0 z-30 border-b border-border bg-background/80 backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4 sm:px-6">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary">
              <Gamepad2 className="h-5 w-5 text-primary-foreground" />
            </div>
            <div>
              <h1 className="text-lg font-bold leading-tight text-foreground">
                DDTank Item Panel
              </h1>
              <p className="text-xs text-muted-foreground">
                Painel de Moderação
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                setSelectionMode(!selectionMode);
                if (selectionMode) setSelectedIds(new Set());
              }}
              className={`flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium transition-all ${
                selectionMode
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-secondary text-secondary-foreground hover:bg-muted"
              }`}
            >
              <MousePointerClick className="h-3.5 w-3.5" />
              {selectionMode ? "Selecionando" : "Selecionar"}
            </button>
            {selectionMode && (
              <button
                onClick={selectAllVisible}
                className="flex items-center gap-1.5 rounded-md border border-border bg-secondary px-3 py-1.5 text-xs font-medium text-secondary-foreground hover:bg-muted transition-all"
              >
                <CheckSquare className="h-3.5 w-3.5" />
                Todos ({filteredItems.length})
              </button>
            )}
            <FileImporter onItemsLoaded={addItems} onImagesLoaded={addImages} />
          </div>
        </div>
      </header>

      {/* Search, Types, Categories & Stats */}
      <div className="mx-auto w-full max-w-7xl px-4 py-4 sm:px-6 space-y-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative max-w-md flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              placeholder="Buscar por Nome ou ID..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full rounded-lg border border-border bg-secondary pl-10 pr-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary transition-colors"
            />
          </div>
          {totalCount > 0 && (
            <span className="text-sm text-muted-foreground">
              {filteredItems.length === totalCount
                ? `${totalCount} itens`
                : `${filteredItems.length} de ${totalCount} itens`}
            </span>
          )}
        </div>

        {/* Type filter */}
        {itemTypes.length > 0 && (
          <div className="space-y-1.5">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Tipo
            </span>
            <div className="flex flex-wrap gap-1.5">
              <button
                onClick={() => setSelectedType(null)}
                className={`rounded-full px-3 py-1 text-xs font-medium transition-all ${
                  selectedType === null
                    ? "bg-accent text-accent-foreground"
                    : "border border-border bg-secondary text-secondary-foreground hover:bg-muted"
                }`}
              >
                Todos
              </button>
              {itemTypes.map(([type, label]) => (
                <div key={type} className="flex items-center gap-0.5">
                  <button
                    onClick={() => setSelectedType(selectedType === type ? null : type)}
                    className={`rounded-full px-3 py-1 text-xs font-medium transition-all ${
                      selectedType === type
                        ? "bg-accent text-accent-foreground"
                        : "border border-border bg-secondary text-secondary-foreground hover:bg-muted"
                    }`}
                  >
                    {label}
                  </button>
                  {selectionMode && (
                    <button
                      onClick={() => selectAllOfType(type)}
                      className="rounded-full p-1 text-muted-foreground hover:text-primary hover:bg-muted transition-all"
                      title={`Selecionar todos "${label}"`}
                    >
                      <CheckSquare className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Category Filter */}
        <CategoryManager
          categories={categories}
          selectedCategory={selectedCategory}
          onSelectCategory={setSelectedCategory}
          onAddCategory={addCategory}
          onDeleteCategory={deleteCategory}
        />
      </div>

      {/* Content */}
      <main className="mx-auto w-full max-w-7xl flex-1 px-4 pb-8 sm:px-6">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-32 text-center">
            <p className="text-sm text-muted-foreground">Carregando itens...</p>
          </div>
        ) : totalCount === 0 ? (
          <div className="flex flex-col items-center justify-center py-32 text-center">
            <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl border border-border bg-secondary">
              <Package className="h-8 w-8 text-muted-foreground/50" />
            </div>
            <h2 className="text-lg font-semibold text-foreground">
              Nenhum item carregado
            </h2>
            <p className="mt-1 max-w-sm text-sm text-muted-foreground">
              Importe um arquivo Excel (.xlsx) ou JSON com os itens, e opcionalmente um .zip com imagens.
            </p>
          </div>
        ) : filteredItems.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-32 text-center">
            <Search className="mb-4 h-10 w-10 text-muted-foreground/40" />
            <p className="text-sm text-muted-foreground">
              Nenhum resultado encontrado
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
            {filteredItems.map((item) => (
              <ItemCard
                key={item.id}
                item={item}
                imageUrl={getItemImage(item.id)}
                onClick={setSelectedItem}
                categories={getItemCategories(Number(item.id))}
                selectionMode={selectionMode}
                isSelected={selectedIds.has(item.id)}
                onToggleSelect={toggleSelect}
              />
            ))}
          </div>
        )}
      </main>

      {/* Bulk Category Assigner */}
      <BulkCategoryAssigner
        selectedCount={selectedIds.size}
        allCategories={categories}
        onBulkAssign={handleBulkAssign}
        onClearSelection={clearSelection}
      />

      {/* Detail Modal */}
      <ItemDetailModal
        item={selectedItem}
        imageUrl={selectedItem ? getItemImage(selectedItem.id) : undefined}
        open={!!selectedItem}
        onClose={() => setSelectedItem(null)}
        allCategories={categories}
        assignedCategories={selectedItem ? getItemCategories(Number(selectedItem.id)) : []}
        onAssign={assignItem}
        onUnassign={unassignItem}
      />
    </div>
  );
};

export default Index;
