# Decisões

Registro das escolhas que já condicionam o código. Cada uma pode ser revista, mas a revisão precisa dizer o que muda nas fases já previstas em [ROADMAP.md](./ROADMAP.md).

## ADR-001 — Supabase como plataforma

- Status: aceita
- Contexto: o produto precisa de autenticação, Postgres, autorização por linha, tempo real e, em seguida, geografia. A equipe quer avançar por fatias verticais.
- Decisão: Supabase (Auth, Postgres, Realtime) é o backend. Não há API própria nesta fundação.
- Consequências: regras críticas ficam em SQL e em funções do banco. O cliente usa a chave anônima. Trocar de backend mais tarde custa uma reescrita da camada `api/` e das políticas.
- Alternativas: API Node separada dá mais liberdade e o dobro de operação para o estágio atual. Firebase enfraquece consultas relacionais de confronto e local.

## ADR-002 — Um pacote, organizado por domínio

- Status: aceita
- Contexto: vários contextos (amizade, comunidade, encontro, partida) precisam de fronteira sem o custo de um monorepo.
- Decisão: um app Vite. Código de produto em `src/domains/<domínio>`, separado em interface, regra pura e acesso a dados. Composição em `src/app`.
- Consequências: é simples de navegar. Um domínio não importa a tela de outro; se precisar de um fato, passa por `model` ou por uma consulta explícita.
- Alternativas: camadas globais `components/hooks/services` misturam regras. Monorepo agora seria estrutura vazia.

## ADR-003 — Resultado confirmado é a fonte de verdade

- Status: aceita
- Contexto: estatística guardada por conta própria diverge quando uma partida é corrigida ou anulada.
- Decisão: só partida `confirmed`, com a revisão vigente do resultado, alimenta números. A projeção é apagada e reinserida por partida, de forma idempotente, e pode ser reprocessada inteira pela mesma função.
- Consequências: correção fica mais trabalhosa do que um `update` no contador, e o número permanece explicável.
- Alternativas: contadores incrementais são rápidos e frágeis. View materializada sem função única de escrita dificulta o reprocessamento parcial.

## ADR-004 — Pontuação é regra versionada, não um inteiro comum

- Status: aceita
- Contexto: vôlei, futsal e beach tennis não produzem o mesmo tipo de resultado. Novas modalidades vão entrar.
- Decisão: modalidade, formato e regra de pontuação são entidades. A regra tem tipo (`set_based`, `goal_based`, `game_based` ou outro futuro) e versão imutável. A partida referencia essa versão. O desfecho sai de uma função pura daquele tipo.
- Consequências: o catálogo carrega complexidade que um placar único evitaria. O histórico sobrevive a uma mudança de regulamento.
- Alternativas: uma coluna `score` obriga gambiarra no segundo esporte. Uma classe por modalidade no código trava o catálogo a um deploy.

## ADR-005 — RLS é a autorização de verdade

- Status: aceita
- Contexto: esconder ação na interface não protege a API do Supabase, que fica exposta com a chave anônima.
- Decisão: toda tabela acessível pelo cliente nasce com política. Funções privilegiadas repetem a checagem. A chave `service_role` não entra no frontend nem no repositório.
- Consequências: algumas consultas pedem modelagem cuidadosa para não ficarem lentas ou permissivas demais. Teste de permissão faz parte da fase que cria a tabela.
- Alternativas: autorização só no cliente é insegura. Um BFF exclusivo adia o problema e adiciona um serviço.

## ADR-006 — Instante universal e fuso nomeado

- Status: aceita
- Contexto: encontros acontecem num local, e quem consulta pode estar em outro fuso.
- Decisão: horários em `timestamptz`. Perfil e encontro guardam fuso IANA. O dia do jogo é calculado no fuso do encontro.
- Consequências: a interface precisa formatar de propósito. Não se guarda hora local numa coluna sem fuso.
- Alternativas: `timestamp` local perde o instante quando o fuso muda ou quando duas pessoas comparam agendas.

## ADR-007 — Convite com hash, prazo e resgate no servidor

- Status: aceita
- Contexto: o link chega a quem não tem conta. Quem obtiver o token não pode ler a tabela de convites.
- Decisão: pelo menos 128 bits de entropia, somente o hash persistido, expiração obrigatória, limite de usos e resgate por função. Cliente anônimo não faz `select` em convites.
- Consequências: depurar um link exige o token original, que não está no banco. É o comportamento desejado.
- Alternativas: token em texto puro simplifica o suporte e vaza com qualquer leitura da tabela.

## ADR-008 — Encontro não depende de comunidade

- Status: aceita
- Contexto: muita partida é marcada entre amigos, sem grupo formal.
- Decisão: `community_id` do encontro é opcional. Comunidade, quando existe, organiza membros e pode agrupar encontros.
- Consequências: visibilidade e permissão do encontro não podem assumir um administrador de comunidade.
- Alternativas: obrigar comunidade empurra uso casual para grupos descartáveis.

## ADR-009 — Amizade separada de comunidade

- Status: aceita
- Contexto: estar num grupo de beach tennis não significa amizade, e amigo não entra sozinho em toda comunidade.
- Decisão: tabelas e políticas distintas. Bloqueio de amizade não remove, por si, uma vaga de comunidade; as regras de visibilidade é que consultam o bloqueio.
- Consequências: duas relações para manter, sem efeito colateral escondido.
- Alternativas: um grafo social único mistura papéis e complica a saída de um grupo.

## ADR-010 — TypeScript 6 em modo strict

