import { useEffect, useRef, useState } from "react";
import { Search, X } from "lucide-react";

/**
 * Lupa da barra do topo (fica fixa ao rolar): abre um campo ligado à mesma busca de itens da
 * página, para buscar sem voltar ao topo. Ao digitar, a lista volta para o começo dos resultados.
 */
export function HeaderSearch({ value, onChange, resultsTop }: {
  value: string;
  onChange: (value: string) => void;
  /** Elemento do começo da lista, para rolar até os resultados ao buscar. */
  resultsTop?: React.RefObject<HTMLElement>;
}) {
  const [open, setOpen] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const expanded = open || value.length > 0;

  useEffect(() => {
    if (open) input.current?.focus();
  }, [open]);

  const toResults = () => {
    const el = resultsTop?.current;
    if (!el) return;
    const top = el.getBoundingClientRect().top + window.scrollY - 140;
    if (window.scrollY > top) window.scrollTo({ top: Math.max(0, top), behavior: "smooth" });
  };

  if (!expanded) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-secondary/60 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        title="Buscar itens"
        aria-label="Buscar itens"
      >
        <Search className="h-4 w-4" />
      </button>
    );
  }

  return (
    <div className="relative w-56 sm:w-64">
      <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
      <input
        ref={input}
        type="text"
        value={value}
        placeholder="Buscar por Nome ou ID..."
        aria-label="Buscar itens"
        onChange={(e) => {
          onChange(e.target.value);
          toResults();
        }}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            onChange("");
            setOpen(false);
          }
        }}
        onBlur={() => { if (!value) setOpen(false); }}
        className="h-9 w-full rounded-lg border border-border bg-secondary pl-8 pr-8 text-xs text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
      />
      <button
        type="button"
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => { onChange(""); setOpen(false); }}
        className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:text-foreground"
        title="Limpar busca"
        aria-label="Limpar busca"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
