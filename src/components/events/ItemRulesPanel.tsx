import { useState } from "react";
import { Ban, Check, Pencil, Plus, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ItemPicker } from "@/components/events/ItemPicker";
import { useItemRules } from "@/hooks/useItemRules";
import { CATEGORIES, categoryLabel, type ItemRule } from "@/lib/eventTemplate/itemRules";
import { SERVER_GROUPS, type ServerGroup } from "@/lib/eventTemplate/serverGroups";

type Draft = Omit<ItemRule, "id"> & { id?: string };

const ALL = "__all__";

/** Uma categoria por linha: neutra, permitida ou proibida (clicar de novo volta a neutra). */
function CategoryToggles({ draft, onChange }: { draft: Draft; onChange: (d: Draft) => void }) {
  const set = (type: string, state: "allowed" | "forbidden" | null) =>
    onChange({
      ...draft,
      allowed: state === "allowed" ? [...new Set([...draft.allowed, type])] : draft.allowed.filter((t) => t !== type),
      forbidden: state === "forbidden" ? [...new Set([...draft.forbidden, type])] : draft.forbidden.filter((t) => t !== type),
    });
  return (
    <div className="grid gap-1 sm:grid-cols-2 lg:grid-cols-3">
      {CATEGORIES.map(({ type, label }) => {
        const allowed = draft.allowed.includes(type);
        const forbidden = draft.forbidden.includes(type);
        return (
          <div key={type} className="flex items-center gap-1 rounded-md border border-border px-2 py-1">
            <span className="flex-1 truncate text-sm">{label}</span>
            <Button
              type="button"
              size="sm"
              variant={allowed ? "default" : "ghost"}
              className={`h-7 gap-1 ${allowed ? "bg-green-600 hover:bg-green-700" : ""}`}
              aria-pressed={allowed}
              onClick={() => set(type, allowed ? null : "allowed")}
            >
              <Check className="h-3.5 w-3.5" /> Permitido
            </Button>
            <Button
              type="button"
              size="sm"
              variant={forbidden ? "destructive" : "ghost"}
              className="h-7 gap-1"
              aria-pressed={forbidden}
              onClick={() => set(type, forbidden ? null : "forbidden")}
            >
              <Ban className="h-3.5 w-3.5" /> Proibido
            </Button>
          </div>
        );
      })}
    </div>
  );
}

/** Aba "Categorias de itens": em quais seções cada item pode ou não pode entrar. */
export function ItemRulesPanel({ group, canEdit }: { group: ServerGroup; canEdit: boolean }) {
  const { rules, loading, save, remove } = useItemRules(group);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [q, setQ] = useState("");
  const [category, setCategory] = useState(ALL);

  const term = q.trim().toLowerCase();
  const shown = rules.filter((r) =>
    (!term || r.item_name.toLowerCase().includes(term) || r.item_id.includes(term))
    && (category === ALL || r.allowed.includes(category) || r.forbidden.includes(category)));

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <p className="flex-1 text-sm text-muted-foreground">
          Itens com as categorias em que podem ou não podem entrar ({SERVER_GROUPS[group].label.toLowerCase()}). Na criação do documento,
          isso aparece ao lado do nome do item quando ele é procurado na seção.{canEdit ? "" : " Só quem tem a permissão “Editar categorias de itens” pode cadastrar."}
        </p>
        {canEdit && !draft && (
          <Button className="gap-1" onClick={() => setDraft({ item_id: "", item_name: "", allowed: [], forbidden: [], note: null })}>
            <Plus className="h-4 w-4" /> Cadastrar item
          </Button>
        )}
      </div>

      {draft && (
        <Card className="space-y-3 p-4">
          <div className="flex flex-wrap items-end gap-2">
            <label className="block w-32 space-y-1">
              <span className="text-xs text-muted-foreground">ID</span>
              <Input value={draft.item_id} inputMode="numeric" onChange={(e) => setDraft({ ...draft, item_id: e.target.value.trim() })} />
            </label>
            <label className="block min-w-[200px] flex-1 space-y-1">
              <span className="text-xs text-muted-foreground">Nome do item</span>
              <Input value={draft.item_name} onChange={(e) => setDraft({ ...draft, item_name: e.target.value })} />
            </label>
            {!draft.id && <ItemPicker getImage={() => ""} onPick={(p) => setDraft({ ...draft, item_id: p.id === "XXX" ? draft.item_id : p.id, item_name: p.name })} />}
          </div>
          <CategoryToggles draft={draft} onChange={setDraft} />
          <label className="block space-y-1">
            <span className="text-xs text-muted-foreground">Observação (opcional, aparece junto do aviso)</span>
            <Input value={draft.note ?? ""} placeholder="Ex.: só em eventos de aniversário" onChange={(e) => setDraft({ ...draft, note: e.target.value })} />
          </label>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setDraft(null)}>Cancelar</Button>
            <Button
              disabled={!/^\d+$/.test(draft.item_id) || !draft.item_name.trim() || draft.allowed.length + draft.forbidden.length === 0}
              title="Informe o ID, o nome e ao menos uma categoria"
              onClick={async () => {
                if (await save(draft)) setDraft(null);
              }}
            >
              Salvar
            </Button>
          </div>
        </Card>
      )}

      <div className="flex flex-wrap gap-2">
        <Input className="max-w-xs" placeholder="Buscar por nome ou ID..." value={q} onChange={(e) => setQ(e.target.value)} />
        <Select value={category} onValueChange={setCategory}>
          <SelectTrigger className="w-56"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Todas as categorias</SelectItem>
            {CATEGORIES.map((c) => <SelectItem key={c.type} value={c.type}>{c.label}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Carregando...</p>
      ) : shown.length === 0 ? (
        <Card className="p-6 text-sm text-muted-foreground">{rules.length === 0 ? "Nenhum item cadastrado ainda." : "Nenhum item com esse filtro."}</Card>
      ) : shown.map((r) => (
        <Card key={r.id} className="flex flex-wrap items-center gap-2 p-3">
          <div className="min-w-0 flex-1">
            <p className="truncate font-medium">{r.item_name} <span className="text-xs font-normal text-muted-foreground">ID {r.item_id}</span></p>
            <div className="mt-1 flex flex-wrap gap-1">
              {r.allowed.map((t) => <Badge key={`a${t}`} className="bg-green-600 hover:bg-green-600">✓ {categoryLabel(t)}</Badge>)}
              {r.forbidden.map((t) => <Badge key={`f${t}`} variant="destructive">✕ {categoryLabel(t)}</Badge>)}
            </div>
            {r.note && <p className="mt-1 text-xs text-muted-foreground">{r.note}</p>}
          </div>
          {canEdit && (
            <>
              <Button size="icon" variant="ghost" title="Editar" onClick={() => setDraft({ ...r })}><Pencil className="h-4 w-4" /></Button>
              <Button size="icon" variant="ghost" title="Excluir" onClick={() => confirm(`Excluir o cadastro de "${r.item_name}"?`) && remove(r.id)}><Trash2 className="h-4 w-4" /></Button>
            </>
          )}
        </Card>
      ))}
    </div>
  );
}
