# Chamadas privadas de áudio e vídeo — Hi You!

## Arquitetura

O módulo `src/shared/calls` concentra estado, sinalização e WebRTC para chamadas privadas 1:1. `CallProvider` mantém no máximo uma chamada por sessão e reutiliza o mesmo runtime, canal e ciclo de negociação para áudio e vídeo. `callService` encapsula Supabase Realtime Broadcast, `RTCPeerConnection` e captura de mídia. A página de mensagens somente registra conversas e solicita uma chamada com o tipo `audio` ou `video`.

Cada conversa usa o canal privado `call:conversation:<conversation_id>`. A migration `20260916000900_authorize_realtime_calls.sql` autoriza Broadcast em `realtime.messages` apenas quando `auth.uid()` é participante real da conversa. O destinatário também valida conversa, remetente, destinatário e identificador da chamada no cliente, sem substituir a autorização server-side.

Convites, aceite, recusa, encerramento, SDP e ICE são mensagens efêmeras. O convite informa apenas se a chamada solicita áudio ou vídeo. Não existe tabela de chamadas, persistência de SDP/ICE, gravação ou armazenamento de mídia. Áudio e vídeo seguem diretamente pelo WebRTC, nunca pelo servidor da aplicação. A configuração possui STUN público e não inclui TURN; redes restritivas podem impedir a conexão.

## Permissões e ciclo de mídia

Chamadas de áudio solicitam somente o microfone. Videochamadas solicitam câmera e microfone em uma única captura. O destinatário só recebe a solicitação do navegador depois de aceitar; o chamador só a recebe depois do aceite remoto. Assim, abrir a tela de mensagens, receber um convite ou recusar uma chamada não ativa dispositivos.

Permissão recusada, dispositivo ausente, dispositivo ocupado e restrição incompatível produzem estado de falha com mensagem explícita. Durante uma chamada ativa, microfone e câmera podem ser desativados e reativados alterando `MediaStreamTrack.enabled`, sem criar nova negociação. Se uma track deixar de estar disponível, o controle informa indisponibilidade. Troca automática do dispositivo físico durante a chamada não é implementada; mudanças escolhidas no sistema operacional dependem do comportamento do navegador.

O vídeo remoto ocupa a área principal, e a prévia local é exibida sem áudio para evitar retorno. Chamadas de áudio preservam o fluxo e a interface compacta existentes. Os controles possuem nomes acessíveis, estado pressionado e alvos adequados para desktop e mobile.

## Negociação, estados e cleanup

Estados suportados: `initiating`, `ringing`, `receiving`, `connecting`, `connected`, `ending`, `ended`, `declined` e `failed`. Oferta recebida antes do aceite explícito é ignorada. Uma única chamada ocupa a sessão; convites concorrentes são recusados. Flags do runtime tornam aceite, oferta e resposta idempotentes. ICE prematuro permanece somente em memória, com limite defensivo, até a descrição remota estar pronta.

Encerramento local ou remoto, falha, logout, troca de sessão, desmontagem e fechamento da página fecham o `RTCPeerConnection`, interrompem tracks de câmera e microfone, soltam streams e removem canais obsoletos. Operações assíncronas verificam a geração da chamada para não anexar mídia após encerramento. Perda de rede e desconexão do peer atualizam o estado sem iniciar um sistema paralelo de sinalização.

## Limitações de validação

Não validado operacionalmente: aplicação da migration no projeto Supabase, autorização real entre duas contas, entrega e reconexão do Realtime, negociação WebRTC/ICE em redes reais, permissões de câmera e microfone, autoplay, troca física de dispositivos, comportamento em múltiplas abas, necessidade de TURN, compatibilidade entre navegadores, responsividade visual, build, typecheck, lint e chamadas reais de áudio ou vídeo. Os arquivos versionados não comprovam configuração ou execução do backend.
