# Verificador de Itens (ID + Nome + Imagem)

Nova ferramenta no painel: você sobe uma planilha `.xlsx` com ID e Nome, e o painel confere linha por linha contra a base do realm atual (BR ou TR), mostrando o que está certo e o que está errado.

## Como vai funcionar

1. Botão novo no cabeçalho (ícone de "check de planilha"), ao lado do botão "Preencher IDs", visível só para ADM e Super Admin.
2. Modal abre, você escolhe o arquivo `.xlsx`.
3. O painel lê as colunas de ID e Nome (aceita variações: `ID`, `Id`, `Nome`, `Name`) e carrega a base do realm atual.
4. Cada linha recebe um status:
   - **Válido**: o ID existe, o nome bate com o do banco e o item tem imagem cadastrada.
   - **Sem imagem**: ID e nome batem, mas o item não tem `image_url`.
   - **Nome divergente**: o ID existe mas o nome é outro (mostra o nome correto do banco).
   - **ID não encontrado**: nenhum item com aquele ID. Se o nome existir na base, sugere o ID correto.
   - **Linha inválida**: sem ID ou sem nome.
5. Comparação de nome é tolerante: ignora maiúsculas/minúsculas, acentos e espaços extras — diferença só de acento/caixa conta como válida.

## Resultado na tela

Tabela com: miniatura da imagem do banco, ID enviado, Nome enviado, Nome no banco, ID sugerido e status colorido. Acima, um resumo com a contagem de cada status e filtro rápido por status (ex.: ver só os inválidos).

## Exportar

Botão "Baixar relatório .xlsx" gera uma planilha com as colunas originais mais: `Status`, `Nome no Banco`, `ID Sugerido`, `Tem Imagem`. Linhas com problema ficam destacadas.

## Detalhes técnicos

- `src/lib/itemValidator.ts` (novo): normalização de nomes, índice por ID e por nome, e a função `validateRows` que devolve os resultados tipados. Coberto por testes em `src/lib/itemValidator.test.ts`.
- `src/components/ItemValidatorModal.tsx` (novo): leitura do arquivo com `@e965/xlsx`, tabela de resultados e exportação — mesmo padrão de `IdFillerModal.tsx`.
- Consulta paginada (1000 por página) em `items` ou `items_turco` conforme o `realm`, buscando `id, name, image_url`. Sem mudanças no banco de dados.
- `src/pages/Index.tsx`: novo botão condicionado a `auth.role === "admin" || "super_admin"`, passando o `realm` atual.
