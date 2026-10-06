import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, ChevronsDownUp, ChevronsUpDown, Copy, Download, FileText, FileUp, History, Plus, Save, ShieldCheck, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useEventItemLookup } from "@/hooks/useEventItemLookup";
import { useItemUsage, invalidateItemUsage } from "@/hooks/useItemUsage";
import { useEventPresets } from "@/hooks/useEventPresets";
import { useAuth } from "@/hooks/useAuth";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { SectionEditor } from "@/components/events/SectionEditor";
import { LayoutPicker } from "@/components/events/LayoutPicker";
import { TemplateBanner } from "@/components/events/TemplateBanner";
import { DateField } from "@/components/events/DateInputs";
import { PresetsPanel } from "@/components/events/PresetsPanel";
import { HistoryPanel } from "@/components/events/HistoryPanel";
import { PastEventsImport } from "@/components/events/PastEventsImport";
import type { PresetApi } from "@/components/events/PresetControls";
import { isoToUs } from "@/lib/eventTemplate/format";
import { manifest, newId, newSection, normalizeSections } from "@/lib/eventTemplate/model";
import { exportDocument } from "@/lib/eventTemplate/exporter";
import { readDocument } from "@/lib/eventTemplate/importer";
import { loadTemplate } from "@/lib/eventTemplate/templateSource";
import { downloadBlob, loadImageForWorkbook } from "@/lib/eventTemplate/browserImages";
import { validateEventDocument, type ValidationIssue } from "@/lib/eventTemplate/validate";
import { collectItemIds, lookupItems, validationOptions, type ItemLookup } from "@/lib/eventTemplate/itemLookup";
import { SERVER_GROUPS, asServerGroup, type ServerGroup } from "@/lib/eventTemplate/serverGroups";
import type { EventDocument, EventItem } from "@/lib/eventTemplate/types";
import type { Json } from "@/integrations/supabase/types";

type Row = Omit<EventDocument, "sections"> & { sections: Json };
/** Linha da lista (sem as seções, que podem ser grandes nos eventos importados). */
type ListRow = Omit<EventDocument, "sections">;

const table = () => supabase.from("event_documents");
const LIST_COLUMNS = "id, title, theme, servers, start_date, end_date, status, template_version, updated_at, server_group, source, source_file";

function fromRow(row: Row): { doc: EventDocument; converted: number; dropped: number } {
  const { sections, converted, dropped } = normalizeSections(row.sections);
  return { doc: { ...row, status: row.status === "final" ? "final" : "draft", sections }, converted, dropped };
}

async function fetchDoc(id: string): Promise<EventDocument> {
  const { data, error } = await table().select("*").eq("id", id).single();
  if (error) throw error;
  return fromRow(data as Row).doc;
}

async function runExport(doc: EventDocument, lookup: ItemLookup): Promise<ValidationIssue[]> {
  const issues = validateEventDocument(doc, manifest, validationOptions(lookup));
  const errors = issues.filter((i) => i.level === "error");
  if (errors.length > 0) {
    toast.error(`Corrija ${errors.length} erro(s) antes de exportar`);
    return issues;
  }
  const template = await loadTemplate(manifest);
  const result = await exportDocument(template, manifest, doc, {
    loadImage: (item: EventItem) => loadImageForWorkbook(item.imageUrl || (lookup.get(item.id.trim())?.imageUrl ?? "")),
  });
  downloadBlob(result.data, result.fileName);
  if (result.warnings.length > 0) toast.warning(`Exportado com ${result.warnings.length} aviso(s): ${result.warnings.slice(0, 2).join("; ")}`);
  else toast.success("Documento exportado no modelo oficial");
  return issues;
}

const isAdminRole = (role: string | null | undefined) => role === "admin" || role === "super_admin";

export default function EventDocuments({ group }: { group?: ServerGroup }) {
  const { id } = useParams();
  return id ? <Editor id={id} /> : <DocList group={group ?? "old"} />;
}

