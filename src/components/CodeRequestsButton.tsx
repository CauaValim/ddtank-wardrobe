import { useCallback, useEffect, useState } from "react";
import { Ticket } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type CodeRequest = Tables<"code_requests">;

const CHANNELS = ["YouTube", "Twitch", "TikTok", "Instagram", "Discord", "Facebook", "Outro"];
const STATUS: Record<string, { label: string; className: string }> = {
  pendente: { label: "Pendente", className: "bg-amber-500/15 text-amber-700 dark:text-amber-400" },
  aprovado: { label: "Aprovado", className: "bg-blue-500/15 text-blue-700 dark:text-blue-400" },
  entregue: { label: "Entregue", className: "bg-green-500/15 text-green-700 dark:text-green-400" },
  recusado: { label: "Recusado", className: "bg-red-500/15 text-red-700 dark:text-red-400" },
};

const EMPTY_FORM = { channel: CHANNELS[0], purpose: "", quantity: "1", reward: "", servers: "", neededBy: "", notes: "" };

const formatDate = (iso: string | null) => (iso ? new Date(iso.length === 10 ? `${iso}T00:00:00` : iso).toLocaleDateString("pt-BR") : "");

interface Props {
  userId: string;
  email: string;
  /** ADM: vê todas as solicitações e responde. */
  canManage: boolean;
}

