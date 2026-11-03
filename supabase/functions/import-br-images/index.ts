import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { accessOf, allows } from "../_shared/permissions.ts";
import { fetchPublicImage, parseImageMappings } from "../_shared/safeFetch.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );
    // Somente quem tem a permissão "Editar itens".
    const token = (req.headers.get("Authorization") ?? "").replace("Bearer ", "");
    const { data: caller } = token ? await supabase.auth.getUser(token) : { data: { user: null } };
    if (!caller?.user || !allows(await accessOf(supabase, caller.user.id), "items.manage")) {
      return new Response(JSON.stringify({ error: "Sem permissão" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    let mappings: { id: number; url: string }[];
    try {
      mappings = parseImageMappings(await req.json());
    } catch (e) {
      return new Response(JSON.stringify({ error: (e as Error).message }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const byUrl = new Map<string, number[]>();
    for (const m of mappings) {
      if (!byUrl.has(m.url)) byUrl.set(m.url, []);
      byUrl.get(m.url)!.push(m.id);
    }

    let uploaded = 0;
    let updated = 0;
    let failed = 0;
    const errors: string[] = [];

    for (const [url, ids] of byUrl.entries()) {
      try {
        const canonicalId = ids[0];
        const path = `${canonicalId}.png`;

        // Download só de endereços públicos, até 5 MB e só imagens (sem SSRF).
        const buf = await fetchPublicImage(url);

        const { error: upErr } = await supabase.storage
          .from("item-images")
          .upload(path, buf, { upsert: true, contentType: "image/png" });

        if (upErr) {
          failed++;
          errors.push(`upload ${path}: ${upErr.message}`);
          continue;
        }
        uploaded++;

        const { data: urlData } = supabase.storage
          .from("item-images")
          .getPublicUrl(path);
        const publicUrl = urlData.publicUrl;

        const { error: updErr, count } = await supabase
          .from("items")
          .update({ image_url: publicUrl }, { count: "exact" })
          .in("id", ids);
        if (updErr) {
          errors.push(`update ${ids.length} ids: ${updErr.message}`);
        } else {
          updated += count ?? ids.length;
        }
      } catch (e) {
        failed++;
        errors.push(`${url}: ${(e as Error).message}`);
      }
    }

    return new Response(
      JSON.stringify({ uploaded, updated, failed, errors: errors.slice(0, 20) }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});