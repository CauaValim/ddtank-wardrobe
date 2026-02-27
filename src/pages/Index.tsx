import { useState } from "react";
import { Search, Package, Gamepad2, Tag } from "lucide-react";
import { useItemStore } from "@/hooks/useItemStore";
import { FileImporter } from "@/components/FileImporter";
import { ItemCard } from "@/components/ItemCard";
import { ItemDetailModal } from "@/components/ItemDetailModal";
import type { GameItem } from "@/types/item";

const Index = () => {
  const {
    items,
    totalCount,
    searchQuery,
    setSearchQuery,
    selectedCategory,
    setSelectedCategory,
    categories,
    addItems,
    addImages,
    getItemImage,
  } = useItemStore();

  const [selectedItem, setSelectedItem] = useState<GameItem | null>(null);

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

          <FileImporter onItemsLoaded={addItems} onImagesLoaded={addImages} />
        </div>
      </header>

      {/* Search, Categories & Stats */}
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
              {items.length === totalCount
                ? `${totalCount} itens`
                : `${items.length} de ${totalCount} itens`}
            </span>
          )}
        </div>

        {/* Category Filter */}
        {categories.length > 0 && (
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setSelectedCategory(null)}
              className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-all ${
                selectedCategory === null
                  ? "bg-primary text-primary-foreground"
                  : "border border-border bg-secondary text-secondary-foreground hover:bg-muted"
              }`}
            >
              <Tag className="h-3 w-3" />
              Todos
            </button>
            {categories.map((cat) => (
              <button
                key={cat}
                onClick={() => setSelectedCategory(selectedCategory === cat ? null : cat)}
                className={`rounded-full px-3 py-1.5 text-xs font-medium transition-all ${
                  selectedCategory === cat
                    ? "bg-primary text-primary-foreground"
                    : "border border-border bg-secondary text-secondary-foreground hover:bg-muted"
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Content */}
      <main className="mx-auto w-full max-w-7xl flex-1 px-4 pb-8 sm:px-6">
        {totalCount === 0 ? (
          <div className="flex flex-col items-center justify-center py-32 text-center">
            <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl border border-border bg-secondary">
              <Package className="h-8 w-8 text-muted-foreground/50" />
            </div>
            <h2 className="text-lg font-semibold text-foreground">
              Nenhum item carregado
            </h2>
            <p className="mt-1 max-w-sm text-sm text-muted-foreground">
              Importe um arquivo Excel (.xlsx) com colunas <span className="font-mono text-primary">ID</span> e{" "}
              <span className="font-mono text-primary">Nome</span>, e opcionalmente um .zip com imagens.
            </p>
          </div>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-32 text-center">
            <Search className="mb-4 h-10 w-10 text-muted-foreground/40" />
            <p className="text-sm text-muted-foreground">
              Nenhum resultado para "{searchQuery}"
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
            {items.map((item) => (
              <ItemCard
                key={item.id}
                item={item}
                imageUrl={getItemImage(item.id)}
                onClick={setSelectedItem}
              />
            ))}
          </div>
        )}
      </main>

      {/* Detail Modal */}
      <ItemDetailModal
        item={selectedItem}
        imageUrl={selectedItem ? getItemImage(selectedItem.id) : undefined}
        open={!!selectedItem}
        onClose={() => setSelectedItem(null)}
      />
    </div>
  );
};

export default Index;
