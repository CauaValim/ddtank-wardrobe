import { useEffect, useRef, useState } from "react";
import { Loader2, Package } from "lucide-react";
import { Input } from "@/components/ui/input";
import { itemById, searchItems, type ItemSearchResult } from "@/lib/eventTemplate/itemSearch";

/**
 * Campos ID e Nome do cadastro com busca na base: o ID digitado preenche o nome do item, e o nome
 * digitado mostra os itens parecidos para escolher (como o botão "+ Item").
 */
export function ItemLookupFields({ id, name, onChange, disabled }: {
  id: string;
  name: string;
  onChange: (item: { id: string; name: string }) => void;
  disabled?: boolean;
}) {
  const [image, setImage] = useState("");
  const [idStatus, setIdStatus] = useState<"idle" | "loading" | "found" | "missing">("idle");
  const [results, setResults] = useState<ItemSearchResult[]>([]);
  const [open, setOpen] = useState(false);
  const [searching, setSearching] = useState(false);
  /** Só busca pelo nome quando ele foi digitado (não quando veio do ID ou da lista). */
  const typedName = useRef(false);

  // ID digitado: procura o item e preenche o nome.
  useEffect(() => {
    if (!/^\d+$/.test(id)) {
      setIdStatus("idle");
      setImage("");
      return;
    }
    let cancelled = false;
    setIdStatus("loading");
    const handle = setTimeout(async () => {
      const found = await itemById(id);
      if (cancelled) return;
      setIdStatus(found ? "found" : "missing");
      setImage(found?.imageUrl ?? "");
      if (found && found.name !== name) {
        typedName.current = false;
        onChange({ id, name: found.name });
      }
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
    // Só quando o ID muda: o nome é consequência dele.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // Nome digitado: sugestões da base.
  useEffect(() => {
    const term = name.trim();
    if (!typedName.current || term.length < 2) {
      setResults([]);
      setSearching(false);
      return;
    }
    let cancelled = false;
    setSearching(true);
    const handle = setTimeout(async () => {
      try {
        const found = await searchItems(term, 12);
        if (!cancelled) {
          setResults(found);
          setOpen(true);
        }
      } catch {
        if (!cancelled) setResults([]);
      } finally {
        if (!cancelled) setSearching(false);
      }
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [name]);

  const pick = (item: ItemSearchResult) => {
    typedName.current = false;
    setOpen(false);
    setResults([]);
    setImage(item.imageUrl);
    onChange({ id: item.id, name: item.name });
  };

  return (
    <div className="flex min-w-[260px] flex-1 items-end gap-2">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-md border border-border bg-secondary">
        {image ? <img src={image} alt="" className="h-full w-full object-contain" /> : <Package className="h-4 w-4 text-muted-foreground/50" />}
      </div>
      <label className="block w-32 space-y-1">
        <span className="text-xs text-muted-foreground">ID</span>
        <Input
          value={id}
          inputMode="numeric"
          disabled={disabled}
          placeholder="Ex.: 1120218"
          onChange={(e) => onChange({ id: e.target.value.trim(), name })}
        />
        {idStatus === "missing" && <span className="block text-[10px] text-destructive">ID não está na base</span>}
      </label>
      <label className="relative block min-w-[200px] flex-1 space-y-1">
        <span className="text-xs text-muted-foreground">Nome do item</span>
        <div className="relative">
          <Input
            value={name}
            disabled={disabled}
            placeholder="Digite o nome para buscar"
            onChange={(e) => {
              typedName.current = true;
              onChange({ id, name: e.target.value });
            }}
            onFocus={() => results.length && setOpen(true)}
            onBlur={() => setTimeout(() => setOpen(false), 150)}
            onKeyDown={(e) => {
              if (e.key === "Escape") setOpen(false);
              if (e.key === "Enter" && open && results[0]) {
                e.preventDefault();
                pick(results[0]);
              }
            }}
            role="combobox"
            aria-expanded={open}
            aria-autocomplete="list"
          />
          {(searching || idStatus === "loading") && <Loader2 className="absolute right-2 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />}
        </div>
        {open && results.length > 0 && (
          <ul role="listbox" className="absolute left-0 right-0 top-full z-50 mt-1 max-h-72 overflow-y-auto rounded-md border border-border bg-popover p-1 shadow-md">
            {results.map((r) => (
              <li key={r.id}>
                <button
                  type="button"
                  role="option"
                  aria-selected={false}
                  // onMouseDown: escolhe antes do blur fechar a lista.
                  onMouseDown={(e) => {
                    e.preventDefault();
                    pick(r);
                  }}
                  className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-muted"
                >
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded bg-secondary">
                    {r.imageUrl ? <img src={r.imageUrl} alt="" loading="lazy" className="h-full w-full object-contain" /> : <Package className="h-3.5 w-3.5 text-muted-foreground/50" />}
                  </span>
                  <span className="min-w-0 flex-1 truncate">{r.name}</span>
                  <span className="font-mono text-xs text-muted-foreground">{r.id}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </label>
    </div>
  );
}
