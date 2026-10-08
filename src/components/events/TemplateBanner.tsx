import { useEffect, useRef, useState } from "react";
import { FileSpreadsheet, Upload } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { manifest } from "@/lib/eventTemplate/model";
import type { TemplateFile } from "@/lib/eventTemplate/types";
import { templateAvailable, uploadTemplate } from "@/lib/eventTemplate/templateSource";

/** Shows whether a template file (the official template by default) is available and lets a Super Admin upload it. */
export function TemplateBanner({ canUpload, onReady, file = manifest, what = "O modelo oficial", effect = "a exportação .xlsx está indisponível" }: {
  canUpload: boolean;
  onReady?: () => void;
  file?: TemplateFile;
  what?: string;
  effect?: string;
}) {
  const [status, setStatus] = useState<"checking" | "ready" | "missing">("checking");
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let alive = true;
    templateAvailable(file).then((ok) => alive && setStatus(ok ? "ready" : "missing"));
    return () => { alive = false; };
  }, [file]);

  if (status !== "missing") return null;

  const send = async (upload?: File) => {
    if (!upload) return;
    setUploading(true);
    try {
      await uploadTemplate(upload, file);
      toast.success(`${file.fileName} enviado`);
      setStatus("ready");
      onReady?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao enviar o modelo");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-lg border border-amber-500/50 bg-amber-500/10 p-3 text-sm">
      <FileSpreadsheet className="h-5 w-5 shrink-0 text-amber-500" />
      <p className="min-w-[240px] flex-1">
        {what} ({file.fileName}) ainda não está no painel, então {effect}.
        {canUpload ? " Envie o arquivo original para liberar." : " Peça a um Super Admin para enviá-lo."}
      </p>
      {canUpload && (
        <>
          <input ref={fileRef} type="file" accept=".xlsx" className="hidden" onChange={(e) => { send(e.target.files?.[0]); e.target.value = ""; }} />
          <Button size="sm" className="gap-1" disabled={uploading} onClick={() => fileRef.current?.click()}>
            <Upload className="h-4 w-4" /> {uploading ? "Enviando..." : "Enviar arquivo"}
          </Button>
        </>
      )}
    </div>
  );
}
