# Checkpoint do PaDre

Registro de 23 de outubro de 2026, com o envio ao GitHub atualizado depois. Não publica o produto e não substitui o roteiro em [ROADMAP.md](./ROADMAP.md). O plano da beta está em [BETA_DEPLOYMENT.md](./BETA_DEPLOYMENT.md).

## Onde cada coisa está

| Situação                       | Estado                                                                                                                                                |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| Implementado localmente        | Sim, no disco desta máquina, incluindo o que ainda não foi commitado                                                                                  |
| Versionado no Git local        | Sim. `HEAD` é `c929448`, incluindo locais, mapas, tema, Android, perfil e cartinhas                                                                   |
| Enviado ao GitHub              | Sim. `origin/main` está em `c929448`. O site público e o Supabase hospedado continuam inexistentes                                                    |
| Aplicado no banco local        | Sim. As 18 migrations, inclusive perfil e cartinhas, estão em `supabase_migrations.schema_migrations`                                                 |
| Aplicado em banco hospedado    | Não. Não há projeto Supabase remoto ligado                                                                                                            |
| Testado na web                 | Sim, nesta data: format, lint, tipos, 117 testes unitários, 139 testes de banco e 25 testes de navegador. Um teste de vídeo foi ignorado de propósito |
| Compilado no Android           | Sim. APK debug em `artifacts/android/padre-debug.apk`, 5.685.730 bytes, `com.padre.sportsclub.dev`, `0.1.0-dev`, 23 de outubro de 2026                |
| Testado em dispositivo Android | Não. Nenhum aparelho estava ligado. O AVD `Pixel_Fold_API_35` existe, mas não foi iniciado: a máquina tinha cerca de 1,3 GB livres de 7,8 GB          |
| Disponível publicamente        | Não. GitHub Pages não está configurado                                                                                                                |

## Git

`HEAD` e `origin/main` estão em `c929448` (`feat: consolidate sports club features and android foundation`). O envio foi fast-forward a partir de `cf84435`. Não há site público. `artifacts/` continua fora do Git.

## Banco

Os dados persistentes ficam em `supabase/.runtime/data`. O supervisor em `scripts/local-supabase.mjs` só executa `initialise` quando não existe `PG_VERSION`. A inicialização desta data reabriu o Postgres 17 existente. Não houve `supabase db reset`.

Antes de subir o serviço, a árvore e esse diretório foram copiados para o arquivo local `/home/andrelcol/Desktop/PaDre/padre-checkpoint-20261023.tar.gz` (23 MB, 2781 entradas). O arquivo fica fora do repositório. Ele contém `.env.local` e `supabase/.runtime`, então não deve ser enviado a lugar nenhum.

O banco local tem 894 perfis e 154 comunidades. Perder `supabase/.runtime` sem esse backup apaga esse histórico.

Uma instalação vazia, em outro diretório e na porta 54332, aplicou as 18 migrations em ordem de nome e criou `profiles`, `venues`, `profile_personal_details`, `community_player_ratings` e `match_player_statistics`. Os wrappers públicos de perfil e cartinha ficaram `security invoker`. Esse banco descartável foi apagado em seguida.

As versões `20261019240000` e `20261019250000` não são horários válidos. O supervisor ordena o nome do arquivo como texto e grava esse prefixo em `schema_migrations`. Não renomear esses arquivos: a versão já está registrada no banco local.

## O que o código faz e o que ainda depende de infraestrutura

Foto de perfil: a tela escolhe JPEG, PNG ou WebP de até 2 MB e recusa SVG. Não há recorte, não há remoção de EXIF e não há upload. `uploadAvatar` sempre falha com a mensagem de armazenamento indisponível. O supervisor não sobe Storage. Nada é gravado em Base64.

Android: o mesmo `dist` entra no WebView. Permissões atuais: internet e localização. Deep link: esquema `padre`. Não há permissão de câmera. Compilar não equivale a usar no aparelho.

Exclusão de conta: quem tem partida confirmada ou organiza comunidade continua bloqueado pela regra já existente. Cartinha e detalhe pessoal não criaram bloqueio novo. Não há fluxo público de exclusão além dessa regra.

## Fora do Git

Não enviar: `.env.local`, `supabase/.runtime`, `supabase/.temp`, `node_modules`, `dist`, `.tools`, `android/.gradle`, `android/app/build`, `android/build`, `android/capacitor-cordova-android-plugins`, `android/app/src/main/assets`, `artifacts/android/*.apk`, keystores e `test-results`.

Enviar, quando houver commit: o código em `android/` necessário para recompilar, `capacitor.config.ts`, o wrapper do Gradle e `scripts/android-debug.mjs`.
