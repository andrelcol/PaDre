# Android

O aplicativo de desenvolvimento é o mesmo cliente React, empacotado pelo Capacitor no projeto `android/`. O identificador é `com.padre.sportsclub.dev`. Não há uma segunda implementação de encontro, comunidade, mapa ou estatística.

## Estatísticas por local

`VenuePerformanceComparison`, `VenueStatisticsPanel`, `VenueUsageSummary` e o resumo do marcador rodam no WebView. O cálculo fica no Postgres. Não há biblioteca nativa de estatística. Tema, rolagem, filtros e o mapa usam o mesmo CSS da web. A navegação inferior e o teclado continuam nos componentes já compartilhados.

Esta página não substitui o registro de compilação do aparelho. Um APK gerado não significa que a tela foi conferida num emulador ou num telefone.

## Perfil e cartinhas

A identidade esportiva, a cartinha e a nota de 1 a 99 usam os mesmos componentes React. Não há tela nativa separada. O seletor de imagem valida JPEG, PNG e WebP. A câmera não é solicitada enquanto o Storage local não existir, porque não há onde gravar o arquivo. A mensagem de indisponibilidade é a mesma da web.
