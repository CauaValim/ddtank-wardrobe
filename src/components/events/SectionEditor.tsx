import { ChevronDown, ChevronUp, Copy, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ItemPicker } from "@/components/events/ItemPicker";
import { ItemRow } from "@/components/events/ItemRow";
import { renderFormat } from "@/lib/eventTemplate/format";
import { capacitySummary, emptyBlock, getLayout, newItem } from "@/lib/eventTemplate/model";
import type { BlockSpec, EventBlock, EventItem, EventSection, FieldSpec, LayoutSpec, SetSpec } from "@/lib/eventTemplate/types";
import type { IdStatus } from "@/lib/eventTemplate/itemLookup";

export interface EditorContext {
  idStatus: (id: string) => IdStatus;
  getImage: (id: string) => string;
  layout: LayoutSpec;
  servers: string;
  sectionFields: Record<string, string>;
}

function Field({ label, children, wide }: { label: string; children: React.ReactNode; wide?: boolean }) {
  return (
    <label className={`block space-y-1 ${wide ? "sm:col-span-2 lg:col-span-3" : ""}`}>
      <span className="text-xs text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}

function FieldInput({ spec, value, onChange }: { spec: FieldSpec; value: string; onChange: (v: string) => void }) {
  if (spec.options) {
    return (
      <Select value={value || spec.options[0]} onValueChange={onChange}>
        <SelectTrigger><SelectValue /></SelectTrigger>
        <SelectContent>{spec.options.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}</SelectContent>
      </Select>
    );
  }
  if (spec.input === "textarea") return <Textarea rows={3} value={value} onChange={(e) => onChange(e.target.value)} />;
  if (spec.input === "datetime") return <Input type="datetime-local" value={value} onChange={(e) => onChange(e.target.value)} />;
  const hint = spec.format !== "{value}" ? spec.format.replace("{value}", "…") : undefined;
  return <Input value={value} placeholder={hint} onChange={(e) => onChange(e.target.value)} />;
}

function editable(fields: FieldSpec[]) {
  return fields.filter((f) => f.input !== "derived");
}

function DerivedLines({ spec, block, ctx }: { spec: BlockSpec; block: EventBlock; ctx: EditorContext }) {
  const lines = spec.fields.filter((f) => f.input === "derived" && /\{(idLine|orLine|idList|requirementsList)/.test(f.format));
  if (lines.length === 0) return null;
  return (
    <div className="space-y-1">
      {lines.map((f) => {
        const text = renderFormat(f.format, { servers: ctx.servers, docTitle: "", docServers: "", sectionFields: ctx.sectionFields, groups: block.groups });
        if (!text.replace(/ID:\s*/, "").trim()) return null;
        return (
          <div key={f.key} className="flex items-center gap-2">
            <span className="w-28 shrink-0 text-xs text-muted-foreground">{f.label}</span>
            <code className="flex-1 break-all rounded bg-muted px-2 py-1 text-xs">{text}</code>
            <Button size="icon" variant="ghost" className="h-7 w-7" title="Copiar" onClick={() => { navigator.clipboard.writeText(text); toast.success("Copiado"); }}>
              <Copy className="h-3.5 w-3.5" />
            </Button>
          </div>
        );
      })}
    </div>
  );
}

function BlockEditor({ spec, block, title, ctx, onChange, onRemove }: {
  spec: BlockSpec; block: EventBlock; title: string; ctx: EditorContext; onChange: (b: EventBlock) => void; onRemove?: () => void;
}) {
  const setGroup = (key: string, items: EventItem[]) => onChange({ ...block, groups: { ...block.groups, [key]: items } });
  const fields = editable(spec.fields);
  return (
    <div className="space-y-3 rounded-lg border border-border p-3">
      <div className="flex items-center gap-2">
        <span className="text-sm font-semibold">{title}</span>
        <span className="flex-1" />
        {onRemove && <Button size="icon" variant="ghost" className="h-7 w-7" title={`Remover ${title.toLowerCase()}`} onClick={onRemove}><Trash2 className="h-4 w-4" /></Button>}
      </div>
      {fields.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {fields.map((f) => (
            <Field key={f.key} label={f.label} wide={f.input === "textarea"}>
              <FieldInput spec={f} value={block.fields[f.key] ?? ""} onChange={(v) => onChange({ ...block, fields: { ...block.fields, [f.key]: v } })} />
            </Field>
          ))}
        </div>
      )}
      {spec.groups.map((g) => {
        const items = block.groups[g.key] ?? [];
        const full = items.length >= g.slots.length;
        return (
          <div key={g.key} className="space-y-2">
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium">{g.label}</span>
              <Badge variant={full ? "default" : "outline"} className="tabular-nums">{items.length} de {g.slots.length}</Badge>
              <span className="flex-1" />
              <ItemPicker
                getImage={ctx.getImage}
                disabled={full}
                onPick={(p) => {
                  const extra: Record<string, string> = {};
                  for (const f of ctx.layout.itemFields ?? []) if (f.default) extra[f.key] = f.default;
                  setGroup(g.key, [...items, newItem({ ...p, ...(Object.keys(extra).length ? { extra } : {}) })]);
                }}
              />
            </div>
            {items.map((item, i) => (
              <ItemRow
                key={i}
                item={item}
                index={i}
                kind={g.kind}
                itemFields={ctx.layout.itemFields}
                idStatus={ctx.idStatus}
                getImage={ctx.getImage}
                onChange={(patch) => setGroup(g.key, items.map((x, k) => (k === i ? { ...x, ...patch } : x)))}
                onRemove={() => setGroup(g.key, items.filter((_, k) => k !== i))}
              />
            ))}
          </div>
        );
      })}
      <DerivedLines spec={spec} block={block} ctx={ctx} />
      {spec.children && (
        <SetEditor set={spec.children} blocks={block.children ?? []} ctx={ctx} onChange={(children) => onChange({ ...block, children })} nested />
      )}
    </div>
  );
}

export function SetEditor({ set, blocks, ctx, onChange, nested }: {
  set: SetSpec; blocks: EventBlock[]; ctx: EditorContext; onChange: (b: EventBlock[]) => void; nested?: boolean;
}) {
  const full = blocks.length >= set.blocks.length;
  return (
    <div className={`space-y-2 ${nested ? "border-l-2 border-primary/30 pl-3" : ""}`}>
      {(set.blocks.length > 1 || nested) && (
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">{set.label}</span>
          <Badge variant="outline" className="tabular-nums">{blocks.length} de {set.blocks.length}</Badge>
        </div>
      )}
      {blocks.map((b, i) => (
        <BlockEditor
          key={i}
          spec={set.blocks[i]}
          block={b}
          title={set.blocks.length > 1 ? `${set.blockLabel} ${i + 1}` : set.blockLabel}
          ctx={ctx}
          onChange={(nb) => onChange(blocks.map((x, k) => (k === i ? nb : x)))}
          onRemove={blocks.length > set.minBlocks && i === blocks.length - 1 ? () => onChange(blocks.slice(0, -1)) : undefined}
        />
      ))}
      {set.blocks.length > 1 && (
        <Button size="sm" variant="outline" className="gap-1" disabled={full} onClick={() => onChange([...blocks, emptyBlock(set.blocks[blocks.length])])}>
          <Plus className="h-3.5 w-3.5" /> {full ? `Limite do modelo: ${set.blocks.length}` : `Adicionar ${set.blockLabel.toLowerCase()}`}
        </Button>
      )}
    </div>
  );
}

interface SectionProps {
  section: EventSection;
  index: number;
  isFirst: boolean;
  isLast: boolean;
  idStatus: (id: string) => IdStatus;
  getImage: (id: string) => string;
  onChange: (s: EventSection) => void;
  onRemove: () => void;
  onMove: (dir: -1 | 1) => void;
}

export function SectionEditor({ section, index, isFirst, isLast, idStatus, getImage, onChange, onRemove, onMove }: SectionProps) {
  const layout = getLayout(section.layoutId);
  if (!layout) {
    return (
      <Card className="p-4 text-sm text-destructive">
        Seção {index + 1}: layout "{section.layoutId}" não existe nesta versão do modelo.
        <Button size="sm" variant="ghost" className="ml-2" onClick={onRemove}>Remover</Button>
      </Card>
    );
  }
  const ctx: EditorContext = { idStatus, getImage, layout, servers: section.servers, sectionFields: section.fields };
  const fields = editable(layout.fields);
  return (
    <Card className="space-y-4 p-4">
      <div className="flex flex-wrap items-start gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <Badge>{index + 1}</Badge>
            <h2 className="font-semibold">{layout.label}</h2>
            <span className="text-xs text-muted-foreground">{capacitySummary(layout)}</span>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">{layout.description} Aba do modelo: {layout.sheet}.</p>
        </div>
        <Button size="icon" variant="ghost" disabled={isFirst} title="Mover para cima" onClick={() => onMove(-1)}><ChevronUp className="h-4 w-4" /></Button>
        <Button size="icon" variant="ghost" disabled={isLast} title="Mover para baixo" onClick={() => onMove(1)}><ChevronDown className="h-4 w-4" /></Button>
        <Button size="icon" variant="ghost" title="Remover seção" onClick={onRemove}><Trash2 className="h-4 w-4" /></Button>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Field label="Servidores">
          <Input value={section.servers} onChange={(e) => onChange({ ...section, servers: e.target.value })} />
        </Field>
        {fields.map((f) => (
          <Field key={f.key} label={f.label} wide={f.input === "textarea"}>
            <FieldInput spec={f} value={section.fields[f.key] ?? ""} onChange={(v) => onChange({ ...section, fields: { ...section.fields, [f.key]: v } })} />
          </Field>
        ))}
      </div>
      {layout.sets.map((set) => (
        <SetEditor
          key={set.key}
          set={set}
          blocks={section.sets[set.key] ?? []}
          ctx={ctx}
          onChange={(blocks) => onChange({ ...section, sets: { ...section.sets, [set.key]: blocks } })}
        />
      ))}
    </Card>
  );
}