- Status: aceita
- Contexto: o template atual do Vite usa TypeScript 6. A linha 7 já aparece no registro, mas `typescript-eslint` ainda declara suporte até a 6.0.x.
- Decisão: TypeScript `~6.0`, `strict` ligado, `erasableSyntaxOnly` herdado do template. Sem `enum`: uniões de literais. `paths` do alias `@/` não usam `baseUrl`, que o TypeScript 6 já trata como obsoleto.
- Consequências: ao adotar TypeScript 7 será preciso confirmar o lint antes de subir a faixa.
- Alternativas: TypeScript 7 agora deixaria o ESLint sem suporte declarado.

## ADR-011 — ESLint e Prettier, além do oxlint do template

- Status: aceita
- Contexto: o template recente do Vite traz oxlint. O padrão pedido para o produto é ESLint e Prettier.
- Decisão: ESLint em flat config, Prettier separado, `eslint-config-prettier` para não disputar estilo. oxlint não fica como segundo lint obrigatório.
- Consequências: uma ferramenta a menos no script de verificação.
- Alternativas: manter os dois gera avisos duplicados sem proteger mais o produto.

## ADR-012 — Sem esquema definitivo nesta fase

- Status: cumprida na Fase 0; a Fase 1 aplicou a migration que esta decisão já previa
- Contexto: criar tabelas antes de fechar o modelo conceitual fixa nomes e relações cedo demais. Também não há pedido para usar um projeto Supabase remoto.
- Decisão: a Fase 0 não adiciona migration, não instala o cliente Supabase e não altera projeto remoto. A primeira migration acompanha contas e perfil.
- Consequências: a Fase 0 não autenticava. A Fase 1 adicionou `supabase/migrations/20261018170000_identity.sql` e o cliente com a chave anônima. Continua sem projeto remoto.
- Alternativas: subir um esquema "provisório" costuma virar o esquema real.

## ADR-013 — Inglês no código, português na interface

- Status: aceita
- Contexto: o produto é usado em português e as bibliotecas, em inglês.
- Decisão: módulos, tipos e colunas em inglês. Textos visíveis e documentação de produto em português.
- Consequências: o glossário do modelo de domínio é a ponte entre os dois vocabulários.
- Alternativas: código em português dificulta biblioteca, log e contribuição. Interface em inglês afasta o uso previsto.

## ADR-014 — Visibilidade padrão

- Status: revista pela ADR-017
- Contexto: histórico esportivo é mais sensível do que o nome.
- Decisão proposta na fundação: nome e avatar públicos; histórico e estatísticas visíveis para amigos; encontro novo começa como `invite_only`.
- Consequências: a Fase 1 não criou colunas de histórico nem de estatística. O padrão do perfil mudou antes de haver dados reais. Encontro `invite_only` continua valendo para a fase de encontros.
- Alternativas: tudo público maximiza descoberta e exposição. Tudo privado dificulta o primeiro convite.

## ADR-015 — Node.js 22

- Status: aceita
- Contexto: a máquina de desenvolvimento estava no Node 20.19. React Router 8, Vitest 5 e jsdom 30 declaram Node `^22.22.2` ou mais novo. O npm 12, que contorna uma falha do npm 10.8 ao resolver o Vite 8, também exige essa faixa.
- Decisão: o projeto pede Node `>=22.22.2`, com `.nvmrc` em 22.23.3. O Node padrão do ambiente não foi alterado.
- Consequências: quem abrir o repositório no Node 20 precisa trocar de versão antes de instalar e testar.
- Alternativas: segurar React Router 7, Vitest 4 e jsdom 26 só para permanecer no Node 20 deixaria a fundação uma geração atrás das bibliotecas estáveis atuais.

## ADR-016 — Supabase local sem Docker e sem projeto remoto

- Status: aceita; o destino desta máquina foi revisto pela ADR-018
- Contexto: a máquina de desenvolvimento não tem Docker, e um `supabase link` reutilizaria outro projeto chamado PaDre. A fase pede persistência real e RLS.
- Decisão: o CLI oficial fica como dependência (`supabase` 2.121.0) e o `config.toml` usa `project_id = "padre-identity-local"`. Sem Docker, `npm run supabase:start` sobe Postgres 17 embutido na porta 54322, GoTrue, PostgREST, Mailpit e um gateway em 127.0.0.1:54321. Segredos ficam em `supabase/.runtime`, ignorado pelo Git. A chave anônima vai para `.env.local`. A `service_role` não é escrita em variável `VITE_`.
- Consequências: o ambiente é independente do Postgres da porta 5432 e de qualquer projeto remoto. O `config.toml` continua válido para o CLI. A ADR-018 registra que o runtime nativo do CLI já funciona nesta máquina e passa a ser o destino, sem trocar o supervisor nesta etapa.
- Alternativas: exigir Docker pararia a fase. Uma máquina virtual só para o CLI seria mais pesada do que os binários já usados pelo CLI.

## ADR-017 — Perfil público separado das preferências

