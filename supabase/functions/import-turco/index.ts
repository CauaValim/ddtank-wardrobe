import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function toBool(v: unknown): boolean {
  if (v === true || v === 1 || v === "1" || v === "true" || v === "True") return true;
  return false;
}
function toInt(v: unknown): number {
  const n = parseInt(String(v ?? 0), 10);
  return Number.isFinite(n) ? n : 0;
}
function toNum(v: unknown): number {
  const n = parseFloat(String(v ?? 0));
  return Number.isFinite(n) ? n : 0;
}
function toText(v: unknown): string | null {
  if (v === null || v === undefined || v === "") return null;
  return String(v);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    const body = await req.json();
    const items = Array.isArray(body) ? body : body.items;
    if (!Array.isArray(items)) {
      return new Response(JSON.stringify({ error: "items array required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const rows = items.map((it: any) => ({
      id: toInt(it.id),
      name: toText(it.name),
      type: toInt(it.type),
      remark: toText(it.remark),
      attack: toInt(it.attack),
      defence: toInt(it.defence),
      agility: toInt(it.agility),
      luck: toInt(it.luck),
      item_grade: toInt(it.item_grade),
      profile: toText(it.profile),
      pic_path: toText(it.pic_path),
      pile_count: toInt(it.pile_count),
      need_sex: toInt(it.need_sex),
      need_grade: toInt(it.need_grade),
      is_strengthen: toBool(it.is_strengthen),
      is_compose: toBool(it.is_compose),
      is_throw: toBool(it.is_throw),
      is_equip: toBool(it.is_equip),
      is_use: toBool(it.is_use),
      is_delete: toBool(it.is_delete),
      data: toText(it.data),
      attribute1: toText(it.attribute1),
      attribute2: toText(it.attribute2),
      attribute3: toText(it.attribute3),
      attribute4: toText(it.attribute4),
      attribute5: toText(it.attribute5),
      attribute6: toText(it.attribute6),
      attribute7: toText(it.attribute7),
      attribute8: toText(it.attribute8),
      bind_type: toInt(it.bind_type),
      melt_type: toInt(it.melt_type),
      success_rate: toNum(it.success_rate),
      success_modulus: toNum(it.success_modulus),
      beset: toText(it.beset),
      melt_grade: toInt(it.melt_grade),
      price: toInt(it.price),
      price_type: toInt(it.price_type),
      can_send: toBool(it.can_send),
      is_callback: toBool(it.is_callBack ?? it.is_callback),
      floor_price: toInt(it.FloorPrice ?? it.floor_price),
      suit_id: toInt(it.SuitID ?? it.suit_id),
      can_transfer: toBool(it.CanTransfer ?? it.can_transfer),
    }));

    // dedupe by id
    const seen = new Map<number, any>();
    for (const r of rows) seen.set(r.id, r);
    const finalRows = Array.from(seen.values());

    const batchSize = 500;
    let inserted = 0;
    const errors: string[] = [];
    for (let i = 0; i < finalRows.length; i += batchSize) {
      const batch = finalRows.slice(i, i + batchSize);
      const { error, count } = await supabase
        .from("items_turco")
        .upsert(batch, { onConflict: "id", ignoreDuplicates: false, count: "exact" });
      if (error) {
        errors.push(`batch ${i}: ${error.message}`);
      } else {
        inserted += count ?? batch.length;
      }
    }

    return new Response(JSON.stringify({ total: finalRows.length, inserted, errors }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});