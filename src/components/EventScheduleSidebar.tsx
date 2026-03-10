import { CalendarDays, ChevronDown } from "lucide-react";
import { useMemo } from "react";
import { isWithinInterval, parseISO, addDays } from "date-fns";
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
import { cronograma } from "@/data/cronograma";
import { cronogramaEconomica } from "@/data/cronogramaEconomica";
import { Badge } from "@/components/ui/badge";

const CATEGORY_COLORS: Record<string, string> = {
  "Faça se Puder": "bg-red-500/15 text-red-700 dark:text-red-400",
  "Atividades": "bg-blue-500/15 text-blue-700 dark:text-blue-400",
  "Rotação de Figuras Normais": "bg-green-500/15 text-green-700 dark:text-green-400",
  "Rotação de Figuras de Elite": "bg-purple-500/15 text-purple-700 dark:text-purple-400",
  "Rotação das Moedas": "bg-yellow-500/15 text-yellow-700 dark:text-yellow-400",
  "Missão de Novatos": "bg-cyan-500/15 text-cyan-700 dark:text-cyan-400",
  "Torneio": "bg-orange-500/15 text-orange-700 dark:text-orange-400",
  "Abas de Coleta": "bg-pink-500/15 text-pink-700 dark:text-pink-400",
  "Código DDBooster": "bg-indigo-500/15 text-indigo-700 dark:text-indigo-400",
};

