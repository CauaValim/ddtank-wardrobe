import { useState, useMemo, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import type { GameItem } from "@/types/item";

export function useItemStore() {
  const [items, setItems] = useState<GameItem[]>([]);
  const [images, setImages] = useState<Map<string, string>>(new Map());
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(true);

  // Load items from Supabase on mount
  const fetchItems = useCallback(async () => {
    setLoading(true);
    let allRows: any[] = [];
    let from = 0;
    const pageSize = 1000;
    let hasMore = true;

    while (hasMore) {
      const { data, error } = await supabase
        .from("items")
        .select("*")
        .order("id", { ascending: true })
        .range(from, from + pageSize - 1);
      if (error || !data) break;
      allRows = allRows.concat(data);
      hasMore = data.length === pageSize;
      from += pageSize;
    }

    if (allRows.length > 0) {
      const parsed: GameItem[] = [];
      const loadedImages = new Map<string, string>();
      allRows.forEach((row) => {
        const { id, name, image_url, created_at, updated_at, ...rest } = row;
        const attributes: Record<string, string> = {};
        Object.entries(rest).forEach(([key, val]) => {
          if (val != null && String(val).length < 200) {
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
      setItems(parsed);
      setImages((prev) => {
        const merged = new Map(prev);
        loadedImages.forEach((v, k) => merged.set(k, v));
        return merged;
      });
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  // Save items to Supabase (upsert)
  const addItems = async (newItems: GameItem[]) => {
    // Update local state immediately
    setItems((prev) => {
      const map = new Map(prev.map((i) => [i.id, i]));
      newItems.forEach((i) => map.set(i.id, i));
      return Array.from(map.values());
    });

    // Persist to Supabase in batches
    const batchSize = 500;
    for (let i = 0; i < newItems.length; i += batchSize) {
      const batch = newItems.slice(i, i + batchSize);
      const rows = batch.map((item) => {
        const row: Record<string, unknown> = {
          id: Number(item.id),
          name: item.name,
        };
        // Map known attributes back to columns
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

      await supabase.from("items").upsert(rows as any, { onConflict: "id" });
    }
  };

  const addImages = async (newImages: Map<string, string>) => {
    // Update local state immediately for preview
    setImages((prev) => {
      const merged = new Map(prev);
      newImages.forEach((v, k) => merged.set(k, v));
      return merged;
    });

    let successCount = 0;
    let failCount = 0;
    const total = newImages.size;

    toast.info(`Iniciando upload de ${total} imagens...`);

    // Process in batches of 5 to avoid overwhelming the server
    const entries = Array.from(newImages.entries());
    const batchSize = 5;

    for (let i = 0; i < entries.length; i += batchSize) {
      const batch = entries.slice(i, i + batchSize);
      await Promise.all(
        batch.map(async ([itemId, blobUrl]) => {
          try {
            const res = await fetch(blobUrl);
            const blob = await res.blob();
            if (blob.size === 0) {
              failCount++;
              return;
            }
            const ext = blob.type.split("/")[1] || "png";
            const path = `${itemId}.${ext}`;

            const { error: uploadError } = await supabase.storage
              .from("item-images")
              .upload(path, blob, { upsert: true, contentType: blob.type });

            if (uploadError) {
              console.error(`Upload failed for ${itemId}:`, uploadError.message);
              failCount++;
              return;
            }

            const { data: urlData } = supabase.storage
              .from("item-images")
              .getPublicUrl(path);

            const publicUrl = urlData.publicUrl;

            await supabase
              .from("items")
              .update({ image_url: publicUrl })
              .eq("id", Number(itemId));

            setImages((prev) => {
              const next = new Map(prev);
              next.set(itemId, publicUrl);
              return next;
            });
            successCount++;
          } catch (err) {
            console.error(`Image upload error for ${itemId}:`, err);
            failCount++;
          }
        })
      );

      // Progress toast every 50 images
      if ((i + batchSize) % 50 === 0 && i + batchSize < entries.length) {
        toast.info(`Progresso: ${successCount + failCount}/${total} imagens processadas`);
      }
    }

    if (failCount > 0) {
      toast.warning(`Upload concluído: ${successCount} salvas, ${failCount} falharam`);
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
            .from("items")
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
      await supabase.from("items").update({ type: newType }).in("id", batch);
    }
  };

  const filteredItems = useMemo(() => {
    let result = items;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (item) =>
          item.id.toLowerCase().includes(q) ||
          item.name.toLowerCase().includes(q) ||
          (item.attributes.desc && item.attributes.desc.toLowerCase().includes(q))
      );
    }
    return result;
  }, [items, searchQuery]);

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
  };
}
