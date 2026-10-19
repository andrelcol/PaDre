# Arquitetura

PaDre é uma aplicação web de página única apoiada em Supabase. O cliente React organiza a interface e as regras puras. PostgreSQL, com Row Level Security, é a fronteira de autorização e a fonte dos dados confirmados.

Nada disso está ligado a um projeto Supabase remoto. Identidade, catálogo, amizades, encontros, partidas, estatísticas e comunidades já têm migration versionada. O restante do esquema entra quando a fase correspondente for a base da etapa.

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

`meetups.community_id` é opcional. Nulo é encontro privado. Preenchido associa o encontro a uma comunidade e não muda depois. Apagar a comunidade não apaga o encontro. Partida pertence a um encontro. Ranking e transporte não ganham tabela própria até as fases que os implementam.

## Backend

- Supabase Auth identifica a pessoa. `profiles` completa o que o Auth não modela, com o mesmo UUID.
- PostgreSQL guarda o domínio. PostGIS entra na migration de locais (`geography(Point, 4326)`), não antes.
- O chat e as enquetes da comunidade atualizam a cada 15 segundos enquanto a página está visível. Realtime continua fora.
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

`meetup_invite_links` não tem `select` para o cliente. O preview público é `preview_meetup_invite`, `security invoker`, e o corpo em `private` devolve título, modalidade, formato, horário, nome do local e vagas. Endereço, e-mail, organizador e a lista de pessoas ficam de fora. `anon` executa esse corpo para o wrapper funcionar. O catálogo de comunidades públicas também é função anônima. As demais funções de `private` continuam fechadas. Entrar pelo link usa a mesma trava `for update` do encontro. A decisão está na [ADR-023](./DECISIONS.md).

### Autorização de partida

`matches`, `match_teams`, `match_players`, `match_results`, `match_confirmations` e `match_audit_logs` têm RLS forçado e nenhum `select`, `insert`, `update` ou `delete` para `anon` ou `authenticated`. Um gatilho recusa escrita fora das funções, inclusive a troca direta de `status` para `confirmed` e a alteração de partida já confirmada ou anulada. O sinal é o GUC `padre.match_write`.

A leitura é `list_meetup_matches`, que reutiliza `private.can_read_meetup`. A resposta traz username, escalação, placar vigente, confirmações dessa revisão e o histórico de ações. Não traz e-mail nem preferências.

Criar, escalar, gravar placar, enviar, revisar e anular exigem o organizador do encontro. Confirmar e contestar exigem um jogador escalado, e a confirmação grava o lado desse jogador. A trava é a linha do encontro e depois a linha da partida, a mesma ordem do cancelamento, para as duas operações não cruzarem. Duas confirmações de lados diferentes na mesma revisão fecham a partida uma vez. O corpo fica em `private`; o PostgREST vê só o wrapper `security invoker`. `anon` não executa essas funções. A decisão está na [ADR-024](./DECISIONS.md).

### Autorização do catálogo

`sports`, `sport_formats` e `scoring_rule_versions` têm RLS forçado. A política de leitura exige `active` na própria linha e nos pais. Não há política de insert, update ou delete, e esses comandos não são concedidos a `anon` nem a `authenticated`. A configuração da regra é validada por `private.scoring_config_is_valid` antes de gravar. O cliente confere de novo com Zod ao ler.

### Autorização de comunidades

`communities`, `community_members`, `community_invitations` e `community_sports` têm RLS forçado e nenhum privilégio de tabela para `anon` ou `authenticated`. Não há política de leitura: a consulta passa por função. A escrita direta é recusada pelo gatilho `private.protect_community_write`, que só libera a transação com `padre.community_write`. O `DELETE` de `postgres` continua livre para o cascade dos testes. O corpo é `security definer` com `search_path` vazio. O PostgREST vê o wrapper `security invoker`.

`anon` executa só `list_public_communities` e `get_community`, além das funções que já eram públicas. `get_community` de uma comunidade privada, para quem não é integrante ativo, devolve o mesmo erro de um slug inexistente. A lista de integrantes traz username e papel, e só para integrante ativo. Criar, entrar, sair, convidar, responder, cancelar, mudar papel, remover e trocar modalidades exigem `authenticated` e conferem `auth.uid()` dentro da função. O cliente não envia `created_by`, slug nem papel de proprietário.

A trava de criação é um `advisory lock` do slug. Entrada, convite e mudança de papel travam a linha da comunidade e o par comunidade/pessoa. Há um proprietário ativo por comunidade, por índice parcial. Convite pendente é único por comunidade e destinatário. A decisão está na [ADR-027](./DECISIONS.md).

