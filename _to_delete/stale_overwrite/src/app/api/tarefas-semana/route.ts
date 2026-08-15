import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getCurrentUser } from '@/lib/auth'

// Quem pode ver/planejar a semana de OUTRO usuário (além da própria)
const PODE_VER_OUTROS = ['ADMIN', 'GESTOR_GERAL', 'GESTOR_OPERACIONAL', 'GESTOR_ADMINISTRATIVO', 'SUPERVISOR']

function segundaFeiraDaSemana(data: Date): Date {
  const d = new Date(data)
  const dia = d.getDay() // 0=domingo..6=sábado
  const diff = dia === 0 ? -6 : 1 - dia
  d.setDate(d.getDate() + diff)
  d.setHours(0, 0, 0, 0)
  return d
}

export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser()
    if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

    const { searchParams } = new URL(request.url)
    const semanaParam = searchParams.get('semanaInicio')
    let usuarioId = searchParams.get('usuarioId') || user.id

    // Só ADMIN/gestores podem ver a semana de outra pessoa
    if (usuarioId !== user.id && !PODE_VER_OUTROS.includes(user.role)) {
      usuarioId = user.id
    }

    const semanaInicio = segundaFeiraDaSemana(semanaParam ? new Date(semanaParam) : new Date())

    const [planejadas, tarefasBruto] = await Promise.all([
      prisma.tarefaSemana.findMany({
        where: { usuarioId, semanaInicio },
        include: {
          tarefa: {
            include: {
              projeto: { select: { id: true, codigo: true, nome: true } },
            },
          },
        },
        orderBy: { criadoEm: 'asc' },
      }),
      // Backlog — tarefas operacionais pendentes
      prisma.tarefa.findMany({
        where: { responsavelId: usuarioId, status: { notIn: ['CONCLUIDA', 'CANCELADA'] } },
        include: {
          projeto: { select: { id: true, codigo: true, nome: true } },
        },
        orderBy: [{ prazo: 'asc' }, { criadoEm: 'asc' }],
      }),
    ])

    const idsTarefaNaSemana = new Set(planejadas.filter(p => p.tarefaId).map(p => p.tarefaId))

    const backlog = tarefasBruto
      .filter(t => !idsTarefaNaSemana.has(t.id))
      .map(t => ({
        id: t.id,
        tipo: 'TAREFA' as const,
        titulo: t.titulo,
        prazo: t.prazo,
        projeto: t.projeto,
      }))
      .sort((a, b) => {
        if (!a.prazo && !b.prazo) return 0
        if (!a.prazo) return 1
        if (!b.prazo) return -1
        return new Date(a.prazo).getTime() - new Date(b.prazo).getTime()
      })

    return NextResponse.json({
      semanaInicio,
      usuarioId,
      backlog,
      planejadas: planejadas.map(p => ({
        id: p.id,
        tipo: 'TAREFA' as const,
        itemId: p.tarefaId,
        criadoEm: p.criadoEm,
        diaSemana: p.diaSemana,
        titulo: p.tarefa?.titulo,
        projeto: p.tarefa?.projeto,
        concluida: p.tarefa?.status === 'CONCLUIDA',
      })),
    })
  } catch (err) {
    console.error('[tarefas-semana GET]', err)
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}

// Adiciona uma tarefa ao planejamento da semana
export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser()
    if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

    const body = await request.json()
    const { itemId, semanaInicio: semanaParam, diaSemana } = body
    if (!itemId) return NextResponse.json({ error: 'itemId é obrigatório' }, { status: 400 })

    let usuarioId = body.usuarioId || user.id
    if (usuarioId !== user.id && !PODE_VER_OUTROS.includes(user.role)) {
      usuarioId = user.id
    }

    const semanaInicio = segundaFeiraDaSemana(semanaParam ? new Date(semanaParam) : new Date())

    const item = await prisma.tarefaSemana.upsert({
      where: { tarefaId_usuarioId_semanaInicio: { tarefaId: itemId, usuarioId, semanaInicio } },
      create: { tarefaId: itemId, usuarioId, semanaInicio, diaSemana: diaSemana ?? null },
      update: {},
    })

    return NextResponse.json({ item })
  } catch (err) {
    console.error('[tarefas-semana POST]', err)
    return NextResponse.json({ error: 'Erro ao adicionar à semana' }, { status: 500 })
  }
}

// Atualiza o dia da semana escolhido para um item já planejado
export async function PATCH(request: NextRequest) {
  try {
    const user = await getCurrentUser()
    if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

    const body = await request.json()
    const { id, diaSemana } = body
    if (!id) return NextResponse.json({ error: 'id é obrigatório' }, { status: 400 })

    const item = await prisma.tarefaSemana.findUnique({ where: { id } })
    if (!item) return NextResponse.json({ error: 'Não encontrado' }, { status: 404 })
    if (item.usuarioId !== user.id && !PODE_VER_OUTROS.includes(user.role)) {
      return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
    }

    const atualizado = await prisma.tarefaSemana.update({
      where: { id },
      data: { diaSemana: diaSemana === null ? null : Number(diaSemana) },
    })

    return NextResponse.json({ item: atualizado })
  } catch (err) {
    console.error('[tarefas-semana PATCH]', err)
    return NextResponse.json({ error: 'Erro ao atualizar' }, { status: 500 })
  }
}

// Remove um item do planejamento da semana (volta pro backlog)
export async function DELETE(request: NextRequest) {
  try {
    const user = await getCurrentUser()
    if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')
    if (!id) return NextResponse.json({ error: 'id é obrigatório' }, { status: 400 })

    const item = await prisma.tarefaSemana.findUnique({ where: { id } })
    if (!item) return NextResponse.json({ error: 'Não encontrado' }, { status: 404 })
    if (item.usuarioId !== user.id && !PODE_VER_OUTROS.includes(user.role)) {
      return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
    }

    await prisma.tarefaSemana.delete({ where: { id } })
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[tarefas-semana DELETE]', err)
    return NextResponse.json({ error: 'Erro ao remover' }, { status: 500 })
  }
}
