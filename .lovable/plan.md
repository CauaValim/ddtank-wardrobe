# Exportação fiel ao modelo atual de eventos

## Objetivo
Usar `BR_16_years_of_DDTank_Week_-_s1-s401_ID_2.xlsx` como modelo oficial temporário. O painel deixará de reconstruir as planilhas e passará a gerar cada documento a partir das abas originais desse arquivo.

O arquivo exportado terá somente os eventos usados no documento. Em cada aba mantida, o visual original permanecerá intacto: imagens, cores, fontes, bordas, mesclagens, larguras, alturas e demais elementos do modelo.

## Como funcionará no painel

1. **Modelo fixo inicial**
   - Registrar o arquivo de 16 anos como a versão ativa do template.
   - Mapear cada tipo de evento do editor para sua aba correspondente no modelo.
   - Permitir futuramente trocar essa versão por um template mais completo sem refazer o editor.

2. **Criação baseada nas abas reais**
   - Ao adicionar um evento, o painel usará a aba original correspondente como base visual.
   - Eventos repetidos do mesmo tipo poderão criar cópias independentes da mesma aba.
   - O documento mostrará quais tipos já possuem template mapeado e bloqueará uma exportação incompleta quando algum não possuir.

3. **Campos editáveis sem alterar o desenho**
   - Cada aba terá posições previamente mapeadas para os dados editáveis.
   - Ao trocar ou adicionar um item, somente a imagem, o nome e o ID/quantidade do item serão substituídos nos espaços definidos.
   - Os demais elementos visuais e textos fixos da aba não serão recriados nem reformatados.
   - O sistema validará capacidade, campos obrigatórios e IDs antes da exportação para evitar conteúdo fora da área prevista.

4. **Exportação apenas do que foi usado**
   - Começar com uma cópia fiel do arquivo-base.
   - Manter apenas as abas correspondentes às seções existentes no documento.
   - Preservar a ordem definida no painel e aplicar nomes de abas compatíveis com o padrão atual.
   - Gerar o `.xlsx` final sem abas vazias ou eventos não utilizados.

5. **Prévia e validação**
   - Mostrar no editor qual layout do modelo será usado em cada seção.
   - Antes de baixar, listar erros como ID inexistente, item sem imagem, grupo sem espaço mapeado ou evento sem template.
   - Criar um modo de comparação para conferir o item anterior e o novo antes da substituição.

## Primeira versão suportada

A primeira entrega mapeará os tipos já disponíveis no editor que possuam uma aba equivalente no modelo de 16 anos:

- Entrada Diária
- Missões
- Faça se Puder
- Desafio da Tribo
- Troca
- Venda de Munição
- Recarga e Consumo
- Recarga e Consumo Extra
- Rankings de Recarga e Consumo

As demais abas do arquivo de 16 anos não entrarão automaticamente nesta fase. Elas serão adicionadas quando seus respectivos formulários forem incluídos no painel.

## Detalhes técnicos

- Manter o formato atual de armazenamento do documento e acrescentar um identificador de versão do template e o mapeamento de layout de cada seção.
- Substituir a exportação atual, que cria tabelas simples, por uma exportação baseada no arquivo original.
- Usar `@e965/xlsx` para leitura e validação dos dados, conforme a regra de segurança do projeto.
- Preservar o pacote original da planilha e modificar somente os valores e mídias dos pontos mapeados, evitando reconstruir estilos ou imagens.
- Guardar o template como arquivo interno do projeto, sem expor uma opção de alteração para usuários comuns.
- Registrar a arquitetura do template em `AGENTS.md` para que futuras variações sigam o mesmo mecanismo.

## Verificação

- Comparar cada aba exportada com a aba original do modelo de 16 anos.
- Conferir imagens, estilos, mesclagens, dimensões, nomes e ordem das abas.
- Testar substituições de itens em cada tipo de evento, incluindo múltiplos itens e eventos repetidos.
- Confirmar que somente imagem, nome e ID/quantidade mudaram nos blocos de itens.
- Abrir o resultado no Excel e no LibreOffice e verificar que não há avisos de arquivo corrompido ou fórmulas inválidas.
