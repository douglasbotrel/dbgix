import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getCurrentUser } from '@/lib/auth'

const ROLES_PERMITIDOS = ['ADMIN', 'GESTOR_GERAL', 'GESTOR_OPERACIONAL']

export async function GET() {
  try {
    const user = await getCurrentUser()
    if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
    if (!ROLES_PERMITIDOS.includes(user.role)) {
      return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
    }

    const hoje = new Date()
    hoje.setHours(23, 59, 59, 999)

    const projetos = await prisma.projeto.findMany({
      where: {
        etapaPipeline: { in: ['OPERACIONAL', 'EM_EXECUCAO'] },
      },
      include: {
        responsavel: { select: { id: true, nome: true } },
        tarefas: {
          select: {
            id: true,
            status: true,
            prazo: true,
            responsavelId: true,
          },
        },
      },
      orderBy: { criadoEm: 'desc' },
    })

    const projetosComStats = projetos.map(p => {
      const tarefas      = p.tarefas
      const total        = tarefas.length
      const concluidas   = tarefas.filter(t => t.status === 'CONCLUIDA').length
      const atrasadas    = tarefas.filter(
        t => t.status !== 'CONCLUIDA' && t.prazo && new Date(t.prazo) < hoje
      ).length
      const semResponsavel = tarefas.filter(
        t => t.status !== 'CONCLUIDA' && !t.responsavelId
      ).length
      const pct          = total > 0 ? Math.round((concluidas / total) * 100) : 0

      return {
        id:               p.id,
        codigo:           p.codigo,
        nome:             p.nome,
        etapaPipeline:    p.etapaPipeline,
        statusOperacional: p.statusOperacional,
        dataPrazo:        p.dataPrazo,
        responsavel:      p.responsavel,
        _stats: {
          total,
          concluidas,
          pendentes:    total - concluidas,
          atrasadas,
          semResponsavel,
          pct,
        },
      }
    })

    // Totais globais
    const totalProjetos          = projetosComStats.length
    const totalTarefas           = projetosComStats.reduce((s, p) => s + p._stats.total, 0)
    const totalConcluidas        = projetosComStats.reduce((s, p) => s + p._stats.concluidas, 0)
    const totalAtrasadas         = projetosComStats.reduce((s, p) => s + p._stats.atrasadas, 0)
    const totalSemResponsavel    = projetosComStats.reduce((s, p) => s + p._stats.semResponsavel, 0)
    const projetosSemResponsavel = projetosComStats.filter(p => !p.responsavel).length
    const pctGlobal              = totalTarefas > 0
      ? Math.round((totalConcluidas / totalTarefas) * 100)
      : 0

    return NextResponse.json({
      projetos: projetosComStats,
      stats: {
        totalProjetos,
        totalTarefas,
        totalConcluidas,
        totalAtrasadas,
        totalSemResponsavel,
        projetosSemResponsavel,
        pctGlobal,
      },
    })
  } catch (error) {
    console.error('Erro na visão de gestão:', error)
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}
