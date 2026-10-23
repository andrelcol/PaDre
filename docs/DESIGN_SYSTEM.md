# PaDre — Sports Club

Identidade visual da aplicação. O domínio e as permissões continuam no Postgres. Esta página descreve só a superfície.

## Identidade

O PaDre é um clube esportivo digital: encontro presencial, grupo e placar confirmado. A tela usa petróleo, grafite e verde de quadra. O tema escuro é a mesma identidade sobre um grafite profundo, não um preto com texto branco. Não há painel corporativo nem número inventado.

## Temas

Há três preferências: `light`, `dark` e `system`. Quem ainda não escolheu fica em `system`, que acompanha `prefers-color-scheme`. A escolha fica em `localStorage`, na chave `padre.theme`, e vale sem login. Entrar ou sair não altera o tema.

O controle **Aparência** oferece Claro, Escuro e Sistema, com a opção atual marcada. No celular ele fica no topo. No desktop, na coluna lateral. O rótulo é texto, não só ícone.

A classe `dark` entra no `html` antes do React, por um script no `index.html`. Assim a primeira pintura já usa a paleta certa. Com Sistema selecionado, uma mudança do sistema operacional atualiza a tela sem recarregar. `color-scheme` acompanha o tema para os controles nativos.

Telas novas devem usar os tokens semânticos (`bg-background`, `text-foreground`, `bg-card`, `text-muted-foreground`, `bg-primary`, `text-pitch`, `bg-ink`). Não fixe `bg-white`, `text-black` nem `theme === "dark"` no componente. O mapa troca o estilo do provedor conforme a classe `dark` e não usa filtro de inversão. Rankings futuros herdam os mesmos tokens.

## Cartinha

`PadrePlayerCard` é a cartinha da comunidade. A faixa usa `bg-ink` e `text-ink-foreground`. O overall usa `text-pitch` e também o numeral, para não depender só da cor. De 3 a 8 atributos cabem na mesma lista. Sem foto autorizada, a inicial ocupa o lugar da imagem. "Aguardando avaliações suficientes" não é apresentado como nota baixa.

## Paleta clara

Tokens em `src/index.css`, no `:root`.

| Token                  | Uso                           | Valor aproximado       |
| ---------------------- | ----------------------------- | ---------------------- |
| `--background`         | Fundo da página               | azul-acinzentado claro |
| `--foreground`         | Texto                         | grafite azulado        |
| `--card`               | Superfície                    | branco                 |
| `--primary`            | Ação principal e página atual | azul-petróleo          |
| `--primary-foreground` | Texto sobre a ação            | quase branco           |
| `--accent`             | Realce de hover               | verde de quadra        |
| `--pitch`              | Número esportivo e vitória    | verde de quadra        |
| `--ink`                | Faixa de destaque             | grafite                |
| `--ink-foreground`     | Texto sobre a faixa           | quase branco           |
| `--destructive`        | Erro                          | vermelho               |
| `--success`            | Confirmado                    | verde                  |
| `--warning`            | Atenção e contestação         | âmbar                  |
| `--muted`              | Apoio                         | cinza neutro           |
| `--border` / `--input` | Contorno                      | cinza azulado          |

## Paleta escura

A classe `.dark` redefine os mesmos tokens.

| Token                  | Uso                | Valor aproximado                |
| ---------------------- | ------------------ | ------------------------------- |
| `--background`         | Fundo              | grafite petróleo                |
| `--card` / `--popover` | Superfície elevada | grafite um pouco mais claro     |
| `--foreground`         | Texto              | cinza muito claro               |
| `--muted-foreground`   | Apoio              | cinza legível                   |
| `--primary`            | Ação               | petróleo claro                  |
| `--primary-foreground` | Texto da ação      | grafite                         |
| `--pitch`              | Número e vitória   | verde de quadra sobre o escuro  |
| `--ink`                | Faixa              | grafite mais fundo que a página |
| `--destructive`        | Erro               | vermelho claro                  |
| `--success`            | Confirmado         | verde claro                     |
| `--warning`            | Atenção            | âmbar claro                     |
| `--border`             | Contorno           | cinza discreto                  |

O verde e o petróleo claro marcam ação e placar. O restante permanece em grafite, sem brilho neon e sem gradiente.

## Tipografia

Outfit nos títulos. Source Sans 3 no texto. Se a rede não entregar a fonte, a pilha cai em Segoe UI e sans-serif.

Escala: título de página grande, título de seção, título de cartão, texto de apoio, metadado pequeno e número de placar em destaque.

## Espaço, forma e movimento

Raio base `0.9rem`. Botão e navegação usam pílula, com alvo mínimo de 44px. Cartão de encontro, local e amizade usa borda e raio `2xl`. Sombra fica só no cartão de autenticação.

`prefers-reduced-motion: reduce` zera transição e animação.

## Navegação

No celular, a barra inferior leva a Início, Encontros, Comunidades, Amigos e Perfil. Locais e Modalidades ficam no topo, porque não cabem na barra sem esconder o destino atual.

No desktop, a mesma navegação vira uma coluna fixa à esquerda, com Locais, Modalidades, Aparência e Sair juntos. A página atual usa o petróleo. O foco visível é o anel do tema.

As rotas não mudaram. As páginas carregam sob demanda e, se o módulo falhar, a navegação tenta de novo em vez de guardar o erro.

## Componentes

Botão, campo, cartão e rótulo continuam em `src/shared/ui`. O mesmo componente serve aos dois temas. O placar de partida lê o tipo da regra: sets, gols ou games com tiebreak, e repete o resultado em texto. Confirmada, contestada, pendente e anulada também aparecem por escrito. A estatística mostra o número grande e uma barra de vitórias sobre partidas. O chat separa a mensagem da pessoa da mensagem dos outros. A enquete marca a opção escolhida com borda e com o texto "Sua escolha". A comunidade guarda chat, enquete e locais em abas; encontro, integrantes e convite permanecem na página.

O card da lista de encontros mostra modalidade, título, horário, local, vagas e status. O detalhe abre com uma faixa de horário, local e vagas, e agrupa o restante em cartões. A lista não traz o nome da comunidade; esse nome aparece no detalhe, quando o encontro é comunitário.

Estado vazio, erro e confirmação continuam no texto de cada domínio. Arquivar local, cancelar encontro, remover amigo, apagar mensagem e cancelar enquete pedem uma segunda ação.

## Acessibilidade

O contraste alvo é 4,5:1 para texto e 3:1 para texto grande e para o contorno dos controles. Controle é botão, link ou rádio. Erro de formulário continua associado ao campo que já existia. Seleção de enquete, de aba e de tema não depende só da cor. O placar repete o vencedor em texto.

## O que ficou de fora

Gráfico grande, biblioteca de ícones e animação decorativa. O mapa acompanha o tema efetivo, com lista ao lado para quem não usa o gesto. A preferência de tema ainda não vai para o banco. A próxima etapa visual pode trocar a fonte remota por arquivo local se o uso offline for obrigatório.
