import { useRef } from "react";
import { AlertTriangle, ImagePlus, Trash2, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { BINDS, DURATIONS, type EventItem, type ItemFieldSpec } from "@/lib/eventTemplate/types";
import { fileToItemImage } from "@/lib/eventTemplate/browserImages";

interface Props {
  item: EventItem;
  index: number;
  kind: "items" | "requirements";
  itemFields?: ItemFieldSpec[];
  idStatus: (id: string) => IdStatus;
  getImage: (id: string) => string;
  onChange: (patch: Partial<EventItem>) => void;
  onRemove: () => void;
}

const NO_BIND = "__none__";

export function ItemRow({ item, index, kind, itemFields, idStatus, getImage, onChange, onRemove }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const isPending = !item.id.trim() || /^x+$/i.test(item.id.trim());
  const image = item.imageUrl || (isPending ? "" : getImage(item.id));
  const unknownId = !isPending && idStatus(item.id) === "unknown";
  const setExtra = (key: string, value: string) => onChange({ extra: { ...(item.extra ?? {}), [key]: value } });

  const pickImage = async (file?: File) => {
    if (!file) return;
    try {
      onChange({ imageUrl: await fileToItemImage(file) });
    } catch {
      toast.error("Não foi possível ler essa imagem");
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-md border border-border/60 bg-background/40 p-2 text-sm">
      <span className="w-5 text-right text-xs tabular-nums text-muted-foreground">{index + 1}</span>
      <button
        type="button"
        onClick={() => fileRef.current?.click()}
        title={image ? "Trocar imagem deste item" : "Enviar imagem para este item"}
        className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded border border-border bg-muted/40 hover:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {image ? <img src={image} alt="" className="h-10 w-10 object-contain" /> : <ImagePlus className="h-4 w-4 text-muted-foreground" />}
        {!image && <AlertTriangle className="absolute -right-1.5 -top-1.5 h-3.5 w-3.5 text-amber-500" />}
      </button>
      <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => { pickImage(e.target.files?.[0]); e.target.value = ""; }} />
      {item.imageUrl && (
        <Button type="button" size="icon" variant="ghost" className="h-6 w-6" title="Voltar a usar a imagem do painel" onClick={() => onChange({ imageUrl: undefined })}>
          <X className="h-3 w-3" />
        </Button>
      )}
      <Input className="min-w-[180px] flex-1" placeholder="Nome do item" value={item.name} onChange={(e) => onChange({ name: e.target.value })} />
      <Input
        className={`w-28 tabular-nums ${unknownId ? "border-amber-500" : ""}`}
        title={unknownId ? "Este ID não existe no painel" : "ID do item (XXX se ainda não existe)"}
        value={item.id}
        onChange={(e) => onChange({ id: e.target.value.trim() })}
      />
      <Input className="w-20 tabular-nums" type="number" min={1} title="Quantidade" value={item.qty} onChange={(e) => onChange({ qty: Number(e.target.value) })} />
      {kind === "items" && (
        <>
          <Input className="w-44" list="event-durations" title="Validade" placeholder="Permanent" value={item.duration} onChange={(e) => onChange({ duration: e.target.value })} />
          <Select value={item.bind || NO_BIND} onValueChange={(v) => onChange({ bind: v === NO_BIND ? "" : v })}>
            <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
            <SelectContent>
              {BINDS.map((b) => <SelectItem key={b} value={b}>{b}</SelectItem>)}
              <SelectItem value={NO_BIND}>Sem vínculo</SelectItem>
            </SelectContent>
          </Select>
          {itemFields?.map((f) =>
            f.options ? (
              <Select key={f.key} value={item.extra?.[f.key] || f.default || f.options[0]} onValueChange={(v) => setExtra(f.key, v)}>
                <SelectTrigger className="w-40" title={f.label}><SelectValue /></SelectTrigger>
                <SelectContent>{f.options.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}</SelectContent>
              </Select>
            ) : (
              <Input key={f.key} className="w-44" title={f.label} placeholder={f.placeholder ?? f.label} value={item.extra?.[f.key] ?? ""} onChange={(e) => setExtra(f.key, e.target.value)} />
            ),
          )}
        </>
      )}
      <Button type="button" size="icon" variant="ghost" title="Remover item" onClick={onRemove}><Trash2 className="h-4 w-4" /></Button>
      <datalist id="event-durations">{DURATIONS.map((d) => <option key={d} value={d} />)}</datalist>
    </div>
  );
}
