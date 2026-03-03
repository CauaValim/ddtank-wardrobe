import { useCallback, useRef, useState } from "react";
import { Upload, FileSpreadsheet, Archive, CheckCircle2, FileText } from "lucide-react";
import { parseExcel, parseJson, parseZipImages } from "@/lib/fileParser";
import type { GameItem } from "@/types/item";

interface FileImporterProps {
  onItemsLoaded: (items: GameItem[]) => void;
  onImagesLoaded: (images: Map<string, string>) => void;
  onSyncDescriptions?: (items: GameItem[]) => void;
  canImportImages?: boolean;
  canSyncDescriptions?: boolean;
}

export function FileImporter({ onItemsLoaded, onImagesLoaded, onSyncDescriptions, canImportImages = true, canSyncDescriptions = true }: FileImporterProps) {
  const [excelStatus, setExcelStatus] = useState<"idle" | "loading" | "done">("idle");
  const [zipStatus, setZipStatus] = useState<"idle" | "loading" | "done">("idle");
  const [descStatus, setDescStatus] = useState<"idle" | "loading" | "done">("idle");
  const [excelCount, setExcelCount] = useState(0);
  const [zipCount, setZipCount] = useState(0);
  const [descCount, setDescCount] = useState(0);
  const excelRef = useRef<HTMLInputElement>(null);
  const zipRef = useRef<HTMLInputElement>(null);
  const descRef = useRef<HTMLInputElement>(null);

  const handleDataFile = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      setExcelStatus("loading");
      try {
        const items = file.name.endsWith(".json")
          ? await parseJson(file)
          : await parseExcel(file);
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

  const handleSyncDesc = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file || !onSyncDescriptions) return;
      setDescStatus("loading");
      try {
        const items = file.name.endsWith(".json")
          ? await parseJson(file)
          : await parseExcel(file);
        const withDesc = items.filter(
          (i) => i.attributes.desc && i.attributes.desc.trim().length > 0
        );
        setDescCount(withDesc.length);
        await onSyncDescriptions(items);
        setDescStatus("done");
      } catch {
        setDescStatus("idle");
      }
    },
    [onSyncDescriptions]
  );

  return (
    <div className="flex flex-wrap gap-3">
      <input
        ref={excelRef}
        type="file"
        accept=".xlsx,.xls,.json"
        className="hidden"
        onChange={handleDataFile}
      />
      <input
        ref={zipRef}
        type="file"
        accept=".zip"
        className="hidden"
        onChange={handleZip}
      />
      <input
        ref={descRef}
        type="file"
        accept=".xlsx,.xls,.json"
        className="hidden"
        onChange={handleSyncDesc}
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
          : "Importar Dados (.xlsx / .json)"}
      </button>

      {canImportImages && (
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
      )}

      {canSyncDescriptions && onSyncDescriptions && (
        <button
          onClick={() => descRef.current?.click()}
          className="flex items-center gap-2 rounded-lg border border-border bg-secondary px-4 py-2.5 text-sm font-medium text-secondary-foreground transition-all hover:bg-muted hover:glow-accent"
        >
          {descStatus === "done" ? (
            <CheckCircle2 className="h-4 w-4 text-success" />
          ) : descStatus === "loading" ? (
            <Upload className="h-4 w-4 animate-pulse" />
          ) : (
            <FileText className="h-4 w-4 text-accent" />
          )}
          {descStatus === "done"
            ? `${descCount} descrições sincronizadas`
            : descStatus === "loading"
            ? "Sincronizando..."
            : "Sincronizar Descrições (.xlsx)"}
        </button>
      )}
    </div>
  );
}
