import { useState, useMemo } from "react";
import type { GameItem } from "@/types/item";

export function useItemStore() {
  const [items, setItems] = useState<GameItem[]>([]);
  const [images, setImages] = useState<Map<string, string>>(new Map());
  const [searchQuery, setSearchQuery] = useState("");

  const addItems = (newItems: GameItem[]) => {
    setItems((prev) => {
      const map = new Map(prev.map((i) => [i.id, i]));
      newItems.forEach((i) => map.set(i.id, i));
      return Array.from(map.values());
    });
  };

  const addImages = (newImages: Map<string, string>) => {
    setImages((prev) => {
      const merged = new Map(prev);
      newImages.forEach((v, k) => merged.set(k, v));
      return merged;
    });
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
  };
}
