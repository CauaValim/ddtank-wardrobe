import { useEffect, useRef, useState } from "react";
import { FileSpreadsheet, Upload } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { manifest } from "@/lib/eventTemplate/model";
import { templateAvailable, uploadTemplate } from "@/lib/eventTemplate/templateSource";

/** Shows whether the official template is available and lets a Super Admin upload it. */
export function TemplateBanner({ canUpload, onReady }: { canUpload: boolean; onReady?: () => void }) {
  const [status, setStatus] = useState<"checking" | "ready" | "missing">("checking");
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let alive = true;
    templateAvailable(manifest).then((ok) => alive && setStatus(ok ? "ready" : "missing"));
    return () => { alive = false; };
  }, []);

  if (status !== "missing") return null;

  const upload = async (file?: File) => {
    if (!file) return;
    setUploading(true);
    try {
      await uploadTemplate(file, manifest);
      toast.success("Modelo oficial enviado");
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
        O modelo oficial ({manifest.fileName}) ainda não está no painel, então a exportação .xlsx está indisponível.
        {canUpload ? " Envie o arquivo original para liberar." : " Peça a um Super Admin para enviá-lo."}
      </p>
      {canUpload && (
        <>
          <input ref={fileRef} type="file" accept=".xlsx" className="hidden" onChange={(e) => { upload(e.target.files?.[0]); e.target.value = ""; }} />
          <Button size="sm" className="gap-1" disabled={uploading} onClick={() => fileRef.current?.click()}>
            <Upload className="h-4 w-4" /> {uploading ? "Enviando..." : "Enviar modelo"}
          </Button>
        </>
      )}
    </div>
  );
}
