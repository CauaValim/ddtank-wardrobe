/**
 * Funções do painel que podem ser liberadas por usuário.
 * As mesmas chaves são usadas nas regras do banco (private.has_permission) e na função
 * manage-users; ao criar uma nova, acrescente nos três lugares.
 */
export const PERMISSION_GROUPS = [
  {
    label: "Itens",
    permissions: [
      { key: "items.view_ids", label: "Ver IDs dos itens", description: "Mostra o ID no detalhe do item." },
      { key: "items.manage", label: "Editar itens", description: "Selecionar itens, mover de tipo, trocar imagens e conteúdo de pacotes." },
      { key: "items.game_sync", label: "Sincronizar com o jogo", description: "Botão que traz itens novos e imagens da API do jogo." },
      { key: "items.export_images", label: "Exportar imagens dos itens", description: "Baixa a lista de itens com o link da imagem (.csv)." },
      { key: "tools.id_filler", label: "Preencher IDs no documento", description: "Ferramenta que completa IDs em planilhas." },
      { key: "tools.validator", label: "Verificar itens", description: "Confere ID, nome e imagem de uma lista de itens." },
    ],
  },
  {
    label: "Criação de Eventos",
    permissions: [
      { key: "events.access", label: "Criação de Eventos", description: "Criar, editar, importar e exportar documentos e eventos anteriores." },
      { key: "events.presets", label: "Editar pré-definições", description: "Criar, alterar e excluir pré-definições." },
      { key: "events.item_rules", label: "Editar categorias de itens", description: "Onde cada item pode ou não entrar." },
      { key: "events.history", label: "Ver histórico", description: "Quem criou e quem alterou cada documento." },
      { key: "events.templates", label: "Enviar modelos", description: "Enviar o modelo oficial e o arquivo das solicitações manuais." },
    ],
  },
  {
    label: "Cronograma",
    permissions: [{ key: "schedule.edit", label: "Editar cronograma", description: "Seções, categorias, períodos e eventos." }],
  },
  {
    label: "Códigos",
    permissions: [
      { key: "codes.request", label: "Solicitar códigos", description: "Botão de solicitação de códigos (mídias)." },
      { key: "codes.manage", label: "Responder solicitações de códigos", description: "Ver todas as solicitações, mudar o status e responder." },
    ],
  },
  {
    label: "Usuários",
    permissions: [{ key: "users.manage", label: "Gerenciar usuários", description: "Criar e remover contas e definir o acesso de cada uma." }],
  },
] as const;

export type Permission = (typeof PERMISSION_GROUPS)[number]["permissions"][number]["key"];

export const ALL_PERMISSIONS: Permission[] = PERMISSION_GROUPS.flatMap((g) => g.permissions.map((p) => p.key));

const ADMIN: Permission[] = ALL_PERMISSIONS.filter((p) => p !== "users.manage" && p !== "events.templates");

/** Modelos para preencher o acesso de um usuário rapidamente (os antigos cargos). */
export const PERMISSION_PRESETS: { label: string; permissions: Permission[] }[] = [
  { label: "Acesso total", permissions: ALL_PERMISSIONS },
  { label: "ADM", permissions: ADMIN },
  { label: "Analista", permissions: ["items.view_ids"] },
  { label: "Mídia", permissions: ["codes.request"] },
  { label: "Nenhum", permissions: [] },
];

/** Permissões equivalentes aos cargos antigos (usadas enquanto a tabela nova não existe). */
export function permissionsFromRole(role: string | null | undefined): Permission[] {
  switch (role) {
    case "super_admin": return ALL_PERMISSIONS;
    case "admin": return ADMIN;
    case "analista": return ["items.view_ids"];
    case "midia": return ["codes.request"];
    default: return [];
  }
}

export const isPermission = (value: string): value is Permission => (ALL_PERMISSIONS as string[]).includes(value);
