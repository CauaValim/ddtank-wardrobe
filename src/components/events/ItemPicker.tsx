import { useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Plus } from "lucide-react";
import type { GameItem } from "@/types/item";

interface Props {
  items: GameItem[];
  getImage: (id: string) => string;
  onPick: (item: { id: string; name: string }) => void;
}

export function ItemPicker({ items, getImage, onPick }: Props) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const results = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (s.length < 2) return [];
    return items
      .filter((i) => i.id === s || i.id.startsWith(s) || i.name.toLowerCase().includes(s))
      .slice(0, 30);
  }, [q, items]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button size="sm" variant="outline" className="gap-1">
          <Plus className="h-3.5 w-3.5" /> Item
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-96 p-2" align="start">
        <Input autoFocus placeholder="Buscar por nome ou ID..." value={q} onChange={(e) => setQ(e.target.value)} />
        <div className="mt-2 max-h-72 overflow-y-auto space-y-1">
          {results.map((it) => (
            <button
              key={it.id}
              className="flex w-full items-center gap-2 rounded px-2 py-1 text-left text-sm hover:bg-muted"
              onClick={() => {
                onPick({ id: it.id, name: it.name });
                setOpen(false);
                setQ("");
              }}
            >
              {getImage(it.id) ? (
                <img src={getImage(it.id)} alt="" className="h-8 w-8 object-contain" />
              ) : (
                <div className="h-8 w-8 rounded bg-muted" />
              )}
              <span className="flex-1 truncate">{it.name}</span>
              <span className="text-xs text-muted-foreground">{it.id}</span>
            </button>
          ))}
          {q.trim().length >= 2 && results.length === 0 && (
            <p className="p-2 text-xs text-muted-foreground">Nenhum item encontrado.</p>
          )}
        </div>
        <Button
          size="sm"
          variant="ghost"
          className="mt-2 w-full"
          onClick={() => {
            onPick({ id: "XXX", name: q.trim() || "Item novo" });
            setOpen(false);
            setQ("");
          }}
        >
          Adicionar como item novo (XXX)
        </Button>
      </PopoverContent>
    </Popover>
  );
}
