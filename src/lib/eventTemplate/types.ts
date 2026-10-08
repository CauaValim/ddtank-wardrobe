/**
 * Tipos do manifesto (gerado por scripts/event-template/build_manifest.py)
 * e do documento salvo em event_documents.sections.
 */

export type RichKind = "plain" | "itemLabel" | "idLine" | "value" | "tierLabel" | "date" | "rankingTitle" | "labelValue";

export interface FieldSpec {
  key: string;
  label: string;
  cell: string;
  /** derived = calculado a partir de outros dados; não aparece como campo editável. */
  input: "text" | "textarea" | "datetime" | "derived";
  /** Texto final com marcadores: {value}, {date}, {time}, {servers}, {idLine:grupo}... */
  format: string;
  rich: RichKind;
  options?: string[];
  /** Texto inicial do campo em blocos novos (ex.: nome do baú no modelo). */
  default?: string;
}

export interface CellSpec {
  cell: string;
  format: string;
  rich: RichKind;
}

export interface DecorationSpec {
  media: string;
  box: string;
  when: Record<string, string>;
  /** [colOff, rowOff] em EMU a partir do canto da célula; sem isso a imagem fica onde está no modelo. */
  offset?: [number, number];
}

export interface SlotSpec {
  cells: CellSpec[];
  image?: string;
  hideRows?: [number, number];
  decorations?: DecorationSpec[];
}

export interface GroupSpec {
  key: string;
  label: string;
  kind: "items" | "requirements";
  labelStyle: "twoLines" | "inline";
  slots: SlotSpec[];
}

export interface BlockSpec {
  fields: FieldSpec[];
  groups: GroupSpec[];
  hideRows?: [number, number];
  hideCols?: string;
  children?: SetSpec;
}

export interface SetSpec {
  key: string;
  label: string;
  blockLabel: string;
  minBlocks: number;
  blocks: BlockSpec[];
}

export interface ItemFieldSpec {
  key: string;
  label: string;
  placeholder?: string;
  options?: string[];
  default?: string;
}

export interface LayoutSpec {
  id: string;
  type: string;
  label: string;
  description: string;
  sheet: string;
  sheetNamePattern: string;
  fields: FieldSpec[];
  sets: SetSpec[];
  itemFields?: ItemFieldSpec[];
  clearRanges?: string[];
  hideWhenEmpty?: { set: string; block: number; group: string; rows: [number, number] }[];
  cover?: { hideColsWithoutSection: string };
  /** fillId da célula do nome para itens com validade em dias / permanentes. */
  durationFill?: { timed: number; permanent: number };
  /** Células mescladas do topo da aba no modelo (reconhece o layout ao importar). */
  signature?: string[];
}

export interface TemplateManifest {
  version: string;
  sha256: string;
  fileName: string;
  coverLayout: string;
  layouts: LayoutSpec[];
}

// ------------------------------------------------------------------ documento

export interface EventItem {
  /** ID do item ou "XXX" para item ainda sem ID. */
  id: string;
  name: string;
  qty: number;
  /** Ex.: "Permanent", "30 Days - renewable". */
  duration: string;
  /** "Bound", "Unbound" ou vazio. */
  bind: string;
  /** Imagem enviada manualmente (itens XXX ou fora da base). */
  imageUrl?: string;
  /** Campos extras definidos pelo layout (preço, moeda, condição...). */
  extra?: Record<string, string>;
}

export interface EventBlock {
  fields: Record<string, string>;
  groups: Record<string, EventItem[]>;
  children?: EventBlock[];
}

export interface EventSection {
  id: string;
  layoutId: string;
  servers: string;
  fields: Record<string, string>;
  sets: Record<string, EventBlock[]>;
}

export interface EventDocument {
  id: string;
  title: string;
  theme: string | null;
  servers: string;
  start_date: string | null;
  end_date: string | null;
  status: "draft" | "final";
  template_version?: string | null;
  sections: EventSection[];
  updated_at?: string;
  /** "old" (s1-s401) ou "new" (s402): bases separadas. */
  server_group?: string;
  /** "editor" (criado no painel) ou "import" (evento anterior importado). */
  source?: string;
  source_file?: string | null;
}

export const DURATIONS = ["Permanent", "30 Days - renewable", "30 Days - non-renewable", "7 Days", "15 Days", "30 Days", "90 Days"];
export const BINDS = ["Bound", "Unbound"];
