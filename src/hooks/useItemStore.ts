import { useState, useMemo, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import type { ImportedImage } from "@/lib/fileParser";
import type { GameItem } from "@/types/item";
import { LAST_UPDATE_SEED } from "@/data/lastUpdateNovidades";
import { FUGURAS_SEED } from "@/data/fuguras";

function loadNovidades(realm: Realm): Set<string> {
  try {
    const seed = LAST_UPDATE_SEED[realm];
    const seedKey = `novidades-seed-${realm}`;
    const raw = localStorage.getItem(`novidades-${realm}`);
    const existing: string[] = raw ? (JSON.parse(raw) ?? []) : [];
    const set = new Set(existing.map(String));
    if (seed && seed.key && seed.ids.length > 0) {
      const applied = localStorage.getItem(seedKey);
      if (applied !== seed.key) {
        seed.ids.forEach((id) => set.add(String(id)));
        localStorage.setItem(`novidades-${realm}`, JSON.stringify(Array.from(set)));
        localStorage.setItem(seedKey, seed.key);
      }
    }
    return set;
  } catch {
    return new Set();
  }
}

async function convertBlobToPng(blob: Blob): Promise<Blob> {
  if (blob.type === "image/png") return blob;

  const imageBitmap = await createImageBitmap(blob);
  const canvas = document.createElement("canvas");
  canvas.width = imageBitmap.width;
  canvas.height = imageBitmap.height;

  const context = canvas.getContext("2d");
  if (!context) {
    imageBitmap.close();
    throw new Error("Não foi possível processar a imagem.");
  }

  context.drawImage(imageBitmap, 0, 0);
  imageBitmap.close();

  const pngBlob = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob(resolve, "image/png");
  });

  if (!pngBlob) {
    throw new Error("Falha ao converter imagem para PNG.");
  }

  return pngBlob;
}

export type Realm = "br" | "turco";

// Module-level cache per realm to reduce Supabase egress when navigating
// between routes (BR <-> TR). Items are re-used until TTL expires or a
// write operation invalidates the cache.
type RealmCache = {
  items: GameItem[];
  images: Map<string, string>;
  fetchedAt: number;
};
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const realmCache: Partial<Record<Realm, RealmCache>> = {};
const inflight: Partial<Record<Realm, Promise<RealmCache> | null>> = {};

function invalidateRealmCache(realm: Realm) {
  delete realmCache[realm];
}

