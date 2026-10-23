# Beta web

Este documento prepara a primeira beta web. Nenhum Supabase hospedado, nenhuma conta na Cloudflare e nenhum deploy foram criados nesta etapa. O código de referência no GitHub, antes deste commit, é `main` em `c929448`.

Web e Android devem apontar para o mesmo backend beta. O Supabase local e os dados desta máquina ficam de fora.

## Ambientes

| Ambiente        | Backend                                         | Site                    | Dados                                  |
| --------------- | ----------------------------------------------- | ----------------------- | -------------------------------------- |
| Desenvolvimento | Supervisor local, Postgres em `127.0.0.1:54322` | `http://127.0.0.1:5173` | Persistidos nesta máquina. Não apagar. |
| Beta            | Projeto Supabase novo, criado à parte           | HTTPS próprio           | Banco vazio, sem cópia do local        |
| Produção futura | Outro projeto, ainda inexistente                | Outro domínio           | Não reutilizar segredo nem URL da beta |

Não há URL administrativa compartilhada. A chave `service_role`, a senha do Postgres, o token de deploy e a keystore não entram no frontend nem no Git.

O `supabase/config.toml` deste repositório é do projeto local `padre-identity-local`. O `site_url` é localhost e o cadastro está aberto. Não rode `supabase config push` desse arquivo contra a beta.

## Variáveis

O cliente lê `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY`. O nome existente permanece. Uma chave `sb_publishable_` também é aceita na build beta. `VITE_PUBLIC_WEB_ORIGIN` é a origem HTTPS dos e-mails. `VITE_APP_LINK_HOST`, quando existir, é só o hostname dessa origem.

Desenvolvimento continua em `.env.local`, gerado por `npm run supabase:start`. Esse arquivo é ignorado pelo Git.

A beta usa `.env.beta`, também ignorado. O modelo sem valores reais está comentado em `.env.example`.

```text
VITE_APP_ENV=beta
VITE_SUPABASE_URL=https://<projeto>.supabase.co
VITE_SUPABASE_ANON_KEY=<chave pública>
VITE_PUBLIC_WEB_ORIGIN=https://<site-beta>
VITE_APP_LINK_HOST=<site-beta>
```

Não defina `VITE_SUPABASE_URL_ANDROID` com `10.0.2.2` na beta. O celular usa a mesma URL HTTPS. `npm run build` continua sendo a build local e de depuração Android. `npm run build:beta` exige `VITE_APP_ENV=beta` ou `production`, HTTPS público e chave de cliente. Ela recusa localhost, `10.0.2.2`, HTTP e chave `service_role` ou `sb_secret_`. Se a configuração beta for inválida em tempo de execução, o cliente não cai no Supabase local: `readSupabaseEnv` devolve vazio e a tela diz que o servidor não está configurado.

`DATABASE_URL` fica só na máquina de quem opera o banco. Não recebe prefixo `VITE_`.

## Migrations

Há 18 arquivos em `supabase/migrations`, nesta ordem:

1. `20261018170000_identity.sql`
2. `20261018190000_sports_catalog.sql`
3. `20261018200000_friendships.sql`
4. `20261018210000_friendship_invoker.sql`
5. `20261018220000_meetups.sql`
6. `20261018230000_meetup_invite_links.sql`
7. `20261018240000_matches.sql`
8. `20261018250000_statistics.sql`
9. `20261019030042_player_relationships.sql`
10. `20261019032036_communities.sql`
11. `20261019092841_community_meetups.sql`
12. `20261019140000_historical_delete_guard.sql`
13. `20261019180000_community_messages.sql`
14. `20261019200000_community_polls.sql`
15. `20261019220000_venues.sql`
16. `20261019230000_venue_locations.sql`
17. `20261019240000_venue_statistics.sql`
18. `20261019250000_profile_details_and_player_cards.sql`

`20261019240000` e `20261019250000` não são horários civis válidos. São versões textuais já gravadas no banco local. Não as renomeie nem divida. A CLI 2.121.0, a mesma de `package.json`, aplicou as 18 num Postgres descartável durante a auditoria. O projeto hospedado já nasce com `auth.users` e os papéis `anon`, `authenticated` e `service_role`. O teste descartável precisou criar esses papéis porque era um Postgres vazio; o Supabase hospedado não precisa dessa etapa.

