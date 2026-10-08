import type { Permission } from "./permissions";

export const ROLE_COLORS = ["#99aab5", "#1abc9c", "#2ecc71", "#3498db", "#9b59b6", "#e91e63", "#f1c40f", "#e67e22", "#e74c3c", "#95a5a6", "#607d8b", "#11806a"];

export interface Viewer {
  can: (p: Permission) => boolean;
  /** Posição do cargo mais alto de quem está vendo. */
  topPosition: number;
}

/** Pode mexer neste cargo? Só abaixo do seu cargo mais alto (Administrador mexe em todos), como no Discord. */
export const canManageRole = (viewer: Viewer, role: { position: number }) =>
  viewer.can("administrator") || role.position < viewer.topPosition;
