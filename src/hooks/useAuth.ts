import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { User } from "@supabase/supabase-js";
import { ALL_PERMISSIONS, isPermission, permissionsFromRole, type Permission } from "@/lib/permissions";

export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [permissions, setPermissions] = useState<Set<Permission>>(new Set());
  /** Posição do cargo mais alto (hierarquia, como no Discord); -1 sem cargo. */
  const [topPosition, setTopPosition] = useState(-1);
  const [loading, setLoading] = useState(true);

  /** Soma das permissões dos cargos do usuário; enquanto as tabelas novas não existem, usa o cargo antigo. */
  const fetchPermissions = useCallback(async (userId: string) => {
    try {
      const { data: links, error } = await supabase.from("user_panel_roles").select("role_id").eq("user_id", userId);
      if (!error) {
        const ids = (links ?? []).map((l) => l.role_id);
        const { data: roles } = ids.length
          ? await supabase.from("panel_roles").select("permissions, position").in("id", ids)
          : { data: [] as { permissions: string[]; position: number }[] };
        const all = new Set((roles ?? []).flatMap((r) => r.permissions).filter(isPermission));
        setPermissions(all.has("administrator") ? new Set(ALL_PERMISSIONS) : all);
        setTopPosition(Math.max(-1, ...(roles ?? []).map((r) => r.position)));
        return;
      }
      const { data: roleRow } = await supabase.from("user_roles").select("role").eq("user_id", userId).limit(1).maybeSingle();
      const legacy = new Set(permissionsFromRole(roleRow?.role));
      setPermissions(legacy.has("administrator") ? new Set(ALL_PERMISSIONS) : legacy);
      setTopPosition(-1);
    } catch (err) {
      console.warn("Erro ao buscar permissões:", err);
      setPermissions(new Set());
    }
  }, []);

  useEffect(() => {
    // Set up listener FIRST (Supabase best practice)
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        const u = session?.user ?? null;
        setUser(u);
        if (u) {
          // Use setTimeout to avoid potential deadlock with Supabase internal locks
          setTimeout(() => fetchPermissions(u.id).finally(() => setLoading(false)), 0);
        } else {
          setPermissions(new Set());
          setLoading(false);
        }

        // If token refresh failed or user was deleted, sign out cleanly
        if (event === "TOKEN_REFRESHED" && !session) {
          // Defer to avoid deadlock inside the auth state listener
          setTimeout(() => { supabase.auth.signOut(); }, 0);
        }
      }
    );

    // Then check existing session
    supabase.auth.getSession().then(({ data: { session }, error }) => {
      if (error || !session) {
        setUser(null);
        setPermissions(new Set());
        setLoading(false);
        return;
      }
      // onAuthStateChange will handle setting state
    });

    return () => subscription.unsubscribe();
  }, [fetchPermissions]);

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return error;
  };

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  const can = useCallback((permission: Permission) => permissions.has(permission), [permissions]);

  return { user, loading, signIn, signOut, permissions, can, topPosition, reloadPermissions: fetchPermissions };
}