- Status: aceita; revisa a ADR-014 para a identidade
- Contexto: a fundação sugeria nome público e histórico visível para amigos. Amizade ainda não existe, e fuso horário não deve vazar na leitura do perfil.
- Decisão: `auth.users` é a conta. `profiles.id` é o mesmo UUID. `profiles` guarda `username`, `display_name`, `visibility`, `created_at` e `updated_at`. `profile_preferences` guarda `timezone`. Visibilidade inicial é só `private` ou `public`, padrão `private`. Username é normalizado com `trim` + minúsculas e precisa casar `^[a-z][a-z0-9_]{2,29}$`. `display_name` aceita acento, de 1 a 80 caracteres. Fuso é um nome IANA, padrão `America/Sao_Paulo`. O gatilho `private.handle_new_user` cria as duas linhas, ignora visibilidade e papel vindos do cliente e recusa username inválido. Outro gatilho força `role = authenticated`. Leitura de perfil público exige sessão. Preferências não entram nessa leitura.
- Consequências: não há página para folhear perfis de outras pessoas; a política já permite a leitura autenticada do perfil público. `friends` fica para a fase de amizades. No ambiente local o GoTrue confirma o e-mail sozinho para o fluxo ser testável; produção ainda não está configurada.
- Alternativas: uma tabela só misturaria fuso com dado público. Confiar no metadata para papel ou visibilidade inicial abriria elevação de privilégio.

## ADR-018 — Runtime nativo oficial, sem trocar o ambiente agora

- Status: aceita
- Contexto: o supervisor manual em `scripts/local-supabase.mjs` existe porque não havia Docker. O CLI 2.121.0, com `[experimental] stack = true`, sobe o mesmo projeto como processos nativos no Linux amd64 com glibc 2.35 ou mais recente. Esta máquina tem glibc 2.39. O comando `supabase start` sem essa opção continua exigindo Docker e não aceita `--runtime`.
- Decisão: o ambiente em uso continua sendo o supervisor manual, nas portas 54321, 54322, 54324 e 54325. A instância nativa foi criada à parte, em `/tmp`, com `--stack audit` e portas escolhidas pelo CLI. Ela aplicou `20261018170000_identity.sql` sem o prelúdio de papéis do script. Cadastro, login, sessão, perfil, RLS e recuperação de senha passaram com o JWT do Auth oficial. A troca do ambiente do repositório fica para um corte único: parar o supervisor, subir o stack nativo nas mesmas portas com `--eager` e restaurar um dump. O CLI não converte dados entre runtimes.
- Consequências: diferenças que só existem no supervisor — `search_path` do `postgres`, `GOTRUE_JWT_DEFAULT_GROUP_NAME` e o encaminhamento de `/redefinir-senha` no gateway — não são necessárias no Auth oficial. O link oficial já nasce em `/auth/v1/verify` com `redirect_to` em `/redefinir-senha`. O stack experimental não tem garantia de compatibilidade entre versões, para serviços ociosos depois de 60 segundos sem `--eager`, e guarda dados em `~/.supabase`, fora do diretório do projeto. O cache dessa prova ocupou cerca de 1,5 GB.
- Alternativas: migrar no meio da auditoria derrubaria o banco que os testes já usam. Permanecer no supervisor para sempre deixaria o projeto dependente de um gateway e de um GoTrue configurados à mão.

## ADR-019 — Catálogo versionado, sem motor de partida

- Status: aceita
- Contexto: a ADR-004 separa modalidade, formato e regra versionada. A fase pede esses dados no banco, leitura para anônimo e autenticado, e nenhuma escrita pelo cliente. O roteiro também mencionava uma função de desfecho. Calcular vencedor sem partida gravada antecipa o domínio de partidas.
- Decisão: três tabelas, `sports`, `sport_formats` e `scoring_rule_versions`. O slug da modalidade continua com hífen, como já estava na aplicação (`beach-volleyball`, não `beach_volleyball`). Jogadores ficam no formato, em mínimo e máximo. A regra guarda tipo, origem e um JSONB só com as chaves daquele tipo. Origem `official_summary` registra o formato do placar de uma competição conhecida, não o regulamento inteiro. Origem `app_proposal` é uma proposta do PaDre: vôlei 4x4, areia 4x4, beach tennis e futevôlei 2x2 a 18 pontos. A versão é imutável; uma partida futura aponta para o UUID da versão. A tela só lê.
- Consequências: uma regra errada não se corrige com `update` no JSON. Cria-se a versão seguinte. O desfecho da partida continua fora desta fase.
- Alternativas: um JSONB único por modalidade misturaria 6x6 e 4x4. Tratar futevôlei como formato de vôlei de areia apagaria a fronteira que o modelo já tinha. Implementar `resolveOutcome` agora testaria um placar que ainda não existe.

## ADR-020 — Amizade é um par, e não abre o perfil

- Status: aceita
- Contexto: a amizade precisa ser a mesma dos dois lados, sem duas linhas concorrentes. O perfil nasce privado. A ADR-017 adiou a visibilidade `friends`. O roteiro também previa bloqueio.
- Decisão: uma linha em `friendships`, única pelo par ordenado. O estado muda só pelas funções. Recusa, cancelamento e remoção esperam 24 horas antes de um novo pedido, e cada pessoa tem no máximo 30 pedidos de saída pendentes. Essas travas ficam no banco. A descoberta é o username exato: a função devolve esse username para quem participa da relação, mesmo com perfil privado, e nada além disso. `display_name`, e-mail e `profile_preferences` continuam fora. Não há visibilidade `friends` nesta fase. Bloqueio futuro é outra tabela, lida pelas mesmas funções, sem apagar a amizade nem a vaga em comunidade.
- Consequências: reenviar no mesmo dia falha de propósito. Um perfil privado segue ilegível por `select` em `profiles`. O bloqueio ainda não esconde ninguém.
- Alternativas: duas linhas espelhadas duplicam a relação sob concorrência. Abrir o perfil inteiro para amigos antecipa o compartilhamento de histórico. Tratar bloqueio como estado desta tabela misturaria “não quero esta amizade” com “não quero ser encontrado”.

