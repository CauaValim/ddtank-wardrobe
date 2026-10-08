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
Solicitações manuais (Activity request): 21 abas, entre elas Masmorra de Aventura, Capturar Nien
(5 baús), Tesouro do Diabo (prêmio), Desvende a Instância (3 prêmios) e Mestre de Eliminação (3 períodos).
Ainda não mapeadas: Transformation, Exchange Extra KICK, Collection Tab, Old Return e Code Tab.

## Trazer abas de outra planilha

As solicitações manuais vieram da planilha "Cronograma Projetos ATUALIZADO.xlsx":

    python scripts/event-template/merge_sheets.py modelo-v2.xlsx "Cronograma Projetos ATUALIZADO.xlsx" modelo-eventos-16-anos-v3.xlsx "BR-Adventure Dungeon s1-s402" ...

O script copia as abas com formatação, mesclagens e imagens (as cores do tema da origem viram cores fixas).
Abas que já existem no modelo são mantidas. Depois, mapeie as abas novas em `build_manifest.py`.
