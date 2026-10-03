import { useState } from "react";
import { RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

export function GameSyncButton() {
  const [busy, setBusy] = useState(false);

  const run = async () => {
    setBusy(true);
    const t = toast.loading("Baixando dados do jogo...");
    try {
      const { data, error } = await supabase.functions.invoke("sync-game-items");
      if (error || data?.error) throw new Error(data?.error || error?.message);
      if (!data.added && !data.images) {
        toast.success(`Painel já está atualizado com o jogo. Itens sem imagem: ${data.stillMissing}.`, { id: t });
      } else {
        toast.success(`${data.added} novos itens, ${data.images} imagens recuperadas (restam ${data.stillMissing} sem imagem). Recarregando...`, { id: t });
        setTimeout(() => window.location.reload(), 1500);
      }
    } catch (e) {
      toast.error(`Falha ao sincronizar: ${(e as Error).message}`, { id: t });
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      onClick={run}
      disabled={busy}
      className="flex items-center gap-1.5 rounded-md border border-border bg-secondary px-3 py-1.5 text-xs font-medium text-secondary-foreground hover:bg-muted transition-all disabled:opacity-50"
      title="Sincronizar com o Jogo"
    >
      <RefreshCw className={`h-3.5 w-3.5 ${busy ? "animate-spin" : ""}`} />
      Sincronizar com o Jogo
    </button>
  );
}
