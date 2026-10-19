# Estatísticas

A estatística oficial é a soma das contribuições de partidas `confirmed`. Cada contribuição é a linha de um jogador escalado naquela partida. Não há contador editável e não há segunda tabela de totais.

## O que entra

Só a revisão vigente de uma partida `confirmed`. `draft`, `pending_confirmation`, `disputed` e `voided` não geram linha. Se uma dessas partidas já teve contribuição e deixar de estar confirmada, o reprocessamento apaga as linhas dela.

A escalação é `match_players`. Participar do encontro sem jogar aquela partida não conta. Jogar várias partidas no mesmo encontro conta uma vez por partida. Sair do encontro depois, ou cancelar o encontro, não apaga contribuição de partida que já estava `confirmed`.

O lado do jogador decide o desfecho:

- o lado vencedor recebe `win`
- o outro lado recebe `loss`
- empate, quando a regra permite, dá `draw` aos dois lados

A modalidade, o formato e a versão da regra vêm de `matches.scoring_rule_version_id`. Uma troca posterior no catálogo ou no encontro não reclassifica o histórico.

## Métricas

Cada par fica nulo quando o tipo da regra não o produz. Zero significa que a métrica existe e o valor foi zero. A tela só mostra o par quando os dois lados vieram preenchidos.

| Tipo         | Modalidades atuais               | O que conta                                                                                                 |
| ------------ | -------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `set_based`  | Vôlei, vôlei de areia, futevôlei | Partidas, vitórias, derrotas, pontos marcados e sofridos, sets vencidos e perdidos                          |
| `goal_based` | Futsal                           | Partidas, vitórias, derrotas, empates, gols marcados e sofridos                                             |
| `game_based` | Beach tennis                     | Partidas, vitórias, derrotas, sets vencidos e perdidos, games vencidos e perdidos, pontos do super tiebreak |

Pontos de vôlei não se somam com gols nem com games. A agregação agrupa por modalidade e por `rule_type`, e dentro disso por formato.

Games são só o par `games` de cada set. O vetor `tiebreak` não entra nessa soma e não é guardado como métrica própria. O super tiebreak, o objeto `points` do set decisivo, vai para `deciding_points_for` e `deciding_points_against`. Se a regra tem set decisivo e a partida não chegou nele, essas colunas ficam 0. A tela esconde a linha quando a soma dos dois lados é 0.

Saldo de pontos e saldo de gols são a subtração inteira na tela. Não há coluna de saldo.

A taxa de vitória é `vitórias / partidas * 100`. Empate fica no denominador e não é vitória. O valor guardado na contribuição não é arredondado. A consulta aplica `round(..., 1)`, meio afastado de zero. Sem partidas daquela modalidade, a modalidade não aparece; a taxa não vira `NaN`.

## Processamento

`private.confirm_match`, quando os dois lados fecham a revisão, grava `confirmed` e chama `private.project_match_statistics` antes de encerrar a transação. Falha na projeção desfaz a confirmação.

A função trava a partida com `for update`. Para uma partida confirmada:

1. lê a revisão vigente e a versão da regra gravada na partida
2. confere se o vencedor calculado do placar é o `outcome` já gravado
3. faz upsert de uma linha por jogador escalado
4. apaga linha de usuário que não está mais na escalação

O segundo e o terceiro processamento da mesma partida deixam as mesmas linhas e os mesmos valores. `created_at` permanece. `updated_at` muda. Duas chamadas concorrentes esperam a mesma trava, então não duplicam nem perdem a linha. A chave primária `(match_id, user_id)` impede duas contribuições do mesmo jogador na mesma partida.

## Reprocessamento

Só o papel `postgres` executa estas funções. O cliente autenticado não tem `EXECUTE`.

```sql
select private.project_match_statistics('<match_id>');
select private.reproject_user_statistics('<user_id>');
select private.reproject_all_statistics();
```

A primeira reconstrói uma partida. A segunda percorre as partidas confirmadas daquele jogador. A terceira percorre todas as confirmadas. As três usam `project_match_statistics`. A migration chama a terceira no final, para o histórico que já existia.

