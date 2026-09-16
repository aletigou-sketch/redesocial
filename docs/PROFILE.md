# Perfil real — integração do frontend

## Dados conectados

A área autenticada consulta e atualiza `public.profiles` usando o cliente Supabase e a sessão existente. São apresentados e editados `username`, `display_name`, `bio` e `is_discoverable`. `avatar_path` é administrado pelo fluxo de avatar; `user_id`, `created_at` e `updated_at` não são editáveis pela interface. As consultas selecionam explicitamente apenas essas colunas conhecidas.

O `ProfileProvider` acompanha o usuário do `AuthProvider`, invalida respostas assíncronas quando a identidade muda e oferece estados de carregamento, perfil inexistente, backend indisponível e erro. A tela permite recarregar os dados sem criar valores fictícios.

## Proteções

A camada de perfil não recebe `user_id` da interface. Antes de cada leitura, gravação ou operação de Storage, ela recupera o usuário pelo mecanismo oficial de Auth e usa exclusivamente esse identificador. As consultas também filtram pelo identificador autenticado e dependem das policies RLS versionadas na migration. Nenhuma chave administrativa é utilizada.

Username, nome, bio e avatar são normalizados e validados novamente na camada de serviço, sem substituir constraints, RLS ou validações do backend. Envios duplicados são bloqueados de forma síncrona. Uma sessão ausente ou inválida encerra o estado autenticado pelo fluxo existente, sem simular sucesso. Respostas de carregamentos ou salvamentos iniciados por uma identidade anterior não são aplicadas à identidade atual.

## Storage

O avatar usa o bucket privado `profile-avatars`. Objetos são gravados em um caminho único iniciado pelo UUID obtido da sessão. A exibição usa URL assinada temporária, nunca URL pública. JPG, PNG e WebP com conteúdo e de até 5 MB são aceitos.

Na substituição, o novo arquivo é enviado e os campos do perfil, incluindo o novo caminho, são atualizados juntos antes da remoção do objeto anterior. Se a atualização do perfil falhar, há tentativa de remover o upload novo. Na remoção, o caminho do perfil é limpo junto com a atualização dos demais campos antes da tentativa de excluir o objeto anterior. Falhas de limpeza não revertem um perfil já salvo e podem exigir manutenção operacional posterior. Falhas isoladas na criação da URL assinada não descartam o perfil carregado ou salvo.

## Auditoria estática das Fases 07–10

Foram revisados AuthProvider/AuthContext, guards, cliente Supabase, ProfileProvider, serviço, tela, migration e estilos do perfil. A implementação mantém o Supabase Auth como fonte da identidade, não aceita identificador arbitrário da interface, não usa `service_role`, depende de RLS e restringe os caminhos de Storage à pasta da conta autenticada.

Foram corrigidos riscos de respostas assíncronas sobrescreverem o estado após troca de usuário, duplicidade de salvamento antes da atualização do estado React, persistência parcial dos campos quando o upload ou a associação do avatar falhava, seleção excessiva de colunas, validação apenas na tela, colisão previsível de nome de arquivo e descarte indevido do perfil quando somente a URL assinada falhava.

A tela preserva loading, ausência, erro, feedback, bloqueio de controles durante salvamento, foco visível, rótulos e comportamento responsivo. A seleção de arquivo inválido e a remoção do avatar também limpam o controle de arquivo para permitir nova seleção consistente.

## Limitações operacionais

O catálogo remoto verificado nesta auditoria não apresentou tabelas em `public`; portanto a aplicação da migration, o trigger de provisionamento, as constraints, RLS, policies de Storage e o bucket estão **não validados operacionalmente** no projeto conectado. Também estão **não validados operacionalmente** o login e a expiração real de sessão durante requisições, unicidade de username, uploads, remoções, geração e expiração de URLs assinadas e isolamento efetivo entre duas contas.

A revisão foi estática. Build, lint, typecheck, consultas livres, upload e testes funcionais ou visuais não foram executados neste ambiente.
