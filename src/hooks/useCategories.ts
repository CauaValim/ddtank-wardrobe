import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface Category {
  id: string;
  name: string;
  color: string;
}

export function useCategories() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [itemCategoryMap, setItemCategoryMap] = useState<Map<number, string[]>>(new Map());
  const [loading, setLoading] = useState(true);

  const fetchCategories = useCallback(async () => {
    const { data } = await supabase
      .from("categories")
      .select("id, name, color")
      .order("name");
    if (data) setCategories(data);
  }, []);

  const fetchItemCategories = useCallback(async () => {
    const { data } = await supabase
      .from("item_categories")
      .select("item_id, category_id");
    if (data) {
      const map = new Map<number, string[]>();
      data.forEach((row) => {
        const existing = map.get(row.item_id) ?? [];
        existing.push(row.category_id);
        map.set(row.item_id, existing);
      });
      setItemCategoryMap(map);
    }
  }, []);

  useEffect(() => {
    Promise.all([fetchCategories(), fetchItemCategories()]).finally(() =>
      setLoading(false)
    );
  }, [fetchCategories, fetchItemCategories]);

  const addCategory = async (name: string, color: string) => {
    const { error } = await supabase
      .from("categories")
      .insert({ name, color });
    if (!error) await fetchCategories();
    return error;
  };

  const deleteCategory = async (id: string) => {
    const { error } = await supabase.from("categories").delete().eq("id", id);
    if (!error) {
      await Promise.all([fetchCategories(), fetchItemCategories()]);
    }
    return error;
  };

  const assignItem = async (itemId: number, categoryId: string) => {
    const { error } = await supabase
      .from("item_categories")
      .insert({ item_id: itemId, category_id: categoryId });
    if (!error) await fetchItemCategories();
    return error;
  };

  const unassignItem = async (itemId: number, categoryId: string) => {
    const { error } = await supabase
      .from("item_categories")
      .delete()
      .eq("item_id", itemId)
      .eq("category_id", categoryId);
    if (!error) await fetchItemCategories();
    return error;
  };

  const getItemCategories = (itemId: number): Category[] => {
    const catIds = itemCategoryMap.get(itemId) ?? [];
    return categories.filter((c) => catIds.includes(c.id));
  };

  return {
    categories,
    loading,
    addCategory,
    deleteCategory,
    assignItem,
    unassignItem,
    getItemCategories,
    itemCategoryMap,
    refetch: () => Promise.all([fetchCategories(), fetchItemCategories()]),
  };
}
