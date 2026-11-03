// deno-lint-ignore-file no-explicit-any
// Mesma lista de src/lib/permissions.ts.
export const PERMISSIONS = [
  "administrator",
  "items.view_ids", "items.manage", "items.game_sync", "items.export_images", "tools.id_filler", "tools.validator",
  "events.access", "events.presets", "events.item_rules", "events.history", "events.templates",
  "schedule.edit", "codes.request", "codes.manage", "finance.view", "users.manage", "roles.manage",
];

export interface CallerAccess {
  permissions: Set<string>;
  /** Posição do cargo mais alto (-1 sem cargo). */
  top: number;
  admin: boolean;
}

/** Cargos do usuário somados (o cliente precisa ser o de service role). */
export async function accessOf(client: any, userId: string): Promise<CallerAccess> {
  const { data: links } = await client.from("user_panel_roles").select("role_id").eq("user_id", userId);
  const ids = (links ?? []).map((l: { role_id: string }) => l.role_id);
  const { data: roles } = ids.length ? await client.from("panel_roles").select("permissions, position").in("id", ids) : { data: [] };
  const permissions = new Set<string>((roles ?? []).flatMap((r: { permissions: string[] }) => r.permissions));
  const top = Math.max(-1, ...(roles ?? []).map((r: { position: number }) => r.position));
  return { permissions, top, admin: permissions.has("administrator") };
}

export const allows = (access: CallerAccess, permission: string) => access.admin || access.permissions.has(permission);

/**
 * Conta da equipe (mesma regra de private.is_panel_member no banco): tem cargo no painel, tem cargo
 * antigo ou foi criada por um administrador. Contas criadas pelo cadastro público não passam.
 */
export async function isPanelMember(client: any, user: { id: string; app_metadata?: Record<string, unknown> }): Promise<boolean> {
  if (user.app_metadata?.panel_member === true) return true;
  const { count: roles } = await client.from("user_panel_roles").select("role_id", { count: "exact", head: true }).eq("user_id", user.id);
  if (roles) return true;
  const { count: legacy } = await client.from("user_roles").select("user_id", { count: "exact", head: true }).eq("user_id", user.id);
  return !!legacy;
}
