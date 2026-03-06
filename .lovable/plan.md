

# Plano: Sidebar "Cronograma Eventos"

## Resumo
Adicionar uma sidebar na lateral esquerda da aplicação contendo o cronograma de eventos extraído do arquivo Excel. A sidebar usará os componentes Shadcn Sidebar já disponíveis no projeto e exibirá as semanas com seus temas e eventos de forma organizada.

## Estrutura dos Dados

O arquivo Excel contém um cronograma semanal de 2026 com ~52 semanas, cada uma com:
- **Período** (ex: "29/12 - 04/01")
- **Tema** (ex: "Natal Week 2", "Carnaval Week 1")
- **Eventos por categoria**: Faça se Puder, Atividades, Rotação de Figuras Normais, Rotação de Figuras de Elite, Rotação das Moedas, Missão de Novatos, Torneio, Abas de Coleta, Código DDBooster

## Mudanças

### 1. Criar arquivo de dados estático
- `src/data/cronograma.ts` — Array tipado com todas as semanas e seus eventos, extraídos do Excel. Cada entrada terá: `{ periodo, tema, eventos: { categoria: string[] } }`.

### 2. Criar componente EventScheduleSidebar
- `src/components/EventScheduleSidebar.tsx` — Usa `Sidebar`, `SidebarContent`, `SidebarGroup` do Shadcn. Cada semana será um `Collapsible` ou `Accordion` mostrando o tema como título e os eventos ao expandir. Destaque visual na semana atual (baseado na data).

### 3. Integrar no layout (App.tsx + Index.tsx)
- Envolver o conteúdo com `SidebarProvider` no `App.tsx`.
- Adicionar `<EventScheduleSidebar />` ao lado do conteúdo principal.
- Adicionar `SidebarTrigger` no header para abrir/fechar.
- A sidebar será colapsável (`collapsible="icon"` ou `"offcanvas"` no mobile).

### 4. Rota /cronograma (opcional)
- Não será necessária rota separada — os dados ficam na sidebar acessível de qualquer página.

## Detalhes Técnicos
- Dados hardcoded em TypeScript (não no banco) pois são estáticos e vêm do Excel.
- A semana atual será destacada automaticamente usando `date-fns` (já instalado).
- ScrollArea para navegação suave pelas semanas.
- No mobile, a sidebar abre como sheet (comportamento padrão do Shadcn Sidebar).

