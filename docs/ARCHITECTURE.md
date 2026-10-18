# Arquitetura

PaDre é uma aplicação web de página única apoiada em Supabase. O cliente React organiza a interface e as regras puras. PostgreSQL, com Row Level Security, é a fronteira de autorização e a fonte dos dados confirmados.

Nada disso está ligado a um projeto Supabase remoto. O esquema físico só entra, em migrations versionadas, depois que o modelo em [DOMAIN_MODEL.md](./DOMAIN_MODEL.md) for a base da etapa correspondente.

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

- Supabase Auth identifica a pessoa. `profiles` completa o que o Auth não modela.
- PostgreSQL guarda o domínio. PostGIS entra na migration de locais (`geography(Point, 4326)`), não antes.
- Realtime entra com chat e enquete. Não há canal aberto nesta etapa.
- A chave `anon` pode ir para o cliente. A `service_role` não vai. Ela não autoriza leitura; as políticas autorizam.
- Mudança de esquema só por arquivo em `supabase/migrations`, na ordem, aplicado primeiro num Supabase local.

### Autorização prevista

Toda tabela exposta ao cliente terá política. O desenho, ainda sem SQL:

| Dado                    | Quem lê                                             | Quem escreve                                      |
| ----------------------- | --------------------------------------------------- | ------------------------------------------------- |
| Perfil                  | A própria pessoa; outras, conforme a visibilidade   | A própria pessoa                                  |
| Amizade                 | Os dois envolvidos                                  | Quem solicita; os dois mudam o estado             |
| Comunidade e membros    | Membros; comunidade pública só no que for público   | Administradores; a pessoa sai da própria vaga     |
| Local                   | Quem vê um encontro que o usa, ou quem criou        | Quem cria; edição por quem criou                  |
| Encontro e presenças    | Conforme visibilidade e participação                | Organização; a pessoa responde pelo próprio RSVP  |
| Convite                 | Organização. Cliente anônimo não seleciona a tabela | Organização cria e revoga. Resgate por função     |
| Partida e resultado     | Quem vê o encontro                                  | Organização, enquanto rascunho. Confirmação única |
| Projeção de estatística | Conforme a privacidade de quem é medido             | Nenhum cliente. Só a função de projeção           |

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

Token aleatório com pelo menos 128 bits. O banco guarda o hash. O link leva o token cru uma vez. Expiração é obrigatória. Convite direto é de uso único; link pode ter limite de usos. Resgate de quem não tem conta acontece depois do cadastro, se o token ainda vale. O aceite é uma função no servidor, não um `select` pelo token.

## Mapas e transporte

MapLibre consome os pontos quando a fase de mapa chegar. Transporte público, mais à frente, lê a coordenada do local por um serviço externo. O núcleo de encontros não depende desse serviço.

## Qualidade

TypeScript `strict`. ESLint e Prettier no código. Vitest e Testing Library nas regras e na interface. Playwright no fluxo do navegador. Um mock não ocupa o lugar de uma função que a etapa deveria ter entregue de verdade.

## Riscos

- Payload de placar flexível vira gaveta se a validação da regra atrasar. A fase de partidas entrega a validação junto com o registro.
- Política RLS frouxa vaza histórico. Cada tabela nova sai com teste de permissão, não só com a migration.
- Qualquer escrita direta na projeção faz a estatística divergir. A política nega escrita do cliente.
- `timestamp` sem fuso, ou data civil guardada como texto, quebra o dia do jogo.
- Token de convite em log, analytics ou query string persistida equivale a vazamento do próprio convite.

## Fora desta etapa

Não há cliente Supabase, migration, Auth, partida, comunidade, chat nem mapa. A tela inicial só mostra que a casca abre e quais são as modalidades iniciais.
