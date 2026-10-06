import { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { CheckCircle2, FileStack, Loader2, Search, XCircle } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { manifest } from "@/lib/eventTemplate/model";
import { readDocument } from "@/lib/eventTemplate/importer";
import { archiveDocument } from "@/lib/eventTemplate/pastEvents";
import { resolveIdsByName } from "@/lib/eventTemplate/resolveNames";
import { normalizeSections } from "@/lib/eventTemplate/model";
import { namesWithoutId } from "@/lib/eventTemplate/nameMatch";
import { SERVER_GROUPS, type ServerGroup } from "@/lib/eventTemplate/serverGroups";
import { invalidateItemUsage } from "@/hooks/useItemUsage";
import type { Json } from "@/integrations/supabase/types";

type Result = { file: string; ok: boolean; message: string };

const nameSummary = ({ resolved, missing }: { resolved: number; missing: number }) =>
  `${resolved ? `, ${resolved} item(ns) sem ID encontrados pelo nome` : ""}${missing ? `, ${missing} sem correspondência na base` : ""}`;

/**
 * Dois botões (servidores antigos / novos) que enviam várias planilhas de eventos anteriores
 * de uma vez. Cada arquivo vira um "evento anterior" só com nomes, IDs e quantidades.
 */
export function PastEventsImport({ current, onDone }: { current: ServerGroup; onDone: () => void }) {
  const navigate = useNavigate();
  const refs = { old: useRef<HTMLInputElement>(null), new: useRef<HTMLInputElement>(null) };
  const [running, setRunning] = useState<{ group: ServerGroup; done: number; total: number } | null>(null);
  const [results, setResults] = useState<Result[]>([]);
  const [lastGroup, setLastGroup] = useState<ServerGroup | null>(null);
  const [fixing, setFixing] = useState<string | null>(null);

  /** Eventos já importados sem ID: procura os nomes na base e grava os IDs encontrados. */
  const fillMissingIds = async () => {
    setFixing("Buscando eventos importados...");
    try {
      const { data, error } = await supabase.from("event_documents").select("id, title, sections").eq("server_group", current).eq("source", "import");
      if (error) throw error;
      let docs = 0;
      let resolved = 0;
      let missing = 0;
      const pending = (data ?? []).map((d) => ({ ...d, sections: normalizeSections(d.sections).sections })).filter((d) => namesWithoutId(d.sections).length > 0);
      for (const [i, d] of pending.entries()) {
        setFixing(`Completando IDs: ${i + 1} de ${pending.length} evento(s)...`);
        const named = await resolveIdsByName(d.sections);
        missing += named.missing;
        if (named.resolved === 0) continue;
        const { error: upErr } = await supabase.from("event_documents").update({ sections: named.sections as unknown as Json }).eq("id", d.id);
        if (upErr) throw upErr;
        docs += 1;
        resolved += named.resolved;
      }
      invalidateItemUsage(current);
      toast.success(`${resolved} item(ns) completados pelo nome em ${docs} evento(s)${missing ? `; ${missing} continuam sem correspondência na base` : ""}`);
      onDone();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao completar os IDs");
    } finally {
      setFixing(null);
    }
  };
  // O botão da base aberta vem primeiro; o da outra base grava lá (e avisa onde ver).
  const order: ServerGroup[] = current === "old" ? ["old", "new"] : ["new", "old"];

  const run = async (group: ServerGroup, files: File[]) => {
    if (files.length === 0) return;
    setResults([]);
    setLastGroup(group);
    setRunning({ group, done: 0, total: files.length });
    const out: Result[] = [];
    for (const [i, file] of files.entries()) {
      try {
        const doc = await readDocument(await file.arrayBuffer(), manifest);
        if (doc.sections.length === 0) {
          out.push({ file: file.name, ok: false, message: "nenhuma aba segue o modelo oficial" });
        } else {
          // Planilhas sem ID: o item é procurado na base pelo nome.
          const named = await resolveIdsByName(doc.sections);
          const archived = archiveDocument({ ...doc, sections: named.sections }, file.name);
          const { error } = await supabase.from("event_documents").insert({
            ...archived,
            sections: archived.sections as unknown as Json,
            server_group: group,
            source: "import",
            source_file: file.name,
          });
          if (error?.code === "23505") out.push({ file: file.name, ok: false, message: "já tinha sido importado" });
          else if (error) out.push({ file: file.name, ok: false, message: error.message });
          else out.push({ file: file.name, ok: true, message: `${archived.sections.length} aba(s)${nameSummary(named)}` });
        }
      } catch (e) {
        out.push({ file: file.name, ok: false, message: e instanceof Error ? e.message : "falha ao ler a planilha" });
      }
      setRunning({ group, done: i + 1, total: files.length });
      setResults([...out]);
    }
    setRunning(null);
    invalidateItemUsage(group);
    const ok = out.filter((r) => r.ok).length;
    const where = SERVER_GROUPS[group].label.toLowerCase();
    const action = group !== current ? { label: `Abrir ${where}`, onClick: () => navigate(SERVER_GROUPS[group].path) } : undefined;
    if (ok === out.length) toast.success(`${ok} evento(s) importado(s) em ${where}`, { action });
    else toast.warning(`${ok} de ${out.length} arquivo(s) importado(s) em ${where}; veja os detalhes`, { action });
    onDone();
  };

  return (
    <Card className="space-y-3 p-4">
      <div>
        <p className="font-semibold">Base de eventos anteriores</p>
        <p className="text-xs text-muted-foreground">
          Envie as planilhas das semanas anteriores (pode selecionar várias). São guardados só os textos, nomes, IDs e quantidades,
          sem imagens. As bases de servidores antigos e novos ficam separadas.
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        {order.map((group) => (
          <span key={group}>
            <input
              ref={refs[group]}
              type="file"
              accept=".xlsx"
              multiple
              className="hidden"
              onChange={(e) => {
                const files = Array.from(e.target.files ?? []);
                e.target.value = "";
                run(group, files);
              }}
            />
            <Button
              variant={group === current ? "default" : "outline"}
              className="gap-1"
              disabled={!!running}
              title={group === current ? "Importa para esta base" : `Importa para a base de ${SERVER_GROUPS[group].label.toLowerCase()} (aparece na outra área)`}
              onClick={() => refs[group].current?.click()}
            >
              <FileStack className="h-4 w-4" /> Importar eventos – {SERVER_GROUPS[group].label} ({SERVER_GROUPS[group].servers})
            </Button>
          </span>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="ghost" size="sm" className="gap-1" disabled={!!running || !!fixing} onClick={fillMissingIds}
          title="Para eventos já importados de planilhas sem ID: procura cada item pelo nome na base do painel">
          <Search className="h-4 w-4" /> Completar IDs pelo nome ({SERVER_GROUPS[current].label.toLowerCase()})
        </Button>
        {fixing && <span className="flex items-center gap-1 text-xs text-muted-foreground"><Loader2 className="h-3 w-3 animate-spin" /> {fixing}</span>}
      </div>
      {running && (
        <p className="flex items-center gap-2 text-sm">
          <Loader2 className="h-4 w-4 animate-spin" /> Importando {running.done} de {running.total} ({SERVER_GROUPS[running.group].label.toLowerCase()})...
        </p>
      )}
      {results.length > 0 && lastGroup && !running && (
        <p className="text-xs">
          Enviados para <span className="font-semibold">{SERVER_GROUPS[lastGroup].label.toLowerCase()}</span>.
          {lastGroup !== current && (
            <Button variant="link" className="h-auto p-0 pl-1 text-xs" onClick={() => navigate(SERVER_GROUPS[lastGroup].path)}>
              Abrir essa base
            </Button>
          )}
        </p>
      )}
      {results.length > 0 && (
        <ul className="max-h-48 space-y-0.5 overflow-y-auto text-xs">
          {results.map((r, i) => (
            <li key={i} className="flex items-center gap-1">
              {r.ok ? <CheckCircle2 className="h-3.5 w-3.5 text-green-600" /> : <XCircle className="h-3.5 w-3.5 text-destructive" />}
              <span className="truncate font-medium">{r.file}</span>
              <span className="text-muted-foreground">— {r.message}</span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