Quando o proprietário autorizar a aplicação, num checkout limpo e com o projeto beta já criado:

```bash
npx supabase link --project-ref <ref-da-beta>
npx supabase db push
```

Isso não roda neste documento. Não use `db reset`. Não copie o diretório `supabase/.runtime`. O link grava metadados em `supabase/.temp`, que o Git ignora. Confira no painel, depois do push, que tabelas novas do schema `public` não são expostas automaticamente. O `config.toml` local já pede `auto_expose_new_tables = false`, mas esse arquivo não deve ser enviado inteiro.

A migration de convites cria `extensions` e `pgcrypto` se ainda não existirem. O projeto hospedado já oferece esse schema.

## Auth

No projeto beta, no painel, e não no `config.toml` local:

- Site URL: `https://<site-beta>`
- Redirects adicionais, exatamente: `https://<site-beta>/redefinir-senha` e `https://<site-beta>/convite/*` se o provedor exigir o curinga do caminho de convite. Não inclua localhost.
- Confirmação de e-mail ligada. O ambiente local autoconfirma; a beta não herda isso.
- Cadastro público desligado. Veja a seção seguinte.
- Sessões anônimas desligadas.
- SMTP próprio para enviar a pessoas reais. O remetente embutido do plano gratuito não deve ser tratado como correio de produção. Confira o limite vigente no painel.

O cliente usa PKCE, grava a sessão no navegador e renova o token. Recuperação de senha chama `resetPasswordForEmail` com `${origem}/redefinir-senha`. Na web, a origem é `window.location.origin`. No Android, é `VITE_PUBLIC_WEB_ORIGIN`. O parâmetro `retorno` só vira caminho se for `/convite/` mais um token de 43 caracteres. `inviteEmailRedirect` recusa outra origem, query string e fragmento. A lista de redirects do Auth é a barreira contra um cliente modificado: um destino fora da lista não deve ser aceito pelo GoTrue.

O link de senha abre o site HTTPS. App Links ainda não estão configurados, então o APK não recebe essa sessão sozinho. A pessoa redefine a senha no site e entra de novo no aplicativo.

Rotas públicas: `/`, `/entrar`, `/cadastrar`, `/recuperar-senha`, `/redefinir-senha`, `/convite/:token`, `/modalidades`, `/comunidades`, `/comunidades/:slug`. Exigem sessão: encontros, locais, amigos, perfil e comunidade nova. Esconder o botão não é a autorização. Quem chamar a API sem sessão recebe a recusa do Postgres.

## Cadastro fechado

Três convites diferentes:

| Convite          | O que autoriza                                              | O que não autoriza        |
| ---------------- | ----------------------------------------------------------- | ------------------------- |
| Conta da beta    | Entrar na plataforma                                        | Participar de um encontro |
| Link de encontro | Entrar num encontro já existente, com token de uso limitado | Criar uma conta           |
| Comunidade       | Uma conta que já existe entra na comunidade                 | Criar uma conta           |

Recomendação para poucos participantes: desligar o cadastro no Auth do projeto beta e criar cada conta pelo painel, com o e-mail real da pessoa. O convite do painel é um convite de conta. O token de encontro continua só para encontro. A tela `/cadastrar` pode permanecer no cliente; com o cadastro desligado, o servidor recusa a criação. Não transforme o token de encontro em permissão de signup.

Para tirar alguém da beta, bloqueie o usuário no Auth. Isso revoga o acesso sem apagar partidas. Apagar a linha em `auth.users` só é seguro enquanto a proteção histórica não recusar a exclusão.

## RLS na internet

As tabelas sensíveis nascem com RLS forçado e `revoke all` para `anon` e `authenticated`. Não há política de leitura direta sobre detalhes pessoais, votos, notas das cartinhas nem locais. O acesso passa por funções. As funções públicas novas são `security invoker` e chamam corpos `security definer` em `private`, com `search_path` vazio.

`anon` executa, de propósito, só três funções privadas: listar comunidades públicas, ler uma comunidade sob a regra de visibilidade e pré-visualizar um convite de encontro pelo token. O catálogo esportivo ativo também é legível por `anon`. Perfil privado, altura, sexo, coordenadas, voto individual e nota individual não saem por `select` direto. Comunidade privada para quem está fora responde como não encontrada. Integrante que saiu perde o acesso de membro; o histórico da partida permanece.

