# Cartinhas e perfil esportivo

As cartinhas são avaliações subjetivas de uma comunidade. Elas não alteram partida confirmada nem estatística esportiva. O overall de uma comunidade não é ranking do jogador.

## Perfil

`profiles` continua com username, nome e visibilidade. Altura, sexo e referência da foto ficam em `profile_personal_details`, uma linha por conta.

- Altura é inteiro em centímetros, nula ou entre 50 e 250. A tela mostra `175 cm`.
- Sexo aceita `female`, `male` ou `intersex`. "Prefiro não informar" grava nulo. O campo não restringe comunidade, encontro ou cartinha, e não entra no overall.
- `show_height`, `show_sex` e `show_avatar` nascem desligados. Outra pessoa só vê o campo se o perfil for público e o flag correspondente estiver ligado. A própria pessoa sempre vê os seus dados.
- A ausência aparece como "Não informado".

`avatar_path` é a chave do objeto, nunca uma URL assinada. Nesta etapa o caminho permanece nulo.

## Foto

O cliente valida JPEG, PNG e WebP de até 2 MB e recusa SVG. O envio real exige Storage.

O supervisor local em `scripts/local-supabase.mjs` sobe Auth, PostgREST, Postgres e serviços auxiliares. Não sobe Storage, MinIO nem imgproxy. Não foi instalado um projeto remoto nem um contêiner só para arquivo. `uploadAvatar` valida o arquivo e devolve erro explícito. A tela não trata arquivo local como avatar persistente e não mostra sucesso.

Quando o Storage existir, o bucket deve ser privado. A leitura autorizada segue os mesmos flags de visibilidade. A cartinha usa a foto só com `show_avatar` e perfil legível; caso contrário, mostra a inicial.

## Modelo das cartinhas

- `community_card_templates`: versão imutável, `draft`, `active` ou `retired`. Uma comunidade tem no máximo um rascunho e uma versão ativa.
- `community_card_attributes`: 3 a 8 atributos, com nome, descrição opcional, ordem e `name_key` normalizado. Nomes repetidos na mesma versão são recusados.
- `community_card_participations`: participação voluntária. Sem linha, a pessoa não entra no catálogo.
- `community_player_ratings`: uma nota vigente por avaliador, jogador, atributo e versão. Atualizar substitui a linha. A nota é inteiro de 1 a 99.

Nomes de atributo sobre aparência, corpo ou sexualidade são recusados por uma lista básica. Isso não é moderação completa.

Uma comunidade multiesportiva continua com uma configuração geral. Cartinha separada por modalidade fica para outra etapa.

## Cálculo

A média do atributo é `avg(score)` no Postgres. A leitura publica uma casa decimal só quando há pelo menos 3 avaliadores distintos e ainda ativos. O limite está em `private.card_rating_minimum()`.

O overall é a média aritmética dessas médias, com peso igual, arredondada só no fim para inteiro. Atributo sem amostra suficiente deixa o overall de fora. A tela mostra "Aguardando avaliações suficientes" ou "Em avaliação". Não há nota zero inventada.

Sexo, altura, foto e estatística de partida não entram na conta.

## Participação, saída e abuso

Ativar e desativar é ação da própria pessoa. Desativar apaga as notas recebidas naquela comunidade e tira a cartinha da lista. Reativar começa sem nota antiga. Administrador não ativa a cartinha de outra pessoa.

Sair ou ser removido apaga as notas em que a pessoa era avaliadora. Entrar de novo não as restaura. A cartinha de quem saiu some do catálogo ativo. Partida e estatística esportiva permanecem.

O avaliador é `auth.uid()`. Não há voto em si mesmo, em quem não participa, em outra comunidade, em convite pendente ou em versão que não está ativa. Há no máximo 120 alterações de nota por avaliador, comunidade e hora. A unicidade impede linha duplicada sob concorrência. A trava segue comunidade, participações e o template ativo.

## Privacidade

A tabela de notas não tem `select` para `authenticated`. As funções de lista e de cartinha devolvem agregados. O autor lê a própria nota em `get_my_community_player_rating`. Não há função que liste votos brutos. Administrador não consulta nota individual pela API comum.

Grupo pequeno não é anonimato matemático: a mudança de uma média pode permitir inferência. A interface diz isso.

Comunidade pública não abre cartinha para quem não é integrante.

## Autorização

Tabelas com RLS forçado, sem privilégio de leitura ou escrita para `anon` e `authenticated`. Escrita só com `padre.card_write` na transação. Funções públicas são `security invoker` e chamam corpos `security definer` em `private`, com `search_path` vazio. `anon` não executa as funções novas. O cliente não usa `service_role`.

`profile_personal_details.user_id` é `on delete cascade`. `created_by` do template é `on delete set null`. A exclusão de conta sem histórico esportivo não ganha bloqueio novo.

## Android

A mesma tela React vale no Capacitor. Não há fluxo de upload separado. Sem Storage, a câmera não é pedida. O seletor de arquivo da web valida e mostra a indisponibilidade. Cartinha, nota numérica, tema e rolagem são os componentes da web.
