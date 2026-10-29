import { useMemo, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, BarChart3, BookOpen, LayoutDashboard, RefreshCw, Search, Trophy, Wallet } from "lucide-react";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import { useFinanceData } from "@/hooks/useFinanceData";
import { useItemRules } from "@/hooks/useItemRules";
import { ruleStatus, type ItemRule } from "@/lib/eventTemplate/itemRules";
import {
  byItem, byPeriod, byServer, filterSales, guideRows, leastSold, options, periodServerTable, topSold, totals, weekItemRows,
  type Sale, type SaleFilter,
} from "@/lib/finance/sales";

const fmt = (n: number) => n.toLocaleString("pt-BR");
const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const day = (iso: string) => iso.split("-").reverse().join("/");
const currencyLabel = (cupons: boolean) => (cupons ? "Cupons" : "L.Cupons");
const ALL = "__all";
const PAGE = 50;

const plain = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

const chartConfig = {
  cupons: { label: "Cupons", color: "hsl(var(--primary))" },
  lcupons: { label: "L.Cupons", color: "hsl(210 80% 60%)" },
  total: { label: "Total", color: "hsl(var(--primary))" },
} satisfies ChartConfig;

/** Seleção com "Todos" (o Select não aceita valor vazio). */
function Pick({ label, value, onChange, values, all = "Todos", labels }: { label: string; value: string; onChange: (v: string) => void; values: string[]; all?: string; labels?: Record<string, string> }) {
  return (
    <label className="flex min-w-0 flex-col gap-1 text-[11px] font-medium text-muted-foreground">
      {label}
      <Select value={value || ALL} onValueChange={(v) => onChange(v === ALL ? "" : v)}>
        <SelectTrigger className="h-9 w-full min-w-0 text-xs sm:w-48"><SelectValue /></SelectTrigger>
        <SelectContent className="max-h-80">
          <SelectItem value={ALL}>{all}</SelectItem>
          {values.map((v) => <SelectItem key={v} value={v}>{labels?.[v] ?? v}</SelectItem>)}
        </SelectContent>
      </Select>
    </label>
  );
}

