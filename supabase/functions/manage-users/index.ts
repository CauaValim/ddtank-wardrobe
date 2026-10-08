import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Mesma lista de src/lib/permissions.ts.
const PERMISSIONS = [
  "items.view_ids", "items.manage", "items.game_sync", "items.export_images", "tools.id_filler", "tools.validator",
  "events.access", "events.presets", "events.item_rules", "events.history", "events.templates",
  "schedule.edit", "codes.request", "codes.manage", "users.manage",
];

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Não autorizado" }, 401);

    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const callerClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user: caller } } = await callerClient.auth.getUser();
    if (!caller) return json({ error: "Não autorizado" }, 401);

    // Somente quem tem a permissão "Gerenciar usuários".
    const { data: allowed } = await supabaseAdmin
      .from("user_permissions")
      .select("permission")
      .eq("user_id", caller.id)
      .eq("permission", "users.manage")
      .maybeSingle();
    if (!allowed) return json({ error: "Acesso negado" }, 403);

    const url = new URL(req.url);
    const action = url.searchParams.get("action");

    const setPermissions = async (userId: string, wanted: string[]) => {
      const { data: current, error } = await supabaseAdmin.from("user_permissions").select("permission").eq("user_id", userId);
      if (error) throw error;
      const have = new Set((current ?? []).map((r: { permission: string }) => r.permission));
      const toAdd = wanted.filter((p) => !have.has(p));
      const toRemove = [...have].filter((p) => !wanted.includes(p));
      if (toAdd.length) {
        const { error: insErr } = await supabaseAdmin.from("user_permissions")
          .insert(toAdd.map((permission) => ({ user_id: userId, permission, granted_by: caller.id })));
        if (insErr) throw insErr;
      }
      if (toRemove.length) {
        const { error: delErr } = await supabaseAdmin.from("user_permissions").delete().eq("user_id", userId).in("permission", toRemove);
        if (delErr) throw delErr;
      }
    };

    const validList = (value: unknown): string[] | null =>
      Array.isArray(value) && value.every((p) => typeof p === "string" && PERMISSIONS.includes(p)) ? [...new Set(value as string[])] : null;

    // LIST users
    if (req.method === "GET" && action === "list") {
      const { data: authUsers, error: authErr } = await supabaseAdmin.auth.admin.listUsers({ perPage: 500 });
      if (authErr) throw authErr;
      const { data: rows, error } = await supabaseAdmin.from("user_permissions").select("user_id, permission");
      if (error) throw error;
      const byUser = new Map<string, string[]>();
      for (const r of rows ?? []) byUser.set(r.user_id, [...(byUser.get(r.user_id) ?? []), r.permission]);
      return json(authUsers.users.map((u) => ({
        id: u.id,
        email: u.email,
        created_at: u.created_at,
        last_sign_in_at: u.last_sign_in_at ?? null,
        permissions: byUser.get(u.id) ?? [],
      })));
    }

    // SET PERMISSIONS
    if (req.method === "POST" && action === "set-permissions") {
      const { user_id, permissions } = await req.json();
      const list = validList(permissions);
      if (!user_id || !list) return json({ error: "user_id e uma lista de permissões válidas são obrigatórios" }, 400);
      if (user_id === caller.id && !list.includes("users.manage")) {
        return json({ error: "Você não pode tirar de si mesmo a permissão de gerenciar usuários" }, 400);
      }
      await setPermissions(user_id, list);
      return json({ success: true });
    }

    // DELETE user
    if (req.method === "POST" && action === "delete-user") {
      const { user_id } = await req.json();
      if (!user_id) return json({ error: "user_id é obrigatório" }, 400);
      if (user_id === caller.id) return json({ error: "Você não pode deletar a si mesmo" }, 400);

      await supabaseAdmin.from("user_roles").delete().eq("user_id", user_id);
      const { error: delErr } = await supabaseAdmin.auth.admin.deleteUser(user_id);
      if (delErr) throw delErr;
      return json({ success: true });
    }

    // CREATE user
    if (req.method === "POST" && action === "create-user") {
      const { email, password, permissions } = await req.json();
      const list = validList(permissions ?? []);
      if (!email || !password) return json({ error: "Email e senha são obrigatórios" }, 400);
      if (!list) return json({ error: "Lista de permissões inválida" }, 400);

      const { data: newUser, error: createErr } = await supabaseAdmin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
      });
      if (createErr) throw createErr;
      await setPermissions(newUser.user.id, list);
      return json({ success: true, user_id: newUser.user.id });
    }

    return json({ error: "Ação não encontrada" }, 404);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return json({ error: message }, 500);
  }
});
