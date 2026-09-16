# Stories — Hi You!

## Implementação

O módulo fica isolado em `src/features/stories` e usa a sessão Supabase existente. A interface permite publicar imagens JPG, PNG e WebP de até 10 MB, listar Stories autorizados, visualizar mídia com progresso, avanço, retrocesso, fechamento por botão ou teclado e registrar uma visualização por usuário.

O frontend nunca recebe `user_id` da interface para autorizar operações. O proprietário é obtido da sessão e também derivado por `auth.uid()` no banco. Objetos usam caminhos únicos sob a pasta do usuário. O bucket é privado e a aplicação usa URLs assinadas de curta duração, sem persistir URLs permanentes.

## Dados e privacidade

A migration `20260916000200_create_stories.sql` adiciona:

- `stories`, com proprietário, caminho da mídia, tipo e expiração em até 24 horas;
- `story_views`, com chave composta que impede visualizações duplicadas;
- bucket privado `story-media`, limitado aos tipos e tamanho aceitos;
- RLS para criação e exclusão pelo proprietário, leitura de Stories ativos próprios ou de perfis descobríveis e não bloqueados, e visualizações vinculadas à sessão;
- policies equivalentes para upload, leitura assinada e remoção da mídia.

A expiração é aplicada nas consultas e policies. Registros e objetos expirados deixam de ser acessíveis, mas a remoção física posterior exige uma rotina operacional agendada no Supabase; nenhuma Edge Function ou agendamento foi criado nesta fase.

## Estados e integridade

A tela cobre carregamento, vazio, erro, publicação em andamento e mídia indisponível. Arquivos vazios, tipos não permitidos e tamanhos acima do limite são rejeitados antes do upload; o bucket repete as restrições. Se a criação do registro falhar após o upload, o frontend tenta remover o objeto recém-enviado.

## Validação operacional pendente

Não validado operacionalmente: aplicação da migration, criação e configuração do bucket, comportamento real de RLS e Storage entre sessões distintas, geração das URLs assinadas, expiração, remoção de objetos órfãos, build, typecheck, lint e comportamento visual em navegadores/dispositivos reais. Os arquivos estão preparados no repositório, mas isso não representa migration aplicada nem publicação operacional no Supabase.
