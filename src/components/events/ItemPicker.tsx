import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Loader2, Plus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { usageSummary, type ItemUsage, type UsageKind } from "@/lib/eventTemplate/usage";

interface Props {
  getImage: (id: string) => string;
  /** Onde o item já foi usado na mesma base de servidores (mostrado em cada resultado). */
  getUsage?: (id: string) => Record<UsageKind, ItemUsage[]>;
  onPick: (item: { id: string; name: string }) => void;
  disabled?: boolean;
}

type Result = { id: string; name: string; imageUrl: string };

const LIMIT = 30;

// Busca direto na tabela `items` do painel, para não depender do catálogo
// carregado no navegador (que chega aos poucos e pode estar desatualizado).
async function searchItems(term: string): Promise<Result[]> {
  const pattern = `%${term.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
  const byName = supabase.from("items").select("id, name, image_url").ilike("name", pattern).order("id").limit(LIMIT);
  const byId = /^\d+$/.test(term)
    ? supabase.from("items").select("id, name, image_url").eq("id", Number(term)).limit(1)
    : null;
  const [names, ids] = await Promise.all([byName, byId]);
  if (names.error) throw names.error;
  if (ids?.error) throw ids.error;
  const seen = new Set<string>();
  const out: Result[] = [];
  for (const row of [...(ids?.data ?? []), ...(names.data ?? [])]) {
    const id = String(row.id);
    if (seen.has(id)) continue;
    seen.add(id);
    out.push({ id, name: row.name ?? `Item #${id}`, imageUrl: row.image_url ?? "" });
  }
  return out.slice(0, LIMIT);
}

export function ItemPicker({ getImage, getUsage, onPick, disabled }: Props) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [results, setResults] = useState<Result[]>([]);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const term = q.trim();

  useEffect(() => {
    if (term.length < 2) {
      setResults([]);
      setLoading(false);
      setFailed(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    const handle = setTimeout(async () => {
      try {
        const found = await searchItems(term);
        if (!cancelled) { setResults(found); setFailed(false); }
      } catch (err) {
        console.warn("Falha ao buscar itens:", err);
        if (!cancelled) { setResults([]); setFailed(true); }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [term]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button size="sm" variant="outline" className="gap-1" disabled={disabled} title={disabled ? "Todas as vagas deste grupo estão ocupadas" : undefined}>
          <Plus className="h-3.5 w-3.5" /> Item
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-96 p-2" align="start">
        <Input autoFocus placeholder="Buscar por nome ou ID..." value={q} onChange={(e) => setQ(e.target.value)} />
        <div className="mt-2 max-h-72 overflow-y-auto space-y-1">
          {results.map((it) => {
            const image = it.imageUrl || getImage(it.id);
            return (
              <button
                key={it.id}
                className="flex w-full items-center gap-2 rounded px-2 py-1 text-left text-sm hover:bg-muted"
                onClick={() => {
                  onPick({ id: it.id, name: it.name });
                  setOpen(false);
                  setQ("");
                }}
              >
                {image ? (
                  <img src={image} alt="" className="h-8 w-8 object-contain" />
                ) : (
                  <div className="h-8 w-8 rounded bg-muted" />
                )}
                <span className="min-w-0 flex-1">
                  <span className="block truncate">{it.name}</span>
                  {getUsage && usageSummary(getUsage(it.id)) && (
                    <span className="block truncate text-[11px] text-amber-700 dark:text-amber-400">{usageSummary(getUsage(it.id))}</span>
                  )}
                </span>
                <span className="text-xs text-muted-foreground">{it.id}</span>
              </button>
            );
          })}
          {loading && (
            <p className="flex items-center gap-1 p-2 text-xs text-muted-foreground"><Loader2 className="h-3 w-3 animate-spin" /> Buscando no painel...</p>
          )}
          {!loading && failed && (
            <p className="p-2 text-xs text-destructive">Não foi possível buscar no painel. Tente de novo.</p>
          )}
          {!loading && !failed && term.length >= 2 && results.length === 0 && (
            <p className="p-2 text-xs text-muted-foreground">Nenhum item encontrado.</p>
          )}
        </div>
        <Button
          size="sm"
          variant="ghost"
          className="mt-2 w-full"
          onClick={() => {
            onPick({ id: "XXX", name: term || "Item novo" });
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
