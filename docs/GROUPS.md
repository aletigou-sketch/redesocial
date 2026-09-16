# Grupos — Hi You!

## Implementação

O módulo isolado em `src/features/groups` permite criar grupos, listar somente participações da sessão, abrir detalhes, editar grupos administrados, entrar por código UUID e sair quando o usuário não é o criador. Nome, descrição, código e imagem opcional são validados no cliente e novamente por constraints, funções e limites do backend.

O frontend não envia `user_id` para autorizar operações. A identidade sempre é obtida da sessão e conferida por `auth.uid()` no banco. A consulta de grupos filtra explicitamente a associação da sessão, evitando inferir o papel a partir de outro membro retornado pelo relacionamento. A criação do grupo e da associação administrativa ocorre atomicamente pela função `create_group`.

## Dados, autorização e concorrência

As migrations de grupos adicionam:

- `groups`, com nome, descrição, imagem privada, criador e timestamps;
- `group_members`, com associação única entre grupo e perfil e papéis `admin` e `member`;
- índices para listagem por usuário, atualização e papéis;
- RLS forçada para leitura exclusiva de membros e alteração exclusiva de administradores;
- funções restritas para criação atômica, entrada, saída e compensação de criação;
- proteção por trigger para impedir alteração da identidade/autoria do grupo e remoção ou rebaixamento do vínculo administrativo do criador;
- serialização transacional das entradas e saídas concorrentes da mesma sessão no mesmo grupo;
- bucket privado `group-images`, limitado a JPG, PNG e WebP de até 5 MB;
- policies de Storage que validam o segmento UUID antes de autorizar membros ou administradores.

Não há policies de inserção, atualização ou remoção direta de membros para usuários autenticados. Entrada e saída passam pelas funções transacionais e usam exclusivamente `auth.uid()`. O criador não pode sair nem perder seu vínculo administrativo. A autorização do frontend serve apenas para apresentação; RLS, funções e triggers são a autoridade efetiva.

A entrada aceita somente UUID válido. UUIDs possuem alta entropia, tentativas para grupos inexistentes recebem resposta genérica e conflitos são idempotentes. Isso reduz enumeração por resposta, mas limitação de taxa e detecção de abuso devem existir também na camada de infraestrutura/API; não foi criada tabela adicional apenas para esse controle operacional.

## Consultas e imagens

A listagem busca os grupos e todas as associações visíveis em duas consultas, calcula as contagens localmente e evita uma consulta de contagem por grupo. O detalhe faz uma única contagem. URLs de imagens são assinadas por dez minutos e não são persistidas.

Imagens usam caminhos únicos iniciados pelo UUID do grupo. Se a criação com imagem falhar, o frontend tenta remover o objeto e desfazer o grupo recém-criado, informando quando a compensação pode exigir limpeza operacional. Se uma troca falhar antes da atualização, o novo objeto é removido; a mídia anterior só é removida depois da atualização aceita, e falhas dessa limpeza também são informadas.

A arquitetura mantém o domínio separado e pronto para referências futuras por `group_id`, sem implementar mensagens, chat, chamadas, notificações ou feed. Uma integração futura de mensagens deve referenciar o grupo por chave estrangeira e repetir a autorização de associação no backend, sem confiar no papel exibido pela interface.

## Estados e interface

A página cobre carregamento, vazio, erro, criação, edição, entrada, saída e sessão expirada. Há layout responsivo, foco visível, diálogos semânticos, rótulos de formulário e representação alternativa quando a mídia não está disponível. Auth, Profiles e Stories permanecem inalterados.

## Validação operacional pendente

Não validado operacionalmente: aplicação das migrations, criação/configuração do bucket, comportamento real das funções, triggers, RLS e Storage entre sessões distintas, concorrência real de entrada e saída, resistência a abuso sob carga, geração e expiração das URLs assinadas, compensação de uploads, build, typecheck, lint e comportamento visual em navegadores ou dispositivos reais. Os arquivos preparados no repositório não representam migrations aplicadas nem validação do backend Supabase.