Uma correção administrativa de partida confirmada ainda não existe. Quando existir, deve mudar o estado definitivo e chamar `project_match_statistics` de novo. A função não depende de a confirmação ser eterna: fora de `confirmed`, ela remove as contribuições daquela partida.

## Consulta e privacidade

`public.my_statistics()` devolve os agregados de `auth.uid()`.

`public.meetup_participant_statistics(meetup_id)` só responde se quem chama está `confirmed` naquele encontro. O organizador entra porque também está confirmado. A resposta traz `user_id`, `username` e os agregados esportivos de cada confirmado. Não traz e-mail, preferência, dado de autenticação nem o histórico de outros encontros como lista. Os agregados são o desempenho esportivo inteiro da pessoa, não só as partidas daquele encontro. Convite pendente não autoriza. Quem saiu perde o acesso. Um UUID avulso não tem função de leitura.

A tabela tem RLS forçado e nenhuma política. `anon` e `authenticated` não têm `INSERT`, `UPDATE`, `DELETE` nem `SELECT`. O gatilho `protect_statistic_write` recusa escrita sem `padre.statistic_write`. Só a projeção liga esse parâmetro, e ele não atravessa a transação. `DELETE` feito por `postgres` passa, para o cascade de usuário de teste. Os wrappers públicos são `security invoker`, com `search_path` vazio. `anon` não executa nenhum deles.

A tela do perfil e a do encontro dizem que confirmados do mesmo encontro podem ver o desempenho esportivo uns dos outros, e que o restante do perfil continua privado.

## Como acrescentar uma métrica

1. Adicione o par de colunas anuláveis em uma migration nova, com a mesma checagem dos pares atuais: os dois nulos ou os dois não negativos.
2. Faça `private.match_side_tally` preencher o par só no tipo de regra que tem esse significado. Nos outros tipos, deixe nulo.
3. Inclua o par no `upsert` de `project_match_statistics` e nas somas de `aggregate_statistics`. Soma de coluna toda nula continua nula. `jsonb_strip_nulls` tira o campo da resposta.
4. Mostre o par na tela só quando os dois valores vierem preenchidos.
5. Cubra o caso num teste de banco com uma partida confirmada daquele tipo, e confira que outro tipo continua com o par nulo.

Um tipo novo de pontuação também precisa de versão nova da regra e de ramo em `private.resolve_match_outcome`. Não altere uma `scoring_rule_versions` já gravada para reinterpretar partida antiga.

## Companheiros e adversários

A relação nasce da escalação da partida, não da lista do encontro. Duas pessoas no mesmo `match_teams.side` são companheiras naquela partida. Lados diferentes são adversárias. A mesma dupla pode ser as duas coisas em partidas diferentes, e as listas não se misturam.

A consulta junta `match_player_statistics` com `match_players` e `match_teams`. A chave `(match_id, user_id)` faz cada par contar uma vez por partida, mesmo num 4x4. Quem não estava escalado não entra. Partida que não está `confirmed` não tem contribuição, então não entra.

Para o jogador consultado, vitória, derrota e empate são o `result` da contribuição dele. O adversário vê o espelho: a vitória de um é a derrota do outro. A taxa é `vitórias / partidas * 100`, com empate no denominador e `round(..., 1)` só na leitura.

O filtro de modalidade é obrigatório nos destaques. O formato é opcional. A soma dos formatos de uma modalidade é o total dela. Modalidades diferentes não se somam.

Não há tabela de dupla. Reprocessar as contribuições individuais não duplica relação, porque a relação é recalculada.

### Destaques

A constante é `private.relationship_highlight_minimum()`, hoje 5. Quem tem menos partidas continua na lista e não concorre a melhor companheiro nem a adversário mais difícil. Se ninguém chega a 5, o destaque fica `insufficient_sample`. Se não há candidato, fica `none`. A interface não inventa um nome.