/** Item por nome, com sugestões da planilha. Só filtra quando o nome bate com um item vendido. */
function ItemField({ value, onChange, items, id }: { value: string; onChange: (v: string) => void; items: string[]; id: string }) {
  const [text, setText] = useState(value);
  return (
    <label className="flex min-w-0 flex-col gap-1 text-[11px] font-medium text-muted-foreground">
      Item
      <div className="relative">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2" />
        <Input
          list={id}
          value={text}
          placeholder="Nome do item"
          className="h-9 w-full pl-8 text-xs sm:w-72"
          onChange={(e) => {
            setText(e.target.value);
            const exact = items.find((i) => plain(i) === plain(e.target.value));
            onChange(exact ?? "");
          }}
        />
        <datalist id={id}>{items.map((i) => <option key={i} value={i} />)}</datalist>
      </div>
    </label>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <p className="text-[11px] font-medium uppercase text-muted-foreground">{label}</p>
      <p className="mt-1 text-lg font-bold tabular-nums text-card-foreground">{value}</p>
      {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

function Panel({ title, children, className = "" }: { title: string; children: ReactNode; className?: string }) {
  return (
    <section className={`min-w-0 rounded-lg border border-border bg-card p-3 ${className}`}>
      <h3 className="mb-2 text-sm font-semibold text-card-foreground">{title}</h3>
      {children}
    </section>
  );
}

/** Tabela simples com rolagem horizontal no celular. */
function Table({ head, rows, empty = "Nenhuma venda com esses filtros." }: { head: string[]; rows: ReactNode[][]; empty?: string }) {
  if (rows.length === 0) return <p className="py-6 text-center text-xs text-muted-foreground">{empty}</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-border text-left text-[11px] uppercase text-muted-foreground">
            {head.map((h) => <th key={h} className="whitespace-nowrap px-2 py-1.5 font-medium">{h}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-b border-border/50 last:border-0">
              {r.map((c, j) => <td key={j} className="px-2 py-1.5 align-top text-card-foreground">{c}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const num = (n: number) => <span className="tabular-nums">{fmt(n)}</span>;

/** Situação do item nas categorias do cadastro (Criação de Eventos > Categorias de itens). */
function RuleAnswer({ rule, categories }: { rule: ItemRule | undefined; categories: string[] }) {
  const statuses = categories.map((c) => ruleStatus(rule, c));
  const answer = statuses.includes("forbidden") ? "Não" : statuses.includes("allowed") ? "Sim" : "Sem cadastro";
  const color = answer === "Sim" ? "text-emerald-600 dark:text-emerald-400" : answer === "Não" ? "text-destructive" : "text-muted-foreground";
  return <span className={`font-semibold ${color}`}>{answer}</span>;
}

function GuideTab({ sales, items }: { sales: Sale[]; items: string[] }) {
  const [item, setItem] = useState("");
  const [validity, setValidity] = useState("");
  const { rules } = useItemRules("old");
  const ofItem = useMemo(() => filterSales(sales, { item }), [sales, item]);
  const rows = useMemo(() => guideRows(filterSales(ofItem, { validity })), [ofItem, validity]);
  const rule = useMemo(() => rules.find((r) => plain(r.item_name) === plain(item)), [rules, item]);
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <ItemField id="finance-guide-items" value={item} onChange={setItem} items={items} />
        <Pick label="Validade" value={validity} onChange={setValidity} values={options(ofItem, "validity")} all="Todas" />
      </div>
      {!item ? (
        <p className="rounded-lg border border-dashed border-border px-3 py-8 text-center text-xs text-muted-foreground">
          Digite o nome de um item para ver os preços já registrados na Venda de Munição.
        </p>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            {([
              ["Pode na Recarga e Consumo?", ["recharge", "consume", "recharge_extra", "consume_extra"]],
              ["Pode na Venda de Munição?", ["ammo"]],
              ["Pode no Ranking de Consumo?", ["ranking_consume"]],
            ] as const).map(([label, categories]) => (
              <div key={label} className="rounded-lg border border-border bg-card p-3">
                <p className="text-[11px] font-medium uppercase text-muted-foreground">{label}</p>
                <p className="mt-1 text-lg"><RuleAnswer rule={rule} categories={[...categories]} /></p>
              </div>
            ))}
          </div>
          <Panel title="Preços registrados por servidor">
            <Table
              head={["Servidor", "Moeda", "Pack", "Quantidade", "Preço mínimo", "Preço máximo", "Vendidos", "Última venda"]}
              rows={rows.map((r) => [r.server, currencyLabel(r.cupons), num(r.pack), num(r.available), num(r.minPrice), num(r.maxPrice), num(r.sold), day(r.lastDate)])}
            />
          </Panel>
          <p className="text-[11px] text-muted-foreground">
            As respostas "Pode na..." vêm do cadastro em Criação de Eventos &gt; Categorias de itens.
          </p>
        </>
      )}
    </div>
  );
}

function OverviewTab({ sales, items }: { sales: Sale[]; items: string[] }) {
  const [f, setF] = useState<SaleFilter>({});
  const set = (patch: SaleFilter) => setF((cur) => ({ ...cur, ...patch }));
  const list = useMemo(() => filterSales(sales, f), [sales, f]);
  const weeks = useMemo(() => weekItemRows(list), [list]);
  const top = useMemo(() => byItem(list).slice(0, 10), [list]);
  const servers = useMemo(() => byServer(list), [list]);
  const weekRow = (r: (typeof weeks)[number]) => [r.period, r.item, currencyLabel(r.cupons), num(r.sold)];
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <Pick label="Moeda" value={f.currency ?? ""} onChange={(v) => set({ currency: v as SaleFilter["currency"] })} values={["cupons", "lcupons"]} labels={{ cupons: "Cupons", lcupons: "L.Cupons" }} />
        <ItemField id="finance-overview-items" value={f.item ?? ""} onChange={(item) => set({ item })} items={items} />
        <Pick label="Semana" value={f.period ?? ""} onChange={(period) => set({ period })} values={options(sales, "period")} all="Todas" />
      </div>
      <div className="grid gap-3 lg:grid-cols-2">
        <Panel title="Top 20 itens menos vendidos">
          <Table head={["Semana", "Item", "Moeda", "Vendeu"]} rows={leastSold(weeks).map(weekRow)} />
        </Panel>
        <Panel title="Top 20 itens mais vendidos">
          <Table head={["Semana", "Item", "Moeda", "Vendeu"]} rows={topSold(weeks).map(weekRow)} />
        </Panel>
        <Panel title="Total em cupons dos itens vendidos (10 maiores)">
          {top.length === 0 ? (
            <p className="py-6 text-center text-xs text-muted-foreground">Nenhuma venda com esses filtros.</p>
          ) : (
            <ChartContainer config={chartConfig} className="aspect-auto h-72 w-full">
              <BarChart data={top} layout="vertical" margin={{ left: 8, right: 16 }}>
                <CartesianGrid horizontal={false} />
                <XAxis type="number" tickFormatter={(v: number) => `${fmt(v / 1e6)} mi`} fontSize={10} />
                <YAxis type="category" dataKey="item" width={140} fontSize={10} tickFormatter={(v: string) => (v.length > 22 ? `${v.slice(0, 21)}…` : v)} />
                <ChartTooltip content={<ChartTooltipContent formatter={(v, _n, p) => `${fmt(Number(v))} cupons · ${fmt(p.payload.sold)} vendidos`} />} />
                <Bar dataKey="total" fill="var(--color-total)" radius={3} />
              </BarChart>
            </ChartContainer>
          )}
        </Panel>
        <Panel title="Total em cupons por servidor">
          <Table head={["Servidor", "Total em cupons"]} rows={servers.map((s) => [s.server, num(s.total)])} />
        </Panel>
      </div>
    </div>
  );
}

function SummaryTab({ sales, items }: { sales: Sale[]; items: string[] }) {
  const [f, setF] = useState<SaleFilter>({});
  const set = (patch: SaleFilter) => setF((cur) => ({ ...cur, ...patch }));
  const list = useMemo(() => filterSales(sales, f), [sales, f]);
  const t = useMemo(() => totals(list), [list]);
  const weeks = useMemo(() => byPeriod(list), [list]);
  const money = useMemo(() => byServer(list, (s) => s.totalBrl), [list]);
  const grid = useMemo(() => periodServerTable(list), [list]);
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <ItemField id="finance-summary-items" value={f.item ?? ""} onChange={(item) => set({ item })} items={items} />
        <Pick label="Servidor" value={f.server ?? ""} onChange={(server) => set({ server })} values={options(sales, "server")} />
        <Pick label="Mês" value={f.month ?? ""} onChange={(month) => set({ month, period: "" })} values={options(sales, "month")} />
        <Pick label="Semana" value={f.period ?? ""} onChange={(period) => set({ period })} values={options(filterSales(sales, { month: f.month }), "period")} all="Todas" />
      </div>
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        <Stat label="Total em Cupons" value={fmt(t.cupons)} />
        <Stat label="Total em L.Cupons" value={fmt(t.lcupons)} />
        <Stat label="Cupons e L.Cupons" value={fmt(t.all)} hint={`${fmt(t.sold)} itens vendidos`} />
        <Stat label="Total em R$" value={brl(t.brl)} />
      </div>
      <div className="grid gap-3 lg:grid-cols-2">
        <Panel title="Total por semana">
          {weeks.length === 0 ? (
            <p className="py-6 text-center text-xs text-muted-foreground">Nenhuma venda com esses filtros.</p>
          ) : (
            <ChartContainer config={chartConfig} className="aspect-auto h-72 w-full">
              <BarChart data={weeks} margin={{ left: 0, right: 8 }}>
                <CartesianGrid vertical={false} />
                <XAxis dataKey="period" fontSize={10} tickFormatter={(v: string) => v.replace(" - Semana ", " S").slice(0, 8)} />
                <YAxis fontSize={10} width={44} tickFormatter={(v: number) => `${fmt(v / 1e6)} mi`} />
                <ChartTooltip content={<ChartTooltipContent formatter={(v, n) => `${chartConfig[n as "cupons"]?.label ?? n}: ${fmt(Number(v))}`} />} />
                <ChartLegend content={<ChartLegendContent />} />
                <Bar dataKey="cupons" stackId="a" fill="var(--color-cupons)" />
                <Bar dataKey="lcupons" stackId="a" fill="var(--color-lcupons)" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ChartContainer>
          )}
        </Panel>
        <Panel title="Gastos em R$ por servidor">
          <Table head={["Servidor", "Total em R$"]} rows={money.map((s) => [s.server, <span className="tabular-nums">{brl(s.total)}</span>])} />
        </Panel>
      </div>
      <Panel title="Total em cupons por semana e servidor">
        <Table
          head={["Semana", ...grid.servers]}
          rows={grid.periods.map((p) => [<span className="whitespace-nowrap">{p}</span>, ...grid.servers.map((s) => (grid.value(p, s) ? num(grid.value(p, s)) : <span className="text-muted-foreground">-</span>))])}
        />
      </Panel>
    </div>
  );
}

function FinderTab({ sales }: { sales: Sale[] }) {
  const [text, setText] = useState("");
  const [f, setF] = useState<SaleFilter>({});
  const [page, setPage] = useState(0);
  const set = (patch: SaleFilter) => {
    setF((cur) => ({ ...cur, ...patch }));
    setPage(0);
  };
  const list = useMemo(() => {
    const q = plain(text);
    return filterSales(sales, f)
      .filter((s) => !q || plain(s.item).includes(q))
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [sales, f, text]);
  const pages = Math.max(1, Math.ceil(list.length / PAGE));
  const shown = list.slice(page * PAGE, page * PAGE + PAGE);
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <label className="flex min-w-0 flex-col gap-1 text-[11px] font-medium text-muted-foreground">
          Item
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2" />
            <Input value={text} placeholder="Parte do nome" className="h-9 w-full pl-8 text-xs sm:w-72" onChange={(e) => { setText(e.target.value); setPage(0); }} />
          </div>
        </label>
        <Pick label="Mês" value={f.month ?? ""} onChange={(month) => set({ month, period: "" })} values={options(sales, "month")} />
        <Pick label="Semana" value={f.period ?? ""} onChange={(period) => set({ period })} values={options(filterSales(sales, { month: f.month }), "period")} all="Todas" />
        <Pick label="Servidor" value={f.server ?? ""} onChange={(server) => set({ server })} values={options(sales, "server")} />
      </div>
      <Panel title={`${fmt(list.length)} vendas`}>
        <Table
          head={["Data", "Semana", "Servidor", "Item", "Validade", "Pack", "Limite", "Preço", "Moeda", "Disponível", "Vendido"]}
          rows={shown.map((s) => [
            day(s.date), <span className="whitespace-nowrap">{s.period}</span>, s.server, s.item, s.validity, num(s.pack),
            s.bound ? "Vinculado" : "Livre", num(s.price), currencyLabel(s.cupons), num(s.available), num(s.sold),
          ])}
        />
        {pages > 1 && (
          <div className="mt-2 flex items-center justify-end gap-2 text-xs text-muted-foreground">
            <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage(page - 1)}>Anterior</Button>
            <span className="tabular-nums">{page + 1} / {pages}</span>
            <Button variant="outline" size="sm" disabled={page >= pages - 1} onClick={() => setPage(page + 1)}>Próxima</Button>
          </div>
        )}
      </Panel>
    </div>
  );
}

export default function Finance() {
  const navigate = useNavigate();
  const { data, isLoading, error, refresh, refreshing } = useFinanceData();
  const sales = useMemo(() => data?.sales ?? [], [data]);
  const items = useMemo(() => options(sales, "item"), [sales]);

  return (
    <div className="mx-auto w-full max-w-7xl space-y-4 px-4 py-5 sm:px-6">
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="ghost" size="sm" title="Voltar ao painel" onClick={() => navigate("/")}><ArrowLeft className="h-4 w-4" /></Button>
        <h1 className="flex items-center gap-2 text-xl font-bold"><Wallet className="h-5 w-5" /> Financeiro</h1>
        <span className="text-xs text-muted-foreground">Venda de Munição</span>
        <span className="flex-1" />
        {data?.fetchedAt && (
          <span className="text-[11px] text-muted-foreground">
            Planilha lida às {new Date(data.fetchedAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
          </span>
        )}
        <Button
          variant="outline"
          size="sm"
          className="gap-1"
          disabled={refreshing || isLoading}
          onClick={() => refresh().catch((e: Error) => toast.error(e.message))}
        >
          <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} /> Atualizar
        </Button>
      </div>

      {isLoading ? (
        <p className="py-10 text-center text-sm text-muted-foreground">Lendo a planilha do financeiro...</p>
      ) : error ? (
        <p className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-4 text-sm text-destructive">
          {(error as Error).message || "Não foi possível ler a planilha do financeiro."}
        </p>
      ) : (
        <Tabs defaultValue="guide" className="space-y-3">
          <TabsList className="flex h-auto w-full flex-wrap justify-start gap-1">
            <TabsTrigger value="guide" className="gap-1 text-xs"><BookOpen className="h-3.5 w-3.5" /> Guia de criação</TabsTrigger>
            <TabsTrigger value="overview" className="gap-1 text-xs"><Trophy className="h-3.5 w-3.5" /> Visão geral</TabsTrigger>
            <TabsTrigger value="summary" className="gap-1 text-xs"><LayoutDashboard className="h-3.5 w-3.5" /> Resumo</TabsTrigger>
            <TabsTrigger value="finder" className="gap-1 text-xs"><Search className="h-3.5 w-3.5" /> Localizar item</TabsTrigger>
            <TabsTrigger value="ranking" className="gap-1 text-xs"><BarChart3 className="h-3.5 w-3.5" /> Ranking de Consumo</TabsTrigger>
          </TabsList>
          <TabsContent value="guide"><GuideTab sales={sales} items={items} /></TabsContent>
          <TabsContent value="overview"><OverviewTab sales={sales} items={items} /></TabsContent>
          <TabsContent value="summary"><SummaryTab sales={sales} items={items} /></TabsContent>
          <TabsContent value="finder"><FinderTab sales={sales} /></TabsContent>
          <TabsContent value="ranking">
            <p className="rounded-lg border border-dashed border-border px-3 py-8 text-center text-xs text-muted-foreground">
              O consumo semanal do Ranking de Consumo não está nesta planilha. Assim que a planilha do ranking for ligada ao painel, ele aparece aqui.
            </p>
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}
