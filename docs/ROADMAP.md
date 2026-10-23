# Roteiro

Cada fase é pequena o bastante para ser verificada e, se estiver consistente, commitada sozinha. Não se antecipa a fase seguinte.

O modelo conceitual está em [DOMAIN_MODEL.md](./DOMAIN_MODEL.md). A migration de contas e perfil já existe. As seguintes continuam nascendo na fase que for usá-las.

## Fase 0 — Fundação

Entregue: documentação, regras do Cursor, cliente React com TypeScript strict, Tailwind, shadcn/ui, roteamento, TanStack Query, ESLint, Prettier, Vitest e Playwright. A tela inicial lista as cinco modalidades.

## Fase 1 — Contas e perfil

Entregue: Supabase local, Auth, perfil com fuso e visibilidade, sessão e recuperação de senha. O procedimento está em [LOCAL_DEVELOPMENT.md](./LOCAL_DEVELOPMENT.md).

Fora: amigos, encontros, catálogo persistido. O catálogo entrou na fase 2.

## Fase 2 — Catálogo esportivo

Entregue: modalidades, formatos e regras versionadas das cinco modalidades iniciais, com leitura pública das linhas ativas e escrita só por migration. A validação da configuração está no banco e no Zod. O resumo exibido na tela sai dessa configuração.

Fora: registrar partida e calcular o vencedor. `resolveOutcome` fica para a fase de partidas.

## Fase 3 — Amizades

Entregue: pedido, aceite, recusa, cancelamento e remoção, com uma linha por par e espera de 24 horas para reenviar. O perfil privado continua fechado; a lista mostra só o username.

Fora: bloqueio, visibilidade `friends`, comunidades e convite de encontro. O bloqueio entra numa tabela própria antes de afetar o que o amigo vê.

## Fase 4 — Locais e encontros

Entregue: encontro privado, horário em `timestamptz` com fuso IANA, local em texto, capacidade com trava transacional e convite entre amigos.

Fora desta fase: PostGIS, visibilidade pública e estado `completed`. O mapa dos pontos informados entrou na fase 11.

## Fase 5 — Convites

Entregue para encontros: link com token de 256 bits, só o hash no banco, expiração de no máximo sete dias, revogação e entrada de quem não é amigo. O cadastro volta ao convite e a vaga depende de uma confirmação explícita.

O convite de comunidade por username entrou na Fase 8. Link compartilhável de comunidade continua fora. Não há limite de usos separado da capacidade do encontro.

Fora: estatísticas.

## Fase 6 — Partidas

Entregue: várias partidas por encontro, dois lados com nome livre, escalação entre confirmados, placar validado pela versão da regra gravada na partida, desfecho calculado no banco, confirmação de um jogador de cada lado, contestação, revisão que invalida confirmações anteriores e histórico de ações. Cancelar o encontro anula rascunho, pendente e contestada. Partida confirmada permanece.

Ficou para a fase seguinte: a projeção individual. Fora: sorteio de equipes e chat.

## Fase 7 — Estatísticas

Entregue: uma contribuição por jogador escalado em cada partida confirmada, gerada na mesma transação da confirmação. A leitura individual agrupa por modalidade e por formato, sem misturar pontos, gols e games. Reprocessar uma partida, uma pessoa ou o histórico inteiro usa a mesma função e não duplica linhas. O perfil mostra o próprio desempenho. Confirmados do mesmo encontro veem só o desempenho esportivo uns dos outros.

Entregue também: companheiros, adversários e confronto direto calculados dessas contribuições, por modalidade e formato. Melhor companheiro e adversário mais difícil exigem cinco partidas. O reprocessamento completo remove contribuição de partida que deixou de estar confirmada.

Entregue depois, na fase dos locais: desempenho pessoal por `venue_id` e utilização agregada do local comunitário, sem ranking.

Ainda fora: ranking.

Pronto quando: reprocessar do zero reproduz os mesmos números e nenhuma tela grava contador próprio. Esse critério vale para a leitura individual, para as relações e para o agrupamento por local.

## Fase 8 — Comunidades

Entregue: comunidade pública e privada, com nome, descrição, modalidades do catálogo e um proprietário. Integrante entra na pública, sai, e vê os outros integrantes. Proprietário promove e rebaixa administrador. Administrador convida pelo username e remove integrante comum. Comunidade privada fica fora da descoberta e só abre depois do convite aceito. Quem foi removido só volta com convite. Quem saiu pode entrar de novo na pública.

