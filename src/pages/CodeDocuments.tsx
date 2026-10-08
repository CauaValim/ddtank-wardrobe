import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Download, Plus, Save, Send, ShieldCheck, Ticket, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { Json, Tables } from "@/integrations/supabase/types";
import { useAuth } from "@/hooks/useAuth";
import { useEventItemLookup } from "@/hooks/useEventItemLookup";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { SectionEditor } from "@/components/events/SectionEditor";
import { TemplateBanner } from "@/components/events/TemplateBanner";
import { codesManifest, newSection, normalizeSections } from "@/lib/eventTemplate/model";
import { exportDocument } from "@/lib/eventTemplate/exporter";
import { loadTemplate } from "@/lib/eventTemplate/templateSource";
import { downloadBlob, loadImageForWorkbook } from "@/lib/eventTemplate/browserImages";
import { validateEventDocument, type ValidationIssue } from "@/lib/eventTemplate/validate";
import { validationOptions } from "@/lib/eventTemplate/itemLookup";
import type { EventDocument, EventItem, EventSection } from "@/lib/eventTemplate/types";

type CodeRow = Tables<"code_documents">;

const STATUS: Record<string, { label: string; className: string }> = {
  rascunho: { label: "Rascunho", className: "bg-muted text-muted-foreground" },
  enviada: { label: "Enviada", className: "bg-amber-500/15 text-amber-700 dark:text-amber-400" },
  concluida: { label: "Concluída", className: "bg-green-500/15 text-green-700 dark:text-green-400" },
  recusada: { label: "Recusada", className: "bg-red-500/15 text-red-700 dark:text-red-400" },
};

const table = () => supabase.from("code_documents");

/** Documento de códigos no formato do editor de eventos (para reaproveitar editor e exportação). */
function asEventDocument(row: CodeRow, sections: EventSection[]): EventDocument {
  return { id: row.id, title: row.title, theme: null, servers: row.servers, start_date: null, end_date: null, status: "draft", sections };
}

export default function CodeDocuments() {
  const { id } = useParams();
  return id ? <CodeEditor id={id} /> : <CodeList />;
}

function StatusBadge({ status }: { status: string }) {
  const s = STATUS[status] ?? STATUS.rascunho;
  return <Badge variant="secondary" className={`border-0 ${s.className}`}>{s.label}</Badge>;
}