/** Solicitação de códigos pelas mídias, com a lista de pedidos e as respostas da staff. */
export function CodeRequestsButton({ userId, email, canManage }: Props) {
  const [open, setOpen] = useState(false);
  const [requests, setRequests] = useState<CodeRequest[]>([]);
  const [form, setForm] = useState(EMPTY_FORM);
  const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState("pendente");

  const load = useCallback(async () => {
    const { data, error } = await supabase.from("code_requests").select("*").order("created_at", { ascending: false }).limit(300);
    if (!error) setRequests(data ?? []);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const pending = requests.filter((r) => r.status === "pendente").length;
  const set = (key: keyof typeof EMPTY_FORM, value: string) => setForm((f) => ({ ...f, [key]: value }));

  const submit = async () => {
    if (!form.purpose.trim()) {
      toast.error("Descreva para que são os códigos");
      return;
    }
    setBusy(true);
    const { error } = await supabase.from("code_requests").insert({
      requested_by: userId,
      requester_email: email,
      channel: form.channel,
      purpose: form.purpose.trim(),
      quantity: Math.max(1, Number(form.quantity) || 1),
      reward: form.reward.trim(),
      servers: form.servers.trim(),
      needed_by: form.neededBy || null,
      notes: form.notes.trim(),
    });
    setBusy(false);
    if (error) {
      toast.error(`Não foi possível enviar: ${error.message}`);
      return;
    }
    toast.success("Solicitação enviada para a staff");
    setForm(EMPTY_FORM);
    await load();
  };

  const visible = canManage && filter !== "todas" ? requests.filter((r) => r.status === filter) : requests;

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="relative flex items-center gap-1.5 rounded-md border border-border bg-secondary px-3 py-1.5 text-xs font-medium text-secondary-foreground hover:bg-muted transition-all"
        title={canManage ? "Solicitações de códigos das mídias" : "Solicitar códigos para a staff"}
      >
        <Ticket className="h-3.5 w-3.5" />
        {canManage ? "Códigos" : "Solicitar códigos"}
        {canManage && pending > 0 && (
          <span className="ml-0.5 rounded-full bg-primary px-1.5 text-[10px] font-semibold leading-4 text-primary-foreground">{pending}</span>
        )}
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Solicitação de códigos</DialogTitle>
          </DialogHeader>
          <Tabs defaultValue={canManage ? "lista" : "nova"}>
            <TabsList>
              <TabsTrigger value="nova">Nova solicitação</TabsTrigger>
              <TabsTrigger value="lista">{canManage ? `Solicitações (${pending} pendentes)` : "Minhas solicitações"}</TabsTrigger>
            </TabsList>

            <TabsContent value="nova" className="space-y-3">
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="space-y-1">
                  <Label>Canal</Label>
                  <Select value={form.channel} onValueChange={(v) => set("channel", v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{CHANNELS.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label htmlFor="cr-qty">Quantidade de códigos</Label>
                  <Input id="cr-qty" type="number" min={1} value={form.quantity} onChange={(e) => set("quantity", e.target.value)} />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="cr-date">Preciso até</Label>
                  <Input id="cr-date" type="date" value={form.neededBy} onChange={(e) => set("neededBy", e.target.value)} />
                </div>
              </div>
              <div className="space-y-1">
                <Label htmlFor="cr-purpose">Para que são os códigos *</Label>
                <Textarea id="cr-purpose" rows={2} placeholder="Ex.: sorteio na live de sábado, vídeo do evento de Halloween" value={form.purpose} onChange={(e) => set("purpose", e.target.value)} />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label htmlFor="cr-reward">Recompensa desejada</Label>
                  <Input id="cr-reward" placeholder="Ex.: pacote de cupons, item do evento" value={form.reward} onChange={(e) => set("reward", e.target.value)} />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="cr-servers">Servidores</Label>
                  <Input id="cr-servers" placeholder="Ex.: s1-s401 ou s402" value={form.servers} onChange={(e) => set("servers", e.target.value)} />
                </div>
              </div>
              <div className="space-y-1">
                <Label htmlFor="cr-notes">Observações</Label>
                <Textarea id="cr-notes" rows={2} value={form.notes} onChange={(e) => set("notes", e.target.value)} />
              </div>
              <div className="flex justify-end">
                <Button onClick={submit} disabled={busy}>{busy ? "Enviando..." : "Enviar solicitação"}</Button>
              </div>
            </TabsContent>

            <TabsContent value="lista" className="space-y-3">
              {canManage && (
                <Select value={filter} onValueChange={setFilter}>
                  <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(STATUS).map(([k, s]) => <SelectItem key={k} value={k}>{s.label}</SelectItem>)}
                    <SelectItem value="todas">Todas</SelectItem>
                  </SelectContent>
                </Select>
              )}
              {visible.length === 0 && <p className="text-sm text-muted-foreground">Nenhuma solicitação.</p>}
              {visible.map((r) => (
                <RequestCard key={r.id} request={r} canManage={canManage} mine={r.requested_by === userId} onChanged={load} />
              ))}
            </TabsContent>
          </Tabs>
        </DialogContent>
      </Dialog>
    </>
  );
}

function RequestCard({ request: r, canManage, mine, onChanged }: { request: CodeRequest; canManage: boolean; mine: boolean; onChanged: () => Promise<void> }) {
  const [status, setStatus] = useState(r.status);
  const [response, setResponse] = useState(r.response);
  const [busy, setBusy] = useState(false);
  const st = STATUS[r.status] ?? STATUS.pendente;
  const dirty = status !== r.status || response !== r.response;

  const save = async () => {
    setBusy(true);
    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await supabase.from("code_requests")
      .update({ status, response, handled_by: user?.id ?? null, handled_at: new Date().toISOString() })
      .eq("id", r.id);
    setBusy(false);
    if (error) toast.error(`Não foi possível salvar: ${error.message}`);
    else {
      toast.success("Solicitação atualizada");
      await onChanged();
    }
  };

  const cancel = async () => {
    if (!confirm("Cancelar esta solicitação?")) return;
    const { error } = await supabase.from("code_requests").delete().eq("id", r.id);
    if (error) toast.error(`Não foi possível cancelar: ${error.message}`);
    else await onChanged();
  };

  return (
    <div className="space-y-2 rounded-md border border-border p-3 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="secondary" className={`border-0 ${st.className}`}>{st.label}</Badge>
        <span className="font-medium">{r.quantity} código(s) · {r.channel}</span>
        <span className="text-xs text-muted-foreground">
          {canManage && `${r.requester_email} · `}pedido em {formatDate(r.created_at)}{r.needed_by && ` · precisa até ${formatDate(r.needed_by)}`}
        </span>
      </div>
      <p className="whitespace-pre-wrap">{r.purpose}</p>
      {(r.reward || r.servers || r.notes) && (
        <p className="whitespace-pre-wrap text-xs text-muted-foreground">
          {[r.reward && `Recompensa: ${r.reward}`, r.servers && `Servidores: ${r.servers}`, r.notes && `Obs.: ${r.notes}`].filter(Boolean).join(" · ")}
        </p>
      )}
      {canManage ? (
        <div className="space-y-2 border-t border-border pt-2">
          <div className="flex flex-wrap gap-2">
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
              <SelectContent>{Object.entries(STATUS).map(([k, s]) => <SelectItem key={k} value={k}>{s.label}</SelectItem>)}</SelectContent>
            </Select>
            <Button size="sm" onClick={save} disabled={busy || !dirty}>{busy ? "Salvando..." : "Salvar resposta"}</Button>
          </div>
          <Textarea rows={2} placeholder="Resposta para a mídia (códigos, motivo da recusa...)" value={response} onChange={(e) => setResponse(e.target.value)} />
        </div>
      ) : (
        <>
          {r.response && <p className="whitespace-pre-wrap rounded bg-muted/60 p-2 text-xs"><b>Resposta da staff:</b> {r.response}</p>}
          {mine && r.status === "pendente" && <Button size="sm" variant="ghost" onClick={cancel}>Cancelar solicitação</Button>}
        </>
      )}
    </div>
  );
}
