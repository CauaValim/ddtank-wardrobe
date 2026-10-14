import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Download, History, Plus, Save, Send, ShieldCheck, Ticket, Trash2 } from "lucide-react";
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
import { deleteLocal, readLocal, writeLocal } from "@/lib/eventTemplate/localBackup";

type CodeRow = Tables<"code_documents">;

const STATUS: Record<string, { label: string; className: string }> = {
  rascunho: { label: "Rascunho", className: "bg-muted text-muted-foreground" },
  enviada: { label: "Enviada", className: "bg-amber-500/15 text-amber-700 dark:text-amber-400" },
  concluida: { label: "Concluída", className: "bg-green-500/15 text-green-700 dark:text-green-400" },
  recusada: { label: "Recusada", className: "bg-red-500/15 text-red-700 dark:text-red-400" },
};

const table = () => supabase.from("code_documents");

/** Backup automático do editor de códigos (cópia neste computador e salvamento no servidor). */
const AUTOSAVE_MS = 60_000;
interface CodeBackup {
  title: string;
  servers: string;
  staff_note: string;
  sections: EventSection[];
  savedAt: string;
}
const backupKey = (id: string) => `code:${id}`;
const codeContent = (b: Pick<CodeBackup, "title" | "servers" | "staff_note" | "sections">) =>
  JSON.stringify({ title: b.title, servers: b.servers, staff_note: b.staff_note ?? "", sections: b.sections });
const hhmm = (d: Date) => d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });

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
  /** Cópia deste computador com alterações que não chegaram ao servidor (queda de internet ou energia). */
  const [recovery, setRecovery] = useState<CodeBackup | null>(null);
  const [autoSaved, setAutoSaved] = useState<{ at: Date; where: "server" | "local" } | null>(null);
  // Estado mais recente para o salvamento automático (o intervalo não reinicia a cada tecla).
  const rowRef = useRef<CodeRow | null>(null);
  const sectionsRef = useRef<EventSection[]>([]);
  const dirtyRef = useRef(false);
  const editableRef = useRef(false);
  const editVersion = useRef(0);
  const savingRef = useRef(false);
  rowRef.current = row;
  sectionsRef.current = sections;
  dirtyRef.current = dirty;
  editableRef.current = !!row && (manager || (row.created_by === user?.id && (row.status === "rascunho" || row.status === "enviada")));

  useEffect(() => {
    table().select("*").eq("id", id).single().then(async ({ data, error }) => {
      if (error) return toast.error(error.message);
      const loaded = normalizeSections(data.sections).sections;
      setRow(data);
      setSections(loaded);
      const backup = await readLocal<CodeBackup>(backupKey(id));
      if (backup && codeContent(backup) !== codeContent({ ...data, sections: loaded })) setRecovery(backup);
      else if (backup) deleteLocal(backupKey(id));
    });
  }, [id]);

  /** Grava no servidor; `extra` muda campos (ex.: status ao enviar); `auto` = sem avisos. */
  const persist = useCallback(async (extra: Partial<CodeRow>, auto: boolean): Promise<boolean> => {
    const current = rowRef.current;
    if (!current || savingRef.current) return false;
    savingRef.current = true;
    if (!auto) setBusy("save");
    const version = editVersion.current;
    const next = { ...current, ...extra };
    const { error } = await table().update({
      title: next.title, servers: next.servers, status: next.status, staff_note: next.staff_note,
      sections: sectionsRef.current as unknown as Json, template_version: codesManifest.version,
    }).eq("id", current.id);
    savingRef.current = false;
    if (!auto) setBusy(null);
    if (error) {
      if (!auto) toast.error(error.message);
      return false;
    }
    setRow((r) => (r ? { ...r, ...extra } : r));
    // Alterações feitas enquanto salvava ficam para o próximo salvamento.
    if (editVersion.current === version) {
      setDirty(false);
      deleteLocal(backupKey(current.id));
    }
    return true;
  }, []);

  const backupNow = useCallback(async () => {
    const current = rowRef.current;
    if (!current || !dirtyRef.current || !editableRef.current) return false;
    await writeLocal<CodeBackup>(backupKey(current.id), {
      title: current.title, servers: current.servers, staff_note: current.staff_note ?? "",
      sections: sectionsRef.current, savedAt: new Date().toISOString(),
    });
    return true;
  }, []);

  // A cada 1 minuto com alterações: cópia neste computador e, com internet, salva no servidor.
  useEffect(() => {
    const tick = async () => {
      if (!(await backupNow())) return;
      const online = typeof navigator === "undefined" || navigator.onLine;
      const ok = online && (await persist({}, true));
      setAutoSaved({ at: new Date(), where: ok ? "server" : "local" });
    };
    const timer = window.setInterval(tick, AUTOSAVE_MS);
    const onHide = () => { if (document.visibilityState === "hidden") backupNow(); };
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("pagehide", backupNow);
    window.addEventListener("online", tick);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("pagehide", backupNow);
      window.removeEventListener("online", tick);
    };
  }, [backupNow, persist]);

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
  const patchRow = (patch: Partial<CodeRow>) => { setRow({ ...row, ...patch }); setDirty(true); editVersion.current += 1; };
  const patchSections = (next: EventSection[]) => { setSections(next); setDirty(true); editVersion.current += 1; };

  const save = (extra: Partial<CodeRow> = {}) => persist(extra, false);

  const restoreBackup = () => {
    if (!recovery) return;
    setRow({ ...row, title: recovery.title, servers: recovery.servers, staff_note: recovery.staff_note });
    setSections(normalizeSections(recovery.sections).sections);
    setDirty(true);
    editVersion.current += 1;
    setRecovery(null);
    toast.success("Cópia de segurança restaurada. Confira e salve.");
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

      {editable && (
        <p className="-mt-2 text-right text-[11px] text-muted-foreground" title="Backup automático a cada 1 minuto">
          {dirty
            ? autoSaved?.where === "local"
              ? `Sem conexão: cópia guardada neste computador às ${hhmm(autoSaved.at)}. Salva no servidor quando a internet voltar.`
              : "Alterações não salvas · backup automático a cada 1 minuto"
            : autoSaved?.where === "server" ? `Salvo automaticamente às ${hhmm(autoSaved.at)}` : "Tudo salvo"}
        </p>
      )}

      {recovery && editable && (
        <Card className="flex flex-wrap items-center gap-3 border-amber-500/50 bg-amber-500/10 p-3 text-sm">
          <History className="h-4 w-4 shrink-0 text-amber-600" />
          <span className="min-w-[240px] flex-1">
            Há uma cópia de segurança desta solicitação feita neste computador em{" "}
            <strong>{new Date(recovery.savedAt).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}</strong>{" "}
            com alterações que não chegaram a ser salvas (queda de internet ou energia).
          </span>
          <Button size="sm" onClick={restoreBackup}>Restaurar cópia</Button>
          <Button size="sm" variant="ghost" onClick={() => { deleteLocal(backupKey(row.id)); setRecovery(null); }}>Descartar</Button>
        </Card>
      )}

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