export function EventScheduleSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";

  const currentWeekIndex = useMemo(() => {
    const now = new Date();
    return cronograma.findIndex((week) => {
      const start = parseISO(week.startDate);
      const end = addDays(start, 6);
      return isWithinInterval(now, { start, end });
    });
  }, []);

  return (
    <Sidebar collapsible="icon" side="left" className="border-r border-border">
      <SidebarHeader className="border-b border-border px-3 py-3">
        <div className="flex items-center gap-2">
          <CalendarDays className="h-5 w-5 shrink-0 text-primary" />
          {!collapsed && (
            <span className="text-sm font-semibold text-foreground truncate">
              Cronograma Projetos
            </span>
          )}
        </div>
      </SidebarHeader>
      <SidebarContent>
         <ScrollArea className="h-[calc(100vh-57px)]">
          <SidebarGroup>
            {!collapsed && (
              <>
              <Collapsible defaultOpen>
                <CollapsibleTrigger className="w-full">
                  <SidebarGroupLabel className="text-xs uppercase tracking-wider flex items-center justify-between cursor-pointer">
                    Cronograma De Eventos
                    <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform duration-200 [[data-state=open]>&]:rotate-180" />
                  </SidebarGroupLabel>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <div className="space-y-0.5 px-1 pb-4">
                    {cronograma.map((week, idx) => {
                      const isCurrent = idx === currentWeekIndex;
                      const hasEvents = Object.values(week.eventos).some(
                        (arr) => arr.length > 0
                      );

                      return (
                        <Collapsible key={idx} defaultOpen={isCurrent}>
                          <CollapsibleTrigger className="w-full">
                            <div
                              className={`flex items-center gap-2 rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-muted/60 ${
                                isCurrent
                                  ? "bg-primary/10 border border-primary/30"
                                  : ""
                              }`}
                            >
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-1.5">
                                  {isCurrent && (
                                    <span className="inline-block h-2 w-2 rounded-full bg-primary shrink-0" />
                                  )}
                                  <span className="text-xs font-semibold text-foreground truncate">
                                    {week.periodo}
                                  </span>
                                </div>
                                {week.tema && (
                                  <p className="text-[11px] text-muted-foreground truncate mt-0.5">
                                    {week.tema}
                                  </p>
                                )}
                              </div>
                              {hasEvents && (
                                <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform duration-200 [[data-state=open]>&]:rotate-180" />
                              )}
                            </div>
                          </CollapsibleTrigger>
                          {hasEvents && (
                            <CollapsibleContent>
                              <div className="ml-3 border-l border-border pl-3 pb-1 space-y-2 mt-1">
                                {Object.entries(week.eventos).map(
                                  ([category, events]) => {
                                    if (events.length === 0) return null;
                                    const colorClass =
                                      CATEGORY_COLORS[category] ||
                                      "bg-muted text-muted-foreground";
                                    return (
                                      <div key={category}>
                                        <Badge
                                          variant="secondary"
                                          className={`text-[10px] font-medium mb-1 ${colorClass} border-0`}
                                        >
                                          {category}
                                        </Badge>
                                        <ul className="space-y-0.5">
                                          {events.map((event, eIdx) => (
                                            <li
                                              key={eIdx}
                                              className="text-[11px] text-muted-foreground leading-tight pl-1"
                                            >
                                              • {event}
                                            </li>
                                          ))}
                                        </ul>
                                      </div>
                                    );
                                  }
                                )}
                              </div>
                            </CollapsibleContent>
                          )}
                        </Collapsible>
                      );
                    })}
                  </div>
                </CollapsibleContent>
              </Collapsible>

              {/* Cronograma Econômica */}
              <Collapsible defaultOpen={false}>
                <CollapsibleTrigger className="w-full">
                  <SidebarGroupLabel className="text-xs uppercase tracking-wider flex items-center justify-between cursor-pointer">
                    Cronograma Econômica
                    <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform duration-200 [[data-state=open]>&]:rotate-180" />
                  </SidebarGroupLabel>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <div className="space-y-0.5 px-1 pb-4">
                    {cronograma.map((week, idx) => {
                      const isCurrent = idx === currentWeekIndex;
                      const ecoEvents = cronogramaEconomica[week.startDate] || [];
                      if (ecoEvents.length === 0) return null;

                      return (
                        <Collapsible key={idx} defaultOpen={isCurrent}>
                          <CollapsibleTrigger className="w-full">
                            <div
                              className={`flex items-center gap-2 rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-muted/60 ${
                                isCurrent
                                  ? "bg-primary/10 border border-primary/30"
                                  : ""
                              }`}
                            >
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-1.5">
                                  {isCurrent && (
                                    <span className="inline-block h-2 w-2 rounded-full bg-primary shrink-0" />
                                  )}
                                  <span className="text-xs font-semibold text-foreground truncate">
                                    {week.periodo}
                                  </span>
                                </div>
                                {week.tema && (
                                  <p className="text-[11px] text-muted-foreground truncate mt-0.5">
                                    {week.tema}
                                  </p>
                                )}
                              </div>
                              <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform duration-200 [[data-state=open]>&]:rotate-180" />
                            </div>
                          </CollapsibleTrigger>
                          <CollapsibleContent>
                            <div className="ml-3 border-l border-border pl-3 pb-1 space-y-0.5 mt-1">
                              <ul className="space-y-0.5">
                                {ecoEvents.map((event, eIdx) => (
                                  <li
                                    key={eIdx}
                                    className="text-[11px] text-muted-foreground leading-tight pl-1"
                                  >
                                    • {event}
                                  </li>
                                ))}
                              </ul>
                            </div>
                          </CollapsibleContent>
                        </Collapsible>
                      );
                    })}
                  </div>
                </CollapsibleContent>
              </Collapsible>
            )}
            {collapsed && (
              <div className="space-y-0.5 px-1 pb-4">
                {cronograma.map((week, idx) => {
                  const isCurrent = idx === currentWeekIndex;
                  return (
                    <div
                      key={idx}
                      className={`flex h-8 w-8 items-center justify-center rounded-md text-[10px] font-bold mx-auto my-0.5 ${
                        isCurrent
                          ? "bg-primary text-primary-foreground"
                          : "text-muted-foreground hover:bg-muted"
                      }`}
                      title={`${week.periodo} — ${week.tema || "Sem tema"}`}
                    >
                      S{idx + 1}
                    </div>
                  );
                })}
              </div>
            )}
          </SidebarGroup>
        </ScrollArea>
      </SidebarContent>
    </Sidebar>
  );
}
