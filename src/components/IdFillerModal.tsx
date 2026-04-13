import { useState, useCallback, useRef } from "react";
import { FileSpreadsheet, Download, AlertTriangle, CheckCircle2, Loader2, X } from "lucide-react";
import * as XLSX from "@e965/xlsx";
import { supabase } from "@/integrations/supabase/client";
import { buildNameIndex, fillIds, createErrorReport } from "@/lib/idFiller";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

interface IdFillerModalProps {
  open: boolean;
  onClose: () => void;
}

type Status = "idle" | "loading-db" | "processing" | "done" | "error";

export function IdFillerModal({ open, onClose }: IdFillerModalProps) {
  const { toast } = useToast();
  const [status, setStatus] = useState<Status>("idle");
  const [filledCount, setFilledCount] = useState(0);
  const [errorCount, setErrorCount] = useState(0);
  const [fileName, setFileName] = useState("");
  const resultWbRef = useRef<XLSX.WorkBook | null>(null);
  const errorWbRef = useRef<XLSX.WorkBook | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const reset = useCallback(() => {
    setStatus("idle");
    setFilledCount(0);
    setErrorCount(0);
    setFileName("");
    resultWbRef.current = null;
    errorWbRef.current = null;
  }, []);

  const handleFile = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      e.target.value = "";
      setFileName(file.name);

      try {
        // Step 1: Load items from DB
        setStatus("loading-db");
        const allItems: { id: number; name: string | null }[] = [];
        let from = 0;
        const pageSize = 1000;
        while (true) {
          const { data, error } = await supabase
            .from("items")
            .select("id, name")
            .range(from, from + pageSize - 1);
          if (error) throw error;
          if (!data || data.length === 0) break;
          allItems.push(...data);
          if (data.length < pageSize) break;
          from += pageSize;
        }

        const nameIndex = buildNameIndex(allItems);

        // Step 2: Parse xlsx
        setStatus("processing");
        const ab = await file.arrayBuffer();
        const wb = XLSX.read(ab, { type: "array", cellStyles: true, cellNF: true, cellDates: true });

        // Step 3: Fill IDs
        const result = fillIds(wb, nameIndex);

        resultWbRef.current = result.workbook;
        setFilledCount(result.filled);
        setErrorCount(result.errors.length);

        if (result.errors.length > 0) {
          errorWbRef.current = createErrorReport(result.errors);
        }

        setStatus("done");
        toast({
          title: "Processamento concluído",
          description: `${result.filled} IDs preenchidos, ${result.errors.length} erros`,
        });
      } catch (err: any) {
        console.error(err);
        setStatus("error");
        toast({
          title: "Erro ao processar",
          description: err.message || "Erro desconhecido",
          variant: "destructive",
        });
      }
    },
    [toast]
  );

  const downloadResult = useCallback(() => {
    if (!resultWbRef.current) return;
    const out = XLSX.write(resultWbRef.current, { type: "array", bookType: "xlsx", cellStyles: true });
    const blob = new Blob([out], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    const baseName = fileName.replace(/\.xlsx$/i, "");
    a.download = `${baseName}_ID.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
  }, [fileName]);

  const downloadErrors = useCallback(() => {
    if (!errorWbRef.current) return;
    const out = XLSX.write(errorWbRef.current, { type: "array", bookType: "xlsx" });
    const blob = new Blob([out], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `erros_${fileName}`;
    a.click();
    URL.revokeObjectURL(url);
  }, [fileName]);

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5" />
            Preencher IDs no Documento
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Faça upload de um arquivo <strong>.xlsx</strong> sem IDs (versão v2). O sistema
            cruzará os nomes dos itens com o banco de dados e preencherá os IDs automaticamente.
          </p>

          {status === "idle" && (
            <div className="flex flex-col items-center gap-3 rounded-lg border-2 border-dashed border-border p-8">
              <FileSpreadsheet className="h-10 w-10 text-muted-foreground/50" />
              <Button onClick={() => inputRef.current?.click()}>
                Selecionar arquivo .xlsx
              </Button>
              <input
                ref={inputRef}
                type="file"
                accept=".xlsx"
                className="hidden"
                onChange={handleFile}
              />
            </div>
          )}

          {(status === "loading-db" || status === "processing") && (
            <div className="flex flex-col items-center gap-3 py-8">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <p className="text-sm text-muted-foreground">
                {status === "loading-db"
                  ? "Carregando itens do banco de dados..."
                  : "Processando documento..."}
              </p>
              {fileName && (
                <p className="text-xs text-muted-foreground/70">{fileName}</p>
              )}
            </div>
          )}

          {status === "done" && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 rounded-lg bg-secondary p-3">
                <CheckCircle2 className="h-5 w-5 text-green-500" />
                <div>
                  <p className="text-sm font-medium">
                    {filledCount} IDs preenchidos
                  </p>
                  {errorCount > 0 && (
                    <p className="text-xs text-amber-500">
                      {errorCount} itens com erro
                    </p>
                  )}
                </div>
              </div>

              <div className="flex flex-col gap-2">
                <Button onClick={downloadResult} className="w-full">
                  <Download className="h-4 w-4" />
                  Baixar documento com IDs
                </Button>
                {errorCount > 0 && (
                  <Button
                    onClick={downloadErrors}
                    variant="outline"
                    className="w-full"
                  >
                    <AlertTriangle className="h-4 w-4" />
                    Baixar relatório de erros
                  </Button>
                )}
                <Button onClick={reset} variant="ghost" className="w-full">
                  Processar outro arquivo
                </Button>
              </div>
            </div>
          )}

          {status === "error" && (
            <div className="flex flex-col items-center gap-3 py-4">
              <AlertTriangle className="h-8 w-8 text-destructive" />
              <p className="text-sm text-destructive">Erro ao processar o arquivo</p>
              <Button onClick={reset} variant="outline">
                Tentar novamente
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
