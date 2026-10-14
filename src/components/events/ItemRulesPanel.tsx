import { useState } from "react";
import { Ban, Check, Pencil, Plus, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ItemPicker } from "@/components/events/ItemPicker";
import { useItemRules } from "@/hooks/useItemRules";
import { CATEGORIES, TIER_CATEGORIES, categoryLabel, minTier, type ItemRule } from "@/lib/eventTemplate/itemRules";
import { ItemLookupFields } from "@/components/events/ItemLookupFields";
import { SERVER_GROUPS, type ServerGroup } from "@/lib/eventTemplate/serverGroups";

type Draft = Omit<ItemRule, "id"> & { id?: string };

const ALL = "__all__";
const ANY_TIER = "__any__";

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
        const tiers = TIER_CATEGORIES[type];
        const tier = draft.min_tiers?.[type] ?? "";
        return (
          <div key={type} className="flex flex-wrap items-center gap-1 rounded-md border border-border px-2 py-1">
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
            {tiers && !forbidden && (
              <div className="flex w-full items-center gap-1.5 pb-0.5 pt-1">
                <span className="text-xs text-muted-foreground">Liberado a partir do andar</span>
                <Select
                  value={tier || ANY_TIER}
                  onValueChange={(v) => onChange({ ...draft, min_tiers: { ...(draft.min_tiers ?? {}), [type]: v === ANY_TIER ? "" : v } })}
                >
                  <SelectTrigger className="h-7 w-32 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ANY_TIER}>Qualquer andar</SelectItem>
                    {tiers.map((t, i) => <SelectItem key={t} value={t}>{i + 1}º · {t}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}
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
          Itens com as categorias em que podem ou não podem entrar. Os cadastros valem para as duas bases (antigos e novos). Na criação do documento,
          isso aparece ao lado do nome do item quando ele é procurado na seção.{canEdit ? "" : " Só quem tem a permissão “Editar categorias de itens” pode cadastrar."}
        </p>
        {canEdit && !draft && (
          <Button className="gap-1" onClick={() => setDraft({ item_id: "", item_name: "", allowed: [], forbidden: [], note: null, min_tiers: {} })}>
            <Plus className="h-4 w-4" /> Cadastrar item
          </Button>
        )}
      </div>

      {draft && (
        <Card className="space-y-3 p-4">
          <div className="flex flex-wrap items-end gap-2">
            <ItemLookupFields
              id={draft.item_id}
              name={draft.item_name}
              onChange={(it) => setDraft((d) => (d ? { ...d, item_id: it.id, item_name: it.name } : d))}
            />
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
              disabled={!/^\d+$/.test(draft.item_id) || !draft.item_name.trim() || draft.allowed.length + draft.forbidden.length + Object.values(draft.min_tiers ?? {}).filter(Boolean).length === 0}
              title="Informe o ID, o nome e ao menos uma categoria ou andar"
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
              {r.allowed.map((t) => <Badge key={`a${t}`} className="bg-green-600 hover:bg-green-600">✓ {categoryLabel(t)}{minTier(r, t) ? ` (a partir de ${minTier(r, t)})` : ""}</Badge>)}
              {Object.keys(r.min_tiers ?? {}).filter((t) => minTier(r, t) && !r.allowed.includes(t) && !r.forbidden.includes(t)).map((t) => (
                <Badge key={`t${t}`} variant="outline">{categoryLabel(t)} a partir de {minTier(r, t)}</Badge>
              ))}
              {r.forbidden.map((t) => <Badge key={`f${t}`} variant="destructive">✕ {categoryLabel(t)}</Badge>)}
            </div>
            {r.note && <p className="mt-1 text-xs text-muted-foreground">{r.note}</p>}
          </div>
          {canEdit && (
            <>
              <Button size="icon" variant="ghost" title="Editar" onClick={() => setDraft({ ...r })}><Pencil className="h-4 w-4" /></Button>
              <Button size="icon" variant="ghost" title="Excluir" onClick={() => confirm(`Excluir o cadastro de "${r.item_name}"?`) && remove(r)}><Trash2 className="h-4 w-4" /></Button>
            </>
          )}
        </Card>
      ))}
    </div>
  );
}
