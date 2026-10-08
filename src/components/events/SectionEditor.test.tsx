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
    const { container, unmount } = render(<Harness initial={newSection(getLayout("recharge-extra-5")!, "s1-s401")} />);
    const add = () => Array.from(container.querySelectorAll("button")).find((b) => /adicionar faixa|limite do modelo/i.test(b.textContent ?? "")) as HTMLButtonElement;
    for (let i = 0; i < 4; i += 1) act(() => add().click());
    expect(byText(container, "Faixa 5")).toBeTruthy();
    expect(add().disabled).toBe(true);
    expect(add().textContent).toContain("Limite do modelo: 5");
    unmount();
  });

  it("missões sem limite, todas com opções de escolha, e qualquer uma pode ser removida", () => {
    const { container, unmount } = render(<Harness initial={newSection(getLayout("missions-3x3-choice")!, "s1-s401")} />);
    const add = () => Array.from(container.querySelectorAll("button")).find((b) => /adicionar missão/i.test(b.textContent ?? "")) as HTMLButtonElement;
    for (let i = 0; i < 4; i += 1) act(() => add().click());
    expect(byText(container, "Missão 5")).toBeTruthy();
    expect(add().disabled).toBe(false);
    expect(Array.from(container.querySelectorAll("span")).filter((s) => s.textContent === "Escolha um (OR)").length).toBe(5);
    const removeFirst = container.querySelector('button[title="Remover missão 1"]') as HTMLButtonElement;
    act(() => removeFirst.click());
    expect(byText(container, "Missão 5")).toBeFalsy();
    unmount();
  });

  it("recolhe a seção", () => {
    function Collapsible() {
      const [section, setSection] = useState(newSection(getLayout("missions-8x5")!, "s1-s401"));
      const [collapsed, setCollapsed] = useState(false);
      return (
        <SectionEditor
          section={section} index={0} isFirst isLast idStatus={() => "unknown"} getImage={() => ""} collapsed={collapsed}
          onToggleCollapse={() => setCollapsed((c) => !c)} onChange={setSection} onRemove={() => {}} onMove={() => {}}
        />
      );
    }
    const { container, unmount } = render(<Collapsible />);
    expect(container.querySelectorAll("input").length).toBeGreaterThan(0);
    act(() => (container.querySelector('button[title="Recolher seção"]') as HTMLButtonElement).click());
    expect(container.querySelectorAll("input").length).toBe(0);
    expect(container.textContent).toContain("0 item(ns)");
    unmount();
  });

  const templatePath = process.env.EVENT_TEMPLATE_PATH ?? path.resolve(__dirname, "../../lib/eventTemplate/__fixtures__/template.xlsx");
  it.skipIf(!existsSync(templatePath))("renderiza todas as abas do modelo com o conteúdo real", async () => {
    const b = readFileSync(templatePath);
    const ab = new ArrayBuffer(b.byteLength);
    new Uint8Array(ab).set(b);
    const pkg = await XlsxPackage.load(ab);
    // Solicitações manuais: arquivo separado, ao lado do modelo.
    const r = readFileSync(templatePath.replace(/template\.xlsx$/, "requests.xlsx"));
    const rab = new ArrayBuffer(r.byteLength);
    new Uint8Array(rab).set(r);
    const requests = await XlsxPackage.load(rab);
    for (const layout of manifest.layouts) {
      const section = await readSection(layout.type === "request" ? requests : pkg, layout);
      const { unmount, container } = render(<Harness initial={section} />);
      expect(container.querySelectorAll("input").length, layout.id).toBeGreaterThan(3);
      unmount();
    }
  }, 120_000);
});