Encontro comunitário usa as mesmas tabelas de encontro, partida e estatística. `list_community_meetups` só devolve linhas daquela comunidade para integrante ativo. Comunidade pública não abre o encontro para quem só descobriu o grupo. `can_read_meetup` separa os dois casos: encontro privado continua com organizador, confirmado ou convite pendente; encontro comunitário exige participação ativa agora. Uma presença antiga não mantém a leitura depois de sair ou ser removido.

Criar passa por `create_community_meetup`, que exige integrante ativo e modalidade ligada à comunidade, e grava o encontro na mesma transação do `create_meetup`, com a vaga de quem organiza. Entrar passa por `join_community_meetup`, com a mesma contagem `confirmed`. Convite interno e link são recusados quando `community_id` está preenchido. Proprietário e administrador da mesma comunidade podem cancelar o encontro de outro integrante. Administrador de outra comunidade não cancela, e encontro privado continua só com quem organiza. A edição geral continua com o organizador.

A ordem de trava nas operações comunitárias é a linha da comunidade, a participação da pessoa, os encontros por `id` e a participação no encontro. Saída e remoção liberam a vaga dos encontros futuros ainda agendados e preservam presença, escalação, resultado e contribuição de encontro que já começou. Quem organiza um encontro futuro precisa cancelá-lo antes de sair ou ser removido. Não há transferência de organização.

`communities.created_by`, o organizador do encontro, o criador da partida, o autor do resultado, a contribuição estatística e o autor da auditoria da partida usam `on delete restrict` a partir do perfil. O gatilho `private.protect_profile_delete` recusa a exclusão e explica a dependência quando a conta é proprietária, organiza encontro, registrou moderação, está na escalação de uma partida que já saiu do rascunho ou assinou resultado e auditoria. Conta sem esses vínculos ainda pode ser excluída. A transferência de propriedade, a transferência de organização e a anonimização continuam fora. A decisão está nas [ADR-028](./DECISIONS.md) e [ADR-029](./DECISIONS.md).

A enquete é `community_polls`, `community_poll_options` e `community_poll_votes`, com RLS forçado e sem privilégio de tabela para `anon` ou `authenticated`. Criar, listar, consultar, votar, encerrar e cancelar passam por funções. O corpo privilegiado fica em `private`, com `search_path` vazio. O wrapper público é `security invoker`. O voto individual não sai da função. O gatilho `protect_community_poll_write` recusa escrita sem `padre.poll_write`, impede mudar pergunta, opção ou autoria, e ainda confere `auth.uid()` no voto quando a sessão não é de manutenção. A decisão está na [ADR-031](./DECISIONS.md). O detalhe do cálculo está em [POLLS.md](./POLLS.md).

O chat é uma tabela, `community_messages`, com RLS forçado e sem privilégio de tabela para `anon` ou `authenticated`. A escrita passa por `send_community_message` e `delete_community_message`. A leitura passa por `list_community_messages`. O corpo privilegiado fica em `private`, com `search_path` vazio. O wrapper público é `security invoker`. Só integrante ativo lê e envia, em comunidade pública ou privada. Descobrir a comunidade, ter convite pendente ou ser amigo de um integrante não abre o chat. O gatilho `protect_community_message_write` recusa escrita sem `padre.message_write` e impede trocar autor, comunidade, pedido ou data. `author_id` usa `on delete cascade`: a conta que já pode ser excluída leva as próprias mensagens, e o chat não entra na trava de histórico esportivo. `deleted_by` usa `on delete set null`. A decisão está na [ADR-030](./DECISIONS.md).

### Autorização prevista

Toda tabela exposta ao cliente terá política. O desenho, ainda sem SQL:

| Dado                    | Quem lê                                                                             | Quem escreve                                                                             |
| ----------------------- | ----------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| Perfil                  | A própria pessoa; outras, conforme a visibilidade                                   | A própria pessoa                                                                         |
| Amizade                 | Só os dois envolvidos                                                               | Funções: pedir, aceitar, recusar, cancelar, remover                                      |
| Local                   | Quem vê um encontro que o usa, ou quem criou                                        | Quem cria; edição por quem criou                                                         |
| Encontro e presenças    | Privado: organizador, confirmado ou convite pendente. Comunitário: integrante ativo | Funções: criar, editar, convidar no privado, entrar direto na comunidade, sair, cancelar |
| Catálogo esportivo      | Anônimo e autenticado, só linhas ativas                                             | Ninguém no cliente. Só migration                                                         |
| Convite por link        | Preview estreito, sem a tabela                                                      | Organização gera e revoga. Entrada por função                                            |
| Partida e resultado     | Quem vê o encontro, pela função de lista                                            | Organização cria e revisa. Cada lado confirma o próprio                                  |
| Projeção de estatística | A própria pessoa; confirmados do mesmo encontro                                     | Nenhum cliente. Só `private.project_match_statistics`                                    |

