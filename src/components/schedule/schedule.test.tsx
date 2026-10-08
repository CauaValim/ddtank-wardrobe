import { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";
import { addDays, isCurrentPeriod, periodTitle, type ScheduleApi } from "@/hooks/useSchedule";
import { ScheduleManager } from "./ScheduleManager";
import { SchedulePeriodDialog } from "./SchedulePeriodDialog";

// Render mínimo com react-dom (como em SectionEditor.test); os diálogos ficam em document.body.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
function render(ui: React.ReactElement) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => root.render(ui));
  return () => { act(() => root.unmount()); container.remove(); };
}
const hasText = (text: string) => (document.body.textContent ?? "").includes(text);
const hasValue = (value: string) => Array.from(document.body.querySelectorAll("input, textarea")).some((el) => (el as HTMLInputElement).value === value);

const period = { id: "p1", start_date: "2026-10-05", end_date: "2026-10-11", label: "", theme: "Halloween Week 1", notes: "", created_at: "", updated_at: "" };

function fakeSchedule(): ScheduleApi {
  return {
    sections: [{ id: "s1", name: "Cronograma de Eventos", position: 0, created_at: "", updated_at: "" }],
    categories: [{ id: "c1", section_id: "s1", name: "Faça se Puder", color: "#ef4444", position: 0, created_at: "", updated_at: "" }],
    periods: [period],
    entriesByPeriod: new Map([["p1", { c1: ["Dinâmica Halloween (07/10)"] }]]),
    loading: false,
    available: true,
    reload: vi.fn(),
    saveSection: vi.fn(),
    saveCategory: vi.fn(),
    savePeriod: vi.fn(),
    duplicatePeriod: vi.fn(),
    deleteSection: vi.fn(),
    deleteCategory: vi.fn(),
    deletePeriod: vi.fn(),
    moveSection: vi.fn(),
    moveCategory: vi.fn(),
  } as unknown as ScheduleApi;
}

describe("cronograma", () => {
  it("nomeia e localiza os períodos", () => {
    expect(periodTitle(period)).toBe("05/10 - 11/10");
    expect(periodTitle({ ...period, label: "Semana do Terror" })).toBe("Semana do Terror");
    expect(periodTitle({ ...period, end_date: period.start_date })).toBe("05/10");
    expect(addDays("2026-12-29", 6)).toBe("2027-01-04");
    expect(isCurrentPeriod(period, "2026-10-11")).toBe(true);
    expect(isCurrentPeriod(period, "2026-10-12")).toBe(false);
  });

  it("mostra seções, categorias e os eventos do período para edição", () => {
    const schedule = fakeSchedule();
    const close = render(<ScheduleManager schedule={schedule} open onOpenChange={() => {}} />);
    expect(hasText("05/10 - 11/10")).toBe(true);
    expect(hasText("1 evento(s)")).toBe(true);
    close();
    const close2 = render(<SchedulePeriodDialog schedule={schedule} period={period} onClose={() => {}} />);
    expect(hasValue("Dinâmica Halloween (07/10)")).toBe(true);
    expect(hasValue("Halloween Week 1")).toBe(true);
    expect(hasText("Faça se Puder")).toBe(true);
    close2();
  });
});
