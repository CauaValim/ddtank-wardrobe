import { getLayout } from "./model";
import type { BlockSpec, EventBlock, EventItem, GroupSpec } from "./types";

/**
 * Pré-definição de missão: textos e recompensas (ou parte delas) reaproveitados em qualquer
 * layout de missão (Missões, Faça se Puder, Desafio da Tribo).
 */
export interface PresetData {
  fields: Record<string, string>;
  groups: Record<string, EventItem[]>;
}

export interface EventPreset {
  id: string;
  name: string;
  server_group: string;
  data: PresetData;
  updated_at?: string;
}

const PRESET_FIELDS = ["titleEn", "titlePt", "descPt"];

/** Bloco de missão: tem título e objetivos em inglês. */
export const isMissionBlock = (spec: BlockSpec) => spec.fields.some((f) => f.key === "titleEn");

const stripItem = ({ imageUrl: _image, ...item }: EventItem): EventItem => item;

export function presetFromBlock(block: EventBlock): PresetData {
  const fields: Record<string, string> = {};
  for (const k of PRESET_FIELDS) if (block.fields[k]?.trim()) fields[k] = block.fields[k];
  const groups: Record<string, EventItem[]> = {};
  for (const [k, items] of Object.entries(block.groups)) if (items.length) groups[k] = items.map(stripItem);
  return { fields, groups };
}

/**
 * Aplica a pré-definição: textos preenchidos substituem os do bloco; os itens da pré-definição
 * vêm primeiro e os que já estavam no bloco continuam depois, até a capacidade de cada grupo.
 * Devolve quantos itens não couberam.
 */
export function applyPreset(spec: BlockSpec, block: EventBlock, preset: PresetData): { block: EventBlock; dropped: number } {
  const fields = { ...block.fields };
  for (const f of spec.fields) if (f.input !== "derived" && preset.fields[f.key]?.trim()) fields[f.key] = preset.fields[f.key];
  const groups = { ...block.groups };
  let dropped = 0;
  for (const g of spec.groups) {
    const wanted = preset.groups[g.key] ?? [];
    if (!wanted.length) continue;
    const key = (i: EventItem) => `${i.id}|${i.name}`;
    const seen = new Set(wanted.map(key));
    const merged = [...wanted, ...(block.groups[g.key] ?? []).filter((i) => !seen.has(key(i)))];
    dropped += Math.max(0, merged.length - g.slots.length);
    groups[g.key] = merged.slice(0, g.slots.length);
  }
  for (const [k, items] of Object.entries(preset.groups)) if (items.length && !spec.groups.some((g) => g.key === k)) dropped += items.length;
  return { block: { ...block, fields, groups }, dropped };
}

const widen = (group: GroupSpec, slots: number): GroupSpec => ({
  ...group,
  slots: Array.from({ length: slots }, (_, i) => group.slots[Math.min(i, group.slots.length - 1)]),
});

/**
 * Spec usada para editar pré-definições: a maior missão possível
 * (até 4 itens exigidos, 6 recompensas e 4 opções de escolha).
 */
export function presetSpec(): BlockSpec {
  const base = getLayout("missions-3x3-choice")!.sets[0].blocks[2];
  const requirements = getLayout("missions-requirements")!.sets[0].blocks[0].groups.find((g) => g.kind === "requirements")!;
  const items = base.groups.find((g) => g.key === "items")!;
  const choice = base.groups.find((g) => g.key === "choice")!;
  return {
    ...base,
    fields: base.fields.filter((f) => PRESET_FIELDS.includes(f.key) || f.key === "idLine" || f.key === "orLine"),
    groups: [widen(requirements, 4), widen(items, 6), choice],
  };
}
