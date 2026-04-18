
## Plano: Duplicar painel em `/turco` com base de dados separada

### Objetivo
Criar uma rota `/turco` que reusa toda a UI/cadastros atuais, mas lê e grava em uma base de dados separada (tabela `items_turco` + bucket `item-images-turco`). Os usuários e cargos permanecem compartilhados.

### Mudanças no Backend (Supabase)

**1. Nova tabela `items_turco`** — schema idêntico a `items` (mesmas colunas, defaults e tipos).

**2. RLS** — mesmas políticas de `items`:
- SELECT público
- INSERT/UPDATE/DELETE apenas para `admin` e `super_admin`

**3. Novo bucket `item-images-turco`** (público, igual ao `item-images`) com políticas de escrita restritas a admins.

### Mudanças no Frontend

**1. Abstração do "realm" no store**
- Refatorar `src/hooks/useItemStore.ts` para aceitar parâmetro `realm: "br" | "turco"`.
- O hook passa a usar dinamicamente:
  - Tabela: `items` ou `items_turco`
  - Bucket: `item-images` ou `item-images-turco`
- Assinatura: `useItemStore(realm)`.

**2. Roteamento (`src/App.tsx`)**
- Adicionar nova rota:
  ```text
  /        → <Index auth={auth} realm="br" />
  /turco   → <Index auth={auth} realm="turco" />
  ```

**3. Página `Index.tsx`**
- Recebe prop `realm`.
- Passa `realm` para `useItemStore(realm)`.
- Título do header muda conforme realm: "Painel Staff DDTank 337" vs "Painel Staff DDTank Turco".

**4. Navegação entre realms**
- Adicionar um seletor/botão no header (ex: badge "BR | TR") que navega entre `/` e `/turco`, para que admins alternem facilmente.

**5. Componentes auxiliares**
- `IdFillerModal`: passar `realm` como prop para que ele consulte a tabela correta ao buscar IDs.
- `FileImporter`: nenhuma mudança (apenas dispara callbacks que já estão amarrados ao realm via store).

### Fluxo de dados resultante

```text
/         → useItemStore("br")    → items + item-images
/turco    → useItemStore("turco") → items_turco + item-images-turco
```

Login, cargos (`user_roles`), cronograma e sidebar permanecem globais e compartilhados.

### Arquivos afetados
- **Migration nova**: criar `items_turco` + RLS + bucket `item-images-turco` + políticas.
- **Editar**: `src/App.tsx`, `src/pages/Index.tsx`, `src/hooks/useItemStore.ts`, `src/components/IdFillerModal.tsx`.

### Observação
Após aprovação, ao entrar em `/turco` pela primeira vez a base estará vazia — você poderá usar o **Importar** (Excel/JSON + ZIP) para carregar a database e imagens turcas, exatamente como fez no painel BR.
