# Mapas

O mapa mostra uma posição que uma pessoa autorizada escolheu. Ele não descobre o lugar pelo endereço e não cria um local.

## Provedor

O motor é MapLibre GL JS. O mapa-base inicial é o [OpenFreeMap](https://openfreemap.org/), sem chave e sem custo obrigatório.

- Tema claro: `https://tiles.openfreemap.org/styles/liberty`
- Tema escuro: `https://tiles.openfreemap.org/styles/dark`

Os dois endereços podem ser trocados por `VITE_MAP_STYLE_LIGHT` e `VITE_MAP_STYLE_DARK`. A troca fica em `src/domains/maps/providers/styles.ts`. Os componentes de local e de encontro não conhecem a URL.

Não usamos o servidor público de tiles do OpenStreetMap como infraestrutura do mapa. Não há roteamento dentro do PaDre.

O estilo escuro é o estilo Dark do OpenFreeMap, derivado do Dark Matter. A tela não aplica `invert()` no mapa.

## Licença e atribuição

Os dados vêm do OpenStreetMap. O esquema de vetores é OpenMapTiles. A atribuição exigida é:

OpenFreeMap © OpenMapTiles · Dados © OpenStreetMap

O MapLibre mantém o controle de atribuição visível. A mesma linha aparece de novo abaixo do mapa. Logotipos e créditos do provedor não são removidos.

O uso da instância pública não tem limite publicado de visualizações. Download offline do planeta, acima de 3.000 tiles ou 50 MB, pede contato com o OpenFreeMap. Esta etapa não baixa tiles para guardar.

## Temas

O mapa segue a classe `dark` do documento, que já representa a preferência clara, escura ou do sistema. Trocar a aparência recria o mapa com o outro estilo, sem recarregar a página. O marcador usa `bg-pitch` e `bg-primary`, então continua legível nos dois temas.

## Coordenadas

`venues.latitude` e `venues.longitude` continuam `numeric(9, 6)`, nulas juntas ou válidas juntas. Latitude vai de -90 a 90. Longitude vai de -180 a 180. `numeric` recusa NaN e infinito.

No cadastro, a posição só entra se a pessoa escolher um ponto e salvar o formulário. Abrir o mapa não grava nada. O nome e o endereço continuam os textos digitados.

Um local que já existe sem posição pode recebê-la uma vez, por `set_venue_location`. A função exige a mesma autorização de editar o local: quem criou o pessoal, ou proprietário e administrador no comunitário. A pessoa confirma na tela. O banco grava `location_set_at` e `location_set_by`. Uma segunda troca é recusada. Endereço, `community_id` e `created_by` continuam imutáveis. Encontro antigo não é reescrito.

## Snapshot do encontro

`meetups.location_latitude` e `meetups.location_longitude` são a cópia geográfica do encontro. Na seleção de um local, o servidor copia a posição que o local tem naquele momento, inclusive quando ela é nula. No local manual, a pessoa pode marcar um ponto; ele fica no encontro e não cria `venue_id`.

`update_meetup` não mexe nessa cópia. `set_meetup_place` troca texto, referência e posição na mesma transação, e continua recusando a troca quando há mais de um confirmado. Uma posição registrada depois no local não altera encontro que já tinha sido criado.

## Privacidade

A leitura continua nas funções que já listam locais. Não há função pública que devolva coordenadas arbitrárias. Comunidade pública não entrega o mapa interno a quem não participa. Local pessoal não aparece para outra conta. Coordenada não abre encontro privado.

Ao escolher um marcador, a tela pede o resumo pessoal daquele local. Os outros pontos não disparam consulta. O resumo não devolve coordenada que a pessoa já não podia ver na lista.

A posição do aparelho, em “Mostrar minha localização”, fica só na tela. Não vai para o banco e não é enviada aos outros integrantes. A página não pede essa permissão ao abrir.

## Como chegar

O link externo só aparece depois de um clique, e só quando há um par válido. Há destino no Google Maps e no OpenStreetMap. Não há cálculo de trajeto, transporte público nem URL permanente do PaDre com a coordenada de outra pessoa.

No Android, a mesma ação abre um aplicativo instalado ou cai no HTTPS. A leitura do aparelho fica em `src/domains/maps/lib/device-location.ts`. O mapa e o resumo estatístico do marcador são os mesmos componentes da web.

## Carregamento

MapLibre entra por import dinâmico no componente do mapa. A página inicial não carrega esse código. A aba invisível da comunidade desmonta o painel, então o mapa não inicia escondido. Ao sair da tela, a instância é destruída. O gesto do mapa pede dois dedos no celular, para a página continuar rolando. A lista permanece disponível. Acima de 200 locais com posição, o mapa mostra os primeiros 200.

Não há PostGIS, busca por proximidade, geocodificação, autocomplete nem catálogo global.
