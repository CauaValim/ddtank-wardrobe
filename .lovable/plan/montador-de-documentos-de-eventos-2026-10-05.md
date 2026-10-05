# Montador de Documentos de Eventos

Um novo módulo no painel para montar o documento semanal de eventos (hoje feito na planilha) direto no painel. O documento fica salvo e também pode ser exportado como .xlsx no mesmo formato que vocês enviam hoje.

## Como vai funcionar (visão do usuário)

1. Botão **"Documentos de Eventos"** no cabeçalho (só ADM e Super Admin).
2. Lista de documentos: nome (ex.: "16 Anos de DDTank - Semana 1"), período, servidores (s1-s401 / s1-s402), status (Rascunho / Finalizado), botões Abrir, Duplicar, Exportar .xlsx, Excluir.
3. Dentro do documento, cada evento vira uma **seção** (igual às abas da planilha). Botão "Adicionar seção" com os tipos da primeira fase:
   - **Entrada Diária**: datas, texto explicativo e filas (Fila 3, 7, 14...) com itens.
   - **Missões / Faça se Puder / Desafio da Tribo**: título em inglês + tradução PT (título e descrição), condições/observações, itens de pré-requisito e recompensas.
   - **Troca**: item de troca (moeda), grupos (A, B...) com valor, item recebido, quantidade, limite e total.
   - **Venda de Munição**: item, preço em cupons, quantidade, limite por servidor.
   - **Recarga / Consumo / Extras / Rankings**: faixas de valor ou posição e recompensas.
4. Cada seção tem: servidores, data/hora de início e fim e um campo de observações livres.
5. **Seletor de itens**: busca por nome ou ID na base do painel; ao escolher, a imagem, o nome e a validade ([Permanent] [Bound], [30 Days - renewable]...) já entram sozinhos. Também dá para usar "XXX" para itens que ainda não existem.
6. A linha "ID*Quantidade" (ex.: `12352*2,12355*5,9608*2`) é gerada automaticamente, sem digitação manual e sem erro.
7. Validação antes de exportar: avisa sobre IDs inexistentes, itens "XXX" pendentes, datas inválidas ou seções vazias (reaproveitando o verificador de planilha que já existe).
8. **Exportar .xlsx**: uma aba por seção, com os nomes de aba no padrão atual ("BR-Daily Entry - 14D s1-s401"...), cabeçalho, tabelas e imagens dos itens.
9. **Importar planilha existente** (opcional, fase 2): ler um .xlsx como o modelo enviado para começar a partir dele.

## Fases

- **Fase 1**: lista de documentos, editor com os 4 grupos de seções escolhidos, seletor de itens, geração do ID*Quantidade, salvamento.
- **Fase 2**: exportação .xlsx com imagens e layout fiel ao modelo, mais a validação.
- **Fase 3**: demais tipos (Transformação, Aba de Coleta, Retorno de Veteranos, Códigos, Instâncias), importação do .xlsx antigo e modelos reutilizáveis (duplicar a semana anterior).

## Detalhes técnicos

- Tabelas novas (Supabase): `event_documents` (id, title, theme, servers, start_date, end_date, status, created_by, timestamps) e `event_sections` (id, document_id, type, title_en, title_pt, description_pt, servers, start_at, end_at, notes, position, `data jsonb` para o conteúdo específico de cada tipo: filas, grupos, faixas e itens `{id, qty, validity, condition}`). GRANTs + RLS liberando leitura e escrita só para `has_role` admin/super_admin.
- Itens referenciados pelo ID da tabela `items` (base BR); a imagem e o nome vêm de `itemsById` já carregado.
- Front: `src/pages/EventDocuments.tsx` (lista), `src/pages/EventDocumentEditor.tsx`, um componente de edição por tipo de seção em `src/components/events/`, `ItemPicker` reutilizável, e rotas novas em `App.tsx` protegidas por `canImport`.
- Exportação com `@e965/xlsx` (regra do projeto); para as imagens, o formato de exportação ainda precisa ser validado (essa biblioteca não incorpora imagens nativamente — alternativa: gerar o arquivo no backend com uma biblioteca que suporte imagens).
- Registrar a arquitetura em `AGENTS.md`.
