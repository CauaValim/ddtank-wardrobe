import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { accessOf, allows } from "../_shared/permissions.ts";

// Financeiro: aba Base da planilha "Histórico - Venda de munição" (Google Sheets compartilhada por
// link). O ID fica no segredo FINANCE_SHEET_ID, fora do código, e só quem tem "Ver financeiro" recebe
// os dados. O CSV é lido no painel (src/lib/finance/sales.ts).
const TTL = 10 * 60 * 1000;
let cache: { at: number; csv: string } | null = null;

const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

async function loadCsv(): Promise<{ at: number; csv: string }> {
  if (cache && Date.now() - cache.at < TTL) return cache;
  const id = Deno.env.get("FINANCE_SHEET_ID");
  if (!id) throw new Error("Planilha do financeiro não configurada (segredo FINANCE_SHEET_ID).");
  const resp = await fetch(`https://docs.google.com/spreadsheets/d/${encodeURIComponent(id)}/export?format=csv&sheet=Base`);
  const type = resp.headers.get("content-type") ?? "";
  if (!resp.ok || !type.includes("text/csv")) {
    await resp.body?.cancel();
    throw new Error(`Não foi possível ler a planilha do financeiro (HTTP ${resp.status}). Confira se ela continua compartilhada por link.`);
  }
  cache = { at: Date.now(), csv: await resp.text() };
  return cache;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const token = (req.headers.get("Authorization") ?? "").replace("Bearer ", "");
    if (!token) return json({ error: "Não autenticado" }, 401);
    const { data: u, error: uErr } = await admin.auth.getUser(token);
    if (uErr || !u.user) return json({ error: "Sessão inválida" }, 401);
    if (!allows(await accessOf(admin, u.user.id), "finance.view")) return json({ error: "Sem permissão" }, 403);

    const body = await req.json().catch(() => ({}));
    if (body?.refresh === true) cache = null;
    const { at, csv } = await loadCsv();
    return json({ csv, fetchedAt: new Date(at).toISOString() });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
