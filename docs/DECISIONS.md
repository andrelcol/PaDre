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

- Status: aceita
- Contexto: a máquina de desenvolvimento não tem Docker, e um `supabase link` reutilizaria outro projeto chamado PaDre. A fase pede persistência real e RLS.
- Decisão: o CLI oficial fica como dependência (`supabase` 2.121.0) e o `config.toml` usa `project_id = "padre-identity-local"`. Sem Docker, `npm run supabase:start` sobe Postgres 17 embutido na porta 54322, GoTrue, PostgREST, Mailpit e um gateway em 127.0.0.1:54321. Segredos ficam em `supabase/.runtime`, ignorado pelo Git. A chave anônima vai para `.env.local`. A `service_role` não é escrita em variável `VITE_`.
- Consequências: o ambiente é independente do Postgres da porta 5432 e de qualquer projeto remoto. Quando houver Docker, o mesmo `config.toml` serve ao CLI oficial; o runtime compatível continua sendo o caminho desta máquina.
- Alternativas: exigir Docker pararia a fase. Uma máquina virtual só para o CLI seria mais pesada do que os binários já usados pelo CLI.

## ADR-017 — Perfil público separado das preferências

- Status: aceita; revisa a ADR-014 para a identidade
- Contexto: a fundação sugeria nome público e histórico visível para amigos. Amizade ainda não existe, e fuso horário não deve vazar na leitura do perfil.
- Decisão: `auth.users` é a conta. `profiles.id` é o mesmo UUID. `profiles` guarda `username`, `display_name`, `visibility`, `created_at` e `updated_at`. `profile_preferences` guarda `timezone`. Visibilidade inicial é só `private` ou `public`, padrão `private`. Username é normalizado com `trim` + minúsculas e precisa casar `^[a-z][a-z0-9_]{2,29}$`. `display_name` aceita acento, de 1 a 80 caracteres. Fuso é um nome IANA, padrão `America/Sao_Paulo`. O gatilho `private.handle_new_user` cria as duas linhas, ignora visibilidade e papel vindos do cliente e recusa username inválido. Outro gatilho força `role = authenticated`. Leitura de perfil público exige sessão. Preferências não entram nessa leitura.
- Consequências: não há página para folhear perfis de outras pessoas; a política já permite a leitura autenticada do perfil público. `friends` fica para a fase de amizades. No ambiente local o GoTrue confirma o e-mail sozinho para o fluxo ser testável; produção ainda não está configurada.
- Alternativas: uma tabela só misturaria fuso com dado público. Confiar no metadata para papel ou visibilidade inicial abriria elevação de privilégio.