| Destaque                   | Quem entra                                | Ordem                                                                                   |
| -------------------------- | ----------------------------------------- | --------------------------------------------------------------------------------------- |
| Companheiro mais frequente | Todos                                     | Mais partidas, mais vitórias, mais derrotas, username, `user_id`                        |
| Melhor companheiro         | Pelo menos 5 partidas                     | Maior aproveitamento, mais partidas, mais vitórias, username, `user_id`                 |
| Adversário mais frequente  | Todos                                     | Mais confrontos, mais vitórias do consultado, mais derrotas, username, `user_id`        |
| Mais vitórias contra       | Quem o consultado venceu ao menos uma vez | Mais vitórias, mais confrontos, menos derrotas, username, `user_id`                     |
| Adversário mais difícil    | Pelo menos 5 confrontos                   | Menor aproveitamento do consultado, mais derrotas, mais confrontos, username, `user_id` |

Os destaques percorrem todos os pares elegíveis, não a página da lista. A lista pessoal devolve no máximo 50 linhas, com `offset`. O encontro devolve os confirmados, no máximo 64.

### Privacidade das relações

`my_teammate_statistics`, `my_opponent_statistics` e `my_relationship_highlights` usam `auth.uid()`. Não recebem o id de outra pessoa. O username de quem jogou uma partida confirmada com o consultado aparece na lista dele. E-mail, preferência e a identificação dos encontros não aparecem.

`meetup_player_relationships(meetup_id, player_id)` exige os dois `confirmed` naquele encontro. Os pares devolvidos são só outros confirmados dali. Os totais podem incluir partidas confirmadas anteriores entre essas mesmas pessoas, sem dizer em qual encontro. Quem está só num outro encontro não aparece. Convite pendente e quem saiu recebem `42501`. Anônimo não executa. Não existe função que receba dois UUIDs soltos.

### Como acrescentar uma métrica social

1. Calcule o valor na consulta `private.player_pair_statistics`, a partir da contribuição ou do placar já guardado. Não copie a métrica para uma coluna nova da contribuição individual.
2. Inclua o campo em `relationship_json` e no Zod do cliente.
3. Mostre o campo na lista e no detalhe.
4. Se o destaque depender do campo, documente a ordem e cubra o desempate num teste de banco.
5. Mantenha modalidade e formato como recorte. Não some unidades diferentes.

## Auditorias

### Reprocessamento

`reproject_all_statistics` percorria só partidas `confirmed`. Uma contribuição deixada numa partida que já não estava confirmada sobrevivia ao reprocessamento completo. `reproject_user_statistics` tinha o mesmo buraco para as linhas daquela pessoa. A migration `20261019030042` apaga essas linhas antes de reconstruir. Partida confirmada continua sendo regravada pela mesma `project_match_statistics`. O estado `confirmed` ainda não pode voltar atrás pelo gatilho atual. A limpeza deixa o reprocessamento pronto para uma anulação futura, sem implementar essa anulação.

### Proteção

`padre.statistic_write` não é a única trava. `anon` e `authenticated` não têm `SELECT`, `INSERT`, `UPDATE` nem `DELETE` na tabela. A RLS está forçada e não há política de leitura. O gatilho recusa escrita sem o parâmetro, inclusive para função `security definer`. O parâmetro vale só na transação e só a projeção o liga. `postgres` ainda pode apagar linha, para o cascade dos testes. As funções de reprocessamento não são executáveis pelo cliente.

### Migrations com hora inválida

`20261018240000` e `20261018250000` não são horários: a hora 24 e a 25 não existem em `YYYYMMDDHHmmss`. A CLI oficial aceita o arquivo porque o padrão é `^([0-9]+)_(.*)\.sql$`. Na lista, um horário válido vira data; esses dois permanecem o número cru. A ordem numérica entre eles está correta, e uma versão `20261019...` fica depois.

Uma migration com relógio real de 18 de outubro de 2026, por exemplo `20261018235959`, entra antes delas. A inspeção isolada, num banco descartável, mostrou essa ordem. Os arquivos aplicados não foram renomeados e o histórico do banco de desenvolvimento não foi reescrito. Migration nova precisa de versão maior que `20261018250000`. `supabase migration new` passou a gerar `20261019...`, que respeita essa ordem.

## Limites desta fase

Não há ranking, desempenho por local, estatística de dupla fixa nem filtro por período. A privacidade da relação ainda é a participação confirmada no encontro, sem configuração por pessoa. Pontos de tiebreak de games não são armazenados; apenas ficam de fora da contagem de games.
