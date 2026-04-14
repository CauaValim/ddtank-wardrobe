import { useState, useMemo, useCallback, useRef } from "react";
import { Search, Package, Gamepad2, MousePointerClick, CheckSquare, LogOut, Users, FileSpreadsheet, Tag } from "lucide-react";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { useNavigate } from "react-router-dom";
import { useItemStore } from "@/hooks/useItemStore";
import { FileImporter } from "@/components/FileImporter";
import { ItemCard } from "@/components/ItemCard";
import { ItemDetailModal } from "@/components/ItemDetailModal";
import { BulkTypeMover } from "@/components/BulkTypeMover";
import { IdFillerModal } from "@/components/IdFillerModal";
import { getTypeName, getTypeGroups, HIDDEN_TYPES } from "@/lib/itemTypes";
import { useCategories } from "@/hooks/useCategories";
import type { GameItem } from "@/types/item";
import type { useAuth } from "@/hooks/useAuth";

interface IndexProps {
  auth: ReturnType<typeof useAuth>;
}

const Index = ({ auth }: IndexProps) => {
  const navigate = useNavigate();
  const {
    items,
    totalCount,
    searchQuery,
    setSearchQuery,
    addItems,
    addImages,
    getItemImage,
    loading,
    updateItemType,
    syncDescriptions,
  } = useItemStore();

  const { categories, getItemCategories, itemCategoryMap } = useCategories();

  const [selectedItem, setSelectedItem] = useState<GameItem | null>(null);
  const [selectedType, setSelectedType] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [idFillerOpen, setIdFillerOpen] = useState(false);

  // Multi-select state
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Get unique types from items, grouped by category name
  const typeGroups = useMemo(() => {
    const existingTypes = new Set<number>();
    items.forEach((item) => {
      const t = item.attributes.type != null ? Number(item.attributes.type) : null;
      if (t != null && !isNaN(t) && !HIDDEN_TYPES.has(t)) {
        existingTypes.add(t);
      }
    });
    return getTypeGroups(existingTypes);
  }, [items]);

  // Filter items by type and category
  const filteredItems = useMemo(() => {
    let result = items;
    if (selectedType != null) {
      const matchingGroup = typeGroups.find(([name]) => name === selectedType);
      const typeNumbers = matchingGroup ? matchingGroup[1] : [];
      result = result.filter((item) => typeNumbers.includes(Number(item.attributes.type)));
    }
    if (selectedCategory != null) {
      result = result.filter((item) => {
        const catIds = itemCategoryMap.get(Number(item.id)) ?? [];
        return catIds.includes(selectedCategory);
      });
    }
    return result;
  }, [items, selectedType, typeGroups, selectedCategory, itemCategoryMap]);

  // Categories that have items
  const activeCategories = useMemo(() => {
    const catItemCounts = new Map<string, number>();
    itemCategoryMap.forEach((catIds) => {
      catIds.forEach((cid) => catItemCounts.set(cid, (catItemCounts.get(cid) ?? 0) + 1));
    });
    return categories.filter((c) => (catItemCounts.get(c.id) ?? 0) > 0);
  }, [categories, itemCategoryMap]);

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

  const selectAllOfType = useCallback((typeName: string) => {
    const matchingGroup = typeGroups.find(([name]) => name === typeName);
    const typeNumbers = matchingGroup ? matchingGroup[1] : [];
    const ids = filteredItems
      .filter((item) => typeNumbers.includes(Number(item.attributes.type)))
      .map((i) => i.id);
    setSelectedIds((prev) => {
      const next = new Set(prev);
      ids.forEach((id) => next.add(id));
      return next;
    });
    setSelectionMode(true);
  }, [filteredItems, typeGroups]);

  const clearSelection = useCallback(() => {
    setSelectedIds(new Set());
    setSelectionMode(false);
  }, []);

  const handleBulkMove = useCallback(async (targetType: number) => {
    const ids = Array.from(selectedIds);
    await updateItemType(ids, targetType);
    clearSelection();
  }, [selectedIds, updateItemType, clearSelection]);

  return (
    <div className="flex min-h-screen flex-col bg-background">
      {/* Header */}
      <header className="sticky top-0 z-30 border-b border-border bg-background/80 backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4 sm:px-6">
          <div className="flex items-center gap-3">
            <SidebarTrigger className="-ml-1" />
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary">
              <Gamepad2 className="h-5 w-5 text-primary-foreground" />
            </div>
            <div>
              <h1 className="text-lg font-bold leading-tight text-foreground">
                Painel Staff DDTank 337
              </h1>
              <p className="text-xs text-muted-foreground">
                {auth.role === "super_admin" ? "Super Admin" : auth.role === "admin" ? "ADM" : auth.role === "analista" ? "Analista" : "Moderador"}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {auth.canSelect && (
              <>
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
              </>
            )}
            {auth.canImport && (
              <FileImporter onItemsLoaded={addItems} onImagesLoaded={addImages} onSyncDescriptions={syncDescriptions} canImportImages={auth.canImportImages} canSyncDescriptions={auth.canSyncDescriptions} />
            )}
            {(auth.role === "super_admin" || auth.role === "admin") && (
              <button
                onClick={() => setIdFillerOpen(true)}
                className="flex items-center gap-1.5 rounded-md border border-border bg-secondary px-3 py-1.5 text-xs font-medium text-secondary-foreground hover:bg-muted transition-all"
                title="Preencher IDs no Documento"
              >
                <FileSpreadsheet className="h-3.5 w-3.5" />
              </button>
            )}
            {auth.role === "super_admin" && (
              <button
                onClick={() => navigate("/users")}
                className="flex items-center gap-1.5 rounded-md border border-border bg-secondary px-3 py-1.5 text-xs font-medium text-secondary-foreground hover:bg-muted transition-all"
                title="Gerenciar Usuários"
              >
                <Users className="h-3.5 w-3.5" />
              </button>
            )}
            <button
              onClick={auth.signOut}
              className="flex items-center gap-1.5 rounded-md border border-border bg-secondary px-3 py-1.5 text-xs font-medium text-secondary-foreground hover:bg-muted transition-all"
              title="Sair"
            >
              <LogOut className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </header>

      {/* Search & Types */}
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
        {typeGroups.length > 0 && (
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
              {typeGroups.map(([label]) => (
                <div key={label} className="flex items-center gap-0.5">
                  <button
                    onClick={() => setSelectedType(selectedType === label ? null : label)}
                    className={`rounded-full px-3 py-1 text-xs font-medium transition-all ${
                      selectedType === label
                        ? "bg-accent text-accent-foreground"
                        : "border border-border bg-secondary text-secondary-foreground hover:bg-muted"
                    }`}
                  >
                    {label}
                  </button>
                  {selectionMode && auth.canSelect && (
                    <button
                      onClick={() => selectAllOfType(label)}
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
                selectionMode={auth.canSelect && selectionMode}
                isSelected={selectedIds.has(item.id)}
                onToggleSelect={toggleSelect}
              />
            ))}
          </div>
        )}
      </main>

      {/* Bulk Type Mover */}
      <BulkTypeMover
        selectedCount={selectedIds.size}
        onBulkMove={handleBulkMove}
        onClearSelection={clearSelection}
      />

      {/* Detail Modal */}
      <ItemDetailModal
        item={selectedItem}
        imageUrl={selectedItem ? getItemImage(selectedItem.id) : undefined}
        open={!!selectedItem}
        onClose={() => setSelectedItem(null)}
        canViewId={auth.canViewId}
      />

      <IdFillerModal open={idFillerOpen} onClose={() => setIdFillerOpen(false)} />
    </div>
  );
};

export default Index;
