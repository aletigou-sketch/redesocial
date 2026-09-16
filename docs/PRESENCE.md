# Presença em tempo real — Hi You!

## Arquitetura

A presença usa Supabase Realtime Presence em canais privados e não cria tabela nem histórico de atividade. A camada reutilizável em `src/shared/presence` centraliza criação, compartilhamento, atualização e remoção dos canais. Páginas consomem contexto e snapshots; não administram diretamente subscriptions Realtime.

Cada tópico identifica um contexto autorizado: `conversation` ou `group`. A migration `20260916000800_authorize_realtime_presence.sql` adiciona policies em `realtime.messages` que permitem leitura e escrita de Presence somente quando `auth.uid()` participa da conversa privada ou do grupo indicado no tópico. Um identificador enviado pela interface não concede acesso. O perfil próprio exibe apenas o estado local da própria sessão e não abre canal público.

O registro em memória reutiliza um canal por tópico, mantém cada inscrição de consumidor separada e remove o canal quando o último consumidor sai. Uma troca de usuário substitui canais pertencentes à sessão anterior, e a troca ou expiração da sessão limpa todos os canais. Troca de conversa desmonta a inscrição anterior. Gerações internas, conferência do registro ativo e serialização das operações `track`/`untrack` evitam que callbacks ou publicações tardias restaurem estados antigos.

## Estados

- `online`: sessão autenticada, navegador conectado e atividade recente;
- `away`: aba oculta ou cinco minutos sem interação local;
- `offline`: ausência de sessão ou navegador sem conexão; para outros participantes, também representa ausência do usuário no snapshot.

Somente `user_id` e o estado atual são enviados como metadados efêmeros. Não são enviados horário da última atividade, conteúdo, perfil, dispositivo, endereço ou informação sensível. Eventos locais atualizam apenas os canais existentes; não há polling. Ao ficar offline, os canais são mantidos para permitir a reconexão automática, mas a camada solicita `untrack` e não publica um estado `offline` persistente.

A tela de mensagens mostra a presença da outra pessoa apenas no contexto da conversa selecionada. O perfil mostra o estado da própria sessão. A camada aceita tópicos de grupo, mas a tela atual de grupos não lista membros individuais; por isso não exibe presença agregada nem cria subscriptions sem um local semanticamente aplicável. Chamadas, vídeo, WebRTC, sinalização e notificações não foram implementados.

## Ciclo, reconexão e limitações

Ao receber `SUBSCRIBED`, a camada reconcilia o estado corrente. Se a sessão estiver online ou ausente, executa `track`; se o navegador estiver offline, executa `untrack`. Mudanças de atividade são serializadas por canal para preservar a ordem. Saída da página, troca de contexto e troca ou expiração da sessão executam `untrack` após operações pendentes e removem o canal. Em quedas abruptas, a remoção server-side ainda depende do timeout do Supabase Realtime.

Não validado operacionalmente: aplicação da migration no projeto Supabase, suporte e configuração efetivos de canais privados, compatibilidade efetiva das policies de `realtime.messages` com a versão implantada do Realtime, limpeza após queda abrupta, reconexão, isolamento entre contas e contextos, presença em múltiplas abas, build, typecheck, lint, testes funcionais e apresentação visual em navegadores reais. Os arquivos versionados não comprovam que a configuração foi aplicada ao backend.