## ADR-021 — Função pública não roda como dono do banco

- Status: aceita
- Contexto: `request_friendship`, `respond_to_friendship` e `list_my_friendships` nasceram `security definer` no schema `public`, o único que o PostgREST expõe. O corpo já estava em `private`, com `search_path` vazio e `auth.uid()` conferido. `anon` não executava. O risco que restava era uma função privilegiada no schema da API, rodando como superusuário.
- Decisão: as três funções públicas passaram a `security invoker` e só delegam ao corpo em `private`. `authenticated` recebe `EXECUTE` nesses corpos para a delegação funcionar. `anon` não recebe. `private` continua fora de `db-schemas`. `username_is_available` segue `security definer` porque o anônimo precisa de um booleano e não lê o perfil.
- Consequências: um erro no wrapper público usa o privilégio de quem chama. O corpo privilegiado ainda confia no `auth.uid()` que o gateway grava a partir do JWT verificado.
- Alternativas: deixar o definer no schema exposto concentrava o privilégio na função que o cliente chama. Conceder o schema `private` ao PostgREST publicaria os corpos.

## ADR-022 — Encontro privado, com uma vaga por transação

- Status: aceita
- Contexto: o modelo conceitual previa rascunho, publicação, local geográfico, comunidade opcional e vários estados de presença. Esta fase precisa que dois amigos marquem um horário, sem mapa, sem link e sem partida.
- Decisão: tabelas `meetups`, `meetup_participants` e `meetup_invitations`. O nome do domínio continua `meetups`, como na arquitetura; `events` seria um segundo nome para o mesmo conceito. A rota é `/encontros`. O encontro nasce `scheduled` e privado. `cancelled` preserva a linha. `completed` fica para o fechamento de presença e não dispara sozinho. A modalidade vem do formato. A `scoring_rule_version_id` fica gravada mesmo que outra versão seja ativada depois. Horário é `timestamptz`; `time_zone` só formata a tela. O local é texto até existir `places`. Quem organiza ocupa uma vaga. A capacidade vai de 2 a 64 e só conta `confirmed`. Toda alta de confirmados trava a linha do encontro com `for update`. Convite exige amizade `accepted`. Aceitar e ocupar a vaga são a mesma transação. Modalidade, regra e horário só mudam enquanto o único confirmado é quem organiza. Quem saiu não volta nesta versão.
- Consequências: dois aceites simultâneos na última vaga deixam um de fora. Um perfil privado continua ilegível; a lista mostra username. Convite por link, geografia, comunidade e partida entram sem reescrever esta linha.
- Alternativas: contar vagas no cliente perde a corrida. Apagar o encontro cancelado some com o histórico. Tratar o organizador como participante opcional deixa o encontro sem responsável.

## ADR-023 — Link de encontro guarda o hash e usa a vaga existente

- Status: aceita
- Contexto: a ADR-007 previa token de 128 bits, limite de usos e resgate no servidor. O encontro já trava a última vaga com `for update`. O link precisa chegar a quem não é amigo e a quem ainda não tem conta, sem abrir a tabela nem o endereço.
- Decisão: `meetup_invite_links` guarda o SHA-256 de 32 bytes aleatórios. O token cru sai só na função de geração. A validade é o menor instante entre sete dias e o início. Um encontro tem no máximo um link com `revoked_at` nulo; gerar outro revoga o anterior na mesma transação. Expirado, revogado, cancelado ou já iniciado não entra. Revogar não tira quem já confirmou. A entrada chama `private.lock_meetup`, a mesma trava do convite interno. Convite interno pendente, recusado ou cancelado dessa pessoa passa a `accepted` junto da vaga. Não nasce amizade. Quem saiu não volta. O preview anônimo mostra título, modalidade, formato, horário, nome do local e vagas. A página `/convite/:token` não é indexada e pede `no-referrer`. O retorno do cadastro só aceita esse caminho interno.
- Consequências: `anon` recebe `USAGE` em `private` e `EXECUTE` só em `private.preview_meetup_invite`, porque o wrapper público é `security invoker`. O schema continua fora do PostgREST. Sem o token original não há como copiar o link de novo. A capacidade substitui um contador de usos.
- Alternativas: `security definer` no schema público concentraria o privilégio na função da API. Guardar o token cru permitiria recopiar e vazaria com qualquer leitura. Um `max_uses` paralelo poderia divergir da capacidade.

## ADR-024 — Partida grava a versão da regra e calcula o desfecho