export function useItemStore(realm: Realm = "br") {
  const tableName = (realm === "turco" ? "items_turco" : "items") as "items";
  const bucketName = realm === "turco" ? "item-images-turco" : "item-images";
  const [items, setItems] = useState<GameItem[]>([]);
  const [images, setImages] = useState<Map<string, string>>(new Map());
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [crossRealmIds, setCrossRealmIds] = useState<Set<string>>(new Set());
  const novidadesKey = `novidades-${realm}`;
  const [novidadesIds, setNovidadesIds] = useState<Set<string>>(() => loadNovidades(realm));
  const [showNovidades, setShowNovidades] = useState(false);

  useEffect(() => {
    setNovidadesIds(loadNovidades(realm));
    setShowNovidades(false);
  }, [realm]);

  // Load items from Supabase on mount
  const fetchItems = useCallback(async () => {
    // Serve from cache if fresh
    const cached = realmCache[realm];
    if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
      setItems(cached.items);
      setImages(new Map(cached.images));
      setLoading(false);
      return;
    }

    // Deduplicate concurrent fetches for the same realm
    if (!inflight[realm]) {
      inflight[realm] = (async () => {
        let allRows: any[] = [];
        let from = 0;
        const pageSize = 1000;
        let hasMore = true;

        while (hasMore) {
          const { data, error } = await supabase
            .from(tableName)
            .select("*")
            .order("id", { ascending: true })
            .range(from, from + pageSize - 1);
          if (error || !data) break;
          allRows = allRows.concat(data);
          hasMore = data.length === pageSize;
          from += pageSize;
        }

        const parsed: GameItem[] = [];
        const loadedImages = new Map<string, string>();
        allRows.forEach((row) => {
          const { id, name, image_url, created_at, updated_at, ...rest } = row;
          const attributes: Record<string, string> = {};
          Object.entries(rest).forEach(([key, val]) => {
            if (val != null && (key === "desc" || String(val).length < 200)) {
              attributes[key] = String(val);
            }
          });
          parsed.push({
            id: String(id),
            name: name ?? `Item #${id}`,
            imageUrl: image_url ?? undefined,
            attributes,
          });
          if (image_url) {
            loadedImages.set(String(id), image_url);
          }
        });

        const entry: RealmCache = {
          items: parsed,
          images: loadedImages,
          fetchedAt: Date.now(),
        };
        realmCache[realm] = entry;
        return entry;
      })().finally(() => {
        inflight[realm] = null;
      });
    }

    setLoading(true);
    try {
      const entry = await inflight[realm]!;
      setItems(entry.items);
      setImages(new Map(entry.images));
    } catch (err) {
      console.warn("Falha ao carregar itens:", err);
    } finally {
      setLoading(false);
    }
  }, [tableName, realm]);

  useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  // Cross-realm search: when in TR, also look up items by name in BR table
  // and include the matching IDs in the TR results.
  useEffect(() => {
    if (realm !== "turco") {
      if (crossRealmIds.size > 0) setCrossRealmIds(new Set());
      return;
    }
    const q = searchQuery.trim();
    if (!q) {
      if (crossRealmIds.size > 0) setCrossRealmIds(new Set());
      return;
    }

    let cancelled = false;
    const handle = setTimeout(async () => {
      const { data, error } = await supabase
        .from("items")
        .select("id")
        .ilike("name", `%${q}%`)
        .limit(1000);
      if (cancelled) return;
      if (error || !data) {
        setCrossRealmIds(new Set());
        return;
      }
      setCrossRealmIds(new Set(data.map((r: any) => String(r.id))));
    }, 250);

    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [realm, searchQuery]);

  // Save items to Supabase (insert only NEW items, never overwrite existing)
  const addItems = async (newItems: GameItem[]) => {
    const validItems = newItems.filter((item) => {
      const numId = Number(item.id);
      return !isNaN(numId) && numId > 0 && isFinite(numId);
    });

    if (validItems.length === 0) {
      toast.error("Nenhum item válido encontrado para importar.");
      return;
    }

    if (validItems.length < newItems.length) {
      toast.warning(`${newItems.length - validItems.length} itens ignorados por terem ID inválido.`);
    }

    // Check which IDs already exist in the database
    const allIds = validItems.map((i) => Number(i.id));
    const existingIds = new Set<number>();
    const checkBatchSize = 1000;
    for (let i = 0; i < allIds.length; i += checkBatchSize) {
      const batch = allIds.slice(i, i + checkBatchSize);
      const { data } = await supabase
        .from(tableName)
        .select("id")
        .in("id", batch);
      if (data) data.forEach((row) => existingIds.add(row.id));
    }

    const onlyNewItems = validItems.filter((item) => !existingIds.has(Number(item.id)));

    if (onlyNewItems.length === 0) {
      toast.info(`Nenhum item novo encontrado. Todos os ${validItems.length} itens já existem.`);
      return;
    }

    toast.info(`${existingIds.size} itens já existem e serão preservados. Inserindo ${onlyNewItems.length} novos...`);

    // Salvar IDs recém-adicionados como "Novidades" (substitui a lista anterior)
    try {
      const ids = onlyNewItems.map((i) => String(i.id));
      localStorage.setItem(novidadesKey, JSON.stringify(ids));
      setNovidadesIds(new Set(ids));
    } catch (e) {
      console.warn("Falha ao salvar Novidades:", e);
    }

    // Update local state (add new, keep existing)
    setItems((prev) => {
      const map = new Map(prev.map((i) => [i.id, i]));
      onlyNewItems.forEach((i) => map.set(i.id, i));
      return Array.from(map.values());
    });
    invalidateRealmCache(realm);

    let failedBatches = 0;
    const batchSize = 500;
    for (let i = 0; i < onlyNewItems.length; i += batchSize) {
      const batch = onlyNewItems.slice(i, i + batchSize);
      const rows = batch.map((item) => {
        const row: Record<string, unknown> = {
          id: Number(item.id),
          name: item.name,
        };

        const attrs = item.attributes;
        const intFields = [
          "type", "attack", "defence", "agility", "luck", "item_grade",
          "pile_count", "need_sex", "need_grade", "color", "bind_type",
          "melt_type", "melt_grade", "price", "price_type", "floor_price",
          "suit_id",
        ];
        const numFields = ["success_rate", "success_modulus"];
        const boolFields = [
          "can_send", "can_transfer", "is_callback", "is_strengthen",
          "is_compose", "is_throw", "is_equip", "is_use", "is_delete",
        ];
        const textFields = [
          "remark", "attribute1", "attribute2", "attribute3", "attribute4",
          "attribute5", "attribute6", "attribute7", "attribute8", "beset",
          "desc", "script", "data", "image_url", "profile", "pic_path",
        ];

        intFields.forEach((f) => {
          if (attrs[f] != null) row[f] = parseInt(String(attrs[f]), 10) || 0;
        });
        numFields.forEach((f) => {
          if (attrs[f] != null) row[f] = parseFloat(String(attrs[f])) || 0;
        });
        boolFields.forEach((f) => {
          if (attrs[f] != null) {
            const v = String(attrs[f]).toLowerCase();
            row[f] = v === "true" || v === "1";
          }
        });
        textFields.forEach((f) => {
          if (attrs[f] != null) row[f] = String(attrs[f]);
        });

        return row;
      });

      const { error } = await supabase.from(tableName).insert(rows as any);
      if (error) {
        console.error("Insert batch error:", error.message);
        failedBatches++;
      }
    }

    if (failedBatches > 0) {
      toast.warning(`${failedBatches} lote(s) falharam ao salvar. Verifique o console.`);
    } else {
      toast.success(`${onlyNewItems.length} novos itens salvos com sucesso!`);
    }
  };

  const addImages = async (newImages: Map<string, ImportedImage>) => {
    if (newImages.size === 0) {
      const errorMessage = "Nenhuma imagem encontrada no arquivo ZIP.";
      toast.info(errorMessage);
      throw new Error(errorMessage);
    }

    setImages((prev) => {
      const merged = new Map(prev);
      newImages.forEach(({ previewUrl }, k) => merged.set(k, previewUrl));
      return merged;
    });

    let successCount = 0;
    let failCount = 0;
    let skippedCount = 0;
    const total = newImages.size;

    toast.info(`Iniciando upload de ${total} imagens...`);

    const entries = Array.from(newImages.entries());
    const batchSize = 5;

    for (let i = 0; i < entries.length; i += batchSize) {
      const batch = entries.slice(i, i + batchSize);
      await Promise.all(
        batch.map(async ([itemId, imageData]) => {
          const numericId = Number(itemId);
          if (!Number.isFinite(numericId) || numericId <= 0) {
            console.error(`ID de imagem inválido: ${itemId}`);
            skippedCount++;
            return;
          }

          try {
            const pngBlob = await convertBlobToPng(imageData.blob);
            // Diretório único por upload para evitar cache do navegador/CDN
            const uniqueDir = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
            const path = `${numericId}/${uniqueDir}.png`;

            const { error: uploadError } = await supabase.storage
              .from(bucketName)
              .upload(path, pngBlob, { upsert: false, contentType: "image/png" });

            if (uploadError) {
              console.error(`Upload failed for ${itemId}:`, uploadError.message);
              failCount++;
              return;
            }

            const { data: urlData } = supabase.storage
              .from(bucketName)
              .getPublicUrl(path);

            const publicUrl = urlData.publicUrl;

            const { data: updatedItem, error: updateError } = await supabase
              .from(tableName)
              .update({ image_url: publicUrl })
              .eq("id", numericId)
              .select("id")
              .maybeSingle();

            if (updateError || !updatedItem) {
              console.error(
                `Image URL update failed for ${itemId}:`,
                updateError?.message ?? "item não encontrado"
              );
              failCount++;
              return;
            }

            setImages((prev) => {
              const next = new Map(prev);
              next.set(itemId, publicUrl);
              return next;
            });
            const c = realmCache[realm];
            if (c) c.images.set(itemId, publicUrl);
            successCount++;
          } catch (err) {
            console.error(`Image upload error for ${itemId}:`, err);
            failCount++;
          }
        })
      );

      const processed = Math.min(i + batch.length, entries.length);
      if (processed % 50 === 0 && processed < entries.length) {
        toast.info(`Progresso: ${processed}/${total} imagens processadas`);
      }
    }

    if (successCount === 0) {
      const errorMessage =
        skippedCount > 0 && failCount === 0
          ? "Nenhuma imagem foi salva. Use o ID do item como nome do arquivo no ZIP."
          : "Nenhuma imagem foi salva. Verifique se os itens já foram importados e se os arquivos do ZIP usam o ID do item.";

      toast.error(errorMessage);
      throw new Error(errorMessage);
    }

    if (failCount > 0 || skippedCount > 0) {
      toast.warning(
        `Upload concluído: ${successCount} salvas, ${failCount} falharam${skippedCount > 0 ? `, ${skippedCount} ignoradas por ID inválido` : ""}`
      );
    } else {
      toast.success(`${successCount} imagens salvas com sucesso!`);
    }
  };

  const syncDescriptions = async (sourceItems: GameItem[]) => {
    // Filter items that have a non-empty desc
    const withDesc = sourceItems.filter(
      (item) => item.attributes.desc && item.attributes.desc.trim().length > 0
    );

    if (withDesc.length === 0) {
      toast.info("Nenhuma descrição encontrada nos dados importados.");
      return;
    }

    toast.info(`Sincronizando ${withDesc.length} descrições...`);

    const batchSize = 100;
    let updated = 0;

    for (let i = 0; i < withDesc.length; i += batchSize) {
      const batch = withDesc.slice(i, i + batchSize);
      await Promise.all(
        batch.map(async (item) => {
          const { error } = await supabase
            .from(tableName)
            .update({ desc: item.attributes.desc })
            .eq("id", Number(item.id));
          if (!error) updated++;
        })
      );

      if ((i + batchSize) % 500 === 0 && i + batchSize < withDesc.length) {
        toast.info(`Progresso: ${Math.min(i + batchSize, withDesc.length)}/${withDesc.length}`);
      }
    }

    // Update local state
    setItems((prev) => {
      const descMap = new Map(withDesc.map((i) => [i.id, i.attributes.desc]));
      return prev.map((item) => {
        const newDesc = descMap.get(item.id);
        if (newDesc) {
          return { ...item, attributes: { ...item.attributes, desc: newDesc } };
        }
        return item;
      });
    });
    invalidateRealmCache(realm);

    toast.success(`${updated} descrições atualizadas com sucesso!`);
  };

  const updateItemType = async (itemIds: string[], newType: number) => {
    // Update local state
    setItems((prev) =>
      prev.map((item) =>
        itemIds.includes(item.id)
          ? { ...item, attributes: { ...item.attributes, type: String(newType) } }
          : item
      )
    );

    // Persist to Supabase
    const numericIds = itemIds.map(Number);
    const batchSize = 500;
    for (let i = 0; i < numericIds.length; i += batchSize) {
      const batch = numericIds.slice(i, i + batchSize);
      await supabase.from(tableName).update({ type: newType }).in("id", batch);
    }
    invalidateRealmCache(realm);
  };

  const filteredItems = useMemo(() => {
    let result = items;
    if (showNovidades && novidadesIds.size > 0) {
      result = result.filter((item) => novidadesIds.has(item.id));
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (item) =>
          item.id.toLowerCase().includes(q) ||
          item.name.toLowerCase().includes(q) ||
          (item.attributes.desc && item.attributes.desc.toLowerCase().includes(q)) ||
          crossRealmIds.has(item.id)
      );
    }
    return result;
  }, [items, searchQuery, crossRealmIds, showNovidades, novidadesIds]);

  const getItemImage = (id: string) => images.get(id) ?? "";

  return {
    items: filteredItems,
    totalCount: items.length,
    searchQuery,
    setSearchQuery,
    addItems,
    addImages,
    getItemImage,
    loading,
    updateItemType,
    syncDescriptions,
    novidadesCount: novidadesIds.size,
    showNovidades,
    setShowNovidades,
  };
}