Esconder botão não é permissão. Funções `security definer`, quando existirem, checam o mesmo critério e não recebem a chave de serviço no browser.

## Estatísticas

Estados que contam: partida `confirmed` com a revisão vigente do resultado. Rascunho, pendente, contestada e anulada ficam de fora. O cálculo está em [STATISTICS.md](./STATISTICS.md).

`resolveOutcome`, no cliente, e `private.resolve_match_outcome`, no banco, interpretam o placar da versão gravada na partida e devolvem lado vencedor ou empate. A gravação persiste esse desfecho. O cliente não escolhe o vencedor.

`match_player_statistics` guarda uma contribuição por jogador escalado e por partida. A chave primária é `(match_id, user_id)`. A modalidade e o formato vêm da versão da regra gravada na partida, não do formato atual do encontro. Métrica que o tipo da regra não produz fica nula. Pontos de vôlei, gols de futsal e games de beach tennis não se somam. O tiebreak não entra em games. O super tiebreak fica em `deciding_points_for` e `deciding_points_against`.

`private.confirm_match` chama `private.project_match_statistics` na mesma transação, depois de gravar `confirmed`. Se a projeção falhar, a confirmação volta atrás. A função trava a partida, substitui as linhas daquela partida e apaga quem saiu da escalação. Partida que não está `confirmed` perde as contribuições. Reprocessar uma pessoa ou o histórico inteiro chama a mesma função, só como `postgres`. Não há tabela agregada: `my_statistics` e `meetup_participant_statistics` somam as contribuições.

A leitura individual agrupa por modalidade e, dentro dela, por formato. Companheiro e adversário saem da mesma contribuição, cruzada com o lado em `match_teams`. Não há tabela de dupla. O destaque de melhor companheiro e de adversário mais difícil exige cinco partidas na modalidade escolhida. O local do encontro continua fora. O cálculo está em [STATISTICS.md](./STATISTICS.md).

## Tempo

Instantes em `timestamptz`. Perfil e encontro guardam um nome de fuso IANA. A tela formata o horário nesse fuso. "Dia do jogo" usa o fuso do encontro, não o fuso do navegador de quem consulta.

## Convites

O link de encontro carrega 32 bytes aleatórios, em base64url. O banco guarda o SHA-256. O token cru volta só na geração e a tela não consegue mostrá-lo de novo depois de recarregar. A validade é o menor prazo entre sete dias e o início do encontro. Há um link não revogado por encontro; gerar outro revoga o anterior. Quem já confirmou permanece. O resgate não cria amizade e não reabre quem saiu. O cadastro volta para `/convite/:token` e a vaga só entra num clique explícito.

## Mapas e transporte

MapLibre consome os pontos quando a fase de mapa chegar. Transporte público, mais à frente, lê a coordenada do local por um serviço externo. O núcleo de encontros não depende desse serviço.

## Qualidade

TypeScript `strict`. ESLint e Prettier no código. Vitest e Testing Library nas regras e na interface. Playwright no fluxo do navegador. Um mock não ocupa o lugar de uma função que a etapa deveria ter entregue de verdade.

## Riscos

- Payload de placar flexível vira gaveta se a validação atrasar. A configuração da regra e o placar jogado são validados no banco, com o mesmo contrato no Zod da tela.
- Política RLS frouxa vaza histórico. Cada tabela nova sai com teste de permissão, não só com a migration.
- Qualquer escrita direta na projeção faz a estatística divergir. A política nega escrita do cliente.
- `timestamp` sem fuso, ou data civil guardada como texto, quebra o dia do jogo.
- Token de convite em log, analytics ou query string persistida equivale a vazamento do próprio convite.

## Fora desta etapa

Mapa, desempenho por local, ranking e Realtime continuam de fora. O chat coletivo e a enquete da comunidade já existem. A identidade local — conta, sessão e perfil — está descrita em [LOCAL_DEVELOPMENT.md](./LOCAL_DEVELOPMENT.md).