- Status: aceita
- Contexto: a ADR-004 e a ADR-019 deixaram o desfecho para a fase de partidas. O catálogo já tem `set_based`, `goal_based` e `game_based`, com chaves diferentes. O encontro já guarda `scoring_rule_version_id`. Uma partida não pode reler a regra ativa, nem aceitar um vencedor vindo da tela.
- Decisão: a partida copia a versão do encontro na criação. O placar é JSONB no contrato do tipo: sets de pontos, par de gols, ou games com tiebreak opcional e set decisivo em pontos. `private.resolve_match_outcome` recusa placar que não fecha e devolve `side_1`, `side_2` ou `draw`. O empate só existe em `goal_based` com `allows_draw`. O set decisivo é só o último set possível. Tiebreak e super tiebreak são “quem chega primeiro”, porque a versão não tem diferença mínima para esses pontos. Gols iguais com empate proibido são inválidos; não há segundo placar de pênaltis. Dois lados, nomes livres. A escalação exige participante confirmado naquele instante e respeita o mínimo e o máximo do formato. Quem sai depois permanece na partida. Enquanto `draft`, o organizador edita escalação e placar. O envio exige encontro `scheduled` já iniciado e passa a `pending_confirmation`. Um jogador de cada lado confirma a revisão vigente. Contestação vai para `disputed`. Revisar incrementa a revisão, preserva a anterior e zera o efeito das confirmações. Cancelar o encontro anula `draft`, `pending_confirmation` e `disputed`. `confirmed` não se reescreve nem se anula nesta versão. O encontro não vira `completed` por causa das partidas. A trava é a linha do encontro e depois a da partida. RLS forçado, sem escrita direta, wrappers `security invoker`. `anon` não executa as funções de partida.
- Consequências: uma chave nova, como diferença mínima do tiebreak ou contagem de pênaltis, entra numa `scoring_rule_versions` seguinte e num ramo novo do motor. As versões já gravadas não mudam. A projeção individual que lê `confirmed` está na ADR-025.
- Alternativas: um placar genérico de dois números aceitaria 25–24 no vôlei. Aceitar `winner_id` da tela separaria o vencedor do placar. Apagar a confirmação antiga perderia o histórico da contestação.

## ADR-025 — Estatística é contribuição por partida, não contador

- Status: aceita
- Contexto: a ADR-003 pedia projeção idempotente a partir do resultado confirmado. A ADR-024 deixou a partida com versão de regra, escalação e desfecho. Misturar pontos, gols e games, ou contar quem só estava no encontro, produziria um número sem significado.
- Decisão: `match_player_statistics` tem uma linha por `(match_id, user_id)`. A modalidade e o formato saem da versão gravada na partida. O desfecho é o do lado escalado. Pares de métrica ficam nulos quando o tipo da regra não os produz. O tiebreak não entra em games; o super tiebreak fica em colunas próprias. `private.confirm_match` projeta na mesma transação. `private.project_match_statistics` trava a partida, faz upsert e apaga quem não está mais escalado. Se o estado não for `confirmed`, apaga as contribuições. `reproject_user_statistics` e `reproject_all_statistics` só rodam como `postgres`. Não há cache agregado. `my_statistics` lê o próprio `auth.uid()`. `meetup_participant_statistics` exige participante `confirmed` naquele encontro e devolve username mais os agregados. Convite pendente e quem saiu não leem. A tabela não tem política de leitura nem escrita para o cliente. A taxa de vitória, com uma casa, nasce só na consulta.
- Consequências: uma correção futura de partida confirmada reutiliza a mesma projeção, sem supor que `confirmed` é eterno. Confronto, companheiros, local e ranking continuam sem tabela. Privacidade mais fina do que "confirmados deste encontro" ainda não existe.
- Alternativas: contador por atleta perde a origem. Uma view materializada duplicaria a idempotência. Reusar `can_read_meetup` abriria a estatística para convite pendente. Somar todas as colunas trataria gol como ponto.

## ADR-026 — Relação social é consulta, não projeção de dupla

- Status: aceita
- Contexto: a ADR-025 guarda uma contribuição por jogador e partida. Companheiro e adversário saem do lado daquela escalação. Uma tabela de totais por dupla repetiria a idempotência e envelheceria se a contribuição fosse reprocessada.
- Decisão: `private.player_pair_statistics` agrupa no banco. Companheiro é o mesmo `side`. Adversário é o lado oposto. Cada par conta uma vez por partida. As funções pessoais usam `auth.uid()` e exigem modalidade. O formato é opcional. `private.relationship_highlight_minimum()` vale 5 para melhor companheiro e adversário mais difícil. O desempate termina em username e `user_id`. `meetup_player_relationships` só devolve confirmados daquele encontro. Não há função com dois UUIDs livres. `reproject_all_statistics` e `reproject_user_statistics` apagam contribuição cuja partida não está mais `confirmed` antes de reconstruir.
- Consequências: o histórico de relação acompanha o reprocessamento da contribuição. O username de quem jogou junto aparece para o parceiro. Encontro, e-mail e quem está fora do grupo autorizado ficam de fora. Ranking e local continuam sem consulta.
- Alternativas: gravar uma linha por dupla duplicaria a contribuição. Calcular no navegador carregaria o histórico. Comparar modalidades num destaque único misturaria vôlei com futsal.

## ADR-027 — Comunidade tem proprietário, convite e reentrada próprios

- Status: aceita
- Contexto: a ADR-008 deixa o encontro existir sem comunidade. A ADR-009 separa amizade de vaga. O modelo antigo misturava convite com participação e tratava administrador como único responsável. Esta fase entrega o grupo sem encontro coletivo e sem abrir os encontros privados já gravados.
- Decisão: `communities`, `community_members`, `community_invitations` e `community_sports`. O criador é o único `owner` ativo. O papel não viaja no payload. Proprietário não sai e não é removido; não há transferência nesta versão. Administrador convida e remove integrante comum. Não remove proprietário nem outro administrador. A participação é uma linha por pessoa. `left` volta sozinho na comunidade pública. `removed` só volta se aceitar um convite novo. O convite não exige amizade, não tem link, não se duplica pendente, espera 24 horas depois de recusa ou cancelamento e para em 30 pendentes por remetente. O slug é do servidor. Comunidade privada, para quem não participa, responde como se não existisse. Anônimo lê o catálogo público por `list_public_communities` e `get_community`. A lista de integrantes é username e papel, só para integrante ativo. Modalidade vem de `sports`; inativa não se associa de novo e a ligação antiga permanece. `meetups` não ganha `community_id` agora. A leitura futura de encontro comunitário será outra função, não `can_read_meetup`.
- Consequências: apagar o perfil do proprietário remove a comunidade, porque ninguém mais pode assumi-la. Rebaixar ou sair zera o papel para `member`. Duas comunidades podem ter o mesmo nome e slugs diferentes. O encontro privado de hoje continua invisível para o integrante da comunidade.
- Alternativas: guardar `invited` na própria participação misturaria convite com vaga. Deixar o proprietário sair criaria grupo sem responsável. Reusar a política do encontro privado abriria histórico para quem só entrou na comunidade. Um segundo catálogo de modalidades divergiria do que a partida já usa.

