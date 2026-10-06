/**
 * Servidores antigos (s1-s401) e novos (s402) têm bases separadas: documentos, eventos anteriores,
 * pré-definições, histórico e avisos de uso de itens nunca se misturam.
 */
export type ServerGroup = "old" | "new";

export const SERVER_GROUPS: Record<ServerGroup, { label: string; short: string; servers: string; path: string }> = {
  old: { label: "Servidores antigos", short: "antigos", servers: "s1-s401", path: "/eventos" },
  new: { label: "Servidores novos", short: "novos", servers: "s402", path: "/eventos/novos" },
};

export const asServerGroup = (value: unknown): ServerGroup => (value === "new" ? "new" : "old");
