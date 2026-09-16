# Painel administrativo

## Autorização

A migration `20260916001200_create_admin_moderation.sql` cria papéis, permissões, vínculos administrativos e auditoria. O Supabase Auth continua sendo a fonte de identidade. As funções administrativas derivam o usuário exclusivamente de `auth.uid()` e verificam, no banco, se existe um vínculo ativo com a permissão exigida.

O cliente não envia papel, não possui chave privilegiada e não lê diretamente as tabelas administrativas. Todas elas têm RLS forçada e nenhuma policy para clientes. A função `get_admin_access` permite apenas descobrir se a própria sessão recebeu acesso administrativo. A rota `/admin` não aparece na navegação comum, mas sua proteção efetiva é feita no backend; esconder a rota não é tratado como autorização.

Os papéis iniciais `moderator` e `admin` recebem as permissões `reports.read` e `reports.update_status`. A separação entre papéis e permissões permite adicionar ferramentas futuras sem acoplar a interface a um papel fixo. A migration não promove nenhum usuário. A atribuição inicial e a manutenção de administradores devem ocorrer por um processo backend confiável e externo ao cliente.

## Denúncias e dashboard

O dashboard consulta totais de denúncias abertas, em análise, resolvidas, encerradas e gerais. A listagem é paginada no backend e aceita filtros controlados de estado e categoria. Os detalhes retornam somente alvo, categoria, descrição, estado e datas; a identidade do denunciante não é enviada à interface administrativa nem continua acessível a usuários comuns.

A camada `adminService` é separada da moderação usada por usuários. Ela trata indisponibilidade, sessão expirada, acesso negado e falhas de requisição. A interface possui estados de carregamento, erro, vazio, paginação e acesso negado, com navegação própria para desktop e tablet.

## Auditoria

Toda alteração efetiva de estado passa por `update_admin_report_status`. A função bloqueia a linha durante a transação, atualiza a denúncia e registra ator, ação, recurso, estado anterior, estado novo e data em `admin_audit_log`. O frontend não pode inserir ou modificar registros de auditoria diretamente.

## Rotas e limites

A área administrativa usa `/admin` e não é incluída na navegação social. A interface faz uma checagem de acesso para oferecer feedback, enquanto cada consulta e alteração é novamente autorizada pelo banco.

Não foram implementados banimentos, punições automáticas, IA, recursos financeiros ou outras ferramentas administrativas. A migration foi adicionada ao repositório, porém sua aplicação no Supabase, a atribuição de administradores e o comportamento operacional de RLS/RPCs permanecem **não validado operacionalmente** nesta tarefa. Testes funcionais, de concorrência e de interface também não foram executados.
