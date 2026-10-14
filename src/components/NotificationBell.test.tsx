import { act } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

const markRead = vi.fn();
vi.mock("@/hooks/useNotifications", () => ({
  useNotifications: () => ({
    items: [
      { id: "n1", kind: "code_request", title: "Nova solicitação de códigos", body: "a@b.c enviou \"Lives\" (s1-s402).", link: "/codigos/x", created_at: "2026-10-15T11:00:00Z", read_at: null },
      { id: "n2", kind: "weekly_schedule", title: "Cronograma da semana 15/10 a 21/10 — Halloween", body: "• Faça se Puder: Dinâmica (17/10)", link: null, created_at: "2026-10-15T11:00:00Z", read_at: "2026-10-15T12:00:00Z" },
    ],
    unread: 1,
    available: true,
    reload: vi.fn(),
    markRead,
    remove: vi.fn(),
    sendWeeklyNow: vi.fn(async () => 3),
  }),
}));

import { NotificationBell } from "./NotificationBell";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
globalThis.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} } as unknown as typeof ResizeObserver;

describe("sino de notificações", () => {
  it("mostra a contagem, lista as notificações e marca como lida ao abrir", () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    act(() => root.render(<MemoryRouter><NotificationBell userId="u1" canSendWeekly className="" /></MemoryRouter>));
    const bell = container.querySelector("button[aria-label^='Notificações']") as HTMLButtonElement;
    expect(bell.textContent).toContain("1");
    act(() => bell.click());
    const text = document.body.textContent ?? "";
    expect(text).toContain("Nova solicitação de códigos");
    expect(text).toContain("Cronograma da semana 15/10 a 21/10 — Halloween");
    expect(text).toContain("Enviar o resumo da semana agora");
    const item = Array.from(document.body.querySelectorAll("button")).find((b) => b.textContent?.includes("Nova solicitação de códigos")) as HTMLButtonElement;
    act(() => item.click());
    expect(markRead).toHaveBeenCalledWith(["n1"]);
    act(() => root.unmount());
    container.remove();
  });
});
