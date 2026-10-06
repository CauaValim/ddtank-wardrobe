import { useState } from "react";
import { ChevronDown, ChevronRight, ChevronUp, Copy, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ItemPicker } from "@/components/events/ItemPicker";
import { ItemRow } from "@/components/events/ItemRow";
import { DateTimeField } from "@/components/events/DateInputs";
import { renderFormat } from "@/lib/eventTemplate/format";
import { capacitySummary, emptyBlock, getLayout, newItem } from "@/lib/eventTemplate/model";
import {
  DAILY_LENGTHS, NO_LIMIT, applyDailyLength, dailyLength, editorBlockSpec, exchangeLimitText, groupLimit, highestStandardTier,
  isAutoField, isExchangeCondition, isFixedSet, normalizeTier, pagination, parseExchangeLimit, setCapacity, tierCondition, tierLadder,
  tiersUpTo, type DailyLength, type TierLadder,
} from "@/lib/eventTemplate/rules";
import type { BlockSpec, EventBlock, EventItem, EventSection, FieldSpec, LayoutSpec, SetSpec } from "@/lib/eventTemplate/types";
import type { IdStatus } from "@/lib/eventTemplate/itemLookup";

export interface EditorContext {
  idStatus: (id: string) => IdStatus;
  getImage: (id: string) => string;
  layout: LayoutSpec;
  section: EventSection;
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
  if (spec.input === "datetime") return <DateTimeField value={value} onChange={onChange} />;
  const hint = spec.format !== "{value}" ? spec.format.replace("{value}", "…") : undefined;
  return <Input value={value} placeholder={hint} onChange={(e) => onChange(e.target.value)} />;
}

const MANUAL = "__manual__";

/** Piso: um dos valores padrão ou um valor manual (para pisos novos no futuro). */
function TierValueInput({ ladder, value, onChange }: { ladder: TierLadder; value: string; onChange: (v: string) => void }) {
  const normalized = value ? normalizeTier(value) : "";
  const [manual, setManual] = useState(!!normalized && !ladder.values.includes(normalized));
  return (
    <div className="flex gap-1">
      <Select
        value={manual ? MANUAL : normalized || undefined}
        onValueChange={(v) => {
          if (v === MANUAL) {
            setManual(true);
            return;
          }
          setManual(false);
          onChange(v);
        }}
      >
        <SelectTrigger className={manual ? "w-32" : ""}><SelectValue placeholder="Escolha o piso" /></SelectTrigger>
        <SelectContent>
          {ladder.values.map((v) => (
            <SelectItem key={v} value={v}>{v} cupons{ladder.repeatable.includes(v) ? " (repetível)" : ""}</SelectItem>
          ))}
          <SelectItem value={MANUAL}>Outro valor (manual)</SelectItem>
        </SelectContent>
      </Select>
      {manual && <Input inputMode="numeric" placeholder="25.000" value={value} onChange={(e) => onChange(e.target.value)} onBlur={() => value && onChange(normalizeTier(value))} />}
    </div>
  );
}

/** Condição da troca: "No limit" ou "LIMIT OF x ITEMS PER EXCHANGE". */
function ExchangeLimitInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const parsed = parseExchangeLimit(value);
  const limited = parsed != null;
  const custom = parsed === undefined;
  return (
    <div className="flex gap-1">
      <Select value={limited ? "limit" : "none"} onValueChange={(v) => onChange(v === "limit" ? exchangeLimitText(1) : NO_LIMIT)}>
        <SelectTrigger className={limited ? "w-36" : ""}><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="none">Sem limite (No limit)</SelectItem>
          <SelectItem value="limit">Com limite de troca</SelectItem>
        </SelectContent>
      </Select>
      {limited && (
        <Input
          type="number"
          min={1}
          className="w-24 tabular-nums"
          title="LIMIT OF x ITEMS PER EXCHANGE"
          value={parsed ?? 1}
          onChange={(e) => onChange(exchangeLimitText(Math.max(1, Number(e.target.value) || 1)))}
        />
      )}
      {custom && value && <span className="self-center text-xs text-amber-600" title={value}>Texto antigo: será trocado ao escolher</span>}
    </div>
  );
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

