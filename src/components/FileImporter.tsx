import { useCallback, useRef, useState } from "react";
import { Upload, FileSpreadsheet, Archive, CheckCircle2 } from "lucide-react";
import { parseExcel, parseZipImages } from "@/lib/fileParser";
import type { GameItem } from "@/types/item";

interface FileImporterProps {
  onItemsLoaded: (items: GameItem[]) => void;
  onImagesLoaded: (images: Map<string, string>) => void;
}

export function FileImporter({ onItemsLoaded, onImagesLoaded }: FileImporterProps) {
  const [excelStatus, setExcelStatus] = useState<"idle" | "loading" | "done">("idle");
  const [zipStatus, setZipStatus] = useState<"idle" | "loading" | "done">("idle");
  const [excelCount, setExcelCount] = useState(0);
  const [zipCount, setZipCount] = useState(0);
  const excelRef = useRef<HTMLInputElement>(null);
  const zipRef = useRef<HTMLInputElement>(null);

  const handleExcel = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      setExcelStatus("loading");
      try {
        const items = await parseExcel(file);
        setExcelCount(items.length);
        onItemsLoaded(items);
        setExcelStatus("done");
      } catch {
        setExcelStatus("idle");
      }
    },
    [onItemsLoaded]
  );

  const handleZip = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      setZipStatus("loading");
      try {
        const images = await parseZipImages(file);
        setZipCount(images.size);
        onImagesLoaded(images);
        setZipStatus("done");
      } catch {
        setZipStatus("idle");
      }
    },
    [onImagesLoaded]
  );

  return (
    <div className="flex flex-wrap gap-3">
      <input
        ref={excelRef}
        type="file"
        accept=".xlsx,.xls"
        className="hidden"
        onChange={handleExcel}
      />
      <input
        ref={zipRef}
        type="file"
        accept=".zip"
        className="hidden"
        onChange={handleZip}
      />

      <button
        onClick={() => excelRef.current?.click()}
        className="flex items-center gap-2 rounded-lg border border-border bg-secondary px-4 py-2.5 text-sm font-medium text-secondary-foreground transition-all hover:bg-muted hover:glow-primary"
      >
        {excelStatus === "done" ? (
          <CheckCircle2 className="h-4 w-4 text-success" />
        ) : excelStatus === "loading" ? (
          <Upload className="h-4 w-4 animate-pulse" />
        ) : (
          <FileSpreadsheet className="h-4 w-4 text-primary" />
        )}
        {excelStatus === "done"
          ? `${excelCount} itens carregados`
          : excelStatus === "loading"
          ? "Processando..."
          : "Importar Excel (.xlsx)"}
      </button>

      <button
        onClick={() => zipRef.current?.click()}
        className="flex items-center gap-2 rounded-lg border border-border bg-secondary px-4 py-2.5 text-sm font-medium text-secondary-foreground transition-all hover:bg-muted hover:glow-accent"
      >
        {zipStatus === "done" ? (
          <CheckCircle2 className="h-4 w-4 text-success" />
        ) : zipStatus === "loading" ? (
          <Upload className="h-4 w-4 animate-pulse" />
        ) : (
          <Archive className="h-4 w-4 text-accent" />
        )}
        {zipStatus === "done"
          ? `${zipCount} imagens carregadas`
          : zipStatus === "loading"
          ? "Extraindo..."
          : "Importar Imagens (.zip)"}
      </button>
    </div>
  );
}
