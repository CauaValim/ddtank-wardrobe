import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Bell, CalendarDays, CheckCheck, Send, Ticket, X } from "lucide-react";
import { toast } from "sonner";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { useNotifications, type PanelNotification } from "@/hooks/useNotifications";

const when = (iso: string) => new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

function KindIcon({ kind }: { kind: string }) {
  if (kind === "code_request") return <Ticket className="h-4 w-4 text-amber-500" />;
  if (kind === "weekly_schedule") return <CalendarDays className="h-4 w-4 text-primary" />;
  return <Bell className="h-4 w-4 text-muted-foreground" />;
}

/** Sino da barra do topo: resumo semanal do cronograma e solicitações de códigos enviadas. */
export function NotificationBell({ userId, canSendWeekly, className }: { userId: string | null; canSendWeekly: boolean; className: string }) {
  const navigate = useNavigate();
  const api = useNotifications(userId);
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  const openItem = (n: PanelNotification) => {
    api.markRead([n.id]);
    if (n.link) {
      setOpen(false);
      navigate(n.link);
    } else {
      setExpanded((cur) => (cur === n.id ? null : n.id));
    }
  };

  const sendWeekly = async () => {
    setSending(true);
    try {
      const sent = await api.sendWeeklyNow();
      toast.success(`Resumo da semana enviado para ${sent} pessoa(s)`);
    } catch (e) {
      toast.error(`Não foi possível enviar: ${(e as Error).message}`);
    } finally {
      setSending(false);
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button className={`${className} relative`} title="Notificações" aria-label={`Notificações${api.unread ? ` (${api.unread} não lidas)` : ""}`}>
          <Bell className="h-4 w-4" />
          {api.unread > 0 && (
            <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold leading-none text-destructive-foreground">
              {api.unread > 9 ? "9+" : api.unread}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[360px] p-0">
        <div className="flex items-center gap-2 border-b border-border px-3 py-2">
          <span className="text-sm font-semibold">Notificações</span>
          <span className="flex-1" />
          {api.unread > 0 && (
            <Button size="sm" variant="ghost" className="h-7 gap-1 text-xs" onClick={() => api.markRead(api.items.filter((n) => !n.read_at).map((n) => n.id))}>
              <CheckCheck className="h-3.5 w-3.5" /> Marcar todas como lidas
            </Button>
          )}
        </div>
        <div className="max-h-[60vh] overflow-y-auto">
          {!api.available && <p className="px-3 py-6 text-center text-xs text-muted-foreground">As notificações ainda não foram criadas no banco de dados.</p>}
          {api.available && api.items.length === 0 && <p className="px-3 py-6 text-center text-xs text-muted-foreground">Nenhuma notificação.</p>}
          {api.items.map((n) => (
            <div key={n.id} className={`group flex gap-2 border-b border-border px-3 py-2 last:border-0 ${n.read_at ? "" : "bg-primary/5"}`}>
              <div className="mt-0.5 shrink-0"><KindIcon kind={n.kind} /></div>
              <button type="button" className="min-w-0 flex-1 text-left" onClick={() => openItem(n)}>
                <p className={`text-xs leading-snug ${n.read_at ? "text-foreground" : "font-semibold text-foreground"}`}>{n.title}</p>
                {n.body && (
                  <p className={`mt-0.5 whitespace-pre-line text-[11px] leading-snug text-muted-foreground ${expanded === n.id ? "" : "line-clamp-3"}`}>{n.body}</p>
                )}
                <p className="mt-1 text-[10px] text-muted-foreground">{when(n.created_at)}</p>
              </button>
              <div className="flex shrink-0 flex-col items-center gap-1">
                {!n.read_at && <span className="mt-1 h-2 w-2 rounded-full bg-primary" aria-label="Não lida" />}
                <button type="button" className="rounded p-0.5 text-muted-foreground opacity-0 transition-opacity hover:text-foreground group-hover:opacity-100" title="Apagar" onClick={() => api.remove(n.id)}>
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
        {canSendWeekly && api.available && (
          <div className="border-t border-border px-3 py-2">
            <Button size="sm" variant="outline" className="h-7 w-full gap-1 text-xs" disabled={sending} onClick={sendWeekly}>
              <Send className="h-3.5 w-3.5" /> {sending ? "Enviando..." : "Enviar o resumo da semana agora"}
            </Button>
            <p className="mt-1 text-center text-[10px] text-muted-foreground">O resumo também sai sozinho toda segunda-feira às 08:00.</p>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
