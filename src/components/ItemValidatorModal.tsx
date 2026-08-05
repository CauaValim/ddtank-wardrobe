import { useState, useCallback, useMemo, useRef } from "react";
import { ClipboardCheck, Download, Loader2, AlertTriangle } from "lucide-react";
import * as XLSX from "@e965/xlsx";
import { supabase } from "@/integrations/supabase/client";
import {
  buildItemIndex,
  validateRows,
  summarize,
  extractPairsFromGrid,
  cleanDisplayName,
  STATUS_LABELS,
  type ValidationRow,
  type ValidationStatus,
  type DbItem,
} from "@/lib/itemValidator";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

interface Props {
  open: boolean;
  onClose: () => void;
  realm?: "br" | "turco";
}

type Status = "idle" | "loading" | "done" | "error";

const STATUS_CLASSES: Record<ValidationStatus, string> = {
  valid: "bg-primary/15 text-primary",
  no_image: "bg-accent/20 text-accent-foreground",
  name_mismatch: "bg-destructive/15 text-destructive",
  id_not_found: "bg-destructive/15 text-destructive",
  invalid_row: "bg-muted text-muted-foreground",
};

const ORDER: ValidationStatus[] = ["valid", "no_image", "name_mismatch", "id_not_found", "invalid_row"];

