import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { ServerGroup } from "@/lib/eventTemplate/serverGroups";

type Row = {
  id: string;
  title: string;
  source: string;
  created_at: string;
  created_by_email: string | null;
  updated_at: string;
  updated_by_email: string | null;
};

const pad = (n: number) => String(n).padStart(2, "0");
/** Data e hora local em MM/DD/YYYY HH:MM. */
function stamp(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${pad(d.getMonth() + 1)}/${pad(d.getDate())}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Aba "Histórico" (permissão "Ver histórico"): quem criou cada documento, quando, e a última modificação. */
export function HistoryPanel({ group, onOpen }: { group: ServerGroup; onOpen: (id: string) => void }) {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [failure, setFailure] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setRows(null);
    setFailure(null);
    supabase.rpc("event_document_history", { _server_group: group }).then(({ data, error }) => {
      if (cancelled) return;
      if (error) {
        toast.error(`Histórico: ${error.message}`);
        setFailure(error.message);
      }
      setRows((data ?? []) as Row[]);
    });
    return () => {
      cancelled = true;
    };
  }, [group]);

  if (!rows) return <p className="text-sm text-muted-foreground">Carregando...</p>;
  if (failure) return <Card className="p-6 text-sm text-destructive">Não foi possível carregar o histórico: {failure}</Card>;
  if (rows.length === 0) return <Card className="p-6 text-sm text-muted-foreground">Nenhum documento nesta base ainda.</Card>;

  return (
    <Card className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Documento</TableHead>
            <TableHead>Criado em</TableHead>
            <TableHead>Criado por</TableHead>
            <TableHead>Última modificação</TableHead>
            <TableHead>Modificado por</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => (
            <TableRow key={r.id} className="cursor-pointer" onClick={() => onOpen(r.id)}>
              <TableCell className="max-w-[280px]">
                <span className="block truncate font-medium">{r.title}</span>
                {r.source === "import" && <Badge variant="secondary" className="mt-0.5">Evento anterior importado</Badge>}
              </TableCell>
              <TableCell className="whitespace-nowrap tabular-nums">{stamp(r.created_at)}</TableCell>
              <TableCell>{r.created_by_email ?? "—"}</TableCell>
              <TableCell className="whitespace-nowrap tabular-nums">{stamp(r.updated_at)}</TableCell>
              <TableCell>{r.updated_by_email ?? "—"}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Card>
  );
}
