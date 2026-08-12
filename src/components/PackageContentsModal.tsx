import { useEffect, useMemo, useState } from "react";
import { PackageOpen, X, Package } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import type { GameItem } from "@/types/item";
import type { Realm } from "@/hooks/useItemStore";
import { parsePackageDescription, normalizeItemName } from "@/lib/packageDescParser";

interface PackageContentEntry {
  content_item_id: number | null;
  name?: string;
  quantity: number;
  probability: string | null;
  imageUrl?: string;
}

interface PackageContentsModalProps {
  packageItem: GameItem | null;
  open: boolean;
  onClose: () => void;
  realm: Realm;
  items: GameItem[];
  getItemImage: (id: string) => string | undefined;
}

export function PackageContentsModal({
  packageItem,
  open,
  onClose,
  realm,
  items,
  getItemImage,
}: PackageContentsModalProps) {
  const [contents, setContents] = useState<PackageContentEntry[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || !packageItem) {
      setContents([]);
      return;
    }

    let cancelled = false;
    setLoading(true);

    (async () => {
      const { data, error } = await supabase
        .from("package_contents")
        .select("content_item_id, quantity, probability")
        .eq("realm", realm)
        .eq("package_id", Number(packageItem.id))
        .order("content_item_id", { ascending: true });

      if (cancelled) return;
      if (error) {
        console.error("Erro ao carregar conteúdo do pacote:", error);
        setContents([]);
      } else {
        setContents((data as PackageContentEntry[]) ?? []);
      }
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [open, packageItem, realm]);

  const nameIndex = useMemo(() => {
    const map = new Map<string, GameItem>();
    for (const i of items) {
      const key = normalizeItemName(i.name ?? "");
      if (key && !map.has(key)) map.set(key, i);
    }
    return map;
  }, [items]);

  // Busca aproximada: exata -> prefixo -> contém
  const findItem = useMemo(() => {
    const normalized = items.map((i) => ({
      item: i,
      key: normalizeItemName(i.name ?? ""),
    }));
    return (rawName: string): GameItem | undefined => {
      const key = normalizeItemName(rawName);
      if (!key) return undefined;
      const exact = nameIndex.get(key);
      if (exact) return exact;
      let best: { item: GameItem; diff: number } | undefined;
      for (const n of normalized) {
        if (!n.key) continue;
        if (n.key.startsWith(key) || key.startsWith(n.key) || n.key.includes(key)) {
          const diff = Math.abs(n.key.length - key.length);
          if (!best || diff < best.diff) best = { item: n.item, diff };
        }
      }
      return best && best.diff <= 12 ? best.item : undefined;
    };
  }, [items, nameIndex]);

  const fromDescription = useMemo<PackageContentEntry[]>(() => {
    if (!packageItem) return [];
    return parsePackageDescription(packageItem.attributes?.desc as string | undefined).map(
      (entry) => {
        const match = findItem(entry.name);
        return {
          content_item_id: match ? Number(match.id) : null,
          name: match?.name ?? entry.name,
          quantity: entry.quantity,
          probability: null,
          imageUrl: match ? getItemImage(match.id) || match.imageUrl : undefined,
        };
      },
    );
  }, [packageItem, findItem, getItemImage]);

  if (!open || !packageItem) return null;

  const itemMap = new Map(items.map((i) => [i.id, i]));

  const displayContents: PackageContentEntry[] =
    contents.length > 0 ? contents : fromDescription;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in zoom-in duration-200"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="package-contents-title"
    >
      <div
        className="bg-card w-full max-w-md rounded-3xl overflow-hidden shadow-2xl border border-border relative p-6 flex flex-col max-h-[85vh]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="absolute top-4 right-4 flex items-center gap-2 z-10">
          <button
            onClick={onClose}
            className="p-2 bg-secondary hover:bg-muted rounded-full transition cursor-pointer text-muted-foreground"
            aria-label="Fechar"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        <div className="flex items-center gap-3 mb-6">
          <div className="p-3 rounded-full bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400">
            <PackageOpen className="h-6 w-6" aria-hidden="true" />
          </div>
          <div className="pr-16">
            <h3
              id="package-contents-title"
              className="text-xl font-black text-card-foreground leading-tight line-clamp-2"
            >
              {packageItem.name}
            </h3>
            <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-500">
              Conteúdo do Baú
            </p>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto pr-2 space-y-2 relative">
          {loading ? (
            <p className="text-sm text-muted-foreground text-center py-8">
              Carregando conteúdo...
            </p>
          ) : displayContents.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <Package className="h-10 w-10 text-muted-foreground/40 mb-3" />
              <p className="text-sm text-muted-foreground">
                Nenhum item cadastrado no conteúdo deste pacote.
              </p>
            </div>
          ) : (
            displayContents.map((entry, idx) => {
              const contentItem =
                entry.content_item_id != null
                  ? itemMap.get(String(entry.content_item_id))
                  : undefined;
              const imageUrl =
                (contentItem
                  ? getItemImage(contentItem.id) || contentItem.imageUrl
                  : undefined) || entry.imageUrl;
              const name =
                contentItem?.name ??
                entry.name ??
                `Item #${entry.content_item_id}`;

              return (
                <div
                  key={`${entry.content_item_id ?? name}-${idx}`}
                  className="bg-secondary/50 p-3 rounded-xl border border-border flex items-center gap-3 hover:border-emerald-500/40 transition"
                >
                  <div className="w-12 h-12 rounded-lg bg-card flex items-center justify-center shrink-0 overflow-hidden relative ring-1 ring-emerald-500/60 shadow-[0_0_12px_rgba(16,185,129,0.3)] dark:shadow-[0_0_15px_rgba(16,185,129,0.2)]">
                    {imageUrl ? (
                      <img
                        alt={name}
                        className="w-full h-full object-contain p-1.5 hover:scale-110 transition-transform"
                        src={imageUrl}
                        loading="lazy"
                      />
                    ) : (
                      <Package className="h-6 w-6 text-muted-foreground/40" />
                    )}
                  </div>
                  <div className="overflow-hidden flex-1 pl-1">
                    <p
                      className="font-bold text-card-foreground text-xs truncate"
                      title={name}
                    >
                      {name}
                    </p>
                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                      {entry.content_item_id != null && (
                        <span className="text-[9px] font-mono text-muted-foreground">
                          #{entry.content_item_id}
                        </span>
                      )}
                      <span className="text-[9px] font-bold text-muted-foreground">
                        QTD: {entry.quantity}x
                      </span>
                      <span className="text-[9px] font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
                        Ilimitado
                      </span>
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    <span className="text-[9px] font-bold px-2 py-1.5 rounded-lg uppercase bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 border border-blue-200 dark:border-blue-800">
                      {entry.probability ?? "Probabilidade Desconhecida"}
                    </span>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
