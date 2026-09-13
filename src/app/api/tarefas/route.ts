import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getCurrentUser } from '@/lib/auth'
import { ROLES_RESTRITOS_AO_PROPRIO } from '@/lib/utils'

export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser()
    if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

    const { searchParams } = new URL(request.url)
    const projetoId         = searchParams.get('projetoId')
    const responsavelId     = searchParams.get('responsavelId')
    const status            = searchParams.get('status')

    const where: any = {}
    if (projetoId)    where.projetoId     = projetoId
    if (responsavelId) where.responsavelId = responsavelId
    if (status)       where.status        = status

    // Perfis operacionais individuais só enxergam as próprias atividades
    if (ROLES_RESTRITOS_AO_PROPRIO.includes(user.role)) {
      where.responsavelId = user.id
    }

    const tarefas = await prisma.tarefa.findMany({
      where,
      include: {
        responsavel: { select: { id: true, nome: true } },
        projeto: { select: { id: true, codigo: true, nome: true } },
        documentos: true,
      },
      orderBy: [{ ordem: 'asc' }, { criadoEm: 'asc' }]
    })

    return NextResponse.json({ tarefas })
  } catch {
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser()
    if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

    const body = await request.json()
    const {
      projetoId, titulo, descricao, observacao, tipo, responsavelId, prazo, ordem, etapa, obrigatorio,
      recorrente, recorrenciaTipo, recorrenciaDiasSemana,
    } = body

    if (!projetoId || !titulo) {
      return NextResponse.json({ error: 'Projeto e título são obrigatórios' }, { status: 400 })
    }

    // ── Recorrência ──────────────────────────────────────────────────────
    // SEMANAL: o(s) dia(s) da semana vêm explicitamente do formulário (pode
    // ser mais de um). MENSAL: o dia do mês continua herdado do prazo da
    // primeira ocorrência, já que não faz sentido escolher "vários dias do
    // mês" da mesma forma.
    if (recorrente) {
      if (!prazo) {
        return NextResponse.json(
          { error: 'Pra tornar uma tarefa recorrente, defina o prazo da primeira ocorrência.' },
          { status: 400 }
        )
      }
      if (recorrenciaTipo !== 'SEMANAL' && recorrenciaTipo !== 'MENSAL') {
        return NextResponse.json({ error: 'Escolha se a recorrência é semanal ou mensal' }, { status: 400 })
      }
      if (recorrenciaTipo === 'SEMANAL') {
        if (!Array.isArray(recorrenciaDiasSemana) || recorrenciaDiasSemana.length === 0) {
          return NextResponse.json({ error: 'Selecione pelo menos um dia da semana pra recorrência semanal' }, { status: 400 })
        }
        if (recorrenciaDiasSemana.some((d: unknown) => typeof d !== 'number' || d < 0 || d > 6 || !Number.isInteger(d))) {
          return NextResponse.json({ error: 'Dia da semana inválido' }, { status: 400 })
        }
      }
    }

    // Perfis operacionais individuais só podem criar tarefas/subtarefas dentro
    // do próprio projeto — mantém a possibilidade prática de detalhar o trabalho
    // sem abrir para criar tarefas em projetos de outras pessoas.
    if (ROLES_RESTRITOS_AO_PROPRIO.includes(user.role)) {
      const projetoDaTarefa = await prisma.projeto.findUnique({
        where: { id: projetoId },
        select: { responsavelId: true },
      })
      if (!projetoDaTarefa || projetoDaTarefa.responsavelId !== user.id) {
        return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
      }
    }

    // ── Validação: prazo não pode ser no passado ───────────────────────────
    if (prazo) {
      const dataPrazo = new Date(prazo)
      const hoje = new Date()
      hoje.setHours(0, 0, 0, 0)
      dataPrazo.setHours(0, 0, 0, 0)
      if (dataPrazo < hoje) {
        return NextResponse.json(
          { error: 'O prazo da tarefa não pode ser uma data passada.' },
          { status: 400 }
        )
      }
    }

    const dataPrazoTarefa = prazo ? new Date(prazo) : null

    // SEMANAL usa os dias escolhidos no formulário; MENSAL continua herdando
    // o dia do mês a partir do prazo desta primeira ocorrência.
    const camposRecorrencia = recorrente && dataPrazoTarefa
      ? {
          recorrente: true,
          recorrenciaTipo,
          recorrenciaDiasSemana: recorrenciaTipo === 'SEMANAL'
            ? Array.from(new Set(recorrenciaDiasSemana as number[])).sort((a: number, b: number) => a - b)
            : [],
          recorrenciaDiaMes: recorrenciaTipo === 'MENSAL' ? dataPrazoTarefa.getDate() : null,
        }
      : {}

    const tarefa = await prisma.tarefa.create({
      data: {
        projetoId, titulo, descricao,
        observacao: observacao || null,
        tipo: tipo || 'TAREFA',
        responsavelId: responsavelId || null,
        prazo: dataPrazoTarefa,
        ordem: ordem || 0,
        etapa,
        obrigatorio: obrigatorio || false,
        status: 'PENDENTE',
        ...camposRecorrencia,
      } as any,
      include: { responsavel: { select: { id: true, nome: true } } }
    })

    return NextResponse.json({ tarefa }, { status: 201 })
  } catch {
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const user = await getCurrentUser()
    if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

    const body = await request.json()
    const { id, status, responsavelId, prazo, descricao, observacao, recorrenciaAtiva } = body

    if (!id) return NextResponse.json({ error: 'ID da tarefa é obrigatório' }, { status: 400 })

    // Busca tarefa atual para checks
    const tarefaAtual = await prisma.tarefa.findUnique({
      where: { id },
      include: { projeto: { select: { id: true, codigo: true, nome: true, responsavelId: true } } }
    })
    if (!tarefaAtual) return NextResponse.json({ error: 'Tarefa não encontrada' }, { status: 404 })

    // Perfis operacionais individuais só podem atualizar: tarefas atribuídas a
    // eles mesmos, ou tarefas de um projeto do qual eles são o responsável
    // (ex: gerenciar subtarefas do próprio projeto mesmo sem estar atribuído a cada uma).
    if (
      ROLES_RESTRITOS_AO_PROPRIO.includes(user.role) &&
      tarefaAtual.responsavelId !== user.id &&
      tarefaAtual.projeto?.responsavelId !== user.id
    ) {
      return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
    }

    // ── Monta payload de update ──────────────────────────────────────────
    const updateData: any = {
      ...(status           !== undefined && { status }),
      ...(responsavelId    !== undefined && { responsavelId }),
      ...(descricao        !== undefined && { descricao }),
      ...(observacao       !== undefined && { observacao: observacao || null }),
      ...(status === 'CONCLUIDA'         && { dataConclusao: new Date() }),
      // Liga/desliga a geração de novas ocorrências — só faz sentido na
      // tarefa "mestre" (a rota de geração já ignora quem não é mestre, mas
      // aceitar aqui em qualquer tarefa recorrente é inofensivo).
      ...(recorrenciaAtiva !== undefined && { recorrenciaAtiva: !!recorrenciaAtiva }),
    }

    if (prazo !== undefined) {
      updateData.prazo = prazo ? new Date(prazo) : null
    }

    const tarefa = await prisma.tarefa.update({
      where: { id },
      data: updateData,
      include: { responsavel: { select: { id: true, nome: true } } }
    })

    // ── Notificar quando responsável é designado ─────────────────────────
    if (
      responsavelId &&
      responsavelId !== tarefaAtual.responsavelId &&
      responsavelId !== user.id
    ) {
      await prisma.notificacao.create({
        data: {
          usuarioId: responsavelId,
          titulo: '📋 Você foi designado para uma atividade',
          mensagem: `Você foi indicado como responsável pela atividade "${tarefaAtual.titulo}" do projeto ${tarefaAtual.projeto?.codigo} (${tarefaAtual.projeto?.nome || ''}).`,
          tipo: 'info',
          link: `/operacional/${tarefaAtual.projetoId}`,
        },
      }).catch(() => {}) // não bloqueia se falhar
    }

    // ── Auto-avanço de pipeline ao concluir tarefas ──────────────────────
    if (updateData.status) {
      const todasTarefas = await prisma.tarefa.findMany({
        where: { projetoId: tarefaAtual.projetoId },
        select: { id: true, status: true },
      })
      const totalTarefas  = todasTarefas.length
      const concluidas    = todasTarefas.filter(t => t.status === 'CONCLUIDA').length

      const proj = await prisma.projeto.findUnique({
        where: { id: tarefaAtual.projetoId },
        select: { id: true, etapaPipeline: true, statusOperacional: true },
      })

      if (proj) {
        if (updateData.status === 'CONCLUIDA') {
          // Primeira tarefa concluída → avança de OPERACIONAL para EM_EXECUCAO
          if (proj.etapaPipeline === 'OPERACIONAL' && concluidas === 1) {
            await prisma.projeto.update({
              where: { id: proj.id },
              data: { etapaPipeline: 'EM_EXECUCAO', statusOperacional: 'EM_ANDAMENTO' },
            })
            await prisma.historicoStatus.create({
              data: {
                projetoId: proj.id,
                statusAnterior: 'NAO_INICIADO',
                statusNovo: 'EM_ANDAMENTO',
                campo: 'statusOperacional',
                observacao: 'Iniciado automaticamente ao concluir primeira tarefa',
                usuarioId: user.id,
              },
            }).catch(() => {})
          }
          // Todas concluídas → finaliza parte operacional. Atualiza os DOIS
          // campos de status juntos (statusOperacional E etapaPipeline) —
          // antes só o statusOperacional avançava pra CONCLUIDO, então o
          // projeto ficava "preso" em etapaPipeline=EM_EXECUCAO pra sempre,
          // e continuava contando como "Em Execução" no Dashboard/BI mesmo
          // com todas as tarefas concluídas.
          if (totalTarefas > 0 && concluidas === totalTarefas) {
            await prisma.projeto.update({
              where: { id: proj.id },
              data: { statusOperacional: 'CONCLUIDO', etapaPipeline: 'CONCLUIDO' },
            })
            if (proj.etapaPipeline !== 'CONCLUIDO') {
              await prisma.historicoStatus.create({
                data: {
                  projetoId: proj.id,
                  statusAnterior: proj.etapaPipeline,
                  statusNovo: 'CONCLUIDO',
                  campo: 'etapaPipeline',
                  observacao: 'Concluído automaticamente ao concluir a última tarefa',
                  usuarioId: user.id,
                },
              }).catch(() => {})
            }
          }
        } else if (updateData.status === 'PENDENTE') {
          // Desmarcou (reabriu uma tarefa) → se o projeto já tinha sido dado
          // como concluído, volta pros dois campos de status pro estado "em
          // andamento" — mesma lógica simétrica do avanço acima.
          if (proj.statusOperacional === 'CONCLUIDO' || proj.etapaPipeline === 'CONCLUIDO') {
            await prisma.projeto.update({
              where: { id: proj.id },
              data: {
                statusOperacional: 'EM_ANDAMENTO',
                ...(proj.etapaPipeline === 'CONCLUIDO' && { etapaPipeline: 'EM_EXECUCAO' }),
              },
            })
          }
        }
      }
    }

    return NextResponse.json({ tarefa })
  } catch (error) {
    console.error(error)
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}
