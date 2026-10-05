import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { SectionEditor } from "./SectionEditor";
import { getLayout, manifest, newSection } from "@/lib/eventTemplate/model";
import { XlsxPackage } from "@/lib/eventTemplate/ooxml";
import { readSection } from "@/lib/eventTemplate/importer";
import type { EventSection } from "@/lib/eventTemplate/types";

// @testing-library/dom não está instalado no projeto; um render mínimo com react-dom basta aqui.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
function render(ui: React.ReactElement) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => root.render(ui));
  return { container, unmount: () => { act(() => root.unmount()); container.remove(); } };
}
const byText = (c: HTMLElement, text: string) => Array.from(c.querySelectorAll("*")).find((el) => el.children.length === 0 && el.textContent?.trim() === text);

globalThis.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} } as unknown as typeof ResizeObserver;

function Harness({ initial }: { initial: EventSection }) {
  const [section, setSection] = useState(initial);
  return (
    <SectionEditor
      section={section} index={0} isFirst isLast idStatus={(id) => (id === "11510" ? "known" : "unknown")} getImage={() => ""}
      onChange={setSection} onRemove={() => {}} onMove={() => {}}
    />
  );
}

describe("editor de seção", () => {
  for (const layout of manifest.layouts) {
    it(`renderiza "${layout.label}" vazio`, () => {
      const { unmount, container } = render(<Harness initial={newSection(layout, "s1-s401")} />);
      expect(byText(container, layout.label)).toBeTruthy();
      unmount();
    });
  }

  it("adiciona blocos até o limite do modelo", () => {
    const { container, unmount } = render(<Harness initial={newSection(getLayout("missions-3x3-choice")!, "s1-s401")} />);
    const add = () => Array.from(container.querySelectorAll("button")).find((b) => /adicionar missão|limite do modelo/i.test(b.textContent ?? "")) as HTMLButtonElement;
    act(() => add().click());
    act(() => add().click());
    expect(byText(container, "Missão 3")).toBeTruthy();
    expect(add().disabled).toBe(true);
    expect(add().textContent).toContain("Limite do modelo: 3");
    unmount();
  });

  const templatePath = process.env.EVENT_TEMPLATE_PATH ?? path.resolve(__dirname, "../../lib/eventTemplate/__fixtures__/template.xlsx");
  it.skipIf(!existsSync(templatePath))("renderiza todas as abas do modelo com o conteúdo real", async () => {
    const b = readFileSync(templatePath);
    const ab = new ArrayBuffer(b.byteLength);
    new Uint8Array(ab).set(b);
    const pkg = await XlsxPackage.load(ab);
    for (const layout of manifest.layouts) {
      const section = await readSection(pkg, layout);
      const { unmount, container } = render(<Harness initial={section} />);
      expect(container.querySelectorAll("input").length, layout.id).toBeGreaterThan(3);
      unmount();
    }
  }, 120_000);
});