Entregue também: encontro dentro da comunidade, na mesma tabela `meetups`, com `community_id` opcional. Integrante ativo propõe, publica na hora e confirma presença sem amizade nem convite. Proprietário e administrador cancelam encontro de outro integrante da mesma comunidade. Sair ou ser removido libera vaga futura e preserva partida já confirmada. A exclusão do perfil do proprietário ou de quem organiza encontro comunitário é recusada, com a dependência explicada.

Fora ainda: link de comunidade, convite de encontro comunitário, transferência de propriedade e ranking. O chat coletivo entrou na fase 9.

Pronto quando: encontro sem comunidade continua válido e administrador não se confunde com amigo.

## Fase 9 — Chat e enquetes

Entregue: um chat coletivo por comunidade. Integrante ativo lê, envia texto, apaga a própria mensagem e compartilha encontro da mesma comunidade. Proprietário e administrador removem mensagem de outro integrante. A página atualiza a cada 15 segundos. Quem não participa não lê, nem na comunidade pública.

Entregue também: enquete da comunidade, com pergunta geral, modalidade do catálogo, horário e local manual. Escolha única e múltipla. Voto, troca e retirada enquanto estiver aberta. Encerramento manual ou pelo prazo, sem agendador. Proprietário, administrador e autor moderam. O resultado é agregado no Postgres. O voto individual não sai da função. A aba atualiza a cada 15 segundos.

Fora ainda: Realtime, chat do encontro, mensagem direta, anexo, reação, resposta encadeada, menção e encontro gerado por enquete.

Pronto quando: quem não participa não lê mensagens nem enquetes pelas funções do banco.

## Fase 10 — Locais reutilizáveis

Entregue: cadastro pessoal em `/locais` e cadastro da comunidade para proprietário e administrador. Integrante consulta e escolhe o local ativo ao propor encontro. O encontro guarda `venue_id` e uma cópia do nome, endereço e detalhes. Texto manual continua. Arquivar tira o local da seleção nova e deixa o histórico. A lista de encontros do local respeita a leitura que o encontro já tinha.

Entregue também: desempenho pessoal por `venue_id` e utilização agregada dos locais da comunidade. A fonte é a contribuição já confirmada. Não há ranking de jogador.

Fora ainda: geocodificação, PostGIS, autocomplete, catálogo global e vínculo da opção de enquete com `venue_id`.

Pronto quando: outro usuário não lê o catálogo pessoal e quem não participa não lê o endereço da comunidade.

## Fase 11 — Mapa dos locais

Entregue: mapa pessoal e da comunidade, marcação explícita da posição, registro único em local que ainda não tinha ponto, snapshot geográfico do encontro, links externos de navegação e localização opcional do aparelho. O tema claro usa o estilo Liberty e o escuro usa o estilo Dark, ambos do OpenFreeMap.

Fora ainda: ranking, geocodificação, PostGIS, rota interna e transporte.

Pronto quando: o mapa só mostra ponto informado por quem pode ver o local, e mudar o cadastro depois não reescreve o encontro.

## Perfil esportivo e cartinhas

Entregue: altura e sexo opcionais, fora da leitura antiga de `profiles`, com exibição desligada por padrão. A foto tem validação de JPEG, PNG e WebP, mas o envio fica indisponível porque o supervisor local não tem Storage.

Entregue também: cartinha por comunidade, com 3 a 8 atributos versionados, participação voluntária, nota de 1 a 99 e overall calculado no Postgres como média das médias. A amostra mínima é 3 avaliadores por atributo. A nota individual não sai da função de lista.

Fora: ranking global, cartinha por modalidade, pacote, raridade e nota automática a partir da partida.

Pronto quando: quem não participa não lê a cartinha e uma versão nova não reinterpreta voto antigo.

## Fase 12 — Rankings

Objetivo: ranking derivado das projeções, sem número mantido à mão.

Dependências: estatísticas.

Pronto quando: o ranking muda ao reprocessar uma partida.

## Fase 13 — Transporte

Objetivo: consultar transporte público até o local.

Dependências: coordenada do lugar e um provedor externo.

Pronto quando: a consulta é opcional e o encontro funciona se o provedor falhar.
