import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useItemStore } from "@/hooks/useItemStore";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { ArrowLeft, Copy, Download, FileText, Plus, Save, Trash2, ChevronUp, ChevronDown, ShieldCheck, LayoutTemplate } from "lucide-react";
import { ItemPicker } from "@/components/events/ItemPicker";
import {
  SECTION_META, EVENT_TEMPLATE_VERSION, newSection, newId, idLine, validateDocument, exportDocumentFromTemplate,
  type EventDocument, type EventSection, type SectionType,
} from "@/lib/eventDocs";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const table = () => (supabase as any).from("event_documents");

export default function EventDocuments() {
  const { id } = useParams();
  return id ? <Editor id={id} /> : <DocList />;
}

function DocList() {
  const navigate = useNavigate();
  const [docs, setDocs] = useState<EventDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const { getItemImage } = useItemStore("br");

  const load = useCallback(async () => {
    const { data, error } = await table().select("*").order("updated_at", { ascending: false });
    if (error) toast.error(error.message);
    setDocs((data as EventDocument[]) ?? []);
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  const create = async (base?: EventDocument) => {
    const { data: u } = await supabase.auth.getUser();
    const payload = base
      ? { title: `${base.title} (cópia)`, theme: base.theme, servers: base.servers, start_date: base.start_date, end_date: base.end_date, sections: base.sections.map((s) => ({ ...s, id: newId() })), created_by: u.user?.id }
      : { title: "Novo documento", servers: "s1-s401", template_version: EVENT_TEMPLATE_VERSION, created_by: u.user?.id };
    const { data, error } = await table().insert(payload).select().single();
    if (error) return toast.error(error.message);
    navigate(`/eventos/${data.id}`);
  };

  const remove = async (d: EventDocument) => {
    if (!confirm(`Excluir "${d.title}"?`)) return;
    const { error } = await table().delete().eq("id", d.id);
    if (error) return toast.error(error.message);
    load();
  };

  return (
    <div className="p-6 max-w-5xl mx-auto w-full space-y-4">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" onClick={() => navigate("/")}><ArrowLeft className="h-4 w-4" /></Button>
        <h1 className="text-xl font-bold flex-1">Documentos de Eventos</h1>
        <Button onClick={() => create()} className="gap-1"><Plus className="h-4 w-4" /> Novo documento</Button>
      </div>
      {loading ? <p className="text-sm text-muted-foreground">Carregando...</p> : docs.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nenhum documento ainda. Crie o primeiro.</p>
      ) : docs.map((d) => (
        <Card key={d.id} className="p-4 flex items-center gap-3">
          <FileText className="h-5 w-5 text-primary" />
          <div className="flex-1 min-w-0">
            <p className="font-semibold truncate">{d.title}</p>
            <p className="text-xs text-muted-foreground">
              {d.servers} · {d.start_date ?? "--"} até {d.end_date ?? "--"} · {d.sections.length} seções
            </p>
          </div>
          <Badge variant={d.status === "final" ? "default" : "secondary"}>{d.status === "final" ? "Finalizado" : "Rascunho"}</Badge>
          <Button size="sm" onClick={() => navigate(`/eventos/${d.id}`)}>Abrir</Button>
          <Button size="icon" variant="ghost" title="Duplicar" onClick={() => create(d)}><Copy className="h-4 w-4" /></Button>
          <Button size="icon" variant="ghost" title="Exportar no modelo oficial" onClick={async () => {
            try { await exportDocumentFromTemplate(d, getItemImage); }
            catch (error) { toast.error(error instanceof Error ? error.message : "Falha ao exportar"); }
          }}><Download className="h-4 w-4" /></Button>
          <Button size="icon" variant="ghost" title="Excluir" onClick={() => remove(d)}><Trash2 className="h-4 w-4" /></Button>
        </Card>
      ))}
    </div>
  );
}

function Editor({ id }: { id: string }) {
  const navigate = useNavigate();
  const { allItems, getItemImage } = useItemStore("br");
  const [doc, setDoc] = useState<EventDocument | null>(null);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [newType, setNewType] = useState<SectionType>("daily");
  const knownIds = useMemo(() => new Set(allItems.map((i) => i.id)), [allItems]);
  const [issues, setIssues] = useState<ReturnType<typeof validateDocument> | null>(null);

  useEffect(() => {
    table().select("*").eq("id", id).single().then(({ data, error }: { data: EventDocument; error: Error | null }) => {
      if (error) toast.error(error.message);
      setDoc(data);
    });
  }, [id]);

  const update = (patch: Partial<EventDocument>) => { setDoc((d) => d && { ...d, ...patch }); setDirty(true); };
  const updateSection = (sid: string, patch: Partial<EventSection>) => {
    if (!doc) return;
    update({ sections: doc.sections.map((s) => (s.id === sid ? { ...s, ...patch } : s)) });
  };

  const save = async () => {
    if (!doc) return;
    setSaving(true);
    const { error } = await table().update({
      title: doc.title, theme: doc.theme, servers: doc.servers, start_date: doc.start_date || null,
      end_date: doc.end_date || null, status: doc.status, sections: doc.sections, updated_at: new Date().toISOString(),
    }).eq("id", doc.id);
    setSaving(false);
    if (error) return toast.error(error.message);
    setDirty(false);
    toast.success("Documento salvo");
  };

  if (!doc) return <p className="p-6 text-sm text-muted-foreground">Carregando...</p>;

  const move = (i: number, dir: -1 | 1) => {
    const arr = [...doc.sections];
    const j = i + dir;
    if (j < 0 || j >= arr.length) return;
    [arr[i], arr[j]] = [arr[j], arr[i]];
    update({ sections: arr });
  };

  return (
    <div className="p-6 max-w-6xl mx-auto w-full space-y-4">
      <div className="flex flex-wrap items-center gap-2 sticky top-0 z-10 bg-background py-2 border-b border-border">
        <Button variant="ghost" size="sm" onClick={() => (!dirty || confirm("Sair sem salvar?")) && navigate("/eventos")}><ArrowLeft className="h-4 w-4" /></Button>
        <Input className="flex-1 min-w-[200px] font-semibold" value={doc.title} onChange={(e) => update({ title: e.target.value })} />
        <Select value={doc.status} onValueChange={(v) => update({ status: v as EventDocument["status"] })}>
          <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="draft">Rascunho</SelectItem><SelectItem value="final">Finalizado</SelectItem></SelectContent>
        </Select>
        <Button variant="outline" className="gap-1" onClick={() => setIssues(validateDocument(doc, knownIds))}><ShieldCheck className="h-4 w-4" /> Validar</Button>
        <Button variant="outline" className="gap-1" onClick={async () => {
          const found = validateDocument(doc, knownIds);
          setIssues(found);
          if (found.length > 0) return toast.error("Corrija os problemas antes de exportar");
          try {
            await exportDocumentFromTemplate(doc, getItemImage);
            toast.success("Documento exportado no modelo oficial");
          } catch (error) {
            toast.error(error instanceof Error ? error.message : "Falha ao exportar");
          }
        }}><Download className="h-4 w-4" /> .xlsx</Button>
        <Button className="gap-1" onClick={save} disabled={saving || !dirty}><Save className="h-4 w-4" /> {saving ? "Salvando..." : "Salvar"}</Button>
      </div>

      <Card className="p-4 grid gap-3 sm:grid-cols-4">
        <Field label="Tema"><Input value={doc.theme ?? ""} onChange={(e) => update({ theme: e.target.value })} placeholder="16 Anos de DDTank" /></Field>
        <Field label="Servidores"><Input value={doc.servers} onChange={(e) => update({ servers: e.target.value })} /></Field>
        <Field label="Início"><Input type="date" value={doc.start_date ?? ""} onChange={(e) => update({ start_date: e.target.value })} /></Field>
        <Field label="Fim"><Input type="date" value={doc.end_date ?? ""} onChange={(e) => update({ end_date: e.target.value })} /></Field>
      </Card>

      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <LayoutTemplate className="h-4 w-4 text-primary" />
        Modelo ativo: 16 Anos de DDTank · imagens e formatação original preservadas
      </div>

      {issues && (
        <Card className="p-4 space-y-1">
          <p className="font-semibold text-sm">{issues.length === 0 ? "Tudo certo — nenhum problema encontrado." : `${issues.length} problema(s):`}</p>
          {issues.map((x, i) => <p key={i} className="text-xs text-destructive">{x.section}: {x.message}</p>)}
        </Card>
      )}

      {doc.sections.map((s, i) => (
        <SectionEditor
          key={s.id}
          section={s}
          index={i}
          items={allItems}
          getImage={getItemImage}
          onChange={(p) => updateSection(s.id, p)}
          onRemove={() => confirm("Remover seção?") && update({ sections: doc.sections.filter((x) => x.id !== s.id) })}
          onMove={(d) => move(i, d)}
        />
      ))}

      <Card className="p-4 flex flex-wrap items-center gap-2 border-dashed">
        <Select value={newType} onValueChange={(v) => setNewType(v as SectionType)}>
          <SelectTrigger className="w-60"><SelectValue /></SelectTrigger>
          <SelectContent>
            {Object.entries(SECTION_META).map(([k, m]) => <SelectItem key={k} value={k}>{m.label}</SelectItem>)}
          </SelectContent>
        </Select>
        <Button className="gap-1" onClick={() => update({ sections: [...doc.sections, newSection(newType, doc.servers)] })}>
          <Plus className="h-4 w-4" /> Adicionar seção
        </Button>
      </Card>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="space-y-1 block"><span className="text-xs text-muted-foreground">{label}</span>{children}</label>;
}

interface SectionProps {
  section: EventSection;
  index: number;
  items: ReturnType<typeof useItemStore>["allItems"];
  getImage: (id: string) => string;
  onChange: (p: Partial<EventSection>) => void;
  onRemove: () => void;
  onMove: (d: -1 | 1) => void;
}

function SectionEditor({ section: s, index, items, getImage, onChange, onRemove, onMove }: SectionProps) {
  const meta = SECTION_META[s.type];
  const setGroups = (groups: EventSection["groups"]) => onChange({ groups });
  const setGroup = (gi: number, patch: Partial<EventSection["groups"][number]>) =>
    setGroups(s.groups.map((g, i) => (i === gi ? { ...g, ...patch } : g)));

  return (
    <Card className="p-4 space-y-3">
      <div className="flex items-center gap-2">
        <Badge>{index + 1}. {meta.label}</Badge>
        <Badge variant="outline" className="gap-1"><LayoutTemplate className="h-3 w-3" /> Layout oficial</Badge>
        <span className="flex-1" />
        <Button size="icon" variant="ghost" onClick={() => onMove(-1)}><ChevronUp className="h-4 w-4" /></Button>
        <Button size="icon" variant="ghost" onClick={() => onMove(1)}><ChevronDown className="h-4 w-4" /></Button>
        <Button size="icon" variant="ghost" onClick={onRemove}><Trash2 className="h-4 w-4" /></Button>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Servidores"><Input value={s.servers} onChange={(e) => onChange({ servers: e.target.value })} /></Field>
        <Field label="Início"><Input type="datetime-local" value={s.start} onChange={(e) => onChange({ start: e.target.value })} /></Field>
        <Field label="Fim"><Input type="datetime-local" value={s.end} onChange={(e) => onChange({ end: e.target.value })} /></Field>
      </div>
      {meta.hasTitles && (
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Título (inglês)"><Input value={s.titleEn} onChange={(e) => onChange({ titleEn: e.target.value })} /></Field>
          <Field label="Título (PT)"><Input value={s.titlePt} onChange={(e) => onChange({ titlePt: e.target.value })} /></Field>
          <Field label="Descrição (PT)"><Input value={s.descPt} onChange={(e) => onChange({ descPt: e.target.value })} /></Field>
        </div>
      )}
      {s.type === "exchange" && (
        <Field label="Item de troca (nome / ID)"><Input value={s.exchangeItem ?? ""} onChange={(e) => onChange({ exchangeItem: e.target.value })} placeholder="Fragmento do Deus de batalha - ID 11568" /></Field>
      )}
      <Field label="Observações"><Textarea rows={2} value={s.notes} onChange={(e) => onChange({ notes: e.target.value })} /></Field>

      {s.groups.map((g, gi) => (
        <div key={gi} className="rounded-lg border border-border p-3 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <Input className="w-48" value={g.label} onChange={(e) => setGroup(gi, { label: e.target.value })} />
            {meta.hasValue && <Input className="w-48" placeholder="Custo (ex.: 11568*5)" value={g.value ?? ""} onChange={(e) => setGroup(gi, { value: e.target.value })} />}
            <ItemPicker items={items} getImage={getImage} onPick={(p) => setGroup(gi, { items: [...g.items, { ...p, qty: 1, validity: "[Permanent] [Bound]" }] })} />
            <span className="flex-1" />
            <Button size="icon" variant="ghost" onClick={() => setGroups(s.groups.filter((_, i) => i !== gi))}><Trash2 className="h-4 w-4" /></Button>
          </div>
          {g.items.map((it, ii) => {
            const setItem = (p: Partial<typeof it>) => setGroup(gi, { items: g.items.map((x, k) => (k === ii ? { ...x, ...p } : x)) });
            return (
              <div key={ii} className="flex flex-wrap items-center gap-2 text-sm">
                {getImage(it.id) ? <img src={getImage(it.id)} alt="" className="h-9 w-9 object-contain" /> : <div className="h-9 w-9 rounded bg-muted" />}
                <Input className="flex-1 min-w-[160px]" value={it.name} onChange={(e) => setItem({ name: e.target.value })} />
                <Input className="w-24" value={it.id} onChange={(e) => setItem({ id: e.target.value })} title="ID" />
                <Input className="w-20" type="number" min={1} value={it.qty} onChange={(e) => setItem({ qty: Number(e.target.value) })} title="Quantidade" />
                <Input className="w-48" value={it.validity} onChange={(e) => setItem({ validity: e.target.value })} title="Validade" />
                {meta.hasPrice && <Input className="w-32" placeholder="Preço" value={it.price ?? ""} onChange={(e) => setItem({ price: e.target.value })} />}
                {(meta.hasPrice || meta.hasValue) && <Input className="w-44" placeholder="Condição/limite" value={it.condition ?? ""} onChange={(e) => setItem({ condition: e.target.value })} />}
                <Button size="icon" variant="ghost" onClick={() => setGroup(gi, { items: g.items.filter((_, k) => k !== ii) })}><Trash2 className="h-3.5 w-3.5" /></Button>
              </div>
            );
          })}
          {g.items.length > 0 && (
            <div className="flex items-center gap-2">
              <code className="flex-1 rounded bg-muted px-2 py-1 text-xs break-all">{idLine(g.items)}</code>
              <Button size="sm" variant="ghost" onClick={() => { navigator.clipboard.writeText(idLine(g.items)); toast.success("Copiado"); }}><Copy className="h-3.5 w-3.5" /></Button>
            </div>
          )}
        </div>
      ))}
      <Button size="sm" variant="outline" className="gap-1" onClick={() => setGroups([...s.groups, { label: `${meta.groupLabel} ${s.groups.length + 1}`, items: [] }])}>
        <Plus className="h-3.5 w-3.5" /> {meta.groupLabel}
      </Button>
    </Card>
  );
}
