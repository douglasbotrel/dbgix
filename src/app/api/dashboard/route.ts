import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getCurrentUser } from '@/lib/auth'

const ROLES_GESTAO = ['ADMIN', 'GESTOR_GERAL', 'GESTOR_ADMINISTRATIVO', 'GESTOR_OPERACIONAL', 'GESTOR_CAMPO', 'SUPERVISOR']

export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser()
    if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

    const hoje = new Date()

    // ── GESTÃO — visão geral de todos os projetos operacionais ──
    if (ROLES_GESTAO.includes(user.role)) {
      const etapasAtivas: string[] = ['OPERACIONAL', 'EM_EXECUCAO']

      const [
        novos, andamento, concluidos, projetos,
        tarefasAtrasadas, tarefasConcluidasMes, tarefasTotais, porEtapa,
      ] = await Promise.all([
        prisma.projeto.count({ where: { etapaPipeline: 'OPERACIONAL' } }),
        prisma.projeto.count({ where: { etapaPipeline: 'EM_EXECUCAO' } }),
        prisma.projeto.count({ where: { etapaPipeline: 'CONCLUIDO' } }),
        prisma.projeto.findMany({
          where: { etapaPipeline: { in: etapasAtivas } },
          include: {
            responsavel: { select: { nome: true } },
            _count: { select: { tarefas: true } },
          },
          orderBy: { criadoEm: 'desc' },
          take: 30,
        }),
        prisma.tarefa.count({
          where: { status: 'PENDENTE', prazo: { lt: hoje }, projeto: { etapaPipeline: { in: etapasAtivas } } }
        }),
        prisma.tarefa.count({
          where: {
            status: 'CONCLUIDA',
            dataConclusao: { gte: new Date(hoje.getFullYear(), hoje.getMonth(), 1) },
          }
        }),
        prisma.tarefa.count({ where: { status: 'PENDENTE', projeto: { etapaPipeline: { in: etapasAtivas } } } }),
        prisma.projeto.groupBy({ by: ['etapaPipeline'], _count: true }),
      ])

      const totalParaEficiencia = tarefasConcluidasMes + tarefasTotais
      const taxaEficiencia = totalParaEficiencia > 0
        ? Math.round((tarefasConcluidasMes / totalParaEficiencia) * 100)
        : 0

      // Evolução mensal (6 meses) — projetos criados
      const evolucaoMensal = []
      for (let i = 5; i >= 0; i--) {
        const mes = new Date(hoje.getFullYear(), hoje.getMonth() - i, 1)
        const fimDoMes = new Date(hoje.getFullYear(), hoje.getMonth() - i + 1, 0)
        const count = await prisma.projeto.count({ where: { criadoEm: { gte: mes, lte: fimDoMes } } })
        evolucaoMensal.push({ mes: mes.toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' }), projetos: count })
      }

      return NextResponse.json({
        tipoView: 'gestor',
        estatisticas: {
          novos, andamento, concluidos,
          tarefasAtrasadas, tarefasConcluidasMes, tarefasTotais, taxaEficiencia,
        },
        porEtapa: porEtapa.map(e => ({ etapa: e.etapaPipeline, count: e._count })),
        projetos,
        evolucaoMensal,
      })
    }

    // ── TÉCNICO / ANALISTA — minhas tarefas e projetos ──────────
    const minhasTarefas = await prisma.tarefa.findMany({
      where: { responsavelId: user.id, status: { not: 'CONCLUIDA' } },
      select: { id: true, projetoId: true, status: true },
    })
    const projetoIdsComTarefas = Array.from(new Set(minhasTarefas.map(t => t.projetoId)))

    const [ativos, concluidos, projetos, tarefasList] = await Promise.all([
      prisma.projeto.count({ where: { etapaPipeline: 'EM_EXECUCAO', id: { in: projetoIdsComTarefas } } }),
      prisma.projeto.count({ where: { responsavelId: user.id, etapaPipeline: 'CONCLUIDO' } }),
      prisma.projeto.findMany({
        where: {
          etapaPipeline: { in: ['OPERACIONAL', 'EM_EXECUCAO'] },
          OR: [
            { responsavelId: user.id },
            { id: { in: projetoIdsComTarefas } },
          ],
        },
        orderBy: { criadoEm: 'desc' },
        take: 20,
      }),
      prisma.tarefa.findMany({
        where: { responsavelId: user.id, status: { not: 'CONCLUIDA' } },
        include: { projeto: { select: { id: true, codigo: true, nome: true } } },
        orderBy: [{ prazo: 'asc' }, { criadoEm: 'asc' }],
        take: 15,
      }),
    ])

    return NextResponse.json({
      tipoView: 'analista',
      estatisticas: { ativos, concluidos, tarefasPendentes: minhasTarefas.length },
      projetos,
      minhasTarefas: tarefasList,
    })
  } catch (error) {
    console.error('Erro no dashboard:', error)
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}
