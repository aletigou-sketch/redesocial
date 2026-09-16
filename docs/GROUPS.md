# Grupos — Hi You!

## Implementação

O módulo isolado em `src/features/groups` permite criar grupos, listar somente participações da sessão, abrir detalhes, editar grupos administrados, entrar por código UUID e sair quando o usuário não é o criador. Nome, descrição e imagem opcional são validados no cliente e repetidos por constraints e limites do backend.

O frontend não envia `user_id` para autorizar operações. A identidade sempre é conferida pela sessão e por `auth.uid()` no banco. A criação do grupo e da associação administrativa ocorre atomicamente pela função `create_group`. Entrada é idempotente por chave primária composta; saída é uma única exclusão protegida e o criador não pode deixar o próprio grupo, evitando grupo sem administrador.

## Dados, RLS e Storage

A migration `20260916000400_create_groups.sql` adiciona:

- `groups`, com nome, descrição, imagem privada, criador e timestamps;
- `group_members`, com associação única entre grupo e perfil e papéis `admin` e `member`;
- índices para listagem por usuário, atualização e papéis;
- RLS forçada para leitura exclusiva de membros e alteração exclusiva de administradores;
- funções restritas para criação atômica, entrada, saída e compensação de criação;
- bucket privado `group-images`, limitado a JPG, PNG e WebP de até 5 MB;
- policies de Storage que permitem leitura aos membros e escrita/remoção aos administradores.

Imagens usam caminhos únicos iniciados pelo UUID do grupo. A aplicação gera URLs assinadas de dez minutos e não persiste URLs públicas. Se a criação com imagem falhar, o frontend tenta remover o objeto e desfazer o grupo recém-criado. Se uma troca de imagem falhar antes da atualização, o novo objeto é removido; a mídia anterior só é removida depois da atualização aceita.

A entrada usa um código UUID compartilhado por um membro. Isso permite associação sem tornar nome, descrição, imagem ou lista de membros pesquisáveis para não membros. A arquitetura mantém o domínio separado e pronto para referências futuras por `group_id`, sem implementar mensagens, chat, chamadas, notificações ou feed.

## Estados e interface

A página cobre carregamento, vazio, erro, criação, edição, entrada, saída e sessão expirada. Há layout responsivo, foco visível, diálogos semânticos, rótulos de formulário e representação alternativa quando a mídia não está disponível.

## Validação operacional pendente

Não validado operacionalmente: aplicação da migration, criação/configuração do bucket, comportamento real das funções, RLS e Storage entre sessões distintas, concorrência real de entrada e saída, geração e expiração das URLs assinadas, compensação de uploads, build, typecheck, lint e comportamento visual em navegadores ou dispositivos reais. Os arquivos preparados no repositório não representam migration aplicada nem validação do backend Supabase.
