# Presença em tempo real — Hi You!

## Arquitetura

A presença usa Supabase Realtime Presence em canais privados e não cria tabela nem histórico de atividade. A camada reutilizável em `src/shared/presence` centraliza criação, compartilhamento, atualização e remoção dos canais. Páginas consomem contexto e snapshots; não administram diretamente subscriptions Realtime.

Cada tópico identifica um contexto autorizado: `conversation` ou `group`. A migration `20260916000800_authorize_realtime_presence.sql` adiciona policies em `realtime.messages` que permitem leitura e escrita de Presence somente quando `auth.uid()` participa da conversa privada ou do grupo indicado no tópico. Um identificador enviado pela interface não concede acesso. O perfil próprio exibe apenas o estado local da própria sessão e não abre canal público.

O registro em memória reutiliza um canal por tópico, mantém listeners por referência e remove o canal quando o último consumidor sai. Troca de sessão limpa todos os canais. Troca de conversa desmonta a inscrição anterior. Gerações internas e conferência do registro ativo evitam que callbacks tardios de canais removidos restaurem estados antigos.

## Estados

- `online`: sessão autenticada, navegador conectado e atividade recente;
- `away`: aba oculta ou cinco minutos sem interação local;
- `offline`: ausência de sessão, navegador offline, desconexão do canal ou ausência do usuário no snapshot.

Somente `user_id` e o estado atual são enviados como metadados efêmeros. Não são enviados horário da última atividade, conteúdo, perfil, dispositivo, endereço ou informação sensível. Eventos locais atualizam os canais existentes; não há polling.

A tela de mensagens mostra a presença da outra pessoa apenas no contexto da conversa selecionada. O perfil mostra o estado da própria sessão. A camada já aceita tópicos de grupo, mas a tela atual de grupos não lista membros individuais; por isso não exibe presença agregada nem cria subscriptions sem um local semanticamente aplicável. Chamadas, vídeo, WebRTC, sinalização e notificações não foram implementados.

## Reconexão e limitações

Quando o canal volta a `SUBSCRIBED`, a camada publica novamente o estado corrente. Saída da página, troca de contexto e troca ou expiração da sessão removem a inscrição e tentam executar `untrack`; a remoção server-side em quedas abruptas depende do timeout do Supabase Realtime.

Não validado operacionalmente: aplicação da migration no projeto Supabase, suporte e configuração efetivos de canais privados, policies de `realtime.messages`, limpeza após queda abrupta, reconexão, isolamento entre contas e contextos, presença em múltiplas abas, build, typecheck, lint, testes funcionais e apresentação visual em navegadores reais. Os arquivos versionados não comprovam que a configuração foi aplicada ao backend.
