# Publish da Lovable nao atualiza o site na Hostinger

## O que esta acontecendo

O botao **Publish** da Lovable so atualiza a URL da Lovable (`ddtank-wardrobe.lovable.app`). Ele nao envia nada para a Hostinger.

O site da Hostinger e atualizado por outro caminho: o workflow `.github/workflows/deploy.yml`, que roda **apenas quando ha um push na branch `main` do GitHub** e envia a pasta `dist/` por FTP. Se o projeto nao estiver sincronizado com o GitHub (ou o push nao acontecer), a Hostinger continua servindo a versao antiga para sempre.

Alem disso, mesmo quando o deploy roda, o `index.html` antigo pode ficar em cache no navegador/servidor, mostrando a interface velha.

## Correcoes propostas

1. **Confirmar o caminho do deploy**
   - Verificar se o projeto esta conectado ao GitHub e se os commits da Lovable chegam na branch `main`.
   - Conferir na aba Actions do repositorio se o workflow "Deploy Lovable via FTP na Hostinger" rodou depois da ultima alteracao e se terminou com sucesso.

2. **Evitar arquivos antigos e cache no servidor**
   - Ajustar o `.htaccess` gerado no deploy para nunca cachear `index.html` (`Cache-Control: no-cache`) e cachear por muito tempo apenas os arquivos com hash em `/assets`.
   - Isso faz o navegador sempre buscar o HTML novo, que aponta para os bundles novos.

3. **Limpeza de arquivos obsoletos no FTP**
   - Hoje o deploy usa `dangerous-clean-slate: false`, entao assets antigos ficam acumulados. Manter assim e seguro, mas o passo 2 e o que garante que a versao nova apareca.

## Fluxo correto depois do ajuste

```text
Editar na Lovable -> commit na branch main (GitHub)
      -> GitHub Actions build + FTP -> Hostinger atualizada
Publish da Lovable -> atualiza apenas *.lovable.app
```

## Detalhes tecnicos

- Arquivo alterado: `.github/workflows/deploy.yml` (bloco que cria o `.htaccess`), adicionando regras `mod_headers`/`mod_expires` para `index.html` sem cache e `/assets/*` com cache longo.
- Nenhuma alteracao no codigo da aplicacao e necessaria.
- Se o repositorio GitHub nao estiver conectado, a Hostinger nunca sera atualizada automaticamente: nesse caso a opcao e conectar o GitHub ou passar a usar o dominio proprio apontando para a Lovable em vez da Hostinger.
