import { CalendarDays, ChevronDown, Settings2 } from "lucide-react";
import { useState } from "react";
import {
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarGroup,
  SidebarGroupLabel,
  useSidebar,
} from "@/components/ui/sidebar";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Badge } from "@/components/ui/badge";
import { isCurrentPeriod, periodTitle, useSchedule, type ScheduleCategory, type SchedulePeriod } from "@/hooks/useSchedule";
import { ScheduleManager } from "@/components/schedule/ScheduleManager";

const CHEVRON = "h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform duration-200 [[data-state=open]>&]:rotate-180";

function PeriodHeader({ period, current }: { period: SchedulePeriod; current: boolean }) {
  return (
    <div
      className={`flex items-center gap-2 rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-muted/60 ${
        current ? "bg-primary/10 border border-primary/30" : ""
      }`}
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          {current && <span className="inline-block h-2 w-2 rounded-full bg-primary shrink-0" />}
          <span className="text-xs font-semibold text-foreground truncate">{periodTitle(period)}</span>
        </div>
        {period.theme && <p className="text-[11px] text-muted-foreground truncate mt-0.5">{period.theme}</p>}
      </div>
      <ChevronDown className={CHEVRON} />
    </div>
  );
}

function CategoryEvents({ category, events }: { category: ScheduleCategory; events: string[] }) {
  return (
    <div>
      <Badge
        variant="secondary"
        className="text-[10px] font-medium mb-1 border-0"
        style={{ backgroundColor: `${category.color}26`, color: category.color }}
      >
        {category.name}
      </Badge>
      <ul className="space-y-0.5">
        {events.map((event, i) => (
          <li key={i} className="text-[11px] text-muted-foreground leading-tight pl-1">• {event}</li>
        ))}
      </ul>
    </div>
  );
}

export function EventScheduleSidebar({ canEdit = false }: { canEdit?: boolean }) {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const schedule = useSchedule();
  const { sections, categories, periods, entriesByPeriod, available, loading } = schedule;
  const [managing, setManaging] = useState(false);

  return (
    <Sidebar collapsible="icon" side="left" className="border-r border-border">
      <SidebarHeader className="border-b border-border px-3 py-3">
        <div className="flex items-center gap-2">
          <CalendarDays className="h-5 w-5 shrink-0 text-primary" />
          {!collapsed && <span className="text-sm font-semibold text-foreground truncate">Cronograma Projetos</span>}
          {!collapsed && canEdit && available && (
            <button
              type="button"
              onClick={() => setManaging(true)}
              className="ml-auto rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
              title="Personalizar cronograma"
            >
              <Settings2 className="h-4 w-4" />
            </button>
          )}
        </div>
      </SidebarHeader>
      <SidebarContent>
        <ScrollArea className="h-[calc(100vh-57px)]">
          <SidebarGroup>
            {!collapsed && !loading && (!available || sections.length === 0) && (
              <p className="px-2 py-3 text-xs text-muted-foreground">
                {!available
                  ? "O cronograma ainda não foi criado no banco de dados."
                  : canEdit
                    ? "Cronograma vazio. Use o botão de personalizar para criar as seções, categorias e períodos."
                    : "Cronograma vazio."}
              </p>
            )}
            {!collapsed &&
              sections.map((section, sIdx) => {
                const cats = categories.filter((c) => c.section_id === section.id);
                const withEvents = periods.filter((p) => cats.some((c) => (entriesByPeriod.get(p.id)?.[c.id] ?? []).length > 0));
                return (
                  <Collapsible key={section.id} defaultOpen={sIdx === 0}>
                    <CollapsibleTrigger className="w-full">
                      <SidebarGroupLabel className="text-xs uppercase tracking-wider flex items-center justify-between cursor-pointer">
                        {section.name}
                        <ChevronDown className={CHEVRON} />
                      </SidebarGroupLabel>
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      <div className="space-y-0.5 px-1 pb-4">
                        {withEvents.length === 0 && <p className="px-2 text-[11px] text-muted-foreground">Sem eventos.</p>}
                        {withEvents.map((period) => {
                          const current = isCurrentPeriod(period);
                          const byCat = entriesByPeriod.get(period.id) ?? {};
                          return (
                            <Collapsible key={period.id} defaultOpen={current}>
                              <CollapsibleTrigger className="w-full">
                                <PeriodHeader period={period} current={current} />
                              </CollapsibleTrigger>
                              <CollapsibleContent>
                                <div className="ml-3 border-l border-border pl-3 pb-1 space-y-2 mt-1">
                                  {cats.map((c) => (byCat[c.id]?.length ? <CategoryEvents key={c.id} category={c} events={byCat[c.id]} /> : null))}
                                  {period.notes && <p className="text-[11px] italic text-muted-foreground">{period.notes}</p>}
                                </div>
                              </CollapsibleContent>
                            </Collapsible>
                          );
                        })}
                      </div>
                    </CollapsibleContent>
                  </Collapsible>
                );
              })}
            {collapsed && (
              <div className="space-y-0.5 px-1 pb-4">
                {periods.map((period, idx) => (
                  <div
                    key={period.id}
                    className={`flex h-8 w-8 items-center justify-center rounded-md text-[10px] font-bold mx-auto my-0.5 ${
                      isCurrentPeriod(period) ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"
                    }`}
                    title={`${periodTitle(period)} — ${period.theme || "Sem tema"}`}
                  >
                    P{idx + 1}
                  </div>
                ))}
              </div>
            )}
          </SidebarGroup>
        </ScrollArea>
      </SidebarContent>
      {canEdit && <ScheduleManager schedule={schedule} open={managing} onOpenChange={setManaging} />}
    </Sidebar>
  );
}
