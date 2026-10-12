import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { CheckCircle2, Download, FileText, Loader2, Paperclip, RotateCcw, Trash2, X } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { periodTitle, type SchedulePeriod } from "@/hooks/useSchedule";
import { PENDENCY_TABS, type PendenciesApi, type Pendency, type PendencyAttachment, type PendencyDraft } from "@/hooks/usePendencies";

const NO_PERIOD = "none";
const EMPTY: PendencyDraft = { title: "", context: "", tab: "", period_id: null, attachments: [] };

const formatSize = (n: number) => (n < 1024 * 1024 ? `${Math.max(1, Math.round(n / 1024))} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`);
const formatDate = (iso: string) => new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });

function AttachmentView({ api, file, onRemove }: { api: PendenciesApi; file: PendencyAttachment; onRemove?: () => void }) {
  const [url, setUrl] = useState<string | null>(null);
  const image = file.type.startsWith("image/");
  useEffect(() => {
    let cancelled = false;
    if (image) api.signedUrl(file.path).then((u) => !cancelled && setUrl(u)).catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [api, file.path, image]);

  const open = async () => {
    try {
      window.open(await api.signedUrl(file.path, file.name), "_blank", "noopener");
    } catch (e) {
      toast.error(`Não foi possível abrir o anexo: ${(e as Error).message}`);
    }
  };

  return (
    <div className="group relative flex items-center gap-2 rounded-md border border-border bg-secondary/40 p-1.5">
      {image && url ? (
        <a href={url} target="_blank" rel="noreferrer" className="shrink-0">
          <img src={url} alt={file.name} className="h-12 w-12 rounded object-cover" />
        </a>
      ) : (
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded bg-muted">
          <FileText className="h-5 w-5 text-muted-foreground" />
        </div>
      )}
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs font-medium" title={file.name}>{file.name}</p>
        <p className="text-[10px] text-muted-foreground">{formatSize(file.size)}</p>
      </div>
      <Button type="button" size="icon" variant="ghost" className="h-7 w-7" title="Baixar" onClick={open}>
        <Download className="h-3.5 w-3.5" />
      </Button>
      {onRemove && (
        <Button type="button" size="icon" variant="ghost" className="h-7 w-7" title="Remover anexo" onClick={onRemove}>
          <X className="h-3.5 w-3.5" />
        </Button>
      )}
    </div>
  );
}

interface Props {
  api: PendenciesApi;
  periods: SchedulePeriod[];
  /** Nomes das categorias do cronograma, sugeridos como aba também. */
  categoryNames: string[];
  /** Pendência aberta; `null` = nova; `undefined` = fechado. */
  pendency: Pendency | null | undefined;
  canEdit: (p: Pendency) => boolean;
  onClose: () => void;
}

/** Criar, ver e editar uma pendência: título, aba, período, contexto e anexos. */
export function PendencyDialog({ api, periods, categoryNames, pendency, canEdit, onClose }: Props) {
  const [draft, setDraft] = useState<PendencyDraft>(EMPTY);
  const [uploading, setUploading] = useState(0);
  const [busy, setBusy] = useState(false);
  /** Arquivos enviados nesta edição (apagados se ela for cancelada) e anexos tirados (apagados ao salvar). */
  const uploaded = useRef<string[]>([]);
  const removed = useRef<string[]>([]);
  const fileInput = useRef<HTMLInputElement>(null);

  const open = pendency !== undefined;
  const isNew = pendency === null;
  const editable = isNew || (!!pendency && canEdit(pendency));

  useEffect(() => {
    if (pendency === undefined) return;
    setDraft(pendency ? { title: pendency.title, context: pendency.context, tab: pendency.tab, period_id: pendency.period_id, attachments: pendency.attachments ?? [] } : EMPTY);
    uploaded.current = [];
    removed.current = [];
  }, [pendency]);

  const set = (patch: Partial<PendencyDraft>) => setDraft((d) => ({ ...d, ...patch }));

  const addFiles = async (files: File[]) => {
    if (!files.length) return;
    setUploading((n) => n + files.length);
    for (const file of files) {
      try {
        const att = await api.uploadAttachment(file);
        uploaded.current.push(att.path);
        setDraft((d) => ({ ...d, attachments: [...d.attachments, att] }));
      } catch (e) {
        toast.error(`Não foi possível anexar "${file.name}": ${(e as Error).message}`);
      } finally {
        setUploading((n) => n - 1);
      }
    }
  };

  const removeAttachment = (path: string) => {
    removed.current.push(path);
    set({ attachments: draft.attachments.filter((a) => a.path !== path) });
  };

  /** Fecha sem salvar o rascunho: os arquivos enviados agora não ficam soltos no Storage. */
  const discardAndClose = () => {
    if (uploaded.current.length) api.removeFiles(uploaded.current).catch(() => undefined);
    uploaded.current = [];
    onClose();
  };
  const close = () => {
    if (!busy) discardAndClose();
  };

  const save = async () => {
    if (!draft.title.trim()) {
      toast.error("Dê um título para a pendência");
      return;
    }
    if (!draft.tab.trim()) {
      toast.error("Informe a aba da pendência");
      return;
    }
    setBusy(true);
    try {
      const clean = { ...draft, title: draft.title.trim(), tab: draft.tab.trim(), context: draft.context.trim() };
      if (isNew) await api.create(clean);
      else if (pendency) await api.update(pendency.id, clean);
      await api.removeFiles(removed.current);
      uploaded.current = [];
      toast.success(isNew ? "Pendência criada" : "Pendência salva");
      onClose();
    } catch (e) {
      toast.error(`Não foi possível salvar: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  };

  const toggleStatus = async () => {
    if (!pendency) return;
    setBusy(true);
    try {
      await api.setStatus(pendency, pendency.status === "open" ? "resolved" : "open");
      toast.success(pendency.status === "open" ? "Pendência resolvida" : "Pendência reaberta");
      discardAndClose();
    } catch (e) {
      toast.error(`Não foi possível alterar: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!pendency || !confirm(`Excluir a pendência "${pendency.title}"? Os anexos também serão apagados.`)) return;
    setBusy(true);
    try {
      await api.remove(pendency);
      toast.success("Pendência excluída");
      discardAndClose();
    } catch (e) {
      toast.error(`Não foi possível excluir: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  };

  const tabOptions = [...new Set([...PENDENCY_TABS, ...categoryNames])];

  return (
    <Dialog open={open} onOpenChange={(v) => !v && close()}>
      <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isNew ? "Nova pendência" : editable ? "Editar pendência" : "Pendência"}</DialogTitle>
          {pendency && (
            <DialogDescription>
              Criada por {pendency.created_by_email ?? "—"} em {formatDate(pendency.created_at)}
              {pendency.status === "resolved" && pendency.resolved_at
                ? ` · resolvida${pendency.resolved_by_email ? ` por ${pendency.resolved_by_email}` : ""} em ${formatDate(pendency.resolved_at)}`
                : ""}
            </DialogDescription>
          )}
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="pendency-title">Título</Label>
            <Input id="pendency-title" value={draft.title} disabled={!editable} onChange={(e) => set({ title: e.target.value })} placeholder="Ex.: Faça se Puder do dia 15/10 não entrou" />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="pendency-tab">Aba</Label>
              <Input id="pendency-tab" list="pendency-tabs" value={draft.tab} disabled={!editable} onChange={(e) => set({ tab: e.target.value })} placeholder="Escolha ou escreva" />
              <datalist id="pendency-tabs">
                {tabOptions.map((t) => <option key={t} value={t} />)}
              </datalist>
            </div>
            <div className="space-y-1.5">
              <Label>Período do cronograma</Label>
              <Select value={draft.period_id ?? NO_PERIOD} disabled={!editable} onValueChange={(v) => set({ period_id: v === NO_PERIOD ? null : v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_PERIOD}>Nenhum</SelectItem>
                  {periods.map((p) => (
                    <SelectItem key={p.id} value={p.id}>{periodTitle(p)}{p.theme ? ` — ${p.theme}` : ""}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="pendency-context">Contexto</Label>
            <Textarea
              id="pendency-context"
              rows={6}
              value={draft.context}
              disabled={!editable}
              onChange={(e) => set({ context: e.target.value })}
              onPaste={(e) => {
                // Print colado no contexto vira anexo.
                const files = Array.from(e.clipboardData.files);
                if (files.length && editable) {
                  e.preventDefault();
                  addFiles(files);
                }
              }}
              placeholder="Ex.: O Faça se Puder do dia 15/10 não entrou no jogo nos servidores s1-s401. Os prêmios do 2º dia também não apareceram. Prints colados aqui (Ctrl+V) viram anexos."
            />
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <Label>Anexos</Label>
              {uploading > 0 && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
              <span className="flex-1" />
              {editable && (
                <>
                  <input ref={fileInput} type="file" multiple className="hidden" onChange={(e) => { addFiles(Array.from(e.target.files ?? [])); e.target.value = ""; }} />
                  <Button type="button" size="sm" variant="outline" className="h-7" onClick={() => fileInput.current?.click()}>
                    <Paperclip className="mr-1 h-3.5 w-3.5" /> Anexar
                  </Button>
                </>
              )}
            </div>
            {draft.attachments.length === 0 ? (
              <p className="text-xs text-muted-foreground">Nenhum anexo.</p>
            ) : (
              <div className="grid gap-1.5">
                {draft.attachments.map((a) => (
                  <AttachmentView key={a.path} api={api} file={a} onRemove={editable ? () => removeAttachment(a.path) : undefined} />
                ))}
              </div>
            )}
          </div>
        </div>

        <DialogFooter className="gap-2 sm:justify-between">
          <div className="flex gap-2">
            {pendency && editable && (
              <>
                <Button type="button" variant="ghost" className="text-destructive" disabled={busy} onClick={remove}>
                  <Trash2 className="mr-1 h-4 w-4" /> Excluir
                </Button>
                <Button type="button" variant="outline" disabled={busy} onClick={toggleStatus}>
                  {pendency.status === "open" ? <><CheckCircle2 className="mr-1 h-4 w-4" /> Resolver</> : <><RotateCcw className="mr-1 h-4 w-4" /> Reabrir</>}
                </Button>
              </>
            )}
          </div>
          {editable ? (
            <Button type="button" disabled={busy || uploading > 0} onClick={save}>
              {busy && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
              {isNew ? "Criar pendência" : "Salvar"}
            </Button>
          ) : (
            <Button type="button" variant="outline" onClick={close}>Fechar</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
