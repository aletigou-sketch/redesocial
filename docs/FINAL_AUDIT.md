# Auditoria técnica final — Hi You!

## Escopo e método

Esta auditoria cobre a arquitetura React/TypeScript, os módulos de Auth, Profiles, Stories, Groups, Messages, Presence, Calls, Notifications, Moderation e Administration, além das migrations Supabase versionadas no repositório.

### Estado da validação

- **VALIDADO ESTATICAMENTE:** organização dos módulos, fluxos no código cliente, contratos de serviços, cleanup de efeitos e canais, validações de entrada, ordem e dependências aparentes das migrations, constraints, índices, funções, grants e policies presentes nos arquivos.
- **NÃO VALIDADO OPERACIONALMENTE:** build, typecheck, lint, execução das migrations, comportamento real de Auth/RLS/Storage/Realtime, reconexão em rede instável, WebRTC entre redes distintas, permissões de mídia e desempenho com volume real.
- Esta auditoria não declara o projeto integralmente validado em produção.

## Estado arquitetural final

A aplicação está separada em composição (`src/app`), módulos de domínio (`src/features`), infraestrutura compartilhada (`src/shared`) e estilos globais (`src/styles`). A UI acessa o backend por serviços de domínio; não há uso de service role no frontend. Providers compartilhados concentram sessão, perfil, presença, notificações e chamadas.

A separação é adequada ao porte atual. Há repetição moderada em validação de UUID, assinatura de imagens, aquisição da sessão e tradução de erros. Essa duplicação não foi removida nesta auditoria porque uma abstração apressada aumentaria o acoplamento entre domínios com regras diferentes.

A Home ainda contém conteúdo demonstrativo local de publicações, Stories, conversas e grupos. Isso é código de apresentação separado dos módulos reais, mas pode causar percepção inconsistente de dados. Foi mantido para não remover funcionalidade nem alterar o conceito do produto.

## Módulos existentes

- **Auth e Profiles:** recuperação e atualização da sessão pelo Supabase Auth, guards de interface, perfil próprio, avatar privado e descarte de respostas obsoletas.
- **Stories:** upload validado, mídia privada, URLs assinadas, expiração, visualizações idempotentes e moderação.
- **Groups:** criação transacional, associação, papéis, saída, autoria protegida, imagem privada e serialização de entrada/saída.
- **Messages:** conversas privadas canônicas, envio idempotente, paginação por cursor, atualização otimista e Realtime.
- **Presence:** canais privados por conversa ou grupo, estados online/away/offline, compartilhamento de subscription, reconciliação e cleanup.
- **Calls:** áudio e vídeo WebRTC, sinalização privada, validação de payload, permissões de mídia e cleanup de streams/canais.
- **Notifications:** deduplicação por chave de evento, paginação por cursor, leitura individual/em lote e Realtime.
- **Moderation:** denúncias, bloqueios e propagação das restrições para descoberta, Stories, mensagens, chamadas, presença e notificações diretas.
- **Administration:** autorização por funções de backend, papéis/permissões privados, triagem de denúncias e auditoria de alteração de estado.

## Problemas encontrados e correções aplicadas

### CORREÇÃO APLICADA — contador de notificações obsoleto

Ao marcar uma notificação ou todas as notificações como lidas, a lista local era atualizada, mas o contador global exibido no shell permanecia com o valor anterior até outra atualização. A tela agora solicita a recontagem autorizada no backend após a confirmação de leitura individual ou em lote.

### PROBLEMA ENCONTRADO — tratamento de sessão não totalmente uniforme

Messages, Notifications e Profile encerram a sessão em erros tipados de expiração. Stories, Groups, Moderation e Administration normalmente exibem o erro, mas nem todos acionam o mesmo fluxo global de saída. A segurança permanece apoiada no Auth e no backend/RLS; o risco é principalmente de experiência inconsistente. Uma política compartilhada de erros de sessão deve ser adotada em etapa futura, sem mascarar falhas de rede como expiração.

### PROBLEMA ENCONTRADO — chamadas dependem das conversas registradas no cliente

Os canais de sinalização são registrados a partir das conversas carregadas pelo módulo de mensagens. O backend restringe o tópico aos participantes, mas o recebimento de chamada fora desse ciclo de UI não está demonstrado operacionalmente. Não foi criada infraestrutura ou funcionalidade adicional nesta auditoria.

### PROBLEMA ENCONTRADO — ausência de TURN

O WebRTC usa STUN público e não configura TURN. Chamadas podem falhar em NATs restritivos, redes corporativas ou cenários móveis. A inclusão de TURN exige operação, credenciais e decisão de infraestrutura, portanto não foi feita como correção automática.