Riscos que continuam sendo configuração, não código novo:

- Esquecer o cadastro desligado abre a beta para qualquer e-mail.
- O pré-visualizador de convite mostra dados do encontro a quem tem o token. É o desenho do link. O token não é conta.
- A chave anônima é pública e não pode ser a `service_role`. A build beta recusa essa troca. Não existe servidor próprio guardando a chave administrativa.

## Hospedagem

Recomendação: Cloudflare Pages.

Serve o `dist` do Vite, tem HTTPS, domínio próprio, variáveis de build e rollback por deployment. O arquivo `public/_redirects` já pede que qualquer caminho devolva `index.html` com status 200. Sem isso, atualizar `/perfil` ou `/comunidades/:slug` responderia 404. O Vite em desenvolvimento não usa esse arquivo.

Configuração, quando a conta existir:

- Comando: `npm run build:beta`
- Saída: `dist`
- Node 22
- Variáveis de ambiente da seção anterior, gravadas no painel da hospedagem, não no Git
- Sem workflow novo no repositório

Vercel também publica Vite e faz o fallback de SPA, mas acrescenta outra conta e o plano gratuito tem restrição de uso comercial. GitHub Pages exigiria Actions para injetar as variáveis e um `404.html` no lugar do `_redirects`. Por isso não é a opção desta beta.

Custos: os dois serviços têm faixa gratuita suficiente para poucos usuários. Confirme no painel, antes de publicar, o número de builds, a pausa do projeto Supabase por inatividade, o tamanho do banco e o limite de e-mails de Auth. Não há contrato pago criado por este repositório.

Rollback: no Pages, promova o deployment anterior. No banco, não apague migration aplicada. Uma correção entra como arquivo novo. Faça um backup pelo painel do Supabase antes do primeiro `db push`. O ambiente local não entra no rollback.

## Mapas

MapLibre carrega o estilo Liberty no tema claro e o Dark no escuro, ambos em `https://tiles.openfreemap.org`. Não há chave no cliente. A atribuição na tela é OpenFreeMap, OpenMapTiles e OpenStreetMap. O serviço público aceita o navegador e pode limitar uso ou ficar indisponível. A beta não tem SLA desse provedor. `VITE_MAP_STYLE_LIGHT` e `VITE_MAP_STYLE_DARK` podem apontar para outro estilo, se um dia existir, e também não devem carregar segredo.

## Fotos

A tela valida JPEG, PNG ou WebP de até 2 MB e recusa SVG. `avatarStorageAvailable` é `false`. `uploadAvatar` falha com a mensagem de armazenamento indisponível. Nada é gravado em Base64 nem em `bytea`. O banco só tem `avatar_path`, uma chave sem barra.

Para completar depois, no projeto beta:

- Bucket privado, sem leitura pública.
- Upload só do dono da conta, com tipo e tamanho limitados.
- Gravar a chave em `avatar_path`, não a URL permanente.
- Leitura por URL assinada e curta, e só quando o perfil público e `show_avatar` permitirem.
- Substituir apaga o objeto anterior. Excluir a conta ou desligar a foto remove o objeto.
- Sem essa peça, a beta não tem foto de perfil. A mensagem de indisponibilidade continua correta.

## Exclusão de conta

`private.protect_profile_delete` recusa apagar conta que seja dona de comunidade, organize encontro ou tenha partida confirmada. Isso preserva o histórico dos outros. Não é um fluxo de encerramento.

Ainda falta, num trabalho próprio: pedido da própria pessoa, confirmação da identidade, revogação das sessões, apagar altura, sexo e foto, anonimizar o que puder sair do histórico, transferir ou encerrar comunidades e encontros sob sua responsabilidade, e uma política de retenção. Não afirmar conformidade legal com o que existe hoje.

| Etapa                       | Bloqueio                                                                                                   |
| --------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Beta fechada, poucas contas | Aceitável se o bloqueio e a recusa de exclusão forem ditos aos participantes. Banir no Auth tira o acesso. |
| Beta com cadastro público   | Precisa do fluxo de pedido de exclusão antes de abrir o cadastro.                                          |
| Play Store                  | A política da loja pede exclusão de conta no aplicativo e na web. O estado atual bloqueia essa publicação. |

