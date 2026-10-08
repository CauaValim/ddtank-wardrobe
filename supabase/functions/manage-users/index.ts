import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { accessOf, allows } from "../_shared/permissions.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

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

    // Ver a lista: quem gerencia usuários ou cargos. Criar e remover contas: só quem gerencia usuários.
    const access = await accessOf(supabaseAdmin, caller.id);
    if (!allows(access, "users.manage") && !allows(access, "roles.manage")) return json({ error: "Acesso negado" }, 403);

    const url = new URL(req.url);
    const action = url.searchParams.get("action");

    // LIST users (com os cargos de cada um)
    if (req.method === "GET" && action === "list") {
      const { data: authUsers, error: authErr } = await supabaseAdmin.auth.admin.listUsers({ perPage: 500 });
      if (authErr) throw authErr;
      const { data: links, error } = await supabaseAdmin.from("user_panel_roles").select("user_id, role_id");
      if (error) throw error;
      const byUser = new Map<string, string[]>();
      for (const l of links ?? []) byUser.set(l.user_id, [...(byUser.get(l.user_id) ?? []), l.role_id]);
      return json(authUsers.users.map((u) => ({
        id: u.id,
        email: u.email,
        created_at: u.created_at,
        last_sign_in_at: u.last_sign_in_at ?? null,
        role_ids: byUser.get(u.id) ?? [],
      })));
    }

    if (!allows(access, "users.manage")) return json({ error: "Acesso negado" }, 403);

    // DELETE user: não pode ter cargo igual ou acima do seu (exceto Administrador).
    if (req.method === "POST" && action === "delete-user") {
      const { user_id } = await req.json();
      if (!user_id) return json({ error: "user_id é obrigatório" }, 400);
      if (user_id === caller.id) return json({ error: "Você não pode deletar a si mesmo" }, 400);
      const target = await accessOf(supabaseAdmin, user_id);
      if (!access.admin && (target.admin || target.top >= access.top)) {
        return json({ error: "Este usuário tem um cargo igual ou acima do seu" }, 403);
      }

      await supabaseAdmin.from("user_roles").delete().eq("user_id", user_id);
      const { error: delErr } = await supabaseAdmin.auth.admin.deleteUser(user_id);
      if (delErr) throw delErr;
      return json({ success: true });
    }

    // CREATE user, já com cargos (só cargos abaixo do seu, exceto Administrador)
    if (req.method === "POST" && action === "create-user") {
      const { email, password, role_ids } = await req.json();
      if (!email || !password) return json({ error: "Email e senha são obrigatórios" }, 400);
      const ids: string[] = Array.isArray(role_ids) ? role_ids.filter((x: unknown) => typeof x === "string") : [];
      if (ids.length) {
        const { data: roles, error } = await supabaseAdmin.from("panel_roles").select("id, position").in("id", ids);
        if (error) throw error;
        if ((roles ?? []).length !== ids.length) return json({ error: "Cargo não encontrado" }, 400);
        if (!access.admin && roles!.some((r) => r.position >= access.top)) {
          return json({ error: "Você só pode dar cargos abaixo do seu cargo mais alto" }, 403);
        }
      }

      const { data: newUser, error: createErr } = await supabaseAdmin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
      });
      if (createErr) throw createErr;
      if (ids.length) {
        const { error } = await supabaseAdmin.from("user_panel_roles")
          .insert(ids.map((role_id) => ({ user_id: newUser.user.id, role_id, granted_by: caller.id })));
        if (error) throw error;
      }
      return json({ success: true, user_id: newUser.user.id });
    }

    return json({ error: "Ação não encontrada" }, 404);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return json({ error: message }, 500);
  }
});
