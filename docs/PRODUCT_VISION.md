# Visão do produto

PaDre é uma plataforma social para organizar encontros esportivos presenciais e acompanhar o que acontece dentro deles.

## Problema

Combinar um esporte com amigos hoje se espalha entre mensagens, planilhas e memória. O histórico se perde: quem jogou, contra quem, com quem e em qual local. Cada modalidade ainda conta o placar de um jeito diferente, então uma estatística genérica de "pontos" mente assim que o segundo esporte entra.

## Proposta

PaDre reúne quatro coisas que precisam permanecer consistentes:

1. Pessoas, com perfil e privacidade.
2. Encontros, com data, horário, modalidade, local e confirmação de presença.
3. Partidas disputadas nesses encontros, com regras de pontuação da modalidade.
4. Estatísticas calculadas a partir das partidas confirmadas, nunca editadas à parte.

Comunidades agrupam pessoas e encontros, mas um encontro também pode existir sozinho. Amizade e participação em comunidade são relações diferentes.

## Quem usa

- Quem organiza peladas, sets e jogos recorrentes.
- Quem participa e quer confirmar presença por convite.
- Quem ainda não tem conta e chega por um link.
- Quem consulta o próprio desempenho, confrontos e locais.

Não há, nesta visão, perfil de clube profissional, bilheteria ou transmissão.

## Capacidades

### Primeira leva

- Perfil individual e estatísticas separadas por modalidade.
- Amigos e convites.
- Encontros presenciais com data, horário, modalidade, local e participantes.
- Link de convite para quem ainda não tem cadastro.
- Partidas registradas durante o encontro.
- Estatísticas individuais, confrontos diretos, desempenho com companheiros e desempenho por local.
- Comunidades com integrantes, administradores e encontros coletivos.
- Chats, enquetes, rankings e mapa interativo.

### Depois

- Opções de transporte público até o local do encontro.

### Modalidades iniciais

Vôlei, vôlei de areia, futsal, beach tennis e futevôlei. A lista é dado de catálogo, não um conjunto fechado no código. Beach tennis e vôlei não compartilham o mesmo placar; futsal pode empatar; um formato recreativo pode ter menos atletas que o regulamento oficial. Formato e regra de pontuação são registros versionados, e cada partida aponta para a versão usada.

## Princípios

- O resultado confirmado da partida é a única fonte de verdade esportiva.
- Autorização que importa mora no banco, com Row Level Security.
- Horário de encontro é um instante universal mostrado no fuso do local.
- Convite público carrega um token opaco, com prazo, e o servidor guarda só o hash.
- Privacidade de perfil, histórico e estatísticas é configuração explícita.
- A arquitetura deixa entrar outra modalidade sem reescrever encontros, amizades ou comunidades.

## O que este repositório ainda não é

A aplicação já tem contas, perfil, amizades, o catálogo das cinco modalidades, encontros privados, link de convite, partidas com placar confirmado pelos dois lados, estatísticas individuais, as relações de companheiro e adversário, comunidades públicas e privadas com proprietário, administrador, integrante, convite por username e encontros publicados para quem participa, o chat coletivo de cada comunidade, e enquetes com escolha única ou múltipla, prazo e resultado agregado. Não há Realtime, desempenho por local nem ranking.
