# Arquitetura — Hi You!

## Auditoria inicial

O repositório continha apenas um README, sem stack, aplicação, autenticação, banco, rotas ou integrações implementadas. A fundação utiliza React, TypeScript estrito e Vite, sem substituir tecnologia anterior.

## Organização

- `src/app`: composição, shell e navegação da aplicação.
- `src/features`: módulos isolados por domínio. A fundação visual começa em `home`; perfis, Stories, grupos, mensagens, chamadas, notificações, privacidade, moderação e administração devem entrar como módulos próprios.
- `src/shared`: tipos, componentes e infraestrutura reutilizável sem regras específicas de domínio.
- `src/styles`: tokens e estilos globais do Design System.

Cada módulo futuro deve separar UI, contratos/tipos, regras, serviços e acesso a dados. Componentes não devem consultar o banco diretamente.

## Segurança e dados

A interface atual usa somente dados demonstrativos locais e não representa autorização real. A etapa de backend deve adotar autenticação gerenciada, Row Level Security e funções de autorização centralizadas. Regras de perfil, participação, bloqueio, privacidade e administração devem ser verificadas no servidor; ocultar elementos na interface não concede segurança.

O modelo de dados futuro deve ser incremental e normalizado, começando por perfis públicos/privados e configurações de privacidade, e depois mídia, Stories, grupos, conversas e mensagens. Mídia deve ficar em armazenamento de objetos; tabelas guardam apenas metadados e referências. Timestamps devem ser armazenados em UTC e formatados em `pt-BR` na apresentação.

A modelagem física completa não foi simulada em arquivos SQL: ela exige uma proposta de banco separada e aprovada, com políticas e relações que não devem ser parcialmente criadas.

## Design System

Os tokens globais definem marca, cores semânticas, superfícies, bordas, raios e sombras. A identidade combina violeta, superfícies claras, tipografia editorial e baixa densidade visual. Estados de foco são visíveis, movimento respeita preferência reduzida e os layouts têm experiências distintas para desktop e mobile.

## Próxima etapa

1. Definir e aprovar o primeiro recorte do banco para identidade, perfil e privacidade.
2. Integrar autenticação e sessão ao mesmo projeto de backend.
3. Criar contratos de repositório e tratamento tipado de erros.
4. Substituir demonstrações por estados de carregamento, vazio, erro e dados autorizados.
5. Adicionar rotas protegidas e testes após a instalação das dependências.

## Validações

Scripts de `build`, `typecheck` e `lint` estão configurados. Não foram executados porque esta operação não possui execução arbitrária de terminal; nenhum resultado de validação é presumido.
