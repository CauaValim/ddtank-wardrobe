import { useEffect, useState } from "react";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { capacitySummary, manifest, newSection, normalizeSections } from "@/lib/eventTemplate/model";
import type { LayoutSpec } from "@/lib/eventTemplate/types";

interface DocOption {
  id: string;
  title: string;
  servers: string;
}

interface Props {
  docs: DocOption[];
  /** Depois de adicionar: abre o documento. */
  onAdded: (docId: string) => void;
}

const REQUESTS = manifest.layouts.filter((l) => l.type === "request");

/**
 * Aba "Solicitações manuais": abas de pedido de inclusão de atividade (Activity request)
 * que entram no documento como uma seção, com datas, servidores e prêmios quando houver.
 */
export function ManualRequestsPanel({ docs, onAdded }: Props) {
  const [target, setTarget] = useState(docs[0]?.id ?? "");
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    if (!docs.some((d) => d.id === target)) setTarget(docs[0]?.id ?? "");
  }, [docs, target]);

  const add = async (layout: LayoutSpec) => {
    const doc = docs.find((d) => d.id === target);
    if (!doc) {
      toast.error("Crie ou escolha um documento primeiro");
      return;
    }
    setBusy(layout.id);
    try {
      const { data, error } = await supabase.from("event_documents").select("sections").eq("id", doc.id).single();
      if (error) throw error;
      const { sections } = normalizeSections(data.sections);
      const next = [...sections, newSection(layout, doc.servers)];
      const { error: saveError } = await supabase.from("event_documents").update({ sections: next as unknown as Json }).eq("id", doc.id);
      if (saveError) throw saveError;
      toast.success(`${layout.label} adicionada em "${doc.title}"`);
      onAdded(doc.id);
    } catch (e) {
      toast.error(`Não foi possível adicionar: ${(e as Error).message}`);
    } finally {
      setBusy(null);
    }
  };

  if (REQUESTS.length === 0) {
    return <p className="text-sm text-muted-foreground">O modelo atual não tem abas de solicitação manual.</p>;
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span>Adicionar ao documento:</span>
        <Select value={target} onValueChange={setTarget} disabled={docs.length === 0}>
          <SelectTrigger className="w-72"><SelectValue placeholder="Nenhum documento" /></SelectTrigger>
          <SelectContent>{docs.map((d) => <SelectItem key={d.id} value={d.id}>{d.title} ({d.servers})</SelectItem>)}</SelectContent>
        </Select>
        <span className="text-xs text-muted-foreground">Também dá para adicionar pelo botão "Adicionar seção" dentro do documento.</span>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        {REQUESTS.map((l) => (
          <div key={l.id} className="flex items-start gap-2 rounded-md border border-border p-3">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">{l.label}</p>
              <p className="text-xs text-muted-foreground">{l.description}</p>
              <p className="text-xs text-muted-foreground">Aba: {l.sheetNamePattern.replace("{servers}", "s…")} · {capacitySummary(l)}</p>
            </div>
            <Button size="sm" variant="outline" className="shrink-0 gap-1" disabled={!target || busy !== null} onClick={() => add(l)}>
              <Plus className="h-3.5 w-3.5" /> {busy === l.id ? "Adicionando..." : "Adicionar"}
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}
