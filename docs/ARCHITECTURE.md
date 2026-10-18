# Arquitetura

PaDre é uma aplicação web de página única apoiada em Supabase. O cliente React organiza a interface e as regras puras. PostgreSQL, com Row Level Security, é a fronteira de autorização e a fonte dos dados confirmados.

Nada disso está ligado a um projeto Supabase remoto. Identidade, catálogo, amizades e encontros já têm migration versionada. O restante do esquema entra quando a fase correspondente for a base da etapa.

## Estilo

Monólito modular no frontend: um pacote, vários domínios. Um monorepo só se justifica quando surgir um segundo deploy. Evita-se tanto a pasta única de componentes quanto uma camada genérica que todo domínio é obrigado a atravessar.

```text
src/
  app/            composição: rotas, providers
  pages/          telas que montam um domínio ou a casca
  domains/
    <domínio>/
      components/ interface
      model/      regras puras, sem React e sem Supabase
      api/        acesso a dados
  shared/         ui, utilitários sem regra de produto
```

Um componente lê o resultado de uma regra ou dispara um comando. Ele não decide vencedor, visibilidade ou validade de convite.

Estado de servidor fica no TanStack Query. Zod valida o que cruza a borda: formulário, payload de placar e resposta externa. Tipos do banco não substituem essa validação.

## Domínios

| Domínio       | Responsabilidade                                    | Não é                      |
| ------------- | --------------------------------------------------- | -------------------------- |
| `identity`    | Perfil, fuso e privacidade                          | Amizade                    |
| `friendships` | Pedido, aceite e bloqueio entre duas pessoas        | Vaga em comunidade         |
| `communities` | Grupo, papéis e administradores                     | O encontro em si           |
| `meetups`     | Encontro, horário, local e confirmação de presença  | Partida                    |
| `invites`     | Convite direto e link, com prazo e token            | A lista de participantes   |
| `sports`      | Modalidade, formato e regra de pontuação versionada | Resultado de uma partida   |
| `matches`     | Partida, lados, atletas e resultado confirmado      | Estatística acumulada      |
| `statistics`  | Projeções reprocessáveis a partir de resultados     | Fonte de verdade           |
| `places`      | Local com ponto geográfico                          | Mapa ou transporte         |
| `messaging`   | Chat e enquetes de encontro ou comunidade           | Comentário solto no perfil |
| `rankings`    | Ordenação derivada das projeções, num escopo        | Número mantido à mão       |

Encontro pode ter `community_id` nulo. Partida pertence a um encontro. Ranking e transporte não ganham tabela própria até as fases que os implementam.

## Backend

- Supabase Auth identifica a pessoa. `profiles` completa o que o Auth não modela, com o mesmo UUID.
- PostgreSQL guarda o domínio. PostGIS entra na migration de locais (`geography(Point, 4326)`), não antes.
- Realtime entra com chat e enquete. Não há canal aberto nesta etapa.
- A chave `anon` pode ir para o cliente. A `service_role` não vai. Ela não autoriza leitura; as políticas autorizam.
- Mudança de esquema só por arquivo em `supabase/migrations`, na ordem, aplicado primeiro num Supabase local.
- O ambiente local desta máquina não tem Docker. `npm run supabase:start` sobe os mesmos serviços por um runtime compatível, sem projeto remoto. O procedimento está em [LOCAL_DEVELOPMENT.md](./LOCAL_DEVELOPMENT.md).

### Autorização de identidade

`profiles` é o que outra pessoa autenticada pode ver quando `visibility = public`: `username`, `display_name` e a própria visibilidade. `profile_preferences` guarda o fuso e só o dono lê. Anônimo não recebe `select`. Não há política de insert nem delete para o cliente: o perfil nasce no gatilho de `auth.users`. Detalhe e políticas em [LOCAL_DEVELOPMENT.md](./LOCAL_DEVELOPMENT.md).

### Autorização de amizade

`friendships` tem RLS forçado. `authenticated` só lê a linha em que é solicitante ou destinatário. Não há `insert`, `update` nem `delete` para o cliente. Um gatilho recusa escrita que não venha da função, inclusive a troca direta de `status` para `accepted`. As funções são `security definer` porque precisam achar um username de perfil privado e gravar a linha sem abrir o restante do perfil. O corpo fica em `private`. O que o PostgREST expõe são três funções estreitas, sem id de terceiro e com `auth.uid()` conferido dentro. `search_path` vazio. `anon` não executa nem lê.

A política de `profiles` não consulta `friendships`, e a de `friendships` não consulta `profiles`. A leitura do username passa pela função, não por uma política cruzada.

As três funções públicas de amizade são `security invoker`. O corpo que lê perfil privado continua em `private`, que o PostgREST não expõe (`db-schemas = "public"`). `authenticated` executa esses corpos; `anon` não. A mesma divisão vale para os encontros.

### Autorização de encontro

`meetups`, `meetup_participants` e `meetup_invitations` têm RLS forçado. Lê o encontro quem organiza, quem está confirmado ou quem tem convite pendente. A lista de convites fica com o organizador e com o próprio convidado. Não há `insert`, `update` nem `delete` para o cliente. Um gatilho recusa escrita fora das funções, inclusive troca de `organizer_id` e de timestamps.

