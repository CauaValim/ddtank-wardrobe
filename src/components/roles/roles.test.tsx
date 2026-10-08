import { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";
import { RolesPanel } from "./RolesPanel";
import { canManageRole, type Viewer } from "@/lib/roles";
import type { Permission } from "@/lib/permissions";
import type { RolesApi } from "@/hooks/useRoles";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
globalThis.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} } as unknown as typeof ResizeObserver;
function render(ui: React.ReactElement) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => root.render(ui));
  return { container, unmount: () => { act(() => root.unmount()); container.remove(); } };
}

const role = (id: string, name: string, position: number, permissions: string[]) =>
  ({ id, name, position, permissions, color: "#3498db", created_at: "", updated_at: "" });
const roles = [role("a", "Super Admin", 50, ["administrator"]), role("b", "ADM", 40, ["items.manage", "roles.manage", "users.manage"]), role("c", "Mídia", 10, ["codes.request"])];

const api = {
  roles,
  loading: false,
  membersOf: new Map([["c", ["u2"]]]),
  rolesOf: () => [],
  reload: vi.fn(), createRole: vi.fn(), updateRole: vi.fn(), deleteRole: vi.fn(), moveRole: vi.fn(), assign: vi.fn(), unassign: vi.fn(),
} as unknown as RolesApi;

// Quem vê é ADM (posição 40), sem Administrador.
const adm: Viewer = { can: (p: Permission) => ["items.manage", "roles.manage", "users.manage"].includes(p), topPosition: 40 };

describe("cargos", () => {
  it("hierarquia como no Discord", () => {
    expect(canManageRole(adm, roles[0])).toBe(false);
    expect(canManageRole(adm, roles[1])).toBe(false); // o próprio cargo
    expect(canManageRole(adm, roles[2])).toBe(true);
    expect(canManageRole({ can: (p) => p === "administrator", topPosition: 0 }, roles[0])).toBe(true);
  });

  it("lista os cargos e trava os que estão no nível de quem vê ou acima", () => {
    const { container, unmount } = render(<RolesPanel api={api} users={[{ id: "u2", email: "midia@x.com" }]} viewer={adm} />);
    const text = container.textContent ?? "";
    expect(text).toContain("Super Admin");
    expect(text).toContain("Mídia");
    // O primeiro cargo (Super Admin) abre selecionado e só para visualização.
    expect(text).toContain("só visualização");
    // Interruptores de permissão travados para o cargo acima.
    const switches = Array.from(container.querySelectorAll('button[role="switch"]'));
    expect(switches.length).toBeGreaterThan(10);
    expect(switches.every((s) => s.hasAttribute("disabled"))).toBe(true);
    unmount();
  });
});