## ADR-028 — Encontro comunitário reusa o encontro e trava a exclusão do responsável

- Status: aceita
- Contexto: a ADR-008 deixa o encontro existir sem comunidade. A ADR-022 já trava vaga, convite e organizador. A ADR-027 criou o grupo e adiou `community_id`, prevendo uma leitura separada de `can_read_meetup`. Apagar o perfil do proprietário, por `on delete cascade`, levaria embora a comunidade e, se o encontro fosse ligado do mesmo jeito, o histórico esportivo.
- Decisão: `meetups.community_id` é opcional e `on delete restrict`. Nulo permanece o encontro privado. Preenchido, o vínculo é imutável. Integrante ativo cria pelo mesmo `create_meetup`, publica na hora e entra por `join_community_meetup`, sem amizade e sem segundo contador de vaga. `can_read_meetup` passa a distinguir: no privado, organizador, confirmado ou convite pendente; no comunitário, só participação ativa atual. Convite interno e link são recusados no comunitário e continuam no privado. Proprietário e administrador da mesma comunidade cancelam, com autor em `meetup_audit_logs`. A edição geral fica com o organizador. Sair ou ser removido libera vaga de encontro futuro agendado e conserva presença, escalação, resultado e estatística do que já começou. Quem organiza encontro futuro cancela antes de sair. A ordem de trava é comunidade, participação na comunidade, encontros por `id` e participação no encontro. `communities.created_by` passa a `on delete restrict`. Um gatilho em `profiles` recusa a exclusão e nomeia a dependência quando a conta é proprietária, organiza encontro comunitário ou registrou moderação. Não há transferência de propriedade nem de organização.
- Consequências: encontro privado e partida confirmada continuam no motor que já existia. Uma presença antiga não abre a comunidade depois da saída. A conta do proprietário fica bloqueada até existir transferência ou arquivamento. A exclusão de quem jogou partida confirmada deixou de apagar escalação e contribuição; essa trava está na ADR-029.
- Alternativas: uma tabela `community_meetups` duplicaria vaga, partida e estatística. `on delete cascade` na comunidade apagaria o histórico. Reusar o convite privado dispensaria a participação ativa. Transferir a propriedade nesta etapa aumentaria o fluxo sem destravar o encontro.

## ADR-029 — Exclusão de conta não apaga histórico esportivo

- Status: aceita, como trava temporária
- Contexto: `auth.users` apaga `profiles` em cascata. Várias chaves do perfil também eram `on delete cascade`: organizador do encontro, criador da partida, autor do resultado, jogador escalado, contribuição estatística e autor da auditoria da partida. Apagar um integrante comum removia a linha dele em `match_players` e `match_player_statistics`. A relação social lê as duas contribuições da mesma partida, então o confronto de quem ficou também mudava. Apagar quem organiza um encontro privado apagava o encontro e, com ele, as partidas de todo mundo. A ADR-028 já recusava proprietário, organizador comunitário e autor de moderação, e deixava o restante aberto.
- Decisão: a menor proteção que impede perda silenciosa. `meetups.organizer_id`, `matches.created_by`, `match_results.created_by`, `match_player_statistics.user_id` e `match_audit_logs.actor_id` passam a `on delete restrict`. `private.protect_profile_delete` recusa, com a dependência nomeada, a exclusão de proprietário, organizador, autor de moderação, jogador de partida que já saiu do rascunho, autor de partida ou resultado e autor da auditoria da partida. Conta sem esses vínculos continua excluível. Participação em comunidade, vaga de encontro e escalação só de rascunho acompanham o perfil. Sair ou ser removido da comunidade não apaga resultado confirmado. Não há entidade de participante histórico nesta etapa.
- Consequências: o histórico confirmado deixa de mudar quando alguém tenta apagar a conta. A mesma trava impede o encerramento legítimo de quem já jogou, organizou ou é proprietário. Username, e-mail e o vínculo com `auth.users` permanecem enquanto a recusa durar. Isso não é política de retenção definitiva: dado pessoal não deve ficar para sempre só para segurar o placar. Uma instalação limpa e o banco atualizado aplicam a mesma função e as mesmas chaves. Convite privado continua com hash, autor e encontro imutáveis; encontro comunitário continua sem link.
- Caminho futuro: transferir propriedade e organização para outra conta ativa. Em seguida, um participante histórico, independente de `auth.users` e `profiles`, guarda o lado, o placar contribuído e a modalidade, sem nome, e-mail nem username. A estatística individual da conta encerrada deixa de ser consultável. A estatística social de quem ficou passa a contar o fato sem identificar a pessoa, ou a omitir o par, conforme a política de retenção que ainda falta definir. Só então a conta pode ser excluída. Correção administrativa de partida confirmada continua fora.
- Alternativas: anonimizar agora exigiria a entidade nova, a regra de retenção e a mudança das consultas sociais. Manter `on delete cascade` continuaria apagando o histórico de terceiros. `on delete set null` quebraria escalação e contribuição, que exigem jogador. Guardar o perfil para sempre conservaria dado pessoal sem prazo.

