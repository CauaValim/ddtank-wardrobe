import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { User } from "@supabase/supabase-js";

export type AppRole = "admin" | "analista" | "moderador" | "user" | "super_admin" | "midia";

export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [role, setRole] = useState<AppRole | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchRole = useCallback(async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", userId)
        .limit(1)
        .single();
      if (error) {
        console.warn("Erro ao buscar role:", error.message);
        setRole("user");
      } else {
        setRole((data?.role as AppRole) ?? "user");
      }
    } catch (err) {
      console.warn("Erro inesperado ao buscar role:", err);
      setRole("user");
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
          setTimeout(() => fetchRole(u.id).finally(() => setLoading(false)), 0);
        } else {
          setRole(null);
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
        setRole(null);
        setLoading(false);
        return;
      }
      // onAuthStateChange will handle setting state
    });

    return () => subscription.unsubscribe();
  }, [fetchRole]);

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return error;
  };

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  // Permission helpers
  const isSuperAdmin = role === "super_admin";
  const isAdmin = role === "admin" || isSuperAdmin;
  const canViewId = isAdmin || role === "analista";
  const canSelect = isAdmin;
  const canImport = isAdmin; // .xlsx / .json import
  const canImportImages = isSuperAdmin; // .zip images
  const canSyncDescriptions = isSuperAdmin;
  const canEditSchedule = isAdmin;
  const canRequestCodes = isAdmin || role === "midia";
  const canManageCodes = isAdmin;

  return { user, role, loading, signIn, signOut, canViewId, canSelect, canImport, canImportImages, canSyncDescriptions, canEditSchedule, canRequestCodes, canManageCodes };
}
