import { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/eventTemplate/siteBackup", () => ({
  listSiteBackups: vi.fn(async () => [
    { id: "b1", document_id: "d1", created_by_email: "a@b.c", created_at: "2026-10-14T13:05:00Z", content: { title: "Semana 1", theme: null, servers: "s1-s401", start_date: null, end_date: null, status: "draft", sections: [] } },
  ]),
}));

import { BackupsDialog } from "./BackupsDialog";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("versões do documento no site", () => {
  it("lista as cópias e restaura a escolhida", async () => {
    const onRestore = vi.fn();
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    await act(async () => root.render(<BackupsDialog documentId="d1" open onOpenChange={() => {}} onRestore={onRestore} />));
    const text = document.body.textContent ?? "";
    expect(text).toContain("Cópias de segurança no site");
    expect(text).toContain("a@b.c");
    expect(text).toContain("Semana 1");
    const button = Array.from(document.body.querySelectorAll("button")).find((b) => b.textContent?.includes("Restaurar"));
    act(() => button!.click());
    expect(onRestore).toHaveBeenCalledWith(expect.objectContaining({ id: "b1" }));
    act(() => root.unmount());
    container.remove();
  });
});
