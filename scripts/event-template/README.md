# Modelo oficial dos Documentos de Eventos

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
4. Publique e, no painel, um Super Admin envia o arquivo em **Documentos de Eventos** (o envio só é aceito se o SHA-256 bater com o manifesto).

Documentos salvos guardam `template_version`; seções cujo layout não existir na versão nova aparecem com aviso no editor.

## Abas mapeadas

Entrada Diária (capa), Venda de Munição, Missões (3 layouts), Faça se Puder (2), Desafio da Tribo,
Troca (6), Recarga, Consumo, Recarga Extra, Consumo Extra e os dois Rankings.
Ainda não mapeadas: Transformation, Exchange Extra KICK, Collection Tab, Old Return, Code Tab,
Chaos Insects e Uncover the Instance.