function CodeList() {
  const navigate = useNavigate();
  const { can, user } = useAuth();
  const manager = can("codes.manage");
  const [rows, setRows] = useState<CodeRow[]>([]);
  const [authors, setAuthors] = useState<Map<string, string>>(new Map());
  const [filter, setFilter] = useState("abertas");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const { data, error } = await table().select("*").order("updated_at", { ascending: false });
    if (error) toast.error(error.message);
    const list = data ?? [];
    setRows(list);
    setLoading(false);
    if (list.length) {
      const { data: emails } = await supabase.rpc("code_document_authors", { _ids: list.map((r) => r.id) });
      setAuthors(new Map((emails ?? []).map((e) => [e.id, e.email])));
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  const create = async () => {
    const { data, error } = await table().insert({ title: "Nova solicitação de códigos", template_version: codesManifest.version }).select("id").single();
    if (error) return toast.error(error.message);
    navigate(`/codigos/${data.id}`);
  };

  const visible = rows.filter((r) =>
    filter === "todas" ? true : filter === "abertas" ? r.status === "enviada" || (r.status === "rascunho" && r.created_by === user?.id) : r.status === filter);

  return (
    <div className="mx-auto w-full max-w-5xl space-y-4 p-6">
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="ghost" size="sm" title="Voltar ao painel" onClick={() => navigate("/")}><ArrowLeft className="h-4 w-4" /></Button>
        <h1 className="flex items-center gap-2 text-xl font-bold"><Ticket className="h-5 w-5" /> Solicitação de Códigos</h1>
        <span className="flex-1" />
        <Select value={filter} onValueChange={setFilter}>
          <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="abertas">Em aberto</SelectItem>
            {Object.entries(STATUS).map(([k, s]) => <SelectItem key={k} value={k}>{s.label}</SelectItem>)}
            <SelectItem value="todas">Todas</SelectItem>
          </SelectContent>
        </Select>
        <Button className="gap-1" onClick={create}><Plus className="h-4 w-4" /> Nova solicitação</Button>
      </div>
      <p className="text-sm text-muted-foreground">
        {manager
          ? "Solicitações enviadas pela equipe e pelas mídias. Abra uma para revisar, responder e exportar o .xlsx no modelo."
          : "Monte a solicitação (KickSub, Lives ou Torneios), escolha os itens e envie para a equipe. O arquivo .xlsx é gerado pela equipe."}
      </p>
      {loading && <p className="text-sm text-muted-foreground">Carregando...</p>}
      {!loading && visible.length === 0 && <Card className="p-6 text-sm text-muted-foreground">Nenhuma solicitação aqui.</Card>}
      {visible.map((r) => {
        const sections = normalizeSections(r.sections).sections;
        return (
          <Card key={r.id} className="flex cursor-pointer flex-wrap items-center gap-3 p-4 hover:border-primary/50" onClick={() => navigate(`/codigos/${r.id}`)}>
            <div className="min-w-0 flex-1">
              <p className="font-medium">{r.title}</p>
              <p className="text-xs text-muted-foreground">
                {sections.length} solicitação(ões) · {r.servers}
                {manager && authors.get(r.id) && ` · ${authors.get(r.id)}`} · atualizado em {new Date(r.updated_at).toLocaleDateString("pt-BR")}
              </p>
              {r.staff_note && <p className="mt-1 text-xs"><b>Resposta da equipe:</b> {r.staff_note}</p>}
            </div>
            <StatusBadge status={r.status} />
          </Card>
        );
      })}
    </div>
  );
}

function CodeEditor({ id }: { id: string }) {
  const navigate = useNavigate();
  const { can, user } = useAuth();
  const manager = can("codes.manage");
  const [row, setRow] = useState<CodeRow | null>(null);
  const [sections, setSections] = useState<EventSection[]>([]);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [issues, setIssues] = useState<ValidationIssue[] | null>(null);
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());
  const doc = row ? asEventDocument(row, sections) : null;
  const { idStatus, getImage, ensure } = useEventItemLookup(doc);

  useEffect(() => {
    table().select("*").eq("id", id).single().then(({ data, error }) => {
      if (error) return toast.error(error.message);
      setRow(data);
      setSections(normalizeSections(data.sections).sections);
    });
  }, [id]);

  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  if (!row || !doc) return <p className="p-6 text-sm text-muted-foreground">Carregando...</p>;

  const mine = row.created_by === user?.id;
  // Quem pediu edita enquanto está em rascunho ou enviada; a equipe edita sempre.
  const editable = manager || (mine && (row.status === "rascunho" || row.status === "enviada"));
  const patchRow = (patch: Partial<CodeRow>) => { setRow({ ...row, ...patch }); setDirty(true); };
  const patchSections = (next: EventSection[]) => { setSections(next); setDirty(true); };

  const save = async (extra: Partial<CodeRow> = {}) => {
    setBusy("save");
    const next = { ...row, ...extra };
    const { error } = await table().update({
      title: next.title, servers: next.servers, status: next.status, staff_note: next.staff_note,
      sections: sections as unknown as Json, template_version: codesManifest.version,
    }).eq("id", row.id);
    setBusy(null);
    if (error) {
      toast.error(error.message);
      return false;
    }
    setRow(next);
    setDirty(false);
    return true;
  };

  const check = async () => {
    const lookup = await ensure(doc);
    const found = validateEventDocument(doc, codesManifest, validationOptions(lookup)).filter((i) => i.where !== "Capa");
    setIssues(found);
    return { found, lookup };
  };

  const submit = async () => {
    const { found } = await check();
    if (found.some((i) => i.level === "error")) return toast.error("Corrija os erros antes de enviar");
    if (await save({ status: "enviada" })) toast.success("Solicitação enviada para a equipe");
  };

  const exportXlsx = async () => {
    setBusy("export");
    try {
      const { found, lookup } = await check();
      if (found.some((i) => i.level === "error")) {
        toast.error("Corrija os erros antes de exportar");
        return;
      }
      const template = await loadTemplate(codesManifest);
      const result = await exportDocument(template, codesManifest, doc, {
        loadImage: (item: EventItem) => loadImageForWorkbook(item.imageUrl || (lookup.get(item.id.trim())?.imageUrl ?? "")),
      });
      downloadBlob(result.data, result.fileName);
      if (result.warnings.length) toast.warning(`Exportado com ${result.warnings.length} aviso(s): ${result.warnings.slice(0, 2).join("; ")}`);
      else toast.success("Solicitação exportada no modelo de códigos");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const remove = async () => {
    if (!confirm("Excluir esta solicitação?")) return;
    const { error } = await table().delete().eq("id", row.id);
    if (error) return toast.error(error.message);
    navigate("/codigos");
  };

  const move = (i: number, dir: -1 | 1) => {
    const arr = [...sections];
    const j = i + dir;
    if (j < 0 || j >= arr.length) return;
    [arr[i], arr[j]] = [arr[j], arr[i]];
    patchSections(arr);
  };

  return (
    <div className="mx-auto w-full max-w-5xl space-y-4 p-6">
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="ghost" size="sm" title="Voltar à lista" onClick={() => (!dirty || confirm("Sair sem salvar?")) && navigate("/codigos")}><ArrowLeft className="h-4 w-4" /></Button>
        <Input className="max-w-md text-lg font-semibold" value={row.title} disabled={!editable} onChange={(e) => patchRow({ title: e.target.value })} />
        <StatusBadge status={row.status} />
        <span className="flex-1" />
        <Button variant="outline" className="gap-1" onClick={check}><ShieldCheck className="h-4 w-4" /> Verificar</Button>
        {editable && <Button variant="outline" className="gap-1" disabled={!dirty || busy !== null} onClick={async () => (await save()) && toast.success("Salvo")}><Save className="h-4 w-4" /> Salvar</Button>}
        {mine && row.status === "rascunho" && <Button className="gap-1" disabled={busy !== null} onClick={submit}><Send className="h-4 w-4" /> Enviar para a equipe</Button>}
        {manager && <Button className="gap-1" disabled={busy !== null} onClick={exportXlsx}><Download className="h-4 w-4" /> {busy === "export" ? "Exportando..." : "Exportar .xlsx"}</Button>}
        {(manager || (mine && row.status === "rascunho")) && <Button variant="ghost" size="icon" title="Excluir" onClick={remove}><Trash2 className="h-4 w-4" /></Button>}
      </div>

      {manager && <TemplateBanner canUpload file={codesManifest} what="O modelo de códigos" effect="a exportação .xlsx dos códigos está indisponível" />}

      <Card className="grid gap-3 p-4 sm:grid-cols-3">
        <label className="space-y-1 text-sm">
          <span className="text-xs font-medium text-muted-foreground">Servidores</span>
          <Input value={row.servers} disabled={!editable} onChange={(e) => {
            const servers = e.target.value;
            patchRow({ servers });
            patchSections(sections.map((s) => ({ ...s, servers })));
          }} />
        </label>
        {manager ? (
          <>
            <label className="space-y-1 text-sm">
              <span className="text-xs font-medium text-muted-foreground">Status</span>
              <Select value={row.status} onValueChange={(status) => patchRow({ status })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{Object.entries(STATUS).map(([k, s]) => <SelectItem key={k} value={k}>{s.label}</SelectItem>)}</SelectContent>
              </Select>
            </label>
            <label className="space-y-1 text-sm sm:col-span-3">
              <span className="text-xs font-medium text-muted-foreground">Resposta para quem pediu</span>
              <Textarea rows={2} value={row.staff_note} onChange={(e) => patchRow({ staff_note: e.target.value })} placeholder="Ex.: códigos gerados, motivo da recusa..." />
            </label>
          </>
        ) : (
          row.staff_note && <p className="text-sm sm:col-span-2"><b>Resposta da equipe:</b> {row.staff_note}</p>
        )}
      </Card>

      {issues && (
        <Card className="space-y-1 p-4">
          <p className="text-sm font-medium">{issues.length === 0 ? "Nenhum problema encontrado." : `${issues.filter((i) => i.level === "error").length} erro(s) e ${issues.filter((i) => i.level === "warning").length} aviso(s)`}</p>
          {issues.map((x, i) => <p key={i} className={`text-xs ${x.level === "error" ? "text-destructive" : "text-amber-600 dark:text-amber-400"}`}>{x.where}: {x.message}</p>)}
        </Card>
      )}

      {sections.length === 0 && <Card className="p-6 text-sm text-muted-foreground">Adicione a primeira solicitação: KickSub, Lives ou Torneios.</Card>}
      <fieldset disabled={!editable} className="space-y-4">
        {sections.map((s, i) => (
          <SectionEditor
            key={s.id}
            section={s}
            index={i}
            isFirst={i === 0}
            isLast={i === sections.length - 1}
            collapsed={collapsed.has(s.id)}
            onToggleCollapse={() => setCollapsed((prev) => {
              const next = new Set(prev);
              if (next.has(s.id)) next.delete(s.id);
              else next.add(s.id);
              return next;
            })}
            idStatus={idStatus}
            getImage={getImage}
            onChange={(ns) => patchSections(sections.map((x) => (x.id === s.id ? ns : x)))}
            onRemove={() => confirm("Remover esta solicitação do documento?") && patchSections(sections.filter((x) => x.id !== s.id))}
            onMove={(d) => move(i, d)}
          />
        ))}
      </fieldset>

      {editable && (
        <div className="flex justify-center border-t border-dashed border-border pt-4">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button className="gap-1"><Plus className="h-4 w-4" /> Adicionar solicitação</Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="max-w-md">
              {codesManifest.layouts.map((l) => (
                <DropdownMenuItem key={l.id} className="flex flex-col items-start" onSelect={() => patchSections([...sections, newSection(l, row.servers)])}>
                  <span className="font-medium">{l.label}</span>
                  <span className="text-xs text-muted-foreground">{l.description}</span>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      )}
    </div>
  );
}
