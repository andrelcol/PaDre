# Desenvolvimento local

Conta, sessão e perfil rodam contra um Supabase local. Não há projeto remoto ligado.

## O que sobe

`npm run supabase:start` usa o CLI do Supabase como dependência e, nesta máquina, um runtime compatível porque não há Docker:

- Postgres 17 em `127.0.0.1:54322`
- GoTrue (Auth) e PostgREST atrás do gateway `http://127.0.0.1:54321`
- Mailpit em `http://127.0.0.1:54324` (SMTP `127.0.0.1:54325`)

O `project_id` é `padre-identity-local`. O script recusa a porta 5432 e não reutiliza outro banco. Segredos ficam em `supabase/.runtime`, fora do Git. `.env.local` recebe só a URL, a chave anônima e `DATABASE_URL` para teste e geração de tipos. `DATABASE_URL` não tem prefixo `VITE_`. A chave `service_role` não é gravada.

No ambiente local o cadastro já devolve sessão (`GOTRUE_MAILER_AUTOCONFIRM`). Isso não é o comportamento de produção.

## Primeiro uso

```bash
nvm use
npm install
npm run supabase:start
npm run dev
```

A aplicação fica em `http://127.0.0.1:5173`.

| Comando                   | O que faz                                               |
| ------------------------- | ------------------------------------------------------- |
| `npm run supabase:start`  | Sobe o ambiente local e escreve `.env.local`            |
| `npm run supabase:stop`   | Encerra os processos deste ambiente                     |
| `npm run supabase:status` | Diz se o supervisor está no ar                          |
| `npm run supabase:reset`  | Apaga só o diretório de dados deste Postgres e recomeça |
| `npm run supabase:types`  | Gera `src/shared/lib/database.types.ts`                 |
| `npm run test:db`         | Testes de RLS contra o banco local                      |

Migrations em `supabase/migrations` são aplicadas na subida, em ordem, numa base vazia. Não há passo manual.

## Dados públicos e privados

`profiles` é o perfil que outra pessoa autenticada pode ver se `visibility = public`:

- `id`
- `username`
- `display_name`
- `visibility`
- `created_at`
- `updated_at`

`profile_preferences` fica só com o dono, mesmo quando o perfil é público:

- `user_id`
- `timezone`
- `updated_at`

Anônimo não recebe `select`. Senha não fica em `profiles`. O papel da conta é sempre `authenticated`; metadata de cadastro não escolhe papel nem a visibilidade inicial. A visibilidade nasce `private`. O fuso nasce `America/Sao_Paulo`.

`username` é guardado em minúsculas, único nesse formato, e precisa casar `^[a-z][a-z0-9_]{2,29}$` depois de `trim`. `display_name` aceita acentos, de 1 a 80 caracteres.

## Políticas RLS

RLS está ligado e forçado nas duas tabelas. Não há política de insert nem de delete para o cliente. O perfil nasce no gatilho `private.handle_new_user`.

| Política                         | Efeito                                                |
| -------------------------------- | ----------------------------------------------------- |
| `profiles_select_own_or_public`  | autenticado lê o próprio perfil ou um perfil `public` |
| `profiles_update_own`            | autenticado atualiza só o próprio perfil              |
| `profile_preferences_select_own` | autenticado lê só o próprio fuso                      |
| `profile_preferences_update_own` | autenticado altera só o próprio fuso                  |

Grants de coluna: em `profiles`, o cliente atualiza `username`, `display_name` e `visibility`. Em `profile_preferences`, só `timezone`. `id`, `user_id`, `created_at` e `updated_at` não são atualizáveis pelo cliente. Gatilhos também recusam trocar o id e preenchem `updated_at`.

Funções de gatilho ficam no schema `private`, fora do PostgREST. `public.username_is_available(candidate)` devolve só um booleano e pode ser chamada antes do login.

## Tipos, testes e usuários

Gerar os tipos depois que o banco estiver no ar:

```bash
npm run supabase:types
```

O arquivo gerado não deve ser editado à mão.

Testes de banco usam o cadastro HTTP, o papel `authenticated` com `auth.uid()` e a API REST com o JWT do usuário. Não usam `service_role`.

```bash
npm run test:db
```

Eles criam pelo menos duas contas com e-mail `@padre.test` e apagam essas contas no fim. Para criar uma conta manualmente, use a tela `/cadastrar` ou `POST /auth/v1/signup` com a chave anônima.

Testes de interface:

```bash
npm test
npm run test:e2e
```

## Amizades

A página `/amigos` pede amizade pelo username exato. Aceitar, recusar, cancelar e remover passam por funções no banco. Um perfil privado continua sem leitura geral; a lista de relações mostra só o username da outra pessoa. Um novo pedido entre o mesmo par espera 24 horas depois de recusa, cancelamento ou remoção. O detalhe está na ADR-020.

## Encontros

A página `/encontros` lista os próximos, os que a pessoa organiza, os convites pendentes e os anteriores ou cancelados. Criar um encontro escolhe modalidade e formato no catálogo vivo, grava o horário em UTC no fuso informado e guarda a versão da regra daquele formato. Convidar exige amizade confirmada. Aceitar, recusar, sair e cancelar passam por funções no banco. O detalhe está na ADR-022.

## Catálogo

Modalidades, formatos e regras ativas podem ser lidos com a chave anônima em `/rest/v1/sports`. Não há escrita pelo cliente. Uma modalidade nova entra numa migration posterior, com UUID fixo. A versão de uma regra não se altera: a migration desativa a versão corrente e insere a seguinte. O procedimento está na ADR-019 e no modelo de domínio.

## Recuperação de senha

1. Em `/recuperar-senha`, informe o e-mail.
2. Abra o Mailpit em `http://127.0.0.1:54324`.
3. Abra o link no mesmo navegador em que o pedido foi feito. O fluxo é PKCE: o verificador fica no `localStorage` daquele navegador. O GoTrue desta versão coloca o token em `/redefinir-senha` no host da API; o gateway local encaminha esse endereço para `/auth/v1/verify`, que devolve o navegador à aplicação com o código.
4. A página `/redefinir-senha` grava a senha nova.

O teste Playwright faz esse caminho lendo a API do Mailpit. Se o link abrir em outro navegador, a troca do código falha; peça outro link no navegador em que vai concluir.

Confirmação de e-mail de produção e o visual do template ainda não estão configurados. Aqui o cadastro já entra.

## Runtime nativo do CLI

O CLI 2.121.0 sobe um Supabase nativo com `[experimental] stack = true` e `supabase start --runtime native`. A prova foi feita numa cópia em `/tmp`, com outro nome de stack e outras portas. A migration de identidade aplicou, e o JWT oficial autorizou as políticas. Esse stack não substitui o supervisor: `npm run supabase:start` continua no ambiente atual.

A troca recomendada é um corte só, com dump do banco de 54322, parada do supervisor e subida nativa nas mesmas portas usando `--eager`. Sem `--eager`, Auth e PostgREST encerram após 60 segundos ociosos. O CLI não importa sozinho o diretório `supabase/.runtime`. A ADR-018 guarda a decisão.