export function ItemValidatorModal({ open, onClose, realm = "br" }: Props) {
  const tableName = (realm === "turco" ? "items_turco" : "items") as "items";
  const { toast } = useToast();
  const [status, setStatus] = useState<Status>("idle");
  const [rows, setRows] = useState<ValidationRow[]>([]);
  const [fileName, setFileName] = useState("");
  const [filter, setFilter] = useState<ValidationStatus | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const counts = useMemo(() => summarize(rows), [rows]);
  const visible = useMemo(
    () => (filter ? rows.filter((r) => r.status === filter) : rows),
    [rows, filter]
  );

  const reset = useCallback(() => {
    setStatus("idle");
    setRows([]);
    setFileName("");
    setFilter(null);
  }, []);

  const handleFile = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      e.target.value = "";
      setFileName(file.name);
      setFilter(null);

      try {
        setStatus("loading");
        const all: DbItem[] = [];
        let from = 0;
        const pageSize = 1000;
        while (true) {
          const { data, error } = await supabase
            .from(tableName)
            .select("id, name, image_url")
            .order("id", { ascending: true })
            .range(from, from + pageSize - 1);
          if (error) throw error;
          if (!data || data.length === 0) break;
          all.push(...(data as DbItem[]));
          if (data.length < pageSize) break;
          from += pageSize;
        }

        const index = buildItemIndex(all);
        const wb = XLSX.read(await file.arrayBuffer(), { type: "array" });

        const parsedRows: Record<string, unknown>[] = [];
        for (const sheetName of wb.SheetNames) {
          const ws = wb.Sheets[sheetName];
          const grid = XLSX.utils.sheet_to_json<(string | null)[]>(ws, {
            header: 1,
            defval: null,
            raw: false,
          });
          for (const pair of extractPairsFromGrid(grid, sheetName)) {
            parsedRows.push({
              Planilha: pair.sheet,
              Célula: pair.cell,
              ID: pair.id,
              Nome: cleanDisplayName(pair.name),
            });
          }
        }

        if (parsedRows.length === 0) {
          // Fallback: planilha simples com colunas ID / Nome
          const ws = wb.Sheets[wb.SheetNames[0]];
          parsedRows.push(
            ...XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: "" })
          );
        }

        setRows(validateRows(parsedRows, index));
        setStatus("done");
      } catch (err) {
        console.error(err);
        setStatus("error");
        toast({
          title: "Erro ao verificar",
          description: (err as Error).message,
          variant: "destructive",
        });
      }
    },
    [tableName, toast]
  );

  const handleExport = useCallback(() => {
    const data = rows.map((r) => ({
      ...r.original,
      Status: STATUS_LABELS[r.status],
      "Nome no Banco": r.dbName ?? "",
      "ID Sugerido": r.suggestedId ?? "",
      "Tem Imagem": r.hasImage ? "Sim" : "Não",
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Verificacao");
    XLSX.writeFile(wb, fileName.replace(/\.xlsx?$/i, "") + "_verificado.xlsx");
  }, [rows, fileName]);

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) { reset(); onClose(); } }}>
      <DialogContent className="max-w-5xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ClipboardCheck className="h-4 w-4" />
            Verificar Itens ({realm === "turco" ? "TR" : "BR"})
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Envie uma planilha .xlsx com as colunas <strong>ID</strong> e <strong>Nome</strong>. O painel confere se o ID, o nome e a imagem batem com a base.
          </p>

          <div className="flex flex-wrap items-center gap-2">
            <input
              ref={inputRef}
              type="file"
              accept=".xlsx,.xls"
              onChange={handleFile}
              className="hidden"
            />
            <Button onClick={() => inputRef.current?.click()} disabled={status === "loading"}>
              {status === "loading" ? (
                <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Verificando...</>
              ) : (
                "Escolher arquivo .xlsx"
              )}
            </Button>
            {status === "done" && rows.length > 0 && (
              <Button variant="secondary" onClick={handleExport}>
                <Download className="mr-2 h-4 w-4" />
                Baixar relatório .xlsx
              </Button>
            )}
            {fileName && <span className="text-xs text-muted-foreground">{fileName}</span>}
          </div>

          {status === "error" && (
            <div className="flex items-center gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
              <AlertTriangle className="h-4 w-4" />
              Não foi possível processar o arquivo.
            </div>
          )}

          {status === "done" && (
            <>
              <div className="flex flex-wrap gap-1.5">
                <button
                  onClick={() => setFilter(null)}
                  className={`rounded-full px-3 py-1 text-xs font-medium transition-all ${
                    filter === null ? "bg-accent text-accent-foreground" : "border border-border bg-secondary text-secondary-foreground hover:bg-muted"
                  }`}
                >
                  Todos ({rows.length})
                </button>
                {ORDER.map((s) => (
                  <button
                    key={s}
                    onClick={() => setFilter(filter === s ? null : s)}
                    disabled={counts[s] === 0}
                    className={`rounded-full px-3 py-1 text-xs font-medium transition-all disabled:opacity-40 ${
                      filter === s ? "bg-accent text-accent-foreground" : "border border-border bg-secondary text-secondary-foreground hover:bg-muted"
                    }`}
                  >
                    {STATUS_LABELS[s]} ({counts[s]})
                  </button>
                ))}
              </div>

              <div className="max-h-[50vh] overflow-auto rounded-lg border border-border">
                <table className="w-full text-left text-xs">
                  <thead className="sticky top-0 bg-secondary text-muted-foreground">
                    <tr>
                      <th className="p-2 font-medium">Img</th>
                      <th className="p-2 font-medium">Aba / Célula</th>
                      <th className="p-2 font-medium">ID</th>
                      <th className="p-2 font-medium">Nome enviado</th>
                      <th className="p-2 font-medium">Nome no banco</th>
                      <th className="p-2 font-medium">ID sugerido</th>
                      <th className="p-2 font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visible.slice(0, 500).map((r) => (
                      <tr key={r.rowNumber} className="border-t border-border">
                        <td className="p-2">
                          {r.imageUrl ? (
                            <img src={r.imageUrl} alt={r.rawName} loading="lazy" className="h-8 w-8 object-contain" />
                          ) : (
                            <div className="h-8 w-8 rounded bg-muted" />
                          )}
                        </td>
                        <td className="p-2 text-muted-foreground">
                          {String(r.original.Planilha ?? "—")}
                          {r.original["Célula"] ? ` · ${r.original["Célula"]}` : ""}
                        </td>
                        <td className="p-2 font-mono">{r.rawId || "—"}</td>
                        <td className="p-2">{r.rawName || "—"}</td>
                        <td className="p-2 text-muted-foreground">{r.dbName ?? "—"}</td>
                        <td className="p-2 font-mono text-muted-foreground">{r.suggestedId ?? "—"}</td>
                        <td className="p-2">
                          <span className={`rounded-full px-2 py-0.5 font-medium ${STATUS_CLASSES[r.status]}`}>
                            {STATUS_LABELS[r.status]}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {visible.length > 500 && (
                <p className="text-xs text-muted-foreground">
                  Mostrando 500 de {visible.length} linhas — baixe o relatório para ver tudo.
                </p>
              )}
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
