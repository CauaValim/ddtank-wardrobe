import { useState } from "react";
import { ImageDown } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

const PAGE = 1000;
const COLUMNS = ["id", "name", "type", "need_sex", "pic_path", "image_url"] as const;

const csvCell = (v: unknown) => {
  const s = v == null ? "" : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/**
 * Exporta (ADM) a lista de itens com o link da imagem salva no painel, para auditar
 * as imagens contra as oficiais do jogo.
 */
export function ExportItemImagesButton({ realm }: { realm: "br" | "turco" }) {
  const [busy, setBusy] = useState(false);
  const table = (realm === "turco" ? "items_turco" : "items") as "items";

  const run = async () => {
    setBusy(true);
    const t = toast.loading("Lendo os itens do painel...");
    try {
      const rows: Record<string, unknown>[] = [];
      for (let from = 0; ; from += PAGE) {
        const { data, error } = await supabase.from(table).select(COLUMNS.join(", ")).order("id", { ascending: true }).range(from, from + PAGE - 1);
        if (error) throw error;
        rows.push(...((data ?? []) as unknown as Record<string, unknown>[]));
        toast.loading(`Lendo os itens do painel... ${rows.length}`, { id: t });
        if (!data || data.length < PAGE) break;
      }
      const csv = [COLUMNS.join(","), ...rows.map((r) => COLUMNS.map((c) => csvCell(r[c])).join(","))].join("\r\n");
      const url = URL.createObjectURL(new Blob(["﻿", csv], { type: "text/csv;charset=utf-8" }));
      const link = document.createElement("a");
      link.href = url;
      link.download = `imagens-itens-${realm}-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
      toast.success(`${rows.length} itens exportados`, { id: t });
    } catch (e) {
      toast.error(`Falha ao exportar: ${(e as Error).message}`, { id: t });
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      onClick={run}
      disabled={busy}
      className="flex items-center gap-1.5 rounded-md border border-border bg-secondary px-3 py-1.5 text-xs font-medium text-secondary-foreground hover:bg-muted transition-all disabled:opacity-50"
      title="Baixa a lista de itens com o link da imagem salva no painel (auditoria de imagens)"
    >
      <ImageDown className="h-3.5 w-3.5" />
      {busy ? "Exportando..." : "Exportar imagens dos itens (.csv)"}
    </button>
  );
}
