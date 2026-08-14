import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getCurrentUserFull, podeAcessarModulo } from '@/lib/auth'

// API de BI simplificada — dbgix não possui mais Comercial/Contratos/Financeiro/
// Acompanhamento de Processos, então os indicadores aqui são só sobre a operação
// (projetos, tarefas por etapa e tempos médios do fluxo operacional).
export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUserFull()
    if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
    if (!podeAcessarModulo(user, 'bi')) {
      return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
    }

    const hoje = new Date()

    // ── Distribuição de tarefas por etapa ────────────────────────────────────
    const porEtapaTarefa = await prisma.tarefa.groupBy({
      by: ['etapa'],
      _count: true,
    })
    const tarefasPorEtapa = porEtapaTarefa
      .map(e => ({ nome: e.etapa || 'Sem etapa', qtd: e._count }))
      .sort((a, b) => b.qtd - a.qtd)

    // ── Distribuição por status operacional ─────────────────────────────────
    const porStatusOperacional = await prisma.projeto.groupBy({
      by: ['statusOperacional'],
      _count: true,
    })

    // ── Tempos médios do fluxo operacional ──────────────────────────────────
    function mediaDias(pares: { inicio: Date; fim: Date }[]): number | null {
      const dias = pares
        .map(p => (p.fim.getTime() - p.inicio.getTime()) / 86_400_000)
        .filter(d => d >= 0)
      if (dias.length === 0) return null
      return Math.round((dias.reduce((a, b) => a + b, 0) / dias.length) * 10) / 10
    }

    const [projetosProtocolados, projetosConcluidos, tarefasConcluidas] = await Promise.all([
      // Tempo médio até o protocolo: do início da execução (dataInicio) até o protocolo no órgão
      prisma.projeto.findMany({
        where: { dataInicio: { not: null }, protocoloData: { not: null } },
        select: { dataInicio: true, protocoloData: true },
      }),
      // Tempo médio até a conclusão: da entrada até a conclusão do projeto
      prisma.projeto.findMany({
        where: { dataConclusao: { not: null } },
        select: { dataEntrada: true, dataConclusao: true },
      }),
      // Tempo médio de execução de tarefa: da criação até a conclusão
      prisma.tarefa.findMany({
        where: { status: 'CONCLUIDA', dataConclusao: { not: null } },
        select: { criadoEm: true, dataConclusao: true },
      }),
    ])

    const tempoMedioProtocoloDias = mediaDias(
      projetosProtocolados.map(p => ({ inicio: p.dataInicio!, fim: p.protocoloData! }))
    )
    const tempoMedioConclusaoDias = mediaDias(
      projetosConcluidos.map(p => ({ inicio: p.dataEntrada, fim: p.dataConclusao! }))
    )
    const tempoMedioTarefaDias = mediaDias(
      tarefasConcluidas.map(t => ({ inicio: t.criadoEm, fim: t.dataConclusao! }))
    )

    return NextResponse.json({
      tarefasPorEtapa,
      porStatusOperacional: porStatusOperacional.map(s => ({ status: s.statusOperacional, count: s._count })),
      tempos: {
        protocoloDias:    tempoMedioProtocoloDias,
        protocoloAmostra: projetosProtocolados.length,
        conclusaoDias:    tempoMedioConclusaoDias,
        conclusaoAmostra: projetosConcluidos.length,
        tarefaDias:       tempoMedioTarefaDias,
        tarefaAmostra:    tarefasConcluidas.length,
      },
    })
  } catch (error) {
    console.error('Erro na API BI:', error)
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}
