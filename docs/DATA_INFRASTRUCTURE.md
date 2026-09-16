# Infraestrutura de dados do Hi You!

## Escopo

A migration `supabase/migrations/20260916000100_create_identity_foundation.sql` prepara apenas a fundação de identidade, perfil, privacidade, bloqueios e avatares. Ela não implementa cadastro, login ou uma autenticação paralela. `auth.users.id` é a origem da identidade.

## Modelo de dados

- `public.profiles`: perfil sem dados privados, identificado por `user_id` UUID. Possui username normalizado e único, nome de exibição, bio, caminho de avatar e opção explícita de descoberta.
- `public.privacy_settings`: preferências privadas em relação um-para-um com o perfil.
- `public.user_blocks`: bloqueio direcionado entre dois perfis, com chave composta que impede duplicidade e constraint que impede autobloqueio.
- `storage.buckets` / `storage.objects`: bucket privado `profile-avatars`; cada objeto deve ficar sob a pasta cujo nome é o UUID do proprietário.

As foreign keys usam `on delete cascade`, de modo que a remoção da identidade pelo fluxo administrativo do Supabase elimina os dados dependentes. A aplicação deverá criar o perfil e suas configurações após o cadastro; não há trigger automática em `auth.users` para evitar efeitos implícitos no schema gerenciado pelo Supabase.

## Acesso e RLS

RLS é habilitado e forçado nas três tabelas públicas.

- `anon` não recebe nenhuma policy de tabela ou Storage.
- Usuários autenticados podem criar, ler, alterar e excluir somente o próprio perfil.
- Outros perfis são legíveis somente quando `is_discoverable = true` e não existe bloqueio em nenhuma direção.
- Configurações de privacidade são acessíveis somente pelo proprietário.
- Cada usuário pode consultar e administrar apenas os bloqueios que criou. A pessoa bloqueada não recebe acesso à lista.
- Objetos de avatar são privados e somente o proprietário da pasta pode ler ou gravar.

Não há `USING (true)` para dados privados. O perfil não contém e-mail, telefone, senha, tokens ou metadados privados de autenticação.

## Decisões de segurança

`public.is_blocked_between` usa `SECURITY DEFINER` somente porque a policy de descoberta precisa detectar bloqueios nas duas direções sem revelar quem bloqueou o usuário. A função tem `search_path` vazio, referencia objetos qualificados e sua execução é revogada de `public` e `anon`.

As demais funções usam o comportamento invocador padrão. Triggers existem apenas para manter `updated_at`. O caminho do avatar é validado para começar com o UUID do proprietário, e as policies de Storage repetem essa condição.

A migration cria índices apenas para consultas previstas: username único, listagem de perfis descobríveis e busca de bloqueios pelo usuário bloqueado. Nenhum dado fictício é inserido; a linha do bucket representa configuração versionada do Storage.

## Ordem de aplicação

1. Revisar esta documentação e a migration SQL.
2. Vincular o Supabase CLI ao projeto remoto correto em um ambiente autorizado.
3. Confirmar que o projeto oferece os schemas `auth` e `storage` e as funções padrão `auth.uid()` e `storage.foldername(text)`.
4. Aplicar as migrations em ordem lexical pelo mecanismo oficial do Supabase.
5. Verificar tabelas, constraints, índices, funções, triggers, RLS, policies e o bucket após a aplicação.
6. Testar com sessões separadas para `anon`, dois usuários autenticados e, quando aplicável, uma função administrativa confiável.

## Pré-requisitos

- Projeto Supabase com Auth e Storage habilitados.
- Executor de migrations com privilégios para referenciar `auth.users`, criar objetos em `public`, configurar policies em `storage.objects` e registrar o bucket.
- Processo de deploy que aplique migrations versionadas na ordem correta.
- Configuração posterior do cliente frontend para o mesmo projeto; nenhuma variável pública foi criada nesta fase.

## Limitações atuais

A migration não foi aplicada. Não foram executados SQL, Supabase CLI, build, lint ou typecheck. A revisão realizada é somente estática; portanto ainda não estão validados a versão PostgreSQL do destino, disponibilidade exata das funções de Storage, conflitos com policies ou bucket existentes, permissões do executor, desempenho real, comportamento das sessões Auth e integração com o frontend.

Antes do uso em produção também devem ser definidos os fluxos de criação de perfil, tratamento de conflito de username, exclusão de conta, entrega de avatares privados e testes automatizados de isolamento entre usuários.
