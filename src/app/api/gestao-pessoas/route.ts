import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getCurrentUserFull, podeAcessarModulo } from '@/lib/auth'

// Quem pode ver o painel de Gestão de Pessoas — mesma régua usada no KPI de
// cumprimento semanal (tarefas-semana/kpi), já que os dados aqui são um
// superconjunto daquele painel.
const PODE_VER = ['ADMIN', 'GESTOR_GERAL', 'GESTOR_OPERACIONAL', 'GESTOR_ADMINISTRATIVO', 'SUPERVISOR']

function segundaFeiraDaSemana(data: Date): Date {
  const d = new Date(data)
  const dia = d.getDay()
  const diff = dia === 0 ? -6 : 1 - dia
  d.setDate(d.getDate() + diff)
  d.setHours(0, 0, 0, 0)
  return d
}

function mediaDias(pares: { inicio: Date; fim: Date }[]): number | null {
  const dias = pares
    .map(p => (p.fim.getTime() - p.inicio.getTime()) / 86_400_000)
    .filter(d => d >= 0)
  if (dias.length === 0) return null
  return Math.round((dias.reduce((a, b) => a + b, 0) / dias.length) * 10) / 10
}

// Painel de análise por pessoa: eficiência (cumprimento do planejamento
// semanal), agilidade (tempo médio de execução), atividades executadas,
// missão do dia (indicada x executada) e sinais de qualidade (justificativas
// preenchidas, atrasos). GET /api/gestao-pessoas?semanas=8
export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUserFull()
    if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
    if (!PODE_VER.includes(user.role) || !podeAcessarModulo(user, 'gestao-pessoas')) {
      return NextResponse.json({ error: 'Sem permissão para ver este painel' }, { status: 403 })
    }

    const { searchParams } = new URL(request.url)
    const semanas = Math.max(1, Math.min(26, parseInt(searchParams.get('semanas') || '8')))

    const inicio = segundaFeiraDaSemana(new Date())
    inicio.setDate(inicio.getDate() - (semanas - 1) * 7)

    const usuarios = await prisma.usuario.findMany({
      where: { ativo: true },
      select: { id: true, nome: true, role: true, cargo: true },
      orderBy: { nome: 'asc' },
    })
    const ids = usuarios.map(u => u.id)

    const [tarefas, planejamento] = await Promise.all([
      prisma.tarefa.findMany({
        where: { responsavelId: { in: ids }, criadoEm: { gte: inicio } },
        select: { responsavelId: true, status: true, criadoEm: true, dataConclusao: true, prazo: true },
      }),
      prisma.tarefaSemana.findMany({
        where: { usuarioId: { in: ids }, semanaInicio: { gte: inicio } },
        select: { usuarioId: true, missaoDia: true, justificativa: true, tarefa: { select: { status: true } } },
      }),
    ])

    const agora = new Date()

    const metricas = usuarios.map(u => {
      const minhasTarefas = tarefas.filter(t => t.responsavelId === u.id)
      const concluidas = minhasTarefas.filter(t => t.status === 'CONCLUIDA')
      const atrasadas = minhasTarefas.filter(t =>
        t.status === 'ATRASADA' || (t.status !== 'CONCLUIDA' && t.status !== 'CANCELADA' && t.prazo && new Date(t.prazo) < agora)
      )
      const agilidadeDias = mediaDias(
        concluidas.filter(t => t.dataConclusao).map(t => ({ inicio: t.criadoEm, fim: t.dataConclusao! }))
      )

      const meusPlanejados = planejamento.filter(p => p.usuarioId === u.id)
      const planejadas = meusPlanejados.length
      const planejadasConcluidas = meusPlanejados.filter(p => p.tarefa?.status === 'CONCLUIDA').length
      const taxaCumprimento = planejadas > 0 ? Math.round((planejadasConcluidas / planejadas) * 1000) / 10 : 0

      const missoes = meusPlanejados.filter(p => p.missaoDia)
      const missoesIndicadas = missoes.length
      const missoesExecutadas = missoes.filter(p => p.tarefa?.status === 'CONCLUIDA').length
      const missoesComJustificativa = missoes.filter(p => p.justificativa).length
      const taxaMissao = missoesIndicadas > 0 ? Math.round((missoesExecutadas / missoesIndicadas) * 1000) / 10 : 0
      const taxaJustificativa = missoesIndicadas > 0 ? Math.round((missoesComJustificativa / missoesIndicadas) * 1000) / 10 : 0

      return {
        usuarioId: u.id,
        nome: u.nome,
        role: u.role,
        cargo: u.cargo,
        atividadesExecutadas: concluidas.length,
        totalAtividades: minhasTarefas.length,
        atrasadas: atrasadas.length,
        agilidadeDias, // menor = mais ágil; null = sem amostra suficiente
        planejadas,
        planejadasConcluidas,
        taxaCumprimento, // "eficiência" — % do que planejou que realmente concluiu
        missoesIndicadas,
        missoesExecutadas,
        taxaMissao,
        missoesComJustificativa,
        taxaJustificativa, // sinal de qualidade: % das missões com justificativa registrada
      }
    })

    metricas.sort((a, b) => b.taxaCumprimento - a.taxaCumprimento)

    return NextResponse.json({ semanas, desde: inicio, pessoas: metricas })
  } catch (error) {
    console.error('Erro na API Gestão de Pessoas:', error)
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}
