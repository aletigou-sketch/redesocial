# Chamadas privadas de áudio — Hi You!

## Arquitetura

O módulo `src/shared/calls` concentra estado, sinalização e WebRTC. `CallProvider` mantém no máximo uma chamada por sessão, administra canais, negociação e recursos de mídia; `callService` encapsula Supabase Realtime Broadcast, `RTCPeerConnection` e captura de áudio. A página de mensagens somente registra conversas carregadas e solicita o início da chamada.

Cada conversa usa o canal privado `call:conversation:<conversation_id>`. A migration `20260916000900_authorize_realtime_calls.sql` autoriza leitura e escrita de Broadcast em `realtime.messages` apenas quando `auth.uid()` é participante real da conversa. O destinatário também confere localmente conversa, remetente, destinatário e identificador da chamada, mas essa conferência não substitui a autorização server-side. Canais removidos da lista atual são liberados quando não sustentam uma chamada ativa, reduzindo assinaturas Realtime obsoletas.

Convites, aceite, recusa, encerramento, SDP e ICE são mensagens efêmeras de sinalização. Não há tabela de chamadas, persistência de SDP/ICE, armazenamento de áudio nem transporte de mídia pelo Supabase. O áudio segue diretamente pelo WebRTC. A configuração atual possui STUN público e não inclui TURN; redes restritivas podem impedir conexão.

## Estados e ciclo

Estados suportados: `initiating`, `ringing`, `receiving`, `connecting`, `connected`, `ending`, `ended`, `declined` e `failed`. O envio inicial aguarda a assinatura do canal privado. O microfone é solicitado apenas após o destinatário aceitar ou após o chamador receber o aceite. Oferta recebida antes do aceite explícito é ignorada. Recusa de permissão, ausência de dispositivo e indisponibilidade do microfone resultam em falha sem simular conexão.

Somente uma chamada pode ocupar a sessão. Convites concorrentes recebem recusa. Flags por runtime tornam aceite, oferta e resposta idempotentes e impedem negociações paralelas. ICE recebido antes da descrição remota fica somente em memória, com limite defensivo, e é aplicado após `setRemoteDescription`.

Encerramento, logout, troca de sessão, desmontagem e fechamento da página fecham o `RTCPeerConnection`, interrompem todas as tracks, soltam streams e removem os canais Realtime. Operações assíncronas conferem a geração da chamada antes de anexar mídia, evitando que permissão tardia restaure uma chamada encerrada. Perda de rede ou desconexão do peer muda a chamada para reconexão/falha sem iniciar polling. A arquitetura permite futura inclusão controlada de tracks de vídeo, mas vídeo, grupos, gravação, WebRTC multiparte e servidor próprio de mídia não fazem parte desta fase.

## Auditoria estática da Fase 21

A auditoria corrigiu espera da conexão inicial do canal, closures de estado obsoleto, limpeza em troca de usuário, aplicação prematura de ICE, oferta antes do aceite, mensagens duplicadas de negociação, callbacks tardios de mídia, validação estrutural de SDP/ICE, limite da fila ICE, reconciliação de canais e semântica acessível do overlay. A autorização continua baseada nos dois participantes persistidos em `private_conversations`; SDP e ICE continuam efêmeros.

## Limitações de validação

Não validado operacionalmente: aplicação da migration no projeto Supabase, suporte efetivo a canais privados e Broadcast com a versão implantada do Realtime, autorização real entre contas, entrega e reconexão da sinalização, negociação ICE em redes reais, compatibilidade de microfone e autoplay, necessidade de TURN, comportamento em múltiplas abas, build, typecheck, lint, chamada real e apresentação visual em navegadores/dispositivos. Os arquivos versionados não comprovam configuração ou execução do backend.
