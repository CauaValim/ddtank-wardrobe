import { useMemo, useState } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { BlockEditor, type EditorContext } from "@/components/events/SectionEditor";
import { useEventPresets } from "@/hooks/useEventPresets";
import { useEventItemLookup } from "@/hooks/useEventItemLookup";
import { useItemUsage } from "@/hooks/useItemUsage";
import { emptyBlock, getLayout } from "@/lib/eventTemplate/model";
import { presetFromBlock, presetSpec } from "@/lib/eventTemplate/presets";
import { isoToUs } from "@/lib/eventTemplate/format";
import { SERVER_GROUPS, type ServerGroup } from "@/lib/eventTemplate/serverGroups";
import type { EventBlock, EventSection } from "@/lib/eventTemplate/types";

interface Draft {
  id?: string;
  name: string;
  block: EventBlock;
}

/** Aba "Pré-definições": missões prontas (textos e recompensas, ou parte delas) para reaproveitar. */
export function PresetsPanel({ group, canEdit }: { group: ServerGroup; canEdit: boolean }) {
  const { presets, loading, save, remove } = useEventPresets(group);
  const [draft, setDraft] = useState<Draft | null>(null);
  const spec = useMemo(() => presetSpec(), []);
  const layout = getLayout("missions-3x3-choice")!;
  const section = useMemo<EventSection>(
    () => ({ id: "preset", layoutId: layout.id, servers: SERVER_GROUPS[group].servers, fields: {}, sets: { missions: draft ? [draft.block] : [] } }),
    [draft, group, layout.id],
  );
  const lookupDoc = useMemo(() => (draft ? { sections: [section] } : null), [draft, section]);
  const { idStatus, getImage } = useEventItemLookup(lookupDoc);
  const { getUsage } = useItemUsage(group, null);
  const ctx: EditorContext = { idStatus, getImage, getUsage, layout, section, servers: section.servers, sectionFields: {} };

  const blockFrom = (data?: { fields: Record<string, string>; groups: Record<string, EventBlock["groups"][string]> }): EventBlock => {
    const base = emptyBlock(spec);
    return data ? { ...base, fields: { ...data.fields }, groups: { ...base.groups, ...data.groups } } : base;
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <p className="flex-1 text-sm text-muted-foreground">
          Missões prontas para aplicar em Missões, Faça se Puder e Desafio da Tribo ({SERVER_GROUPS[group].label.toLowerCase()}).
          {canEdit ? "" : " Só quem tem a permissão “Editar pré-definições” pode criar e editar."}
        </p>
        {canEdit && !draft && (
          <Button className="gap-1" onClick={() => setDraft({ name: "", block: blockFrom() })}><Plus className="h-4 w-4" /> Nova pré-definição</Button>
        )}
      </div>

      {draft && (
        <Card className="space-y-3 p-4">
          <label className="block space-y-1">
            <span className="text-xs text-muted-foreground">Nome da pré-definição</span>
            <Input autoFocus value={draft.name} placeholder="Ex.: Missão de combate 4x4" onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
          </label>
          <BlockEditor spec={spec} setKey="missions" block={draft.block} title="Missão" ctx={ctx} onChange={(block) => setDraft({ ...draft, block })} />
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setDraft(null)}>Cancelar</Button>
            <Button
              disabled={!draft.name.trim()}
              onClick={async () => {
                if (await save(draft.name, presetFromBlock(draft.block), draft.id)) setDraft(null);
              }}
            >
              Salvar pré-definição
            </Button>
          </div>
        </Card>
      )}

      {loading ? (
        <p className="text-sm text-muted-foreground">Carregando...</p>
      ) : presets.length === 0 ? (
        <Card className="p-6 text-sm text-muted-foreground">Nenhuma pré-definição ainda.</Card>
      ) : presets.map((p) => {
        const count = (k: string) => p.data.groups[k]?.length ?? 0;
        return (
          <Card key={p.id} className="flex flex-wrap items-center gap-3 p-4">
            <div className="min-w-0 flex-1">
              <p className="truncate font-semibold">{p.name}</p>
              <p className="truncate text-xs text-muted-foreground">
                {p.data.fields.titlePt || p.data.fields.titleEn || "Sem título"} · {count("items")} recompensa(s)
                {count("choice") ? ` · ${count("choice")} opção(ões)` : ""}{count("requirements") ? ` · ${count("requirements")} exigido(s)` : ""}
                {p.updated_at ? ` · ${isoToUs(p.updated_at)}` : ""}
              </p>
            </div>
            {canEdit && (
              <>
                <Button size="icon" variant="ghost" title="Editar" onClick={() => setDraft({ id: p.id, name: p.name, block: blockFrom(p.data) })}><Pencil className="h-4 w-4" /></Button>
                <Button size="icon" variant="ghost" title="Excluir" onClick={() => confirm(`Excluir a pré-definição "${p.name}"?`) && remove(p.id)}><Trash2 className="h-4 w-4" /></Button>
              </>
            )}
          </Card>
        );
      })}
    </div>
  );
}
