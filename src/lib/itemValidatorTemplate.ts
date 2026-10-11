import { detectLayout, readSection } from "@/lib/eventTemplate/importer";
import { manifest, requestsManifest } from "@/lib/eventTemplate/model";
import { XlsxPackage } from "@/lib/eventTemplate/ooxml";
import type { BlockSpec, EventBlock, LayoutSpec, SetSpec, TemplateManifest } from "@/lib/eventTemplate/types";
import type { ExtractedPair } from "@/lib/itemValidator";

/**
 * "Verificar Itens" em planilhas do modelo oficial: cada aba reconhecida é lida pelo mesmo leitor
 * da Criação de Eventos, que sabe onde fica cada item em cada layout (Faça se Puder com itens
 * exigidos e linhas "OR", trocas, pacotes, solicitações...). Abas fora do modelo ficam para a
 * leitura aproximada (extractPairsFromGrid).
 */

const allLayouts: TemplateManifest = { ...manifest, layouts: [...manifest.layouts, ...requestsManifest.layouts] };

function blockPairs(sheet: string, spec: BlockSpec | undefined, block: EventBlock, out: ExtractedPair[]) {
  for (const group of spec?.groups ?? []) {
    (block.groups[group.key] ?? []).forEach((item, i) => {
      if (!item.name.trim() && !item.id.trim()) return;
      // Os itens ocupam as posições do grupo em ordem: a célula é a do nome na posição i.
      const slot = group.slots[i] ?? group.slots[group.slots.length - 1];
      const cell = slot?.cells.find((c) => c.format === "{label}" || c.format.includes("{name}"))?.cell ?? slot?.cells[0]?.cell ?? "";
      out.push({ sheet, cell, name: item.name, id: item.id.trim() || "XXX" });
    });
  }
  if (spec?.children && block.children) setPairs(sheet, spec.children, block.children, out);
}

function setPairs(sheet: string, set: SetSpec, blocks: EventBlock[], out: ExtractedPair[]) {
  // Abas de continuação repetem a última posição do layout.
  blocks.forEach((block, i) => blockPairs(sheet, set.blocks[i] ?? set.blocks[set.blocks.length - 1], block, out));
}

/** Pares (nome, ID) das abas do modelo e a lista das abas que não seguem nenhum layout. */
export async function extractTemplatePairs(data: ArrayBuffer): Promise<{ pairs: ExtractedPair[]; otherSheets: string[] }> {
  const pkg = await XlsxPackage.load(data);
  const pairs: ExtractedPair[] = [];
  const otherSheets: string[] = [];
  for (const { name } of await pkg.sheets()) {
    let layout: LayoutSpec | null = null;
    try {
      layout = await detectLayout(pkg, allLayouts, name);
    } catch {
      layout = null;
    }
    if (!layout) {
      otherSheets.push(name);
      continue;
    }
    const section = await readSection(pkg, layout, name);
    const before = pairs.length;
    for (const set of layout.sets) setPairs(name, set, section.sets[set.key] ?? [], pairs);
    // Aba reconhecida mas sem itens lidos (variação antiga): tenta a leitura aproximada.
    if (pairs.length === before) otherSheets.push(name);
  }
  return { pairs, otherSheets };
}
