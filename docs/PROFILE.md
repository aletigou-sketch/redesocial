# Perfil real — integração do frontend

## Dados conectados

A área autenticada consulta e atualiza `public.profiles` usando o cliente Supabase e a sessão existente. São apresentados e editados `username`, `display_name`, `bio` e `is_discoverable`. `avatar_path` é administrado pelo fluxo de avatar; `user_id`, `created_at` e `updated_at` não são editáveis pela interface.

O `ProfileProvider` acompanha o usuário do `AuthProvider`, carrega novamente o perfil quando a identidade autenticada muda e oferece estados de carregamento, perfil inexistente, backend indisponível e erro. A tela permite recarregar os dados sem criar valores fictícios.

## Proteções

A camada de perfil não recebe `user_id` da interface. Antes de cada leitura, gravação ou operação de Storage, ela recupera o usuário pelo mecanismo oficial de Auth e usa exclusivamente esse identificador. As consultas também filtram pelo identificador autenticado e dependem das policies RLS versionadas na migration. Nenhuma chave administrativa é utilizada.

Username, nome, bio e avatar são validados no frontend, sem substituir constraints, RLS ou validações do backend. Envios duplicados são bloqueados. Uma sessão ausente ou inválida encerra o estado autenticado pelo fluxo existente, sem simular sucesso.

## Storage

O avatar usa o bucket privado `profile-avatars`. Objetos são gravados em um caminho iniciado pelo UUID obtido da sessão. A exibição usa URL assinada temporária, nunca URL pública. JPG, PNG e WebP de até 5 MB são aceitos.

Na substituição, o novo arquivo é enviado e o perfil é atualizado antes da remoção do objeto anterior. Se a atualização do perfil falhar, há tentativa de remover o upload novo. Na remoção, o caminho do perfil é limpo antes da tentativa de excluir o objeto anterior. Falhas de limpeza não revertem um perfil já salvo e podem exigir manutenção operacional posterior.

## Limitações operacionais e revisão estática

O catálogo remoto verificado no momento desta fase não apresentou tabelas em `public`; portanto a migration versionada, o trigger de provisionamento, RLS e o bucket podem ainda não estar aplicados no projeto conectado. Nesse cenário a interface apresenta erro ou perfil inexistente e não cria dados fictícios. Também dependem do backend a unicidade real de username, geração de URLs assinadas, políticas de Storage e expiração de sessão durante requisições.

A revisão estática conferiu derivação de identidade pela sessão, ausência de `service_role`, caminhos privados de avatar, validações, bloqueio de envio duplicado e estados visuais. Build, lint, typecheck, upload, consultas e testes funcionais não foram executados neste ambiente.
