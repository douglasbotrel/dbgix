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

// 0=Segunda .. 6=Domingo — mesmo índice usado em diaSemana/DIAS_NOME no front-end
function diaDeHojeIndex(): number {
  const dia = new Date().getDay()
  return dia === 0 ? 6 : dia - 1
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
        missaoDia: p.missaoDia,
        justificativa: p.justificativa,
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

// Atualiza o dia da semana, a marcação de "missão do dia" e/ou a justificativa
// de um item já planejado. Quem pode editar: o próprio dono do item (analista)
// ou um gestor (PODE_VER_OUTROS) — mesma regra dos outros endpoints desta rota,
// já que a missão do dia pode ser definida pelo gestor OU pelo analista.
//
// Regras da missão do dia:
// - É sempre HOJE — ao marcar, o servidor já entende qual dia é hoje e move o
//   item para lá, não precisa escolher o dia manualmente antes.
// - Só existe para a semana atual (não faz sentido em semanas passadas/futuras).
// - Só uma por usuário/dia. Um gestor pode definir/trocar a de qualquer
//   subordinado a qualquer momento. O próprio analista só pode definir a sua
//   caso ainda não exista nenhuma registrada para hoje — não pode sobrescrever
//   uma que o gestor (ou ele mesmo antes) já tenha definido.
export async function PATCH(request: NextRequest) {
  try {
    const user = await getCurrentUser()
    if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

    const body = await request.json()
    const { id, diaSemana, missaoDia, justificativa } = body
    if (!id) return NextResponse.json({ error: 'id é obrigatório' }, { status: 400 })

    const item = await prisma.tarefaSemana.findUnique({ where: { id } })
    if (!item) return NextResponse.json({ error: 'Não encontrado' }, { status: 404 })
    if (item.usuarioId !== user.id && !PODE_VER_OUTROS.includes(user.role)) {
      return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
    }

    const data: any = {}
    if (diaSemana !== undefined) data.diaSemana = diaSemana === null ? null : Number(diaSemana)

    if (missaoDia === true) {
      const semanaAtual = segundaFeiraDaSemana(new Date())
      if (item.semanaInicio.getTime() !== semanaAtual.getTime()) {
        return NextResponse.json({ error: 'Só é possível marcar a missão do dia na semana atual' }, { status: 400 })
      }

      // Missão do dia é sempre hoje — sobrescreve qualquer diaSemana enviado.
      const diaHoje = diaDeHojeIndex()
      data.diaSemana = diaHoje

      const souGestor = PODE_VER_OUTROS.includes(user.role)
      if (!souGestor) {
        const existente = await prisma.tarefaSemana.findFirst({
          where: {
            usuarioId: item.usuarioId,
            semanaInicio: item.semanaInicio,
            diaSemana: diaHoje,
            missaoDia: true,
            id: { not: id },
          },
        })
        if (existente) {
          return NextResponse.json({ error: 'Já existe uma missão do dia registrada para hoje' }, { status: 409 })
        }
      }

      data.missaoDia = true
    } else if (missaoDia === false) {
      data.missaoDia = false
    }

    if (justificativa !== undefined) data.justificativa = justificativa ? String(justificativa).trim() : null

    // Só um item por usuário/dia pode ser a "missão do dia" — ao marcar um
    // novo (sempre hoje), desmarca qualquer outro que já fosse a de hoje.
    const atualizado = await prisma.$transaction(async tx => {
      if (data.missaoDia === true) {
        await tx.tarefaSemana.updateMany({
          where: {
            usuarioId: item.usuarioId,
            semanaInicio: item.semanaInicio,
            diaSemana: data.diaSemana,
            missaoDia: true,
            id: { not: id },
          },
          data: { missaoDia: false },
        })
      }
      return tx.tarefaSemana.update({ where: { id }, data })
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