## Android

O mesmo React entra no WebView. `applicationId` atual: `com.padre.sportsclub.dev`. `versionName`: `0.1.0-dev`. Não é identificador de produção e não vai para a Play Store neste plano.

Depuração local: `npm run android:build:debug`. Pode usar HTTP e `10.0.2.2`.

APK de experimento contra a beta, sem distribuir:

```bash
npm run android:build:beta
```

Esse comando exige a configuração beta e sincroniza o Capacitor com `CAPACITOR_CLEARTEXT=0`. O APK continua assinado em debug e o identificador continua `.dev`. Não misture `.env.local` nessa build: o modo `beta` recusa o backend local. Não há segundo frontend.

## Dados

Não copiar os 894 perfis nem as 154 comunidades. Não copiar senha, sessão nem token. A beta começa vazia, fora do catálogo que as migrations inserem.

Contas piloto nascem pelo painel. Comunidades, locais, encontros e partidas nascem pela própria interface, com pessoas que concordaram em participar. Testes automatizados continuam criando usuários fictícios `@padre.test` só no banco local ou num Postgres descartável.

## Performance

As rotas pesadas já carregam sob demanda. O MapLibre fica num chunk separado, cerca de 1,1 MB sem comprimir e 296 kB em gzip, e só entra quando a tela do mapa abre. O primeiro carregamento ainda baixa dois chunks grandes, perto de 340 kB e 350 kB antes do gzip, este último nomeado a partir de `button`. Juntos passam de 200 kB gzip. As fontes Outfit e Source Sans 3 vêm do Google Fonts. Não há otimização extra recomendada antes da beta fechada. Se a rede móvel ficar lenta, a primeira medida é inspecionar esse chunk compartilhado, não reescrever o mapa.

## Testes de aceitação

Antes de abrir a beta para as pessoas convidadas:

1. `npm run build:beta` com as variáveis do projeto beta, e falha proposital se apontar para localhost.
2. Abrir direto `/entrar`, `/perfil`, `/encontros`, `/comunidades/<slug>` e `/locais` e receber o aplicativo, não 404.
3. Confirmar e-mail, entrar, sair, recuperar senha e voltar a `https://<site-beta>/redefinir-senha`.
4. Cadastro público recusado pelo Auth.
5. Conta criada pelo painel entra. Conta bloqueada deixa de entrar.
6. Perfil privado, comunidade privada, voto e nota individual continuam invisíveis para quem está fora.
7. Mapa claro e escuro carregam, com a atribuição visível.
8. Foto mostra a indisponibilidade. Nenhum arquivo fica gravado.
9. O APK beta, se for gerado, fala com o mesmo projeto e não usa HTTP claro.
10. O Supabase local e os dados desta máquina seguem iguais.

## Checklist de publicação

- [ ] Projeto Supabase novo, região escolhida, sem link com o runtime local.
- [ ] Backup do banco beta antes do primeiro `db push`.
- [ ] 18 migrations aplicadas, sem renomear versões.
- [ ] Exposição automática de tabelas novas desligada.
- [ ] Site URL e redirects só no HTTPS da beta.
- [ ] Confirmação de e-mail e SMTP conferidos.
- [ ] Cadastro público desligado.
- [ ] Variáveis só no painel da hospedagem.
- [ ] `npm run build:beta` verde.
- [ ] Cloudflare Pages com `dist` e o `_redirects` já versionado.
- [ ] Rollback ensaiado no Pages.
- [ ] Participantes informados sobre foto indisponível e exclusão de conta incompleta.
- [ ] Nenhum dado local copiado.

## O que o proprietário precisa fornecer

- Autorização para criar o projeto Supabase e a conta Cloudflare Pages.
- Região do banco e o hostname da beta, mesmo que seja um subdomínio `pages.dev` no começo.
- Lista curta de e-mails das primeiras contas.
- Um SMTP se os e-mails precisarem chegar a caixas reais.
- Confirmação de que o banco local não será copiado nem resetado.
- Confirmação de que o cadastro permanece fechado.