## Auth, identidade e exposição de dados

A sessão persiste, renova token e detecta sessão em URL. Os guards são controle de navegação, não mecanismo de autorização. A autorização relevante está nas policies e funções do banco. Perfis não armazenam e-mail, senha ou tokens. Avatares e mídias usam buckets privados e URLs assinadas.

A revisão estática não encontrou service role, segredo embutido ou credencial no frontend. As variáveis `VITE_` esperadas são URL e chave publicável, não segredo administrativo. A validade da configuração e o vínculo com o projeto correto ainda precisam de validação operacional.

## Stories e Storage

As imagens têm limite, MIME permitido e verificação de assinatura no serviço de Stories. O banco limita tipo, caminho do proprietário e janela de expiração. A mídia é legível somente quando há Story ativo e autorização correspondente. Visualizações usam chave composta e o cliente tolera conflito de duplicidade.

Risco residual: a expiração lógica não remove automaticamente linhas ou objetos. É necessário validar e operar uma rotina de retenção/limpeza sem tornar conteúdo expirado acessível. URLs já emitidas possuem TTL curto, mas o comportamento exato após expiração deve ser testado no Storage real.

## Groups

Autoria e associação do criador são protegidas por triggers; criação e associação inicial são transacionais. Entrada e saída usam advisory lock e chave composta. Imagens ficam em escopo do grupo, acessíveis a membros e graváveis por administradores.

Risco residual: as listagens calculam contagens em consulta separada e assinam imagens individualmente. Isso evita N+1 de contagem, mas ainda gera uma chamada de assinatura por imagem distinta e pode se tornar gargalo com muitos grupos.

## Messages

O par de participantes é canônico e único. O envio valida participação e bloqueios no backend, usa chave idempotente e rejeita reutilização incompatível. A paginação usa `(created_at, id)` e possui índice compatível. Subscriptions são removidas ao trocar de conversa ou desmontar a tela.

Riscos residuais: a lista de conversas é limitada a 50 sem paginação adicional no frontend. A consulta da última mensagem usa lateral por conversa; deve ser medida com volume alto. Realtime, entrega duplicada e ordenação sob concorrência ainda precisam de testes reais com duas sessões.

## Presence e Calls

Presence usa tópicos privados e autorização derivada de participação. O serviço compartilha canais por tópico, serializa track/untrack, descarta gerações antigas e remove canais sem listeners. O estado não é persistido.

Calls validam IDs, SDP e ICE, limitam candidatos pendentes e encerram tracks/peer connections em término, troca de sessão e desmontagem. A autorização do Broadcast é feita no backend. Reconexão completa de mídia não foi implementada; desconexões mudam o estado visual, mas ICE restart e retomada de chamada exigiriam evolução funcional.

## Notifications

Há chave única por destinatário/evento, paginação estável, RLS por destinatário e proteção de conteúdo imutável. O Realtime filtra pelo destinatário. O contador global e a página mantêm subscriptions separadas; isso é funcional, porém duplica canais enquanto a página está aberta. Consolidação futura pode reduzir subscriptions sem mudar a regra de negócio.

## Moderation e bloqueios

Bloqueios são aplicados estaticamente a descoberta de perfis, Stories, conversas, mensagens, presença de conversa, chamadas e notificações. A criação de denúncias valida que o alvo está disponível ao denunciante. Dados internos de denúncias não têm policies para usuários comuns.

Em grupos, participantes bloqueados podem continuar compartilhando o mesmo contexto de grupo e presença coletiva. O comportamento pode ser intencional para comunidades, mas precisa de decisão explícita de produto e teste de privacidade antes de qualquer alteração de regra.

## Administração

Tabelas administrativas não possuem acesso direto para clientes autenticados. As funções derivam `auth.uid()`, verificam permissão no backend e registram alterações de estado no log de auditoria. A rota frontend apenas apresenta a área; não substitui a autorização do banco.

Risco residual: o provisionamento inicial de administradores não existe nas migrations, deliberadamente. Deve ocorrer por processo operacional controlado e auditável. Não deve ser exposto ao cliente.

## Frontend, acessibilidade e performance

Há lazy loading por domínio, fallbacks de carregamento, estados vazios/erro, labels e foco em fluxos importantes. Modais de Stories possuem contenção de foco; outros modais não demonstram contenção/restauração uniforme. A navegação é baseada em History API própria, suficiente para o escopo, mas sem roteador formal.

Não foi feito redesign. O Design System permanece centralizado. Devem ser testados teclado, leitor de tela, contraste, zoom, telas pequenas, redução de movimento e foco em todos os modais. O arquivo global de estilos é amplo e tende a crescer; a divisão por domínio pode ser considerada quando houver benefício mensurável.

