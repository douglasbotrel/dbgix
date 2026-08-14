# Roteiro: Provisionar um Novo Cliente

Use este roteiro toda vez que um novo cliente assinar o Ecdise (Licença de Uso ou SaaS Mensal).

## Modelo adotado

Cada cliente recebe seu próprio banco de dados e seu próprio projeto na Vercel, mas todos rodam exatamente o mesmo código, sempre a partir da branch `main`. Não há multi-tenant compartilhado hoje — o schema do Prisma não tem isolamento por empresa, então a separação acontece na infraestrutura (banco + deploy), não no código.

Consequência importante: como todos os projetos-cliente apontam para a mesma branch `main`, um push nessa branch atualiza automaticamente todos os clientes (se "Auto Deploy" estiver ativo em cada projeto Vercel). Teste mudanças relevantes na `demo` antes de subir na `main` quando possível, especialmente alterações no `prisma/schema.prisma`.

## Pré-requisitos

- Conta em um provedor de Postgres gratuito/pago (Neon ou Supabase são os mais rápidos de configurar).
- Acesso à conta Vercel onde o repositório `douglasbotrel/Ecdise` está conectado.
- Nome do cliente e e-mail do responsável que vai logar primeiro.

## Passo 1 — Criar o banco de dados

1. Crie um projeto novo no Neon (ou Supabase/Railway) exclusivo para esse cliente — não reutilize o banco de outro cliente nem o de produção.
2. Copie a connection string no formato `postgresql://usuario:senha@host:5432/banco?schema=public`. Guarde-a, vai precisar dela no Passo 3.

## Passo 2 — Criar o projeto na Vercel

1. Em vercel.com, clique em "Add New Project" e importe o repositório `douglasbotrel/Ecdise`.
2. Em "Production Branch", deixe configurado como `main`.
3. Não finalize o deploy ainda — antes, configure as variáveis de ambiente (Passo 3), senão o build vai falhar exatamente como aconteceu com a `demo`.

## Passo 3 — Configurar variáveis de ambiente

No projeto recém-criado, em Settings → Environment Variables, adicione (todas no ambiente "Production"):

| Variável | Valor |
|---|---|
| `DATABASE_URL` | a connection string do Passo 1 |
| `JWT_SECRET` | string aleatória forte — gere com `node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"` |
| `JWT_EXPIRES_IN` | `7d` |
| `NEXTAUTH_SECRET` | outra string aleatória, gerada do mesmo jeito |
| `NEXTAUTH_URL` | a URL final do projeto (ex.: `https://clientex.vercel.app`) |
| `APP_NAME` | nome do cliente, se quiser personalizar |
| `APP_URL` | mesma URL do `NEXTAUTH_URL` |
| `UPLOAD_DIR` | `./public/uploads` |
| `MAX_FILE_SIZE` | `10485760` |

Gere `JWT_SECRET` e `NEXTAUTH_SECRET` novos para cada cliente — nunca reaproveite os de outro ambiente.

## Passo 4 — Primeiro deploy

Dispare o deploy (ou ele já roda automático após salvar as variáveis). O comando de build (`prisma generate && prisma db push && next build`) cria todas as tabelas do zero nesse banco novo, sem precisar rodar nenhuma migração manual. Acompanhe o log e confirme que a etapa `prisma db push` terminou sem erro antes de seguir.

## Passo 5 — Criar o primeiro usuário (bootstrap)

O sistema não tem tela de cadastro pública — criar usuário exige estar logado como `GESTOR_GERAL`, o que é impossível num banco vazio. Por isso o primeiro usuário precisa ser inserido direto no banco:

1. Na sua máquina, aponte temporariamente o `.env` local para o `DATABASE_URL` desse cliente.
2. Gere o hash da senha provisória: `node -e "const bcrypt=require('bcryptjs'); console.log(bcrypt.hashSync('SENHA-PROVISORIA-AQUI', 12))"`.
3. Rode `npx prisma studio`, abra a tabela `Usuario` e crie um registro manualmente com: `nome`, `email`, `senha` (cole o hash gerado, nunca a senha em texto puro), `role` = `GESTOR_GERAL`, `departamento` = `OPERACIONAL_AMBIENTAL` (ou outro válido), `ativo` = `true`.
4. Avise o cliente para logar com esse e-mail e a senha provisória, e oriente a trocar a senha assim que possível (se não houver essa opção na tela de configurações ainda, é um ponto a desenvolver).
5. Reverta o `.env` local de volta ao banco de testes/produção antes de continuar trabalhando no código, para não editar o banco do cliente por engano.

## Passo 6 — Domínio customizado (opcional)

Se o cliente tiver domínio próprio, configure em Settings → Domains do projeto Vercel e aponte o DNS conforme instrução da própria Vercel. Lembre de atualizar `NEXTAUTH_URL` e `APP_URL` para o domínio final.

## Passo 7 — Checklist de verificação

- Login com o usuário criado no Passo 5 funciona.
- Sidebar mostra os módulos esperados para o papel `GESTOR_GERAL` (todos).
- Criar um projeto de teste e excluir depois, só para confirmar que grava no banco certo.
- Conferir nos logs do Neon/Supabase que as tabelas foram criadas (tabela `usuarios`, `projetos`, etc.).

## Quando repensar esse modelo

Banco por cliente funciona bem para um número pequeno de clientes. Se o número de clientes SaaS Mensal crescer a ponto de o trabalho manual de provisionar (e de aplicar atualizações de schema em N bancos) virar gargalo, vale migrar para um modelo multi-tenant de banco único com uma tabela `Empresa` e `empresaId` em cada modelo — mas isso é um projeto de refatoração à parte, não uma mudança incremental.
