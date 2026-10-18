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
