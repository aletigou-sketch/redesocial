# Moderação e denúncias

## Modelo

A migration `20260916001100_create_moderation.sql` adiciona `reports` e reutiliza `user_blocks`, criado na fundação de identidade. Denúncias registram autor, tipo e identificador do alvo, categoria controlada, descrição opcional, datas e estado. Os estados previstos são `open`, `in_review`, `resolved` e `closed`.

Os alvos aceitos são perfil, Story, grupo e mensagem. As categorias são spam, assédio, discurso de ódio, violência, conteúdo sexual, falsidade ideológica, privacidade e outros.

## Autorização

A criação ocorre somente pela função `create_report`, que deriva o autor de `auth.uid()` e valida no banco se o alvo existe e está acessível no contexto do usuário. A interface não envia um `reporter_id`. Usuários comuns não possuem policies para listar, alterar ou excluir denúncias, evitando exposição da identidade do denunciante e de dados internos de análise.

Um índice único parcial evita repetição da mesma denúncia ativa pelo mesmo autor, alvo e categoria. Reenvios idênticos são idempotentes enquanto a denúncia estiver aberta ou em análise.

Bloqueios são criados e removidos pelas funções `block_user` e `unblock_user`. Ambas derivam o proprietário da sessão. A RLS de `user_blocks` continua permitindo que cada usuário veja e administre somente os bloqueios criados pela própria conta.

## Integrações

O bloqueio bilateral foi incorporado à autorização de conversas, mensagens, sinalização de chamadas, presença em conversas e criação de notificações. Stories e descoberta de perfis já consultavam `is_blocked_between`. Conversas existentes deixam de aparecer e não aceitam novas mensagens quando há bloqueio entre os participantes.

A interface reutiliza `ModerationActions` em Stories, grupos e mensagens. Ela oferece denúncia contextual e, quando existe uma pessoa diretamente associada, bloqueio com confirmação. Estados de envio, erro e sucesso são explícitos; sessão expirada é tratada pela camada de serviço.

## Limites desta fase

Não há painel administrativo, banimentos, punições automáticas, classificação por IA ou automação de decisões. Os estados posteriores à abertura foram preparados para uma futura superfície administrativa, sem conceder esse acesso ao frontend atual.

A migration foi adicionada ao repositório, mas sua aplicação no Supabase, o comportamento operacional das policies/RPCs e os fluxos integrados permanecem **não validado operacionalmente** nesta tarefa. Também não foram executados testes funcionais, de concorrência ou de interface.
