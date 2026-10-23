# Enquetes da comunidade

Uma enquete pertence a uma comunidade. Quem não participa não lê, não vota e não vê o agregado. Comunidade pública não publica a enquete. Convite pendente também não abre.

A pergunta, as opções e a regra de voto ficam congeladas na publicação. Erro de redação se resolve cancelando e criando outra. Não há edição nesta versão, para o voto continuar comparável com o que foi perguntado.

Não nasce encontro a partir de uma enquete. O resultado é uma consulta do grupo, não uma reserva de quadra. A opção de local continua texto livre. Uma referência opcional a `venues` pode entrar depois, sem converter enquete já publicada e sem criar o encontro sozinha.

## Modelo

`community_polls` guarda a pergunta, a descrição opcional, a categoria, o modo, `max_selections`, o estado gravado e `closes_at`. O encerramento é um instante absoluto. A tela mostra esse instante em `America/Sao_Paulo` e escreve o nome do fuso junto.

`community_poll_options` é a mesma tabela para todas as categorias. `community_poll_votes` liga pessoa, enquete e opção. A chave primária impede voto duplicado na mesma opção. Não existe contador gravado à parte: a quantidade é `count(*)` dos votos.

Categorias:

| Categoria  | O que a opção guarda                                                                                                          |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `general`  | Texto livre                                                                                                                   |
| `sport`    | `sport_id` do catálogo, e só se a modalidade está em `community_sports`. O nome exibido é o do catálogo                       |
| `schedule` | Texto. Se houver data, também `starts_at` em UTC e `time_zone` IANA. Horário sem data fica só no texto e não inventa instante |
| `location` | Nome digitado. Não há `place_id`. Dois nomes iguais não são o mesmo lugar                                                     |

Limites: pergunta de 3 a 140 caracteres, descrição até 500, opção de 1 a 80, de 2 a 10 opções. Texto repetido depois de cortar as pontas e juntar espaços internos é recusado. Escolha única força `max_selections = 1`. Múltipla escolha aceita de 1 até a quantidade de opções. O prazo precisa ficar entre 15 minutos e 30 dias à frente do relógio do Postgres. Cada integrante pode criar até 10 enquetes na mesma comunidade em uma hora.

## Voto

`vote_community_poll(poll_id, option_ids)` usa só `auth.uid()`. A chamada manda o conjunto inteiro. A transação apaga a seleção anterior daquela pessoa e grava a nova. Lista vazia retira o voto. A enquete é travada com `for update` antes da troca, e a participação ativa também. Encerrar ou cancelar trava a mesma linha, na mesma ordem.

Dois votos simultâneos da mesma pessoa esperam um ao outro. O que termina por último define a seleção. Um voto que espera o encerramento vê a enquete já fechada e não grava. Um voto que segurou a trava entra; o encerramento corre em seguida e o voto permanece.

O estado efetivo não depende de agendamento. `open` com `closes_at` no passado já é encerrada na leitura e recusa voto. `closed` guarda o resultado. `cancelled` invalida a decisão: os votos ficam para auditoria, sem opção marcada como vencedora, e a enquete não reabre. Criador, proprietário e administrador encerram ou cancelam enquanto a votação ainda está aberta. Cancelar depois do prazo é recusado, porque o prazo já encerrou a consulta.

## Resultado

Para cada opção: identificador, texto, quantidade de votos. Para a enquete: quantas pessoas marcaram ao menos uma opção, o estado efetivo, o prazo e a seleção de quem consulta.

O percentual é `votos da opção / pessoas que votaram * 100`, com uma casa. Na múltipla escolha a soma pode passar de 100%. Isso é a definição, não um erro. Sem votos, o percentual fica nulo e não há vencedora. Empate no primeiro lugar marca todas as empatadas. Não há desempate automático.

A função não devolve quem votou em cada opção. Não há RPC de eleitores. Proprietário e administrador recebem o mesmo agregado.

## Saída e conta

Quem sai ou é removido perde a leitura e o voto novo. O voto antigo continua no agregado enquanto a conta existe, sem o nome da pessoa. Excluir a conta apaga os votos dela (`on delete cascade`) e solta a autoria (`created_by` e `closed_by` em `on delete set null`). A enquete permanece. A trava de histórico esportivo não menciona enquete: partida confirmada continua impedindo a exclusão, e conta sem esse histórico continua excluível.

## Como acrescentar uma categoria

1. Incluir o valor no check de `community_polls.kind` e nas funções que rejeitam categoria desconhecida.
2. Se a opção precisar de um fato estruturado, acrescentar uma coluna anulável em `community_poll_options`, com check e validação na criação. Não criar outra tabela de votos.
3. Ensinar a tela a montar essa coluna e a mostrá-la. O voto, o percentual e a moderação permanecem os mesmos.
4. Documentar o campo aqui e na ADR.

Realtime pode substituir o intervalo de 15 segundos da aba Enquetes sem mudar o contrato de `list_community_polls`.
