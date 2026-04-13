

## Plano: Ferramenta de Preenchimento Automático de IDs em Documentos XLSX

### Problema
Atualmente, o preenchimento de IDs nos documentos semanais de eventos é feito manualmente -- o operador precisa buscar cada nome de item e inserir o ID correspondente em diversas posições do documento. Esse processo é repetitivo e propenso a erros.

### Como funciona o documento

Analisando os 4 arquivos enviados, identifiquei os seguintes padrões de onde os IDs precisam ser inseridos:

```text
Tipo 1 - Coluna "ID" (AMMUNITION SALE)
  v2:  [vazio]
  ID:  12269

Tipo 2 - Coluna "ID and Amount" / "ID / Amount"
  v2:  *200
  ID:  1123107*200

Tipo 3 - Múltiplos itens combinados (Queues, Missions)
  v2:  *500,*1,*300
  ID:  12656*500,46077*1,12212*500

Tipo 4 - Escolha (OR)
  v2:  *1 OR *1 OR *1 OR *1
  ID:  ID1*1 OR ID2*1 OR ID3*1 OR ID4*1
```

Os nomes dos itens aparecem em células próximas e possuem sufixos como `[Permanent] [Bound]` que precisam ser removidos antes da busca.

### Solução

Criar um botão/página no painel que:
1. O usuário faz upload de um arquivo `.xlsx` (versão v2, sem IDs)
2. O sistema lê todas as células, identifica nomes de itens e as células de ID correspondentes
3. Busca os IDs no banco de dados Supabase (tabela `items`) por nome
4. Preenche os IDs no formato correto
5. Gera dois arquivos para download:
   - O `.xlsx` processado com os IDs preenchidos
   - Um relatório de erros (itens não encontrados, nomes ambíguos, etc.)

### Etapas de implementação

1. **Criar componente `IdFiller`** -- Nova página/seção no painel com upload de arquivo e botões de download

2. **Criar lógica de processamento (`lib/idFiller.ts`):**
   - Ler o xlsx com `@e965/xlsx` (já instalado)
   - Varrer todas as sheets/células identificando padrões:
     - Células com header "ID" vazias + nome de item na mesma linha
     - Células com `*amount` ou `*a,*b,*c` no formato "ID and Amount"
     - Células com `*a OR *b` no formato de escolha
   - Para cada nome encontrado, limpar sufixos (`[Permanent]`, `[Bound]`, `[30 Days...]`, etc.)
   - Buscar correspondência na tabela `items` do Supabase por nome
   - Preencher o ID no formato correto
   - Coletar erros (não encontrado, múltiplos resultados, etc.)

3. **Gerar arquivo de saída:**
   - Reconstruir o xlsx com os IDs preenchidos mantendo toda a formatação original
   - Gerar um segundo xlsx/csv com o relatório de erros

4. **Integrar na UI:**
   - Adicionar botão na página principal (visível para admins)
   - Modal ou seção dedicada com upload + progress + downloads

### Detalhes Técnicos

- **Matching de nomes**: Busca case-insensitive, ignorando espaços extras e sufixos entre colchetes
- **Busca no banco**: Uma única query `SELECT id, name FROM items` carregada em memória para matching rápido
- **Preservação de formatação**: Usando `@e965/xlsx` para ler e escrever mantendo estilos, merges, imagens
- **Relatório de erros** incluirá: sheet, célula, nome do item, motivo do erro (não encontrado / múltiplos matches / já possui ID)

