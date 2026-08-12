import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  try {
    const { rows, table = "items" } = await req.json();
    if (!Array.isArray(rows)) throw new Error("rows must be an array");
    if (table !== "items" && table !== "items_turco") throw new Error("invalid table");

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const ids = rows.map((r: { id: number }) => r.id);
    const { data: existing, error } = await supabase
      .from(table)
      .select("id, desc")
      .in("id", ids);
    if (error) throw error;

    const missing = new Set(
      (existing ?? [])
        .filter((r: { desc: string | null }) => !r.desc || r.desc.trim() === "")
        .map((r: { id: number }) => r.id)
    );

    let updated = 0;
    for (const r of rows as { id: number; desc: string }[]) {
      if (!missing.has(r.id)) continue;
      const { error: upErr } = await supabase.from(table).update({ desc: r.desc }).eq("id", r.id);
      if (upErr) continue;
      updated++;
    }

    return new Response(JSON.stringify({ updated, checked: rows.length }), {
      headers: { ...cors, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 400,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }
});
