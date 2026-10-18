# PaDre

Plataforma social para organizar encontros esportivos presenciais e acompanhar o que foi jogado.

Esta etapa entrega a fundação: documentação, regras de trabalho e um cliente React que abre na tela inicial. Contas, encontros, partidas, comunidades, chat e estatísticas ainda não existem.

## Requisitos do produto

- Perfis individuais e estatísticas separadas por modalidade.
- Amigos e convites, inclusive link para quem ainda não tem cadastro.
- Encontros com data, horário, modalidade, local e participantes. Um encontro não precisa de comunidade.
- Partidas registradas dentro do encontro, com regras de pontuação próprias da modalidade.
- Consultas de desempenho individual, confronto direto, companheiros e local, calculadas a partir de resultados confirmados.
- Comunidades com integrantes, administradores, chat, enquetes e rankings.
- Mapa dos locais e, mais adiante, transporte público até o encontro.

Modalidades iniciais: vôlei, vôlei de areia, futsal, beach tennis e futevôlei. O catálogo precisa aceitar outras sem tratar todo placar como um inteiro só.

O desenho está em:

- [docs/PRODUCT_VISION.md](docs/PRODUCT_VISION.md)
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)
- [docs/DOMAIN_MODEL.md](docs/DOMAIN_MODEL.md)
- [docs/ROADMAP.md](docs/ROADMAP.md)
- [docs/DECISIONS.md](docs/DECISIONS.md)

## Stack

- React 19, TypeScript 6 em modo strict, Vite 8
- Tailwind CSS 4 e shadcn/ui
- React Router 8 e TanStack Query 5
- Zod 4, reservado para validar formulários, placares e respostas externas
- ESLint 10 e Prettier 3
- Vitest 5, Testing Library e Playwright
- Supabase, PostgreSQL, Auth, Realtime e PostGIS nas próximas fases. Não há projeto remoto ligado.

O template atual do Vite sugere oxlint. O projeto usa ESLint, conforme [ADR-011](docs/DECISIONS.md).

## Pré-requisitos

- Node.js 22.22.2 ou mais novo. A versão usada no projeto está em `.nvmrc` (22.23.3).
- npm 10.9, o que acompanha esse Node, ou npm 12.

React Router 8, Vite 8, Vitest 5 e jsdom 30 não suportam Node 20. Se o `nvm` ainda aponta para o Node 20:

```bash
nvm install
nvm use
```

O npm 10.8, no Node 20, falha ao resolver o Vite 8 (`Cannot read properties of null (reading 'edgesOut')`). Neste Node 22, a instalação que gerou o `package-lock.json` foi feita com npm 12.2. Se `npm install` falhar com o npm que veio no Node, use:

```bash
npx npm@12 install
```

## Instalação e execução

```bash
npm install
npm run dev
```

A aplicação fica em `http://127.0.0.1:5173`.

Variáveis previstas para a fase de autenticação estão em `.env.example`. Não coloque segredo em `.env` versionado. A chave `service_role` do Supabase não entra no cliente.

## Scripts

| Comando                | O que faz                      |
| ---------------------- | ------------------------------ |
| `npm run dev`          | Sobe o Vite                    |
| `npm run build`        | Checa tipos e gera `dist/`     |
| `npm run preview`      | Serve o build                  |
| `npm run typecheck`    | `tsc -b`                       |
| `npm run lint`         | ESLint                         |
| `npm run format`       | Prettier em modo escrita       |
| `npm run format:check` | Prettier em modo verificação   |
| `npm test`             | Vitest uma vez                 |
| `npm run test:watch`   | Vitest em modo interativo      |
| `npm run test:e2e`     | Playwright (sobe o dev server) |

Na primeira execução do Playwright, instale o navegador:

```bash
npx playwright install chromium
```

## Estrutura

```text
src/
  app/                 rotas e providers
  pages/               tela inicial
  domains/sports/      lista das modalidades iniciais, ainda sem catálogo no banco
  shared/ui/           componentes shadcn/ui
  shared/lib/          utilitário cn
e2e/                   fluxo no navegador
docs/                  visão, arquitetura, domínio, roteiro e decisões
.cursor/rules/         arquitetura, código, segurança, testes e processo
```

Regra de negócio futura fica em `src/domains/<domínio>/model`, não no componente. Acesso ao Supabase fica em `api/`. A tela inicial não simula essas camadas.

## O que esta etapa não inclui

- Cliente ou projeto Supabase
- Migrations e tabelas
- Autenticação, amigos, encontros, partidas, comunidades, chat, mapa ou estatísticas
