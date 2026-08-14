import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getCurrentUser } from '@/lib/auth'

const PODE_VER_KPI = ['ADMIN', 'GESTOR_GERAL', 'GESTOR_OPERACIONAL', 'GESTOR_ADMINISTRATIVO', 'SUPERVISOR']

function segundaFeiraDaSemana(data: Date): Date {
  const d = new Date(data)
  const dia = d.getDay()
  const diff = dia === 0 ? -6 : 1 - dia
  d.setDate(d.getDate() + diff)
  d.setHours(0, 0, 0, 0)
  return d
}

// KPI de gestão: taxa de cumprimento do planejamento semanal, por usuário.
// GET /api/tarefas-semana/kpi?semanas=4
export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser()
    if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
    if (!PODE_VER_KPI.includes(user.role)) {
      return NextResponse.json({ error: 'Sem permissão para ver este painel' }, { status: 403 })
    }

    const { searchParams } = new URL(request.url)
    const semanas = Math.max(1, Math.min(26, parseInt(searchParams.get('semanas') || '4')))

    const inicio = segundaFeiraDaSemana(new Date())
    inicio.setDate(inicio.getDate() - (semanas - 1) * 7)

    const registros = await prisma.tarefaSemana.findMany({
      where: { semanaInicio: { gte: inicio } },
      include: {
        usuario: { select: { id: true, nome: true } },
        tarefa: { select: { status: true } },
      },
    })

    const porUsuario: Record<string, { nome: string; planejadas: number; concluidas: number }> = {}
    for (const r of registros) {
      if (!porUsuario[r.usuarioId]) {
        porUsuario[r.usuarioId] = { nome: r.usuario.nome, planejadas: 0, concluidas: 0 }
      }
      porUsuario[r.usuarioId].planejadas++
      const concluida = r.tarefa?.status === 'CONCLUIDA'
      if (concluida) porUsuario[r.usuarioId].concluidas++
    }

    const usuarios = Object.entries(porUsuario)
      .map(([usuarioId, v]) => ({
        usuarioId,
        nome: v.nome,
        planejadas: v.planejadas,
        concluidas: v.concluidas,
        taxa: v.planejadas > 0 ? Math.round((v.concluidas / v.planejadas) * 1000) / 10 : 0,
      }))
      .sort((a, b) => b.taxa - a.taxa)

    return NextResponse.json({ semanas, desde: inicio, usuarios })
  } catch (err) {
    console.error('[tarefas-semana/kpi GET]', err)
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}
