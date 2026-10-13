import { useEffect, useState } from "react";
import { Loader2, RotateCcw } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { listSiteBackups, type SiteBackup } from "@/lib/eventTemplate/siteBackup";

const when = (iso: string) => new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });

/** Versões do documento guardadas no site pelo backup automático, com o botão de restaurar. */
export function BackupsDialog({ documentId, open, onOpenChange, onRestore }: {
  documentId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onRestore: (backup: SiteBackup) => void;
}) {
  const [list, setList] = useState<SiteBackup[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setList(null);
    setError(null);
    listSiteBackups(documentId)
      .then(setList)
      .catch((e: Error) => setError(/relation|does not exist|schema cache/i.test(e.message) ? "As cópias de segurança no site ainda não foram criadas no banco de dados." : e.message));
  }, [open, documentId]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Cópias de segurança no site</DialogTitle>
          <DialogDescription>
            Uma versão por minuto enquanto o documento é editado (as 30 mais recentes). Restaurar coloca a versão no editor; confira e salve.
          </DialogDescription>
        </DialogHeader>
        {error && <p className="text-sm text-destructive">{error}</p>}
        {!error && !list && <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Carregando...</p>}
        {list && list.length === 0 && <p className="text-sm text-muted-foreground">Nenhuma cópia ainda. Elas são feitas a cada minuto enquanto há alterações.</p>}
        {list && list.length > 0 && (
          <ul className="divide-y divide-border rounded-md border border-border">
            {list.map((b) => (
              <li key={b.id} className="flex items-center gap-2 px-3 py-2 text-sm">
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{when(b.created_at)}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {b.created_by_email ?? "—"} · {b.content.sections?.length ?? 0} aba(s) · {b.content.title}
                  </p>
                </div>
                <Button size="sm" variant="outline" className="gap-1" onClick={() => onRestore(b)}>
                  <RotateCcw className="h-3.5 w-3.5" /> Restaurar
                </Button>
              </li>
            ))}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  );
}