function GroupSwitch({ group }: { group: ServerGroup }) {
  const navigate = useNavigate();
  return (
    <div className="inline-flex rounded-md border border-border p-0.5">
      {(["old", "new"] as ServerGroup[]).map((g) => (
        <Button key={g} size="sm" variant={g === group ? "default" : "ghost"} className="h-7" onClick={() => navigate(SERVER_GROUPS[g].path)}>
          {SERVER_GROUPS[g].label} ({SERVER_GROUPS[g].servers})
        </Button>
      ))}
    </div>
  );
}

function DocList({ group }: { group: ServerGroup }) {
  const navigate = useNavigate();
  const { role } = useAuth();
  const isAdmin = isAdminRole(role);
  const [docs, setDocs] = useState<ListRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const importRef = useRef<HTMLInputElement>(null);
  const info = SERVER_GROUPS[group];

  const [failure, setFailure] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await table().select(LIST_COLUMNS).eq("server_group", group).order("updated_at", { ascending: false });
    if (error) toast.error(error.message);
    setFailure(error?.message ?? null);
    setDocs(((data ?? []) as ListRow[]).map((r) => ({ ...r, status: r.status === "final" ? "final" : "draft" })));
    setLoading(false);
  }, [group]);
  useEffect(() => { load(); }, [load]);

  const created = docs.filter((d) => d.source !== "import");
  const past = docs.filter((d) => d.source === "import");

  const insert = async (payload: Partial<EventDocument>) => {
    const { data, error } = await table()
      .insert({
        ...payload,
        title: payload.title ?? "Novo documento",
        servers: payload.servers ?? info.servers,
        sections: (payload.sections ?? []) as unknown as Json,
        template_version: manifest.version,
        server_group: group,
        source: "editor",
        source_file: null,
      })
      .select("id")
      .single();
    if (error) {
      toast.error(error.message);
      return;
    }
    navigate(`/eventos/${data.id}`);
  };

  const withDoc = async (d: ListRow, key: string, fn: (doc: EventDocument) => Promise<unknown>) => {
    setBusy(key);
    try { await fn(await fetchDoc(d.id)); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Falha ao abrir o documento"); }
    finally { setBusy(null); }
  };

  const duplicate = (d: ListRow) => withDoc(d, `dup-${d.id}`, (doc) => insert({
    title: d.source === "import" ? `${d.title} (nova semana)` : `${d.title} (cópia)`,
    theme: doc.theme, servers: doc.servers, start_date: doc.start_date, end_date: doc.end_date,
    sections: doc.sections.map((s) => ({ ...s, id: newId() })),
  }));

  const remove = async (d: ListRow) => {
    if (!confirm(`Excluir "${d.title}"? Essa ação não pode ser desfeita.`)) return;
    const { error } = await table().delete().eq("id", d.id);
    if (error) return toast.error(error.message);
    invalidateItemUsage(group);
    load();
  };

  const importFile = async (file?: File) => {
    if (!file) return;
    setBusy("import");
    try {
      const doc = await readDocument(await file.arrayBuffer(), manifest);
      if (doc.sections.length === 0) {
        toast.error("Nenhuma aba dessa planilha segue o modelo oficial");
        return;
      }
      toast.success(`${doc.sections.length} aba(s) importada(s)`);
      await insert({ ...doc, title: file.name.replace(/\.xlsx$/i, "") });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao ler a planilha");
    } finally {
      setBusy(null);
    }
  };

  const list = (rows: ListRow[], empty: string) =>
    loading ? (
      <p className="text-sm text-muted-foreground">Carregando...</p>
    ) : failure ? (
      <Card className="p-6 text-sm text-destructive">Não foi possível carregar a lista: {failure}</Card>
    ) : rows.length === 0 ? (
      <Card className="p-6 text-sm text-muted-foreground">{empty}</Card>
    ) : rows.map((d) => (
      <Card key={d.id} className="flex flex-wrap items-center gap-3 p-4">
        <FileText className="h-5 w-5 text-primary" />
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold">{d.title}</p>
          <p className="truncate text-xs text-muted-foreground">
            {d.servers}, {isoToUs(d.start_date) || "sem início"} a {isoToUs(d.end_date) || "sem fim"}
            {d.source_file ? ` · ${d.source_file}` : ""}
          </p>
        </div>
        {d.source !== "import" && <Badge variant={d.status === "final" ? "default" : "secondary"}>{d.status === "final" ? "Finalizado" : "Rascunho"}</Badge>}
        <Button size="sm" onClick={() => navigate(`/eventos/${d.id}`)}>Abrir</Button>
        <Button size="icon" variant="ghost" title={d.source === "import" ? "Criar um documento novo a partir deste evento" : "Duplicar"} disabled={busy === `dup-${d.id}`} onClick={() => duplicate(d)}><Copy className="h-4 w-4" /></Button>
        <Button
          size="icon"
          variant="ghost"
          title="Exportar .xlsx"
          disabled={busy === d.id}
          onClick={() => withDoc(d, d.id, async (doc) => runExport(doc, await lookupItems(collectItemIds(doc))))}
        >
          <Download className="h-4 w-4" />
        </Button>
        <Button size="icon" variant="ghost" title="Excluir" onClick={() => remove(d)}><Trash2 className="h-4 w-4" /></Button>
      </Card>
    ));

  return (
    <div className="mx-auto w-full max-w-5xl space-y-4 p-6">
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="ghost" size="sm" title="Voltar ao painel" onClick={() => navigate("/")}><ArrowLeft className="h-4 w-4" /></Button>
        <h1 className="text-xl font-bold">Criação de Eventos</h1>
        <span className="flex-1" />
        <GroupSwitch group={group} />
      </div>
      <TemplateBanner canUpload={role === "super_admin"} />

      <Tabs defaultValue="docs">
        <TabsList className="flex-wrap">
          <TabsTrigger value="docs">Documentos ({created.length})</TabsTrigger>
          <TabsTrigger value="past">Eventos anteriores ({past.length})</TabsTrigger>
          <TabsTrigger value="presets">Pré-definições</TabsTrigger>
          {isAdmin && <TabsTrigger value="history" className="gap-1"><History className="h-3.5 w-3.5" /> Histórico</TabsTrigger>}
        </TabsList>

        <TabsContent value="docs" className="space-y-3">
          <div className="flex flex-wrap justify-end gap-2">
            <input ref={importRef} type="file" accept=".xlsx" className="hidden" onChange={(e) => { importFile(e.target.files?.[0]); e.target.value = ""; }} />
            <Button variant="outline" className="gap-1" disabled={busy === "import"} onClick={() => importRef.current?.click()}>
              <FileUp className="h-4 w-4" /> {busy === "import" ? "Importando..." : "Começar de uma planilha"}
            </Button>
            <Button className="gap-1" onClick={() => insert({ sections: [] })}><Plus className="h-4 w-4" /> Novo documento ({info.servers})</Button>
          </div>
          {list(created, "Nenhum documento ainda. Crie um novo, comece de uma planilha ou de um evento anterior.")}
        </TabsContent>

        <TabsContent value="past" className="space-y-3">
          <PastEventsImport current={group} onDone={load} />
          {list(past, `Nenhum evento anterior importado para ${info.label.toLowerCase()}.`)}
        </TabsContent>

        <TabsContent value="presets">
          <PresetsPanel group={group} canEdit={isAdmin} />
        </TabsContent>

        {isAdmin && (
          <TabsContent value="history">
            <HistoryPanel group={group} onOpen={(docId) => navigate(`/eventos/${docId}`)} />
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}

function Editor({ id }: { id: string }) {
  const navigate = useNavigate();
  const { role } = useAuth();
  const [doc, setDoc] = useState<EventDocument | null>(null);
  const group = doc ? asServerGroup(doc.server_group) : null;
  const { idStatus, getImage, ensure } = useEventItemLookup(doc);
  const { getUsage } = useItemUsage(group, doc?.id ?? null);
  const { presets, save: savePreset } = useEventPresets(group);
  const presetApi = useMemo<PresetApi>(() => ({ list: presets, canSave: isAdminRole(role), save: savePreset }), [presets, role, savePreset]);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [issues, setIssues] = useState<ValidationIssue[] | null>(null);
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    table().select("*").eq("id", id).single().then(({ data, error }) => {
      if (error) {
        toast.error(error.message);
        return;
      }
      const { doc: loaded, converted, dropped } = fromRow(data as Row);
      setDoc(loaded);
      if (converted > 0 || dropped > 0) {
        setDirty(true);
        toast.info(`Documento convertido para o novo editor (${converted} seção(ões))${dropped ? `; ${dropped} sem layout equivalente foram descartadas` : ""}. Revise e salve.`);
      }
    });
  }, [id]);

  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const update = (patch: Partial<EventDocument>) => {
    setDoc((d) => (d ? { ...d, ...patch } : d));
    setDirty(true);
  };

  const save = async () => {
    if (!doc) return;
    setSaving(true);
    const { error } = await table().update({
      title: doc.title, theme: doc.theme, servers: doc.servers, start_date: doc.start_date || null, end_date: doc.end_date || null,
      status: doc.status, sections: doc.sections as unknown as Json, template_version: manifest.version,
    }).eq("id", doc.id);
    setSaving(false);
    if (error) return toast.error(error.message);
    setDirty(false);
    invalidateItemUsage(asServerGroup(doc.server_group));
    toast.success("Documento salvo");
  };

  if (!doc || !group) return <p className="p-6 text-sm text-muted-foreground">Carregando...</p>;

  const move = (i: number, dir: -1 | 1) => {
    const arr = [...doc.sections];
    const j = i + dir;
    if (j < 0 || j >= arr.length) return;
    [arr[i], arr[j]] = [arr[j], arr[i]];
    update({ sections: arr });
  };

  const validate = async () => {
    try { setIssues(validateEventDocument(doc, manifest, validationOptions(await ensure(doc)))); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Falha ao verificar os IDs no painel"); }
  };

  return (
    <div className="mx-auto w-full max-w-6xl space-y-4 p-6">
      <div className="sticky top-0 z-10 flex flex-wrap items-center gap-2 border-b border-border bg-background py-2">
        <Button variant="ghost" size="sm" title="Voltar à lista" onClick={() => (!dirty || confirm("Sair sem salvar as alterações?")) && navigate(SERVER_GROUPS[group].path)}><ArrowLeft className="h-4 w-4" /></Button>
        <Input className="min-w-[200px] flex-1 font-semibold" value={doc.title} onChange={(e) => update({ title: e.target.value })} aria-label="Nome do documento" />
        <Badge variant="outline" title="Base de servidores deste documento">{SERVER_GROUPS[group].label}</Badge>
        {doc.source === "import" && <Badge variant="secondary">Evento anterior</Badge>}
        <Select value={doc.status} onValueChange={(v) => update({ status: v as EventDocument["status"] })}>
          <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="draft">Rascunho</SelectItem><SelectItem value="final">Finalizado</SelectItem></SelectContent>
        </Select>
        <Button variant="outline" className="gap-1" onClick={validate}><ShieldCheck className="h-4 w-4" /> Validar</Button>
        <Button
          variant="outline"
          className="gap-1"
          disabled={exporting}
          onClick={async () => {
            setExporting(true);
            try { setIssues(await runExport(doc, await ensure(doc))); }
            catch (e) { toast.error(e instanceof Error ? e.message : "Falha ao exportar"); }
            finally { setExporting(false); }
          }}
        >
          <Download className="h-4 w-4" /> {exporting ? "Gerando..." : "Exportar .xlsx"}
        </Button>
        <Button className="gap-1" onClick={save} disabled={saving || !dirty}><Save className="h-4 w-4" /> {saving ? "Salvando..." : "Salvar"}</Button>
      </div>

      <TemplateBanner canUpload={role === "super_admin"} />

      <Card className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-4">
        <label className="block space-y-1 lg:col-span-2">
          <span className="text-xs text-muted-foreground">Evento na capa (em inglês, como em "EVENT FOR THE SERVERS")</span>
          <Input value={doc.theme ?? ""} placeholder="16th Birthday Week 1" onChange={(e) => update({ theme: e.target.value })} />
        </label>
        <label className="block space-y-1">
          <span className="text-xs text-muted-foreground">Servidores do documento</span>
          <Input value={doc.servers} onChange={(e) => update({ servers: e.target.value })} />
        </label>
        <div className="grid grid-cols-2 gap-2">
          <label className="block space-y-1">
            <span className="text-xs text-muted-foreground">Início (MM/DD/YYYY)</span>
            <DateField value={doc.start_date} onChange={(v) => update({ start_date: v })} />
          </label>
          <label className="block space-y-1">
            <span className="text-xs text-muted-foreground">Fim (MM/DD/YYYY)</span>
            <DateField value={doc.end_date} onChange={(v) => update({ end_date: v })} />
          </label>
        </div>
        <p className="text-xs text-muted-foreground sm:col-span-2 lg:col-span-4">
          A capa (primeira aba do modelo) sempre sai no arquivo. Se o documento tiver uma seção de Entrada Diária, ela ocupa a capa.
          Modelo: {manifest.version}. Os selos Troca, Ranking e 30 dias mostram onde cada item já foi usado em {SERVER_GROUPS[group].label.toLowerCase()}.
        </p>
      </Card>

      {issues && (
        <Card className="space-y-1 p-4">
          <p className="text-sm font-semibold">
            {issues.length === 0 ? "Nenhum problema encontrado." : `${issues.filter((i) => i.level === "error").length} erro(s) e ${issues.filter((i) => i.level === "warning").length} aviso(s)`}
          </p>
          {issues.map((x, i) => (
            <p key={i} className={`text-xs ${x.level === "error" ? "text-destructive" : "text-amber-600 dark:text-amber-400"}`}>
              {x.where}: {x.message}
            </p>
          ))}
        </Card>
      )}

      {doc.sections.length === 0 ? (
        <Card className="p-6 text-sm text-muted-foreground">Este documento ainda não tem seções. Adicione a primeira escolhendo o layout da aba.</Card>
      ) : (
        <div className="flex justify-end">
          {(() => {
            const allCollapsed = doc.sections.every((s) => collapsed.has(s.id));
            return (
              <Button size="sm" variant="ghost" className="gap-1" onClick={() => setCollapsed(allCollapsed ? new Set() : new Set(doc.sections.map((s) => s.id)))}>
                {allCollapsed ? <ChevronsUpDown className="h-4 w-4" /> : <ChevronsDownUp className="h-4 w-4" />}
                {allCollapsed ? "Expandir todas" : "Recolher todas"}
              </Button>
            );
          })()}
        </div>
      )}

      {doc.sections.map((s, i) => (
        <SectionEditor
          key={s.id}
          section={s}
          index={i}
          isFirst={i === 0}
          isLast={i === doc.sections.length - 1}
          collapsed={collapsed.has(s.id)}
          onToggleCollapse={() => setCollapsed((prev) => {
            const next = new Set(prev);
            if (next.has(s.id)) next.delete(s.id);
            else next.add(s.id);
            return next;
          })}
          idStatus={idStatus}
          getImage={getImage}
          getUsage={getUsage}
          presets={presetApi}
          onChange={(ns) => update({ sections: doc.sections.map((x) => (x.id === s.id ? ns : x)) })}
          onRemove={() => confirm("Remover esta seção?") && update({ sections: doc.sections.filter((x) => x.id !== s.id) })}
          onMove={(d) => move(i, d)}
        />
      ))}

      <div className="flex justify-center border-t border-dashed border-border pt-4">
        <LayoutPicker onPick={(layout) => update({ sections: [...doc.sections, newSection(layout, doc.servers)] })} />
      </div>
    </div>
  );
}