function BlockEditor({ spec, setKey, block, title, ctx, onChange, onRemove }: {
  spec: BlockSpec; setKey: string; block: EventBlock; title: string; ctx: EditorContext; onChange: (b: EventBlock) => void; onRemove?: () => void;
}) {
  const setGroup = (key: string, items: EventItem[]) => onChange({ ...block, groups: { ...block.groups, [key]: items } });
  const setField = (key: string, v: string) => onChange({ ...block, fields: { ...block.fields, [key]: v } });
  const fields = editable(spec.fields);
  const ladder = setKey === "tiers" ? tierLadder(ctx.layout) : null;
  const renderField = (f: FieldSpec) => {
    const value = block.fields[f.key] ?? "";
    if (isAutoField(ctx.layout, setKey, f.key)) return <Input value={value} disabled title="Preenchido automaticamente pela duração da Entrada Diária" />;
    if (ladder && f.key === "value") {
      return <TierValueInput ladder={ladder} value={value} onChange={(v) => onChange({ ...block, fields: { ...block.fields, value: v, condition: tierCondition(ladder, v) } })} />;
    }
    if (isExchangeCondition(ctx.layout, setKey, f.key)) return <ExchangeLimitInput value={value} onChange={(v) => setField(f.key, v)} />;
    return <FieldInput spec={f} value={value} onChange={(v) => setField(f.key, v)} />;
  };
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
              {renderField(f)}
            </Field>
          ))}
        </div>
      )}
      {spec.groups.map((g) => {
        const items = block.groups[g.key] ?? [];
        const limit = groupLimit(ctx.layout, ctx.section, setKey, g.key, g.slots.length);
        const full = items.length >= limit;
        return (
          <div key={g.key} className="space-y-2">
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium">{g.label}</span>
              <Badge variant={items.length > limit ? "destructive" : full ? "default" : "outline"} className="tabular-nums">{items.length} de {limit}</Badge>
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
  const capacity = setCapacity(ctx.layout, set);
  const unlimited = capacity === Infinity;
  const fixed = isFixedSet(ctx.layout, set.key);
  const full = blocks.length >= capacity;
  const pages = unlimited ? Math.ceil(blocks.length / set.blocks.length) : 1;
  return (
    <div className={`space-y-2 ${nested ? "border-l-2 border-primary/30 pl-3" : ""}`}>
      {(set.blocks.length > 1 || nested || unlimited) && (
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">{set.label}</span>
          <Badge variant="outline" className="tabular-nums">{unlimited ? blocks.length : `${blocks.length} de ${set.blocks.length}`}</Badge>
          {unlimited && pagination(ctx.layout, set.key)?.lastBlockGroup && (
            <span className="text-xs text-muted-foreground">Cada missão com opções de escolha fica na 3ª posição de uma aba.</span>
          )}
          {unlimited && !pagination(ctx.layout, set.key)?.lastBlockGroup && pages > 1 && (
            <span className="text-xs text-muted-foreground">{pages} abas no arquivo ({set.blocks.length} por aba)</span>
          )}
        </div>
      )}
      {blocks.map((b, i) => (
        <BlockEditor
          key={i}
          spec={editorBlockSpec(ctx.layout, set, i)}
          setKey={set.key}
          block={b}
          title={set.blocks.length > 1 || unlimited ? `${set.blockLabel} ${i + 1}` : set.blockLabel}
          ctx={ctx}
          onChange={(nb) => onChange(blocks.map((x, k) => (k === i ? nb : x)))}
          onRemove={
            fixed || blocks.length <= set.minBlocks ? undefined
              : unlimited ? () => onChange(blocks.filter((_, k) => k !== i))
              : i === blocks.length - 1 ? () => onChange(blocks.slice(0, -1)) : undefined
          }
        />
      ))}
      {!fixed && (set.blocks.length > 1 || unlimited) && (
        <Button size="sm" variant="outline" className="gap-1" disabled={full} onClick={() => onChange([...blocks, emptyBlock(editorBlockSpec(ctx.layout, set, blocks.length))])}>
          <Plus className="h-3.5 w-3.5" /> {full ? `Limite do modelo: ${set.blocks.length}` : `Adicionar ${set.blockLabel.toLowerCase()}`}
        </Button>
      )}
    </div>
  );
}

/** Controles próprios de alguns layouts, acima dos blocos. */
function SectionRules({ layout, section, onChange }: { layout: LayoutSpec; section: EventSection; onChange: (s: EventSection) => void }) {
  if (layout.type === "daily") {
    return (
      <Field label="Duração da Entrada Diária">
        <Select value={String(dailyLength(section))} onValueChange={(v) => onChange(applyDailyLength(layout, section, Number(v) as DailyLength))}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            {DAILY_LENGTHS.map((d) => <SelectItem key={d} value={String(d)}>{d} dias (filas de {d === 7 ? "3 e 7" : "3, 7 e 14"} dias)</SelectItem>)}
          </SelectContent>
        </Select>
      </Field>
    );
  }
  const ladder = tierLadder(layout);
  if (ladder) {
    const current = highestStandardTier(layout, section);
    return (
      <Field label="Pisos até">
        <Select value={current || undefined} onValueChange={(v) => onChange(tiersUpTo(layout, section, v))}>
          <SelectTrigger><SelectValue placeholder="Escolha o último piso" /></SelectTrigger>
          <SelectContent>
            {ladder.values.map((v) => <SelectItem key={v} value={v}>{v} cupons</SelectItem>)}
          </SelectContent>
        </Select>
      </Field>
    );
  }
  return null;
}

function itemCount(blocks: EventBlock[]): number {
  return blocks.reduce((n, b) => n + Object.values(b.groups).reduce((m, g) => m + g.length, 0) + itemCount(b.children ?? []), 0);
}

interface SectionProps {
  section: EventSection;
  index: number;
  isFirst: boolean;
  isLast: boolean;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
  idStatus: (id: string) => IdStatus;
  getImage: (id: string) => string;
  onChange: (s: EventSection) => void;
  onRemove: () => void;
  onMove: (dir: -1 | 1) => void;
}

export function SectionEditor({ section, index, isFirst, isLast, collapsed, onToggleCollapse, idStatus, getImage, onChange, onRemove, onMove }: SectionProps) {
  const layout = getLayout(section.layoutId);
  if (!layout) {
    return (
      <Card className="p-4 text-sm text-destructive">
        Seção {index + 1}: layout "{section.layoutId}" não existe nesta versão do modelo.
        <Button size="sm" variant="ghost" className="ml-2" onClick={onRemove}>Remover</Button>
      </Card>
    );
  }
  const ctx: EditorContext = { idStatus, getImage, layout, section, servers: section.servers, sectionFields: section.fields };
  const fields = editable(layout.fields);
  const items = itemCount(Object.values(section.sets).flat());
  return (
    <Card className="space-y-4 p-4">
      <div className="flex flex-wrap items-start gap-2">
        {onToggleCollapse && (
          <Button size="icon" variant="ghost" title={collapsed ? "Expandir seção" : "Recolher seção"} aria-expanded={!collapsed} onClick={onToggleCollapse}>
            {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </Button>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <Badge>{index + 1}</Badge>
            <h2 className="font-semibold">{layout.label}</h2>
            <span className="text-xs text-muted-foreground">{collapsed ? `${section.servers} · ${items} item(ns)` : capacitySummary(layout)}</span>
          </div>
          {!collapsed && <p className="mt-1 text-xs text-muted-foreground">{layout.description} Aba do modelo: {layout.sheet}.</p>}
        </div>
        <Button size="icon" variant="ghost" disabled={isFirst} title="Mover para cima" onClick={() => onMove(-1)}><ChevronUp className="h-4 w-4" /></Button>
        <Button size="icon" variant="ghost" disabled={isLast} title="Mover para baixo" onClick={() => onMove(1)}><ChevronDown className="h-4 w-4" /></Button>
        <Button size="icon" variant="ghost" title="Remover seção" onClick={onRemove}><Trash2 className="h-4 w-4" /></Button>
      </div>
      {!collapsed && (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <Field label="Servidores">
              <Input value={section.servers} onChange={(e) => onChange({ ...section, servers: e.target.value })} />
            </Field>
            {fields.map((f) => (
              <Field key={f.key} label={f.label} wide={f.input === "textarea"}>
                <FieldInput spec={f} value={section.fields[f.key] ?? ""} onChange={(v) => onChange({ ...section, fields: { ...section.fields, [f.key]: v } })} />
              </Field>
            ))}
            <SectionRules layout={layout} section={section} onChange={onChange} />
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
        </>
      )}
    </Card>
  );
}