A vaga sobe só dentro da função, com `select for update` na linha do encontro. Aceitar, criar e qualquer aumento usam essa trava. A política de leitura chama `private.can_read_meetup`, `security definer`, para não fazer a política de uma tabela ler a outra sob RLS.

O username dos participantes sai de `get_meetup` e `list_my_meetups`. `profiles` e `profile_preferences` não se abrem por causa do encontro.

`meetup_invite_links` não tem `select` para o cliente. O preview público é `preview_meetup_invite`, `security invoker`, e o corpo em `private` devolve título, modalidade, formato, horário, nome do local e vagas. Endereço, e-mail, organizador e a lista de pessoas ficam de fora. `anon` executa só esse corpo, para o wrapper funcionar, e não executa as outras funções de `private`. Entrar pelo link usa a mesma trava `for update` do encontro. A decisão está na [ADR-023](./DECISIONS.md).

### Autorização do catálogo

`sports`, `sport_formats` e `scoring_rule_versions` têm RLS forçado. A política de leitura exige `active` na própria linha e nos pais. Não há política de insert, update ou delete, e esses comandos não são concedidos a `anon` nem a `authenticated`. A configuração da regra é validada por `private.scoring_config_is_valid` antes de gravar. O cliente confere de novo com Zod ao ler.

### Autorização prevista

Toda tabela exposta ao cliente terá política. O desenho, ainda sem SQL:

| Dado                    | Quem lê                                             | Quem escreve                                        |
| ----------------------- | --------------------------------------------------- | --------------------------------------------------- |
| Perfil                  | A própria pessoa; outras, conforme a visibilidade   | A própria pessoa                                    |
| Amizade                 | Só os dois envolvidos                               | Funções: pedir, aceitar, recusar, cancelar, remover |
| Comunidade e membros    | Membros; comunidade pública só no que for público   | Administradores; a pessoa sai da própria vaga       |
| Local                   | Quem vê um encontro que o usa, ou quem criou        | Quem cria; edição por quem criou                    |
| Encontro e presenças    | Organizador, confirmado ou convite pendente        | Funções: criar, editar, convidar, aceitar, sair, cancelar, entrar por link |
| Catálogo esportivo      | Anônimo e autenticado, só linhas ativas             | Ninguém no cliente. Só migration                    |
| Convite por link        | Preview estreito, sem a tabela                      | Organização gera e revoga. Entrada por função       |
| Partida e resultado     | Quem vê o encontro                                  | Organização, enquanto rascunho. Confirmação única   |
| Projeção de estatística | Conforme a privacidade de quem é medido             | Nenhum cliente. Só a função de projeção             |

Esconder botão não é permissão. Funções `security definer`, quando existirem, checam o mesmo critério e não recebem a chave de serviço no browser.

## Estatísticas

Estados que contam: partida `confirmed` com a revisão vigente do resultado. Rascunho e partida anulada ficam de fora.

Uma função pura, por tipo de regra, interpreta o placar e devolve lado vencedor ou empate. A confirmação grava esse desfecho junto do resultado, calculado, não digitado. A projeção agrega desfechos.

A única escritora das projeções é uma função idempotente por partida: apaga as linhas daquela partida e as reinsere a partir do resultado vigente. Reprocessar é chamá-la para cada partida confirmada. Gatilho, job e correção usam o mesmo caminho. Não existe contador de vitórias atualizado por fora.

As quatro leituras do produto saem dessa projeção, sempre filtradas por modalidade:

- individual
- confronto direto
- companheiros de lado
- local do encontro

## Tempo

Instantes em `timestamptz`. Perfil e encontro guardam um nome de fuso IANA. A tela formata o horário nesse fuso. "Dia do jogo" usa o fuso do encontro, não o fuso do navegador de quem consulta.

## Convites

O link de encontro carrega 32 bytes aleatórios, em base64url. O banco guarda o SHA-256. O token cru volta só na geração e a tela não consegue mostrá-lo de novo depois de recarregar. A validade é o menor prazo entre sete dias e o início do encontro. Há um link não revogado por encontro; gerar outro revoga o anterior. Quem já confirmou permanece. O resgate não cria amizade e não reabre quem saiu. O cadastro volta para `/convite/:token` e a vaga só entra num clique explícito.

## Mapas e transporte

MapLibre consome os pontos quando a fase de mapa chegar. Transporte público, mais à frente, lê a coordenada do local por um serviço externo. O núcleo de encontros não depende desse serviço.

## Qualidade

TypeScript `strict`. ESLint e Prettier no código. Vitest e Testing Library nas regras e na interface. Playwright no fluxo do navegador. Um mock não ocupa o lugar de uma função que a etapa deveria ter entregue de verdade.

## Riscos

- Payload de placar flexível vira gaveta se a validação atrasar. A configuração da regra já é validada. A fase de partidas valida o placar jogado.
- Política RLS frouxa vaza histórico. Cada tabela nova sai com teste de permissão, não só com a migration.
- Qualquer escrita direta na projeção faz a estatística divergir. A política nega escrita do cliente.
- `timestamp` sem fuso, ou data civil guardada como texto, quebra o dia do jogo.
- Token de convite em log, analytics ou query string persistida equivale a vazamento do próprio convite.

## Fora desta etapa

Partida, comunidade, chat e mapa continuam de fora. A identidade local — conta, sessão e perfil — está descrita em [LOCAL_DEVELOPMENT.md](./LOCAL_DEVELOPMENT.md).
