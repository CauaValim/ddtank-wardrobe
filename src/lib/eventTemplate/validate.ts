import type { BlockSpec, EventBlock, EventDocument, LayoutSpec, SetSpec, TemplateManifest } from "./types";

export interface ValidationIssue {
  level: "error" | "warning";
  where: string;
  message: string;
}

export interface ValidationOptions {
  knownIds: Set<string>;
  hasImage: (id: string) => boolean;
}

function checkDates(issues: ValidationIssue[], where: string, fields: Record<string, string>, spec: { key: string; input: string; label: string }[]) {
  const dateFields = spec.filter((f) => f.input === "datetime");
  for (const f of dateFields) if (!fields[f.key]) issues.push({ level: "warning", where, message: `${f.label} não preenchido` });
  if (fields.start && fields.end && fields.end < fields.start) issues.push({ level: "error", where, message: "Data final antes da inicial" });
}

function checkBlock(issues: ValidationIssue[], where: string, spec: BlockSpec, block: EventBlock, opts: ValidationOptions) {
  checkDates(issues, where, block.fields, spec.fields);
  for (const f of spec.fields) {
    if ((f.input === "text" || f.input === "textarea") && !block.fields[f.key] && f.format !== "{value}") {
      issues.push({ level: "warning", where, message: `${f.label} não preenchido` });
    }
  }
  for (const g of spec.groups) {
    const items = block.groups[g.key] ?? [];
    if (items.length > g.slots.length) {
      issues.push({ level: "error", where, message: `${g.label}: ${items.length} itens, o modelo comporta ${g.slots.length}` });
    }
    items.forEach((item, i) => {
      const label = `${g.label} ${i + 1}`;
      if (!item.name.trim()) issues.push({ level: "error", where, message: `${label}: item sem nome` });
      const id = item.id.trim();
      if (!id || /^x+$/i.test(id)) {
        issues.push({ level: "warning", where, message: `${label}: "${item.name || "item"}" ainda está como XXX` });
        if (!item.imageUrl && g.slots[i]?.image) issues.push({ level: "warning", where, message: `${label}: "${item.name || "item"}" sairá sem imagem (envie uma imagem)` });
      } else {
        if (!opts.knownIds.has(id)) issues.push({ level: "warning", where, message: `${label}: ID ${id} não existe no painel` });
        else if (g.slots[i]?.image && !item.imageUrl && !opts.hasImage(id)) issues.push({ level: "warning", where, message: `${label}: ${item.name} não tem imagem no painel` });
      }
      if (!(item.qty > 0)) issues.push({ level: "error", where, message: `${label}: quantidade inválida` });
    });
  }
  if (spec.children) checkSet(issues, where, spec.children, block.children ?? [], opts);
}

function checkSet(issues: ValidationIssue[], where: string, set: SetSpec, blocks: EventBlock[], opts: ValidationOptions) {
  if (blocks.length > set.blocks.length) {
    issues.push({ level: "error", where, message: `${set.label}: ${blocks.length} ${set.blockLabel.toLowerCase()}(s), o modelo comporta ${set.blocks.length}` });
  }
  blocks.slice(0, set.blocks.length).forEach((b, i) => checkBlock(issues, `${where} › ${set.blockLabel} ${i + 1}`, set.blocks[i], b, opts));
}

export function validateEventDocument(doc: EventDocument, manifest: TemplateManifest, opts: ValidationOptions): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  if (!doc.theme?.trim()) issues.push({ level: "warning", where: "Capa", message: "Preencha o tema (aparece na capa como \"EVENT FOR THE SERVERS\")" });
  if (doc.sections.length === 0) issues.push({ level: "error", where: "Documento", message: "Adicione ao menos uma seção" });
  doc.sections.forEach((section, i) => {
    const layout: LayoutSpec | undefined = manifest.layouts.find((l) => l.id === section.layoutId);
    const where = `${i + 1}. ${layout?.label ?? section.layoutId}`;
    if (!layout) {
      issues.push({ level: "error", where, message: "Layout não existe nesta versão do modelo" });
      return;
    }
    if (!/^s\d+\s*-\s*s?\d+$/i.test(section.servers.trim())) issues.push({ level: "warning", where, message: `Servidores "${section.servers}" fora do padrão s1-s401` });
    checkDates(issues, where, section.fields, layout.fields);
    let total = 0;
    for (const set of layout.sets) {
      const blocks = section.sets[set.key] ?? [];
      total += blocks.length;
      checkSet(issues, where, set, blocks, opts);
    }
    if (total === 0) issues.push({ level: "warning", where, message: "Seção sem conteúdo" });
  });
  return issues;
}