## Banco e migrations

A ordem lexical expressa dependências coerentes: identidade; Stories; hardening de Stories; grupos; hardening de grupos; mensagens; hardening de mensagens; Presence; Calls; notificações; moderação/bloqueios; administração.

As migrations usam transações, constraints, RLS forçada, funções com `search_path` vazio e revogações explícitas. Os arquivos de hardening dependem da aplicação integral dos anteriores. Eles não são scripts destinados a reaplicação arbitrária: várias operações `create` e adições à publication falhariam se executadas novamente fora do controle de histórico de migrations.

Não há confirmação de que nenhuma migration está aplicada. O catálogo observado durante esta auditoria não apresentou tabelas no schema `public`; isso sugere que todas as migrations versionadas continuam pendentes no banco consultado, mas não substitui validação do histórico remoto e não representa aplicação.

## Segurança geral

A autorização sensível reside em RLS e funções do backend. Uploads têm limites e escopo de caminho; Stories e grupos verificam assinatura de arquivo no cliente, enquanto avatar valida MIME/tamanho, mas não assinatura binária. Validação cliente melhora UX e não deve ser tratada como inspeção confiável de conteúdo. Para produção, validação/transformação confiável de mídia exige uma decisão de backend fora desta auditoria.

Funções `SECURITY DEFINER` revisadas fixam `search_path`, qualificam objetos e restringem execução. Ainda é obrigatório testar grants efetivos, owner das funções, RLS forçada e policies no ambiente real.

## Escalabilidade

Pontos previsíveis de atenção:

- lista de conversas limitada sem paginação completa;
- assinaturas de URL por mídia e imagem;
- crescimento de subscriptions simultâneas de Presence, Calls e Notifications;
- retenção de Stories e objetos expirados;
- crescimento de mensagens e notificações, apesar dos índices e cursores existentes;
- paginação administrativa por offset, adequada ao volume inicial, mas mais cara em páginas profundas;
- ausência de métricas operacionais para latência, falhas de Realtime, Storage e WebRTC.

Não foi introduzida infraestrutura distribuída ou otimização prematura.

## Migrations pendentes de aplicação

Pendente de validação e aplicação operacional, em ordem:

1. `20260916000100_create_identity_foundation.sql`
2. `20260916000200_create_stories.sql`
3. `20260916000300_harden_stories.sql`
4. `20260916000400_create_groups.sql`
5. `20260916000500_harden_groups.sql`
6. `20260916000600_create_private_messages.sql`
7. `20260916000700_harden_private_messages.sql`
8. `20260916000800_authorize_realtime_presence.sql`
9. `20260916000900_authorize_realtime_calls.sql`
10. `20260916001000_create_notifications.sql`
11. `20260916001100_create_moderation.sql`
12. `20260916001200_create_admin_moderation.sql`

## Testes ainda necessários

1. Executar build, typecheck e lint em ambiente habilitado.
2. Aplicar migrations em ambiente descartável e confirmar rollback transacional em falhas.
3. Testar Auth, renovação, expiração e troca de usuário em múltiplas abas.
4. Montar uma matriz de RLS com `anon`, dois usuários, bloqueio nas duas direções, membro, administrador de grupo e administrador da aplicação.
5. Testar Storage com caminhos malformados, MIME falso, limites, URLs expiradas e objetos órfãos.
6. Testar concorrência de criação/entrada/saída de grupo, visualização de Story e envio idempotente.
7. Testar paginação sem lacunas/duplicatas enquanto novos registros são inseridos.
8. Testar Realtime após perda de rede, refresh, troca rápida de contexto e logout.
9. Testar chamadas de áudio/vídeo entre navegadores, dispositivos e tipos de NAT, incluindo recusas de permissão e encerramento inesperado.
10. Testar acessibilidade por teclado e leitor de tela em páginas e modais.
11. Medir consultas e índices com volume representativo de mensagens, notificações, grupos e denúncias.

## Recomendações para a próxima etapa

- Priorizar uma suíte de integração para Auth/RLS/Storage e testes multiusuário.
- Padronizar o tratamento global de sessão expirada sem confundir indisponibilidade de rede com logout.
- Definir retenção operacional de Stories e mídias órfãs.
- Avaliar TURN antes de considerar chamadas prontas para produção.
- Paginar conversas e medir a consulta de última mensagem com dados volumosos.
- Consolidar subscriptions somente se métricas demonstrarem necessidade.
- Formalizar a decisão de produto sobre bloqueios dentro de grupos.
- Substituir gradualmente os dados demonstrativos da Home por dados reais apenas em uma etapa funcional própria.
