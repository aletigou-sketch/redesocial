# Notificações — Hi You!

## Arquitetura e eventos

O módulo `src/features/notifications` fornece serviço reutilizável, listagem paginada, leitura individual, leitura em lote e atualização Realtime. O `NotificationProvider` mantém apenas o contador global e uma assinatura da sessão; a página mantém sua própria lista e descarta assinaturas na troca de sessão.

A migration `20260916001000_create_notifications.sql` cria notificações persistentes para nova mensagem, chamada recebida/perdida, atividade relevante de grupo e evento aplicável de Story. A função compartilhada `create_notification` recebe um evento dos módulos existentes, valida no banco a relação entre autor, destinatário e contexto e usa `event_key` único por destinatário para evitar duplicação. Eventos triviais não são gerados automaticamente. A integração inicial deixa os produtores explícitos e desacoplados; novos módulos podem chamar o mesmo contrato sem criar outro barramento.

## Segurança

O destinatário é persistido em cada registro, mas leitura e alteração são autorizadas exclusivamente por `auth.uid()`. RLS está habilitada e forçada, sem policies de inserção ou exclusão direta. A escrita passa por função restrita que deriva o ator da sessão e comprova conversa, grupo ou Story relacionado. O frontend não pode usar um `recipient_id` arbitrário para obter acesso.

Conteúdo, autoria, destinatário, tipo, contexto e data são imutáveis. O cliente pode somente preencher `read_at`, e uma notificação lida não pode voltar ao estado não lido. O índice composto atende destinatário, estado, data e paginação; a chave única `(recipient_id, event_key)` torna a criação idempotente.

## Interface e limitações

O shell apresenta contador de não lidas sem bloquear a aplicação. A página cobre loading, vazio, erro, sessão expirada, paginação e reconexão, preservando o Design System. Quando há contexto, a seleção navega ao módulo correspondente; seleção profunda de uma conversa, grupo ou Story específico não existe na navegação atual.

Não foram implementadas notificações push do navegador, email ou WhatsApp. Chamadas usam sinalização efêmera; persistir chamadas recebidas/perdidas exige que o módulo de chamadas invoque o produtor no momento correto, sem transformar SDP, ICE ou mídia em dados persistentes. Stories só devem produzir eventos relevantes definidos pelo produto.

Não validado operacionalmente: aplicação da migration, RLS entre contas, Realtime, publication, concorrência/idempotência, planos de consulta, geração por eventos reais, reconexão, build, typecheck, lint, acessibilidade assistiva e responsividade visual. Os arquivos versionados não comprovam execução no Supabase.