## ADR-030 — Chat coletivo da comunidade não guarda mensagem como dado pessoal eterno

- Status: aceita
- Contexto: a comunidade já tem integrante ativo, papel e encontro. A conversa precisava ficar no banco, com a mesma regra de participação, sem Realtime e sem impedir a exclusão de conta que a ADR-029 deixou aberta para quem não tem histórico esportivo.
- Decisão: `community_messages`, um fio por comunidade. Texto de 1 a 2000 caracteres úteis, com quebra de linha e sem outros controles. Encontro opcional tem de ser da mesma comunidade; o cartão é consultado ao ler, não copiado. `client_request_id` é único por autor e comunidade e torna o reenvio idempotente. O limite é 5 mensagens em 10 segundos por pessoa e comunidade, com a participação travada. A página pede de novo a cada 15 segundos. Autor, proprietário e administrador apagam; a exclusão zera o texto. `author_id` é `on delete cascade`. `deleted_by` é `on delete set null`. `meetup_id` é `on delete set null`.
- Consequências: comunidade pública não abre o chat para quem só a descobriu. Sair ou ser removido tira o acesso e deixa o histórico para quem ficou. Conta sem histórico esportivo pode ser excluída e as mensagens dela saem junto. Conta com partida confirmada continua recusada pela ADR-029, não pelo chat. Username acompanha o perfil enquanto a conta existe. A tela não interpreta HTML. Realtime substitui o intervalo depois, na mesma função de lista.
- Alternativas: `on delete restrict` no autor bloquearia exclusão por causa de conversa. Guardar o texto apagado em outra coluna reteria o conteúdo. Um chat por encontro duplicaria autorização. Markdown e anexo aumentariam a superfície sem pedido desta etapa.

## ADR-031 — Enquete da comunidade congela a pergunta e esconde o voto

- Status: aceita
- Contexto: o grupo já decide modalidade, horário e local na conversa. Faltava uma consulta com prazo, sem transformar o resultado em encontro e sem mostrar quem marcou o quê.
- Decisão: `community_polls`, `community_poll_options` e `community_poll_votes`. As categorias geral, modalidade, horário e local usam as mesmas opções e os mesmos votos. Modalidade aponta para `sports` e para `community_sports`. Horário com data guarda instante e fuso IANA; horário sem data fica texto. Local é nome manual, sem catálogo e sem identidade geográfica. Escolha única grava uma opção; múltipla grava o conjunto completo e substitui o anterior. O prazo é `closes_at`. A leitura calcula o estado efetivo com `now()` e não há tarefa agendada. Encerrar preserva o resultado. Cancelar tira o valor de decisão e não apaga a linha. Pergunta, opções e regra não mudam depois de publicar. O agregado e a seleção de quem consulta saem das funções. Não existe lista de eleitores. Até 10 enquetes por pessoa, por comunidade, a cada hora. A aba atualiza a cada 15 segundos. `created_by` e `closed_by` usam `on delete set null`. O voto usa `on delete cascade`. A trava da ADR-029 não ganha cláusula de enquete.
- Consequências: comunidade pública não abre a enquete para quem só a descobriu. Sair ou ser removido tira o acesso e deixa o voto antigo no total, sem o nome. Conta sem histórico esportivo continua excluível; a enquete que ela criou permanece anônima. Conta com partida confirmada continua recusada pela ADR-029. Empate mostra todas as primeiras. Múltipla escolha pode somar mais de 100%. Erro de pergunta se corrige com cancelamento e uma enquete nova. Encontro automático fica para outra decisão.
- Alternativas: um contador na opção divergiria do voto sob concorrência. Editar a opção publicada mudaria o sentido do voto já dado. `on delete restrict` no autor bloquearia exclusão por causa de consulta. Quatro tabelas de voto, uma por categoria, repetiriam a mesma regra. JSONB na opção misturaria modalidade, instante e lugar sem check.

## ADR-032 — Local cadastrado guarda identidade própria e o encontro guarda cópia

- Status: aceita
- Contexto: o encontro já tinha nome e endereço em texto. O grupo precisava reutilizar quadra sem tratar o nome como chave e sem deixar uma correção do cadastro reescrever o encontro antigo.
- Decisão: `venues` com UUID, escopo pessoal (`community_id` nulo) ou comunitário. Nome obrigatório, endereço informado pela pessoa, detalhes opcionais, latitude e longitude nulas ou válidas juntas. Sem PostGIS, sem geocodificação e sem catálogo global. Integrante ativo lê o local da comunidade. Só proprietário e administrador criam, editam e arquivam. `meetups.venue_id` é opcional. A seleção copia nome, endereço e detalhes para o encontro. `update_meetup` não mexe no local. `set_meetup_place` troca referência e cópia na mesma transação e recusa a troca quando já há outro confirmado. Endereço e coordenadas do cadastro não mudam. Arquivar impede seleção nova e preserva encontro, partida e projeção. A lista de encontros do local usa `can_read_meetup`. `created_by` é `on delete set null`. `venue_id` é `on delete restrict`.
- Consequências: dois nomes iguais continuam dois lugares. Encontro manual e encontro antigo ficam com `venue_id` nulo. Comunidade pública não mostra endereço a quem não participa. Local pessoal não entra em encontro comunitário como cadastro. Opção de enquete de local continua texto. Mapa e estatística por local ficam para outra etapa. O detalhe está em [VENUES.md](./VENUES.md).
- Alternativas: usar o nome como chave fundiria quadras diferentes. Deduzir coordenada do endereço inventaria um ponto. Atualizar o snapshot quando o cadastro mudasse alteraria o histórico. `on delete restrict` em `created_by` bloquearia exclusão de conta por causa de um local.

