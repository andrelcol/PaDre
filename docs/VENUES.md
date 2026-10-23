# Locais

Um local é um cadastro reutilizável. O nome não prova que dois registros são o mesmo lugar, e endereços parecidos também não. Cada linha tem um UUID. Estatística futura por local agrupa esse identificador, não o texto.

O mapa usa a posição escolhida pela pessoa. Não há geocodificação, autocomplete nem local público global. O detalhe do mapa está em [MAPS.md](./MAPS.md).

## Escopo

Pessoal: `community_id` nulo. Só quem criou lista, edita e arquiva. Serve para encontro privado que essa pessoa organiza.

Comunitário: `community_id` preenchido. Integrante ativo consulta. Proprietário e administrador cadastram, editam e arquivam. Integrante comum escolhe um local ativo ao propor encontro e não muda o endereço do grupo.

Comunidade pública não entrega o endereço a quem não participa. A descoberta da comunidade continua sem a lista de locais.

`community_id` e `created_by` não mudam depois da criação. Não há transferência para outra conta ou outro grupo.

## Campos

`name` é obrigatório, de 2 a 80 caracteres. `address` é obrigatório, até 200. `details` é opcional, até 500, para uma instrução como “entrada pelo portão lateral”. `latitude` e `longitude` são nulas juntas ou válidas juntas: latitude de -90 a 90, longitude de -180 a 180. O formulário só grava o par quando a pessoa marca um ponto. O texto do endereço não vira coordenada.

`status` é `active` ou `archived`. Arquivado não entra em encontro novo. A linha permanece. Encontro, partida, resultado e projeção não são apagados nem reescritos.

## Encontro

`meetups.venue_id` é opcional e aponta para `venues` com `on delete restrict`. Na seleção, o servidor copia `name`, `address` e `details` para `location_name`, `location_address` e `location_details`, e copia `latitude` e `longitude` para `location_latitude` e `location_longitude`. Uma edição posterior do cadastro não altera essas colunas. Uma posição registrada depois no local também não.

Local manual deixa `venue_id` nulo e grava o texto digitado. A pessoa pode marcar um ponto só para aquele encontro. Encontro antigo continua com `venue_id` nulo. Não há migração por semelhança de nome.

Encontro privado só aceita local pessoal ativo de quem organiza. Encontro comunitário só aceita local ativo da mesma comunidade, com a pessoa ainda integrante. Local pessoal não vira local cadastrado de encontro comunitário; o texto manual continua disponível.

`update_meetup` não grava local. Título, descrição e capacidade passam por ela. A troca de lugar é `set_meetup_place`, na mesma transação da referência e do snapshot. Com mais de um confirmado, a troca é recusada, no mesmo critério de modalidade, regra e horário.

Nome e detalhes do cadastro podem ser corrigidos enquanto o local está ativo. O endereço não muda. A posição entra no cadastro ou, uma vez, por `set_venue_location`, com `location_set_at` e `location_set_by`. Depois disso ela não muda. Outro lugar físico é outro cadastro: arquiva-se o anterior.

## Leitura dos encontros

`list_venue_meetups` devolve só encontros com aquele `venue_id` que `can_read_meetup` já autoriza. Texto de endereço igual não entra. A página tem de 1 a 20 itens. Local pessoal alheio responde como não encontrado. Local comunitário não revela encontro privado de outra pessoa.

## Autorização

RLS forçado, sem grant de tabela. O gatilho `protect_venue_write` exige `padre.venue_write` na mesma transação. `created_by` pode ir a nulo na exclusão da conta (`on delete set null`), no mesmo espírito da autoria de enquete, para não criar uma trava nova. Apagar a linha do local usado por encontro é recusado pela chave estrangeira. A API não oferece exclusão física.

As funções públicas são `security invoker`. O corpo fica em `private`, `security definer`, `search_path` vazio. `anon` não executa. `private` não entra no PostgREST.

## Duplicata e provedor externo

Dois “Quadra Central” são dois UUIDs. Uma revisão humana futura pode listar nomes parecidos; a semelhança não funde registro.

Um provedor como Google Places entra depois, com colunas próprias de provedor e identificador externo, sem gravar a resposta do serviço no lugar do texto que a pessoa informou. Enquanto isso, essas colunas não existem.

## PostGIS e mapa

A coordenada numérica é o ponto do mapa. PostGIS não está instalado. Rota interna e transporte continuam fora. O mapa, a privacidade e os links externos estão em [MAPS.md](./MAPS.md).

## Enquete

Opção de local na enquete continua texto. Não há `venue_id` na opção e não há conversão do histórico. Uma associação opcional futura pode apontar a opção para um local da mesma comunidade sem reescrever o voto já contado.

## Estatísticas

O desempenho pessoal agrupa por `venue_id`, a partir de `match_player_statistics`. O cálculo, a privacidade de quem saiu da comunidade e o uso agregado estão em [STATISTICS.md](./STATISTICS.md). Arquivar não apaga esse histórico e não devolve o local para um encontro novo. A utilização comunitária não lista jogadores.

## Catálogo global

Um local público de plataforma, visível fora da comunidade, exigiria escopo novo, revisão e uma política que não copie o endereço comunitário para a descoberta. Não entra nesta versão.
