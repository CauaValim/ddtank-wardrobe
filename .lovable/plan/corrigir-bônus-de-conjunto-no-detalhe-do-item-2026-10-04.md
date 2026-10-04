# Corrigir bônus de conjunto no detalhe do item

## Objetivo
Mostrar o bônus progressivo real do conjunto ao qual o item pertence, em vez dos atributos gerais da Fugura.

## Alterações
- Expor, pela fonte oficial do jogo, somente os itens que possuem `SuitId`, incluindo nome e descrição do bônus.
- No detalhe do item, localizar o conjunto pelo `SuitId` e exibir a descrição oficial do bônus por quantidade de peças.
- Listar as peças oficiais do mesmo conjunto com suas imagens quando disponíveis.
- Remover do detalhe do item o bloco de atributos da Fugura; ele continuará existindo apenas no botão Fuguras.
- Manter os atributos oficiais das montarias e os atributos comuns dos demais itens como estão.

## Validação
- Confirmar que um item com bônus progressivo mostra o texto oficial do conjunto.
- Confirmar que os atributos da Fugura não aparecem mais no detalhe desse item.
- Verificar compilação e erros da interface.
