# Modelo oficial da Criação de Eventos

A exportação `.xlsx` preenche o modelo oficial (`BR_16_years_of_DDTank_Week_-_s1-s401_ID_2.xlsx`)
seguindo o manifesto `src/lib/eventTemplate/manifest.json`. Só as células e imagens mapeadas
são alteradas; o resto do arquivo (estilos, mesclagens, artes) fica igual ao modelo.

## Trocar o modelo

1. Altere `VERSION` em `build_manifest.py` (ex.: `17-anos-v1`) e ajuste o mapeamento das abas que mudaram.
2. Gere o manifesto:
   `python3 scripts/event-template/build_manifest.py novo-modelo.xlsx src/lib/eventTemplate/manifest.json`
3. Rode o teste de ida e volta com o arquivo novo:
   `EVENT_TEMPLATE_PATH=novo-modelo.xlsx npx vitest run src/lib/eventTemplate src/components/events`
   Cada aba é lida para um documento e exportada de novo; todas as células mapeadas precisam sair iguais.
4. Publique e, no painel, um Super Admin envia o arquivo em **Criação de Eventos** (o envio só é aceito se o SHA-256 bater com o manifesto).

Documentos salvos guardam `template_version`; seções cujo layout não existir na versão nova aparecem com aviso no editor.

## Abas mapeadas

Entrada Diária (capa), Venda de Munição, Missões (3 layouts), Faça se Puder (2), Desafio da Tribo,
Troca (6), Recarga, Consumo, Recarga Extra, Consumo Extra e os dois Rankings.
Ainda não mapeadas: Transformation, Exchange Extra KICK, Collection Tab, Old Return e Code Tab.

## Solicitações manuais (arquivo separado)

As 21 abas de solicitação (Activity request) não fazem parte do modelo: ficam no arquivo
`solicitacoes-manuais-v2.xlsx` (manifesto `src/lib/eventTemplate/requestsManifest.json`), enviado uma vez
por um Super Admin em **Criação de Eventos**. Na exportação, o painel junta ao final do documento só as
abas das solicitações usadas.

O arquivo é gerado a partir do modelo, para carregar os mesmos estilos e textos com os mesmos índices:

    python scripts/event-template/merge_sheets.py --only modelo.xlsx "Cronograma Projetos ATUALIZADO.xlsx" solicitacoes-manuais-v2.xlsx "BR-Adventure Dungeon s1-s402" ...
    python scripts/event-template/build_manifest.py modelo.xlsx src/lib/eventTemplate/manifest.json solicitacoes-manuais-v2.xlsx src/lib/eventTemplate/requestsManifest.json

Se o modelo mudar, gere o arquivo de solicitações de novo a partir dele.
Para testar: `EVENT_REQUESTS_PATH=solicitacoes-manuais-v2.xlsx` (padrão: `__fixtures__/requests.xlsx`).
