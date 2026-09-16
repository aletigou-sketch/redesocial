# Mensagens privadas — Hi You!

## Núcleo implementado

O módulo `src/features/messages` implementa conversas privadas entre exatamente dois perfis, envio de texto, histórico paginado, atualização em tempo real e estados de carregamento, vazio, erro, reconexão e entrega. Não inclui grupos de chat, anexos, áudio, reações, chamadas, notificações ou recursos de moderação adicionais. A presença básica foi integrada posteriormente por uma camada compartilhada e está documentada em `docs/PRESENCE.md`.

A migration `20260916000600_create_private_messages.sql` cria `private_conversations` e `private_messages`. Os dois participantes ficam em colunas obrigatórias, distintas e ordenadas, com unicidade do par; assim, uma conversa não pode adquirir um terceiro participante. Mensagens possuem UUID próprio, timestamp UTC e `client_message_id` único por remetente para tornar reenvios idempotentes.

## Segurança

RLS está habilitada e forçada. Conversas só podem ser lidas por um dos dois participantes, e mensagens somente por participantes reais da conversa. Não existem policies de escrita direta para clientes autenticados.

A criação e o envio passam por funções transacionais `security definer` com `search_path` vazio. A identidade do remetente é sempre derivada de `auth.uid()`. O identificador do outro perfil apenas indica o destinatário pretendido: a função exige perfil existente e descobrível, permissão para mensagens diretas e ausência de bloqueio em qualquer direção. Ele nunca substitui o participante autenticado nem concede acesso a terceiros.

A função de criação usa par canônico, constraint única e bloqueio transacional para impedir conversas duplicadas concorrentes. O envio valida participação, conteúdo entre 1 e 4000 caracteres e chave de repetição UUID. Repetir a mesma tentativa retorna a mensagem já persistida em vez de criar uma cópia. A migration de endurecimento `20260916000700_harden_private_messages.sql` também rejeita a reutilização dessa chave com outra conversa ou conteúdo, inclusive em concorrência.

## Consultas e tempo real

A lista de conversas é obtida em uma chamada, incluindo perfil correspondente e última mensagem, sem N+1. O histórico usa cursor composto por `created_at` e `id`, ordenação determinística e páginas de até 30 itens na interface. O índice `(conversation_id, created_at desc, id desc)` atende esse acesso.

A assinatura Realtime é criada apenas para a conversa selecionada e filtrada por `conversation_id`. A tabela permanece protegida por SELECT/RLS; a interface trata a assinatura apenas como transporte, nunca como autorização. Respostas assíncronas e estados de canais antigos são descartados após a troca de conversa, e o carregamento inicial é mesclado com eventos recebidos durante a consulta para evitar perda ou contaminação entre históricos. A arquitetura mantém conversas e mensagens isoladas. A presença usa um canal privado separado por conversa, sem misturar estado efêmero ao histórico; chamadas continuam apenas preparadas para evolução futura.

## Limitações e validação operacional pendente

Não validado operacionalmente: aplicação da migration, inclusão da tabela na publication Realtime, comportamento efetivo de RLS entre contas distintas, preferências e bloqueios reais, entrega e reconexão Realtime, concorrência e idempotência sob carga, planos de consulta, build, typecheck, lint, acessibilidade assistiva e comportamento visual em navegadores ou dispositivos reais. Os arquivos no repositório são preparação versionada e não comprovam que a migration foi aplicada ao Supabase.
