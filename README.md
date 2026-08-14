# dbgix — Sistema de Gestão Operacional Ambiental

Versão reduzida do Ecdise, focada apenas na operação: cadastro direto de projetos, execução de tarefas, planejamento semanal e indicadores. Sem esteira comercial (Comercial → Contratos → Financeiro) e sem Acompanhamento de Processos — o projeto já nasce pronto para execução.

## 🚀 Como Rodar o Projeto

### Pré-requisitos
- [Node.js](https://nodejs.org) v18 ou superior
- [Git](https://git-scm.com)

### 1. Instalar dependências
```bash
cd dbgix
npm install
```

### 2. Configurar variáveis de ambiente
```bash
# O arquivo .env já está criado com SQLite para desenvolvimento
# Para produção, copie e edite o .env.example
cp .env.example .env
```

### 3. Configurar banco de dados (SQLite para dev)
```bash
# Gera o cliente Prisma
npm run db:generate

# Cria as tabelas no banco
npm run db:push

# Popula com dados iniciais (tipos de serviço, usuários, etc.)
npm run db:seed
```

### 4. Rodar o projeto
```bash
npm run dev
```

Acesse: **http://localhost:3000**

### Credenciais de acesso (desenvolvimento — definidas em `prisma/seed.ts`)
| Usuário | Email | Senha | Perfil |
|---------|-------|-------|--------|
| Douglas | douglas@dbgix.com | Douglas@2024 | Administrador (acesso total) |
| Bruno   | bruno@dbgix.com   | Bruno@2024   | (ver seed.ts) |

⚠️ Altere as senhas após o primeiro acesso.

---

## 🗂️ Estrutura do Projeto

```
dbgix/
├── prisma/
│   ├── schema.prisma        # Schema do banco de dados
│   └── seed.ts              # Dados iniciais (tipos de serviço, usuários)
├── src/
│   ├── app/
│   │   ├── (auth)/          # Login
│   │   ├── (dashboard)/     # Módulos principais
│   │   │   ├── dashboard/       # Dashboard gerencial / do analista
│   │   │   ├── tarefas-semana/  # Planejamento semanal de tarefas
│   │   │   ├── operacional/     # Cadastro e execução de projetos
│   │   │   ├── bi/              # BI / Relatórios
│   │   │   └── configuracoes/   # Usuários, permissões e tipos de serviço
│   │   └── api/             # APIs REST
│   ├── components/
│   │   ├── layout/          # Sidebar, Header
│   │   └── modals/          # Modais de formulário
│   ├── lib/
│   │   ├── auth.ts          # JWT + autenticação
│   │   ├── prisma.ts        # Cliente do banco
│   │   └── utils.ts         # Utilitários
│   └── middleware.ts        # Proteção de rotas
```

---

## 📦 Módulos do Sistema

| Módulo | Descrição |
|--------|-----------|
| **Dashboard** | Visão geral de projetos e tarefas (por perfil: gestão ou analista) |
| **Tarefas da Semana** | Planejamento e acompanhamento semanal de tarefas |
| **Operacional** | Cadastro de novos projetos e execução das tarefas até a conclusão |
| **BI** | Indicadores operacionais, tempos médios e serviços mais contratados |
| **Cadastro Base** | Usuários, permissões e catálogo de tipos de serviço |

Não há mais "travas" de etapa (pipeline) entre módulos — todo projeto entra direto em Operacional. O controle de acesso é feito apenas por usuário/perfil (`modulosAcesso` e `MODULOS_POR_ROLE`).

---

## 🛠️ Stack Tecnológica

- **Frontend:** Next.js 14 (App Router) + React + TypeScript
- **Estilo:** Tailwind CSS
- **Banco:** SQLite (dev) / PostgreSQL (produção)
- **ORM:** Prisma
- **Auth:** JWT com cookies HttpOnly
- **Gráficos:** Recharts

---

## 🔐 Hierarquia de Permissões

```
ADMIN > GESTOR_GERAL > GESTOR_ADMINISTRATIVO > GESTOR_OPERACIONAL > 
GESTOR_CAMPO > SUPERVISOR > ANALISTA > TECNICO_CAMPO
```

---

## 🗄️ Para usar PostgreSQL em produção

1. Altere o `DATABASE_URL` no `.env`:
```
DATABASE_URL="postgresql://user:password@localhost:5432/dbgix?schema=public"
```

2. Altere o provider no `prisma/schema.prisma`:
```prisma
datasource db {
  provider = "postgresql"  // <- mude de "sqlite"
  url      = env("DATABASE_URL")
}
```

3. Rode as migrações:
```bash
npm run db:migrate
npm run db:seed
```

---

## 📋 Scripts disponíveis

```bash
npm run dev          # Servidor de desenvolvimento
npm run build        # Build de produção
npm run start        # Servidor de produção
npm run db:generate  # Gerar cliente Prisma
npm run db:push      # Sincronizar schema (dev)
npm run db:migrate   # Criar migração (prod)
npm run db:seed      # Popular banco com dados iniciais
npm run db:studio    # Interface visual do banco (Prisma Studio)
```
