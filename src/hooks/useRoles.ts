import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";

export type PanelRole = Tables<"panel_roles">;

const check = ({ error }: { error: { message: string } | null }) => {
  if (error) throw new Error(error.message);
};

/**
 * Cargos do painel (como no Discord), do mais alto para o mais baixo, e quem tem cada um.
 * As regras de hierarquia valem no banco; aqui só se reflete o que a tela pode oferecer.
 */
export function useRoles() {
  const [roles, setRoles] = useState<PanelRole[]>([]);
  const [links, setLinks] = useState<{ user_id: string; role_id: string }[]>([]);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    const [r, l] = await Promise.all([
      supabase.from("panel_roles").select("*").order("position", { ascending: false }),
      supabase.from("user_panel_roles").select("user_id, role_id"),
    ]);
    if (!r.error) setRoles(r.data ?? []);
    if (!l.error) setLinks(l.data ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  const membersOf = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const l of links) map.set(l.role_id, [...(map.get(l.role_id) ?? []), l.user_id]);
    return map;
  }, [links]);

  const rolesOf = useCallback(
    (userId: string) => roles.filter((r) => links.some((l) => l.user_id === userId && l.role_id === r.id)),
    [roles, links],
  );

  const createRole = useCallback(async (name: string) => {
    // Cargo novo entra no fim da lista (como no Discord), abaixo de todos.
    const position = roles.length ? Math.min(...roles.map((r) => r.position)) - 1 : 0;
    const { data, error } = await supabase.from("panel_roles").insert({ name, position, color: "#99aab5", permissions: [] }).select("*").single();
    if (error) throw new Error(error.message);
    await reload();
    return data;
  }, [roles, reload]);

  const updateRole = useCallback(async (id: string, patch: Partial<Pick<PanelRole, "name" | "color" | "permissions">>) => {
    check(await supabase.from("panel_roles").update(patch).eq("id", id));
    await reload();
  }, [reload]);

  const deleteRole = useCallback(async (id: string) => {
    check(await supabase.from("panel_roles").delete().eq("id", id));
    await reload();
  }, [reload]);

  /** Troca de lugar com o vizinho de cima (dir -1) ou de baixo (dir 1) na lista. */
  const moveRole = useCallback(async (id: string, dir: -1 | 1) => {
    const i = roles.findIndex((r) => r.id === id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= roles.length) return;
    const a = roles[i];
    const b = roles[j];
    // Posições iguais não trocam de ordem: abre espaço antes.
    const [pa, pb] = a.position === b.position ? (dir === -1 ? [b.position + 1, b.position] : [b.position - 1, b.position]) : [b.position, a.position];
    check(await supabase.from("panel_roles").update({ position: pa }).eq("id", a.id));
    check(await supabase.from("panel_roles").update({ position: pb }).eq("id", b.id));
    await reload();
  }, [roles, reload]);

  const assign = useCallback(async (userId: string, roleId: string) => {
    check(await supabase.from("user_panel_roles").insert({ user_id: userId, role_id: roleId }));
    await reload();
  }, [reload]);

  const unassign = useCallback(async (userId: string, roleId: string) => {
    check(await supabase.from("user_panel_roles").delete().eq("user_id", userId).eq("role_id", roleId));
    await reload();
  }, [reload]);

  return { roles, loading, reload, membersOf, rolesOf, createRole, updateRole, deleteRole, moveRole, assign, unassign };
}

export type RolesApi = ReturnType<typeof useRoles>;
