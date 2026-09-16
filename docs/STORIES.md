# Stories — Hi You!

## Implementação

O módulo fica isolado em `src/features/stories` e usa a sessão Supabase existente. A interface permite publicar imagens JPG, PNG e WebP de até 10 MB, listar Stories autorizados, visualizar mídia com progresso, avanço, retrocesso, fechamento por botão ou teclado e registrar uma visualização por usuário.

O frontend nunca recebe `user_id` da interface para autorizar operações. O proprietário é obtido da sessão e também derivado por `auth.uid()` no banco. Objetos usam caminhos únicos sob a pasta do usuário, formados com UUID criptográfico. O bucket é privado e a aplicação usa URLs assinadas de cinco minutos, sem persistir URLs permanentes.

## Dados e privacidade

A migration `20260916000200_create_stories.sql` adiciona:

- `stories`, com proprietário, caminho da mídia, tipo e expiração em até 24 horas;
- `story_views`, com chave composta que impede visualizações duplicadas;
- bucket privado `story-media`, limitado aos tipos e tamanho aceitos;
- RLS para criação e exclusão pelo proprietário, leitura de Stories ativos próprios ou de perfis descobríveis e não bloqueados, e visualizações vinculadas à sessão;
- policies equivalentes para upload, leitura assinada e remoção da mídia.

A migration corretiva `20260916000300_harden_stories.sql` restringe também a leitura da mídia do proprietário à existência de um Story ativo correspondente e substitui o índice parcial ineficaz por um índice alinhado à filtragem por expiração.

A expiração é aplicada nas consultas e policies. Registros e objetos expirados deixam de ser acessíveis, mas a remoção física posterior exige uma rotina operacional agendada no Supabase; nenhuma Edge Function ou agendamento foi criado nesta fase.

## Estados, integridade e concorrência

A tela cobre carregamento, vazio, erro, publicação em andamento e mídia indisponível, inclusive falhas ocorridas depois da geração da URL assinada. Arquivos vazios, tipos não permitidos, tamanhos acima do limite e assinaturas binárias incompatíveis com o MIME declarado são rejeitados antes do upload; o bucket repete as restrições de tipo e tamanho.

Se a criação do registro falhar após o upload, o frontend tenta remover o objeto recém-enviado e informa quando essa compensação também falha. Trocas de sessão invalidam carregamentos anteriores para evitar que respostas atrasadas mantenham dados do usuário anterior. O registro de visualização não reinicia o temporizador ao atualizar o estado local, e a chave composta no banco preserva a idempotência.

URLs de mídia e avatar são geradas em paralelo, com reaproveitamento por caminho durante cada carregamento. A consulta seleciona apenas as colunas usadas, filtra expiração no banco e repete a verificação temporal no resultado antes de expor os itens à interface.

## Acessibilidade básica

O visualizador identifica-se como diálogo modal, informa o progresso semanticamente, move o foco para o controle de fechamento, contém a navegação por Tab, restaura o foco ao cartão de origem e bloqueia a rolagem da página enquanto aberto. Escape e setas continuam disponíveis para teclado.

## Validação operacional pendente

Não validado operacionalmente: aplicação das migrations, criação e configuração do bucket, comportamento real de RLS e Storage entre sessões distintas, geração e expiração das URLs assinadas, bloqueio de mídia expirada, remoção de objetos órfãos, build, typecheck, lint e comportamento visual em navegadores/dispositivos reais. Os arquivos estão preparados no repositório, mas isso não representa migrations aplicadas nem publicação operacional no Supabase.
