# Autenticação — preparação do frontend

## Estrutura

A integração usa o cliente oficial `@supabase/supabase-js`, centralizado em `src/shared/supabase/client.ts`. O `AuthProvider` recupera a sessão persistida, observa mudanças de autenticação e expõe sessão, usuário, estado de carregamento, login por e-mail e senha, criação de conta, logout e solicitação de redefinição de senha.

`RequireAuth` protege conteúdo autenticado e aceita estados explícitos para carregamento, ausência de sessão e ausência de configuração. `PublicOnly` protege páginas destinadas somente a visitantes e aceita um estado alternativo para usuários já autenticados. Os guards não simulam navegação nem sessão; deverão ser ligados ao roteador quando as rotas e o fluxo visual forem definidos.

## Configuração pública necessária

O ambiente do frontend deve fornecer:

- `VITE_SUPABASE_URL`: URL pública do projeto Supabase.
- `VITE_SUPABASE_PUBLISHABLE_KEY`: chave pública/publishable destinada ao cliente web.

Nenhuma chave `service_role` ou outro segredo pode ser usado no frontend. Na ausência das variáveis, o cliente não é criado, o provider permanece sem sessão e as operações retornam um erro de configuração controlado.

## Limitações desta fase

A interface definitiva de cadastro, login e recuperação não foi criada porque suas decisões de UX ainda não existem. Os dados demonstrativos atuais também não foram convertidos em dados autenticados. A integração depende de o Supabase Auth estar habilitado e configurado no mesmo projeto, das URLs de redirecionamento autorizadas e das variáveis públicas acima.

A migration versionada prepara o provisionamento automático do perfil e das configurações de privacidade a partir de `auth.users`, sem permitir que o frontend escolha o identificador. O cadastro somente poderá ser considerado completo quando essa migration estiver aplicada: falhas no trigger revertem a criação da identidade, enquanto login posterior e recuperação de sessão reutilizam o perfil vinculado pelo mesmo UUID.

Esta preparação não aplica migrations e não comprova que autenticação, trigger, RLS, entrega de e-mail ou redirecionamentos funcionam no backend. Após a configuração operacional, os formulários e as rotas poderão consumir a camada existente sem criar autenticação própria.

## Revisão estática

Os imports e contratos foram organizados para TypeScript estrito. A inscrição em mudanças de autenticação é cancelada ao desmontar o provider, a inicialização tolera configuração ausente e nenhuma credencial foi incluída. Build, lint e testes funcionais não foram executados neste ambiente.
