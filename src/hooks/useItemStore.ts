import { useState, useMemo, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
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

    // Upload each image to Supabase Storage and update item's image_url
    const uploadPromises: Promise<void>[] = [];
    newImages.forEach((blobUrl, itemId) => {
      uploadPromises.push(
        (async () => {
          try {
            const res = await fetch(blobUrl);
            const blob = await res.blob();
            const ext = blob.type.split("/")[1] || "png";
            const path = `${itemId}.${ext}`;

            // Upload to storage bucket
            const { error: uploadError } = await supabase.storage
              .from("item-images")
              .upload(path, blob, { upsert: true, contentType: blob.type });

            if (uploadError) {
              console.error(`Upload failed for ${itemId}:`, uploadError.message);
              return;
            }

            // Get public URL
            const { data: urlData } = supabase.storage
              .from("item-images")
              .getPublicUrl(path);

            const publicUrl = urlData.publicUrl;

            // Update item in DB
            await supabase
              .from("items")
              .update({ image_url: publicUrl })
              .eq("id", Number(itemId));

            // Update local state with persistent URL
            setImages((prev) => {
              const next = new Map(prev);
              next.set(itemId, publicUrl);
              return next;
            });
          } catch (err) {
            console.error(`Image upload error for ${itemId}:`, err);
          }
        })()
      );
    });

    await Promise.all(uploadPromises);
  };

  const filteredItems = useMemo(() => {
    let result = items;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (item) =>
          item.id.toLowerCase().includes(q) ||
          item.name.toLowerCase().includes(q)
      );
    }
    return result;
  }, [items, searchQuery]);

  const getItemImage = (id: string) => images.get(id);

  return {
    items: filteredItems,
    totalCount: items.length,
    searchQuery,
    setSearchQuery,
    addItems,
    addImages,
    getItemImage,
    loading,
  };
}