## ADR-033 — Posição do local entra uma vez e o encontro guarda a própria cópia

- Contexto: a ADR-032 deixou latitude e longitude imutáveis desde a criação, e o encontro só copiava o texto. A pessoa precisa marcar o ponto no mapa, inclusive num local que já existe sem coordenada, sem reescrever encontro antigo.
- Decisão: `set_venue_location` grava o par uma única vez, com `location_set_at` e `location_set_by`, para quem já pode editar o local. O gatilho recusa qualquer troca seguinte e continua protegendo endereço, autoria e comunidade. `meetups.location_latitude` e `location_longitude` nascem na seleção: vêm do local naquele instante, ou de um ponto explícito do local manual. `set_meetup_place` atualiza essa cópia junto com o texto e a referência. Uma posição adicionada depois ao local não altera encontro já criado. O mapa lê só as funções de lista já autorizadas. A posição do aparelho não é persistida.
- Consequências: o mapa claro usa Liberty e o escuro usa Dark, no OpenFreeMap, sem chave. Não há PostGIS, geocodificação nem rota interna. O detalhe está em [MAPS.md](./MAPS.md).
- Alternativas: permitir mover o ponto depois faria o mesmo cadastro representar outra quadra. Mostrar a coordenada viva do local no encontro antigo mudaria o histórico. Inverter o mapa por CSS estragaria nomes e cores.

## ADR-034 — Estatística por local lê a contribuição e o venue_id

- Status: aceita
- Contexto: o grupo quer ver desempenho por quadra sem um segundo placar e sem fundir locais pelo nome.
- Decisão: `my_venue_statistics`, `my_venue_statistic` e `community_venue_usage` agregam `match_player_statistics` de partidas `confirmed`, pelo `meetups.venue_id`. Não há tabela de totais. `venue_id` nulo fica fora dos locais. Nome e coordenada só saem para quem já pode ler o cadastro. Integrante que saiu conserva o próprio número, sem o cadastro atual. O uso da comunidade conta partidas distintas e exige participação ativa. A comparação de aproveitamento exige a mesma modalidade e cinco partidas em ao menos dois locais. O mapa consulta um local por vez.
- Consequências: reprocessar a contribuição reprocessa o local. Arquivar não apaga o histórico. Dono de local pessoal não vê partida alheia. Não há ranking. O detalhe está em [STATISTICS.md](./STATISTICS.md).
- Alternativas: contador por local divergiria da contribuição. Agrupar por nome fundiria quadras diferentes. Materializar agora adiantaria otimização sem volume.

## ADR-035 — Detalhe pessoal fica fora da leitura pública do perfil

- Status: aceita
- Contexto: altura, sexo e foto são opcionais e não podem vazar pelas consultas que já leem `profiles`.
- Decisão: `profile_personal_details` guarda altura em centímetros, sexo (`female`, `male`, `intersex` ou nulo) e a chave do arquivo. Os três flags de exibição nascem desligados. Outra pessoa só recebe o campo quando o perfil é público e o flag está ligado. "Prefiro não informar" grava nulo. Sexo não filtra comunidade, encontro nem cartinha. A foto não entra em Base64 nem em `bytea`. O ambiente local não tem Storage, então o envio recusa com erro explícito e `avatar_path` fica nulo.
- Consequências: a consulta antiga de perfil não cresce. Sem Storage, a cartinha usa a inicial. A exclusão da conta sem histórico continua possível porque a linha pessoal sai em cascade.
- Alternativas: colunas novas em `profiles` ampliariam toda leitura pública. URL assinada gravada no banco expiraria. Arquivo local do navegador fingiria persistência.

## ADR-036 — Cartinha da comunidade é versão, amostra e média das médias

- Status: aceita
- Contexto: cada comunidade quer avaliar habilidades diferentes, sem transformar isso em ranking global nem em estatística de partida.
- Decisão: uma configuração ativa por comunidade, com 3 a 8 atributos e versão imutável. Mudança estrutural publica outra versão e não migra nota. A nota vigente é única por avaliador, jogador, atributo e versão, na escala inteira de 1 a 99. A média sai no Postgres. O atributo só publica média com pelo menos 3 avaliadores ativos. O overall é a média dessas médias, peso igual, arredondado só no fim. Participação é voluntária. Desativar apaga as notas recebidas. Sair apaga as notas dadas e não as devolve na reentrada. Voto individual não sai da função de leitura. O limite é 120 alterações por avaliador, comunidade e hora.
- Consequências: cartinha de comunidade multiesportiva é geral nesta versão. Grupo pequeno não promete anonimato matemático. Partida confirmada permanece independente. O detalhe está em [PLAYER_CARDS.md](./PLAYER_CARDS.md).
- Alternativas: seis atributos fixos de futebol não servem vôlei. Somar todas as notas daria mais peso ao atributo mais votado. Reaproveitar nota antiga numa versão nova mudaria o sentido do voto.
