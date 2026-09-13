import { prisma } from './prisma'

// ============================================================
// Geração automática das próximas ocorrências de tarefas recorrentes.
//
// Uma tarefa "mestre" (recorrente=true, recorrenciaOrigemId=null) é uma
// atividade normal — com seu próprio prazo, responsável e status — que
// também funciona como modelo: sempre que essa função roda, ela garante que
// existe uma janela de próximas ocorrências já criadas (cada uma é uma
// Tarefa independente, ligada à mestre via recorrenciaOrigemId), sem que
// ninguém precise recriá-las manualmente toda semana/mês.
//
// Chamada a partir de rotas GET já existentes (tarefas-semana, projeto),
// seguindo o mesmo padrão de "self-heal a cada carregamento" já usado no
// resto do app (ex: auto-planejamento em tarefas-semana/route.ts).
//
// NOTA (ambiente de desenvolvimento): o binário do Prisma Query Engine não
// pôde ser baixado neste sandbox (bloqueio de rede pra binaries.prisma.sh),
// então o client local aqui está com os TYPES desatualizados em relação ao
// schema novo — os `as any` abaixo existem só por causa disso, pra não gerar
// erro de type falso-positivo neste ambiente. Rodando `npm run db:push` (ou
// `npx prisma generate`) na sua máquina, com internet normal, o client fica
// com os tipos certos e esses casts deixam de ser necessários (podem ficar,
// não afetam nada em tempo de execução).
// ============================================================

const JANELA_SEMANAL = 4 // manter sempre as próximas 4 ocorrências semanais geradas
const JANELA_MENSAL = 3  // manter sempre as próximas 3 ocorrências mensais geradas

// 0=Segunda..6=Domingo — mesmo índice usado em diaSemana/DIAS_NOME no resto do app
function diaIndexDeData(data: Date): number {
  const dia = data.getDay()
  return dia === 0 ? 6 : dia - 1
}

// Primeira data estritamente depois de `base` cujo dia da semana está em
// `diasSemana` (um ou mais dias, ex: [0, 2, 4] = Seg/Qua/Sex). Limita a busca
// a 8 dias — o suficiente pra sempre achar um dia válido — pra nunca travar
// em loop infinito caso a lista venha vazia por algum motivo.
function proximaDataSemanal(base: Date, diasSemana: number[]): Date {
  const dias = diasSemana.length > 0 ? diasSemana : [diaIndexDeData(base)]
  const d = new Date(base)
  d.setHours(0, 0, 0, 0)
  for (let i = 0; i < 8; i++) {
    d.setDate(d.getDate() + 1)
    if (dias.includes(diaIndexDeData(d))) return d
  }
  return d
}

// Primeira data no mês seguinte a `base` no dia `diaMes` (ou o último dia
// desse mês, se ele for mais curto — ex: dia 31 em fevereiro vira 28/29)
function proximaDataMensal(base: Date, diaMes: number): Date {
  const proximoMes = new Date(base.getFullYear(), base.getMonth() + 1, 1)
  const ultimoDiaDoMes = new Date(proximoMes.getFullYear(), proximoMes.getMonth() + 1, 0).getDate()
  proximoMes.setDate(Math.min(diaMes, ultimoDiaDoMes))
  proximoMes.setHours(0, 0, 0, 0)
  return proximoMes
}

// filtroExtra: restringe quais tarefas mestre são consideradas (ex: só de um
// projeto, ou só de um responsável) — usado pelas rotas que chamam isso pra
// não varrer o sistema inteiro toda hora sem necessidade.
export async function gerarProximasOcorrencias(filtroExtra: Record<string, unknown> = {}) {
  try {
    const masters = await (prisma.tarefa as any).findMany({
      where: {
        recorrente: true,
        recorrenciaOrigemId: null,
        recorrenciaAtiva: true,
        status: { not: 'CANCELADA' },
        projeto: { etapaPipeline: { in: ['OPERACIONAL', 'EM_EXECUCAO'] } },
        ...filtroExtra,
      },
      select: {
        id: true, projetoId: true, titulo: true, descricao: true, tipo: true,
        responsavelId: true, ordem: true, etapa: true, obrigatorio: true,
        recorrenciaTipo: true, recorrenciaDiasSemana: true, recorrenciaDiaMes: true,
        prazo: true,
      },
    })

    const hoje = new Date()
    hoje.setHours(0, 0, 0, 0)

    for (const master of masters) {
      if (!master.recorrenciaTipo) continue

      const janela = master.recorrenciaTipo === 'MENSAL' ? JANELA_MENSAL : JANELA_SEMANAL

      const [ultima, futurasExistentes] = await Promise.all([
        (prisma.tarefa as any).findFirst({
          where: { OR: [{ id: master.id }, { recorrenciaOrigemId: master.id }] },
          orderBy: { prazo: 'desc' },
          select: { prazo: true },
        }),
        (prisma.tarefa as any).count({
          where: {
            OR: [{ id: master.id }, { recorrenciaOrigemId: master.id }],
            prazo: { gte: hoje },
          },
        }),
      ])

      let cursor: Date = ultima?.prazo ? new Date(ultima.prazo) : hoje
      if (cursor < hoje) cursor = hoje

      let faltam = janela - futurasExistentes
      while (faltam > 0) {
        cursor = master.recorrenciaTipo === 'MENSAL'
          ? proximaDataMensal(cursor, master.recorrenciaDiaMes || 1)
          : proximaDataSemanal(cursor, master.recorrenciaDiasSemana ?? [])

        await (prisma.tarefa as any).create({
          data: {
            projetoId: master.projetoId,
            titulo: master.titulo,
            descricao: master.descricao,
            tipo: master.tipo,
            responsavelId: master.responsavelId,
            prazo: cursor,
            ordem: master.ordem,
            etapa: master.etapa,
            obrigatorio: master.obrigatorio,
            status: 'PENDENTE',
            recorrenciaOrigemId: master.id,
          },
        }).catch(() => {
          // Corrida entre duas requisições gerando a mesma ocorrência ao
          // mesmo tempo — o @@unique([recorrenciaOrigemId, prazo]) barra o
          // duplicado, não precisa fazer nada além de seguir em frente.
        })

        faltam--
      }
    }
  } catch (err) {
    // Geração de recorrência nunca deve derrubar a tela que a disparou —
    // só loga e segue (mesmo padrão de outros self-heals no app).
    console.error('[gerarProximasOcorrencias]', err)
  }
}
