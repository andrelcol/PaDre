# Roteiro

Cada fase é pequena o bastante para ser verificada e, se estiver consistente, commitada sozinha. Não se antecipa a fase seguinte.

O modelo conceitual está em [DOMAIN_MODEL.md](./DOMAIN_MODEL.md). A migration de contas e perfil já existe. As seguintes continuam nascendo na fase que for usá-las.

## Fase 0 — Fundação

Entregue: documentação, regras do Cursor, cliente React com TypeScript strict, Tailwind, shadcn/ui, roteamento, TanStack Query, ESLint, Prettier, Vitest e Playwright. A tela inicial lista as cinco modalidades.

## Fase 1 — Contas e perfil

Entregue: Supabase local, Auth, perfil com fuso e visibilidade, sessão e recuperação de senha. O procedimento está em [LOCAL_DEVELOPMENT.md](./LOCAL_DEVELOPMENT.md).

Fora: amigos, encontros, catálogo persistido.

## Fase 2 — Catálogo esportivo

Objetivo: modalidades, formatos e regras versionadas das cinco modalidades iniciais.

Dependências: Fase 1 para saber quem administra o catálogo, ou leitura pública com escrita restrita à service role em seed.

Fora: registrar partida.

Pronto quando: as regras de vôlei, areia, futsal, beach tennis e futevôlei existem como dados distintos e uma função pura de desfecho está testada para cada tipo, sem ainda gravar partida.

## Fase 3 — Amizades

Objetivo: pedido, aceite, recusa e bloqueio.

Dependências: perfis.

Fora: comunidades e convite de encontro.

Pronto quando: só os dois envolvidos leem a relação, e bloqueio passa a afetar a visibilidade prevista.

## Fase 4 — Locais e encontros

Objetivo: PostGIS, local, encontro sem comunidade obrigatória, e estados de presença.

Dependências: perfil e catálogo.

Fora: link anônimo e partida.

Pronto quando: a organização publica um encontro com horário em fuso IANA e outra pessoa confirma presença. Rascunho não aparece para terceiros.

## Fase 5 — Convites

Objetivo: convite para quem já tem conta e link com token hasheado, expiração e limite de uso.

Dependências: encontros. Comunidades entram só quando a Fase 8 existir; o convite de comunidade espera essa fase.

Fora: estatísticas.

Pronto quando: o token cru não está no banco, o link expirado falha, e o resgate de quem acabou de cadastrar cria a participação.

## Fase 6 — Partidas

Objetivo: partida dentro do encontro, lados, participantes e resultado confirmado com revisão.

Dependências: encontros e regras da Fase 2.

Fora: projeção agregada e chat.

Pronto quando: só o resultado confirmado é aceito como verdade, rascunho não conta, e correção gera revisão em vez de apagar o histórico.

## Fase 7 — Estatísticas

Objetivo: projeção idempotente e as quatro consultas (individual, confronto, companheiros, local), por modalidade.

Dependências: partidas confirmadas.

Pronto quando: reprocessar do zero reproduz os mesmos números e nenhuma tela grava contador próprio.

## Fase 8 — Comunidades

Objetivo: grupo, administradores, membros e encontro coletivo.

Dependências: encontros. Convite de comunidade completa o que a Fase 5 deixou preparado.

Fora: ranking.

Pronto quando: encontro sem comunidade continua válido e administrador não se confunde com amigo.

## Fase 9 — Chat e enquetes

Objetivo: conversa e enquete no encontro ou na comunidade, com Realtime.

Dependências: os escopos que ancoram a conversa.

Pronto quando: quem não participa não lê as mensagens pelas políticas.

## Fase 10 — Rankings e mapa

Objetivo: ranking derivado das projeções e mapa com MapLibre sobre os pontos dos locais.

Dependências: estatísticas e locais.

Pronto quando: o ranking muda ao reprocessar uma partida, e o mapa mostra o local do encontro.

## Fase 11 — Transporte

Objetivo: consultar transporte público até o local.

Dependências: coordenada do lugar e um provedor externo.

Pronto quando: a consulta é opcional e o encontro funciona se o provedor falhar.
