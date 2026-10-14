import { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";
import { addDays, dayLabel, isCurrentPeriod, periodDays, periodTitle, type ScheduleApi } from "@/hooks/useSchedule";
import { ScheduleManager } from "./ScheduleManager";
import { SchedulePeriodDialog } from "./SchedulePeriodDialog";
import { PendenciesPanel } from "./PendenciesPanel";
import { PendencyDialog } from "./PendencyDialog";
import { storageName, type PendenciesApi } from "@/hooks/usePendencies";

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
    entriesByPeriod: new Map([["p1", { c1: [{ text: "Dinâmica Halloween (07/10)", date: "2026-10-07" }, { text: "Sem dia definido", date: null }] }]]),
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
    expect(periodDays(period)).toEqual(["2026-10-05", "2026-10-06", "2026-10-07", "2026-10-08", "2026-10-09", "2026-10-10", "2026-10-11"]);
    expect(dayLabel("2026-10-17")).toBe("Sáb 17/10");
  });

  it("mostra seções, categorias e os eventos do período para edição", () => {
    const schedule = fakeSchedule();
    const close = render(<ScheduleManager schedule={schedule} open onOpenChange={() => {}} />);
    expect(hasText("05/10 - 11/10")).toBe(true);
    expect(hasText("2 evento(s)")).toBe(true);
    close();
    const close2 = render(<SchedulePeriodDialog schedule={schedule} period={period} onClose={() => {}} />);
    expect(hasValue("Dinâmica Halloween (07/10)")).toBe(true);
    expect(hasValue("Halloween Week 1")).toBe(true);
    expect(hasText("Faça se Puder")).toBe(true);
    close2();
  });
});

describe("pendências", () => {
  const pend = {
    id: "x1", title: "Falta o ID do prêmio", context: "O 2º lugar está com XXX", tab: "Ranking de Recarga", period_id: "p1",
    status: "open" as const, attachments: [{ path: "u1/1-print.png", name: "print.png", size: 2048, type: "image/png" }],
    created_by: "u1", created_by_email: "a@b.c", resolved_at: null, resolved_by_email: null, created_at: "2026-10-12T10:00:00Z", updated_at: "",
  };
  function fakeApi(): PendenciesApi {
    return {
      pendencies: [pend, { ...pend, id: "x2", title: "Resolvida antes", status: "resolved" as const, attachments: [] }],
      loading: false, available: true,
      reload: vi.fn(), create: vi.fn(), update: vi.fn(), setStatus: vi.fn(), remove: vi.fn(),
      uploadAttachment: vi.fn(), removeFiles: vi.fn(async () => undefined), signedUrl: vi.fn(async () => "blob:x"),
    } as unknown as PendenciesApi;
  }

  it("lista as abertas com aba, período e anexos e abre para editar", () => {
    const close = render(<PendenciesPanel api={fakeApi()} schedule={fakeSchedule()} userId="u1" canManage={false} />);
    expect(hasText("Abertas (1)")).toBe(true);
    expect(hasText("Resolvidas (1)")).toBe(true);
    expect(hasText("Falta o ID do prêmio")).toBe(true);
    expect(hasText("Resolvida antes")).toBe(false);
    expect(hasText("Ranking de Recarga")).toBe(true);
    expect(hasText("05/10 - 11/10")).toBe(true);
    const card = Array.from(document.body.querySelectorAll("button")).find((b) => b.textContent?.includes("Falta o ID do prêmio"));
    act(() => card!.click());
    expect(hasText("Editar pendência")).toBe(true);
    expect(hasValue("O 2º lugar está com XXX")).toBe(true);
    expect(hasText("print.png")).toBe(true);
    close();
  });

  it("quem não criou e não edita o cronograma só vê a pendência", () => {
    const close = render(<PendencyDialog api={fakeApi()} periods={[period]} categoryNames={[]} pendency={pend} canEdit={() => false} onClose={() => {}} />);
    expect(hasText("Pendência")).toBe(true);
    expect(hasText("Salvar")).toBe(false);
    expect(hasText("Fechar")).toBe(true);
    close();
  });

  it("nome de arquivo seguro para o Storage", () => {
    expect(storageName("Print da Missão (2).png")).toBe("Print_da_Missao_2_.png");
  });
});
