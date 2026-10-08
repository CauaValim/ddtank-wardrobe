/**
 * Permissões que podem ser ligadas em cada cargo (como no Discord).
 * As mesmas chaves são usadas nas regras do banco (private.has_permission) e nas edge functions
 * (supabase/functions/_shared/permissions.ts); ao criar uma nova, acrescente nos três lugares.
 */
export const PERMISSION_GROUPS = [
  {
    label: "Geral",
    permissions: [
      {
        key: "administrator",
        label: "Administrador",
        description: "Libera todas as permissões e ignora a hierarquia de cargos. Dê com cuidado.",
      },
    ],
  },
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
    label: "Usuários e cargos",
    permissions: [
      { key: "users.manage", label: "Gerenciar usuários", description: "Criar e remover contas e dar ou tirar cargos abaixo do seu cargo mais alto." },
      { key: "roles.manage", label: "Gerenciar cargos", description: "Criar, editar, ordenar e excluir cargos abaixo do seu cargo mais alto." },
    ],
  },
] as const;

export type Permission = (typeof PERMISSION_GROUPS)[number]["permissions"][number]["key"];

export const ALL_PERMISSIONS: Permission[] = PERMISSION_GROUPS.flatMap((g) => g.permissions.map((p) => p.key));

export const isPermission = (value: string): value is Permission => (ALL_PERMISSIONS as string[]).includes(value);

/** Permissões equivalentes aos cargos antigos (usadas enquanto as tabelas novas não existem). */
export function permissionsFromRole(role: string | null | undefined): Permission[] {
  switch (role) {
    case "super_admin": return ["administrator"];
    case "admin":
      return ALL_PERMISSIONS.filter((p) => !["administrator", "users.manage", "roles.manage", "events.templates"].includes(p));
    case "analista": return ["items.view_ids"];
    case "midia": return ["codes.request"];
    default: return [];
  }
}
