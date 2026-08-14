import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getCurrentUser } from '@/lib/auth'
import { ROLES_RESTRITOS_AO_PROPRIO } from '@/lib/utils'

// Qual etapa vem depois de cada etapa ao "salvar/confirmar"
const PROXIMA_ETAPA: Record<string, string> = {
  OPERACIONAL: 'EM_EXECUCAO',
  EM_EXECUCAO: 'CONCLUIDO',
}

async function criarNotificacaoEtapa(etapa: string, projeto: any) {
  const notifs: { usuarioId: string; titulo: string; mensagem: string; tipo: string; link: string }[] = []
  const base = `Projeto ${projeto.codigo} — ${projeto.nome}`

  if (etapa === 'EM_EXECUCAO' && projeto.responsavelId) {
    notifs.push({
      usuarioId: projeto.responsavelId,
      titulo: '📋 Projeto em execução',
      mensagem: `${base}: primeira tarefa concluída — projeto agora em execução.`,
      tipo: 'info',
      link: `/operacional/${projeto.id}`,
    })
  }

  if (notifs.length > 0) {
    await prisma.notificacao.createMany({ data: notifs })
  }
}

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await getCurrentUser()
    if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

    const projeto = await prisma.projeto.findUnique({
      where: { id: params.id },
      include: {
        responsavel: { select: { id: true, nome: true, email: true, cargo: true } },
        supervisor: { select: { id: true, nome: true, email: true } },
        tarefas: {
          orderBy: { ordem: 'asc' },
          include: {
            responsavel: { select: { id: true, nome: true } },
            documentos: true,
          }
        },
        documentos: {
          orderBy: { criadoEm: 'desc' },
          include: { usuario: { select: { id: true, nome: true } } }
        },
        comentarios: {
          orderBy: { criadoEm: 'desc' },
          include: { autor: { select: { id: true, nome: true } } }
        },
        historico: {
          orderBy: { criadoEm: 'desc' },
          take: 20,
        },
      }
    })

    if (!projeto) {
      return NextResponse.json({ error: 'Projeto não encontrado' }, { status: 404 })
    }

    // Perfis operacionais individuais só podem abrir projetos onde são o responsável
    // (a listagem já filtra isso, mas o acesso direto por ID/URL precisa da mesma regra)
    if (ROLES_RESTRITOS_AO_PROPRIO.includes(user.role) && projeto.responsavelId !== user.id) {
      return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
    }

    return NextResponse.json({ projeto })
  } catch (error) {
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await getCurrentUser()
    if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

    const body = await request.json()
    const projeto = await prisma.projeto.findUnique({ where: { id: params.id } })
    if (!projeto) return NextResponse.json({ error: 'Projeto não encontrado' }, { status: 404 })

    // Perfis operacionais individuais só podem editar o próprio projeto
    if (ROLES_RESTRITOS_AO_PROPRIO.includes(user.role) && projeto.responsavelId !== user.id) {
      return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
    }

    // Avança pipeline quando o responsável confirma
    const avancarPipeline = body.avancarPipeline === true

    let novaEtapa = projeto.etapaPipeline
    if (avancarPipeline && PROXIMA_ETAPA[projeto.etapaPipeline]) {
      novaEtapa = PROXIMA_ETAPA[projeto.etapaPipeline]
    } else if (body.etapaPipeline && body.etapaPipeline !== projeto.etapaPipeline) {
      novaEtapa = body.etapaPipeline
    }

    // Histórico de etapa
    if (novaEtapa !== projeto.etapaPipeline) {
      await prisma.historicoStatus.create({
        data: {
          projetoId: params.id,
          statusAnterior: projeto.etapaPipeline,
          statusNovo: novaEtapa,
          campo: 'etapaPipeline',
          observacao: body.observacaoTransicao || null,
          usuarioId: user.id,
        }
      }).catch(() => {})
    }

    // Histórico de statusOperacional
    if (body.statusOperacional && body.statusOperacional !== projeto.statusOperacional) {
      await prisma.historicoStatus.create({
        data: {
          projetoId: params.id,
          statusAnterior: projeto.statusOperacional,
          statusNovo: body.statusOperacional,
          campo: 'statusOperacional',
          usuarioId: user.id,
        }
      }).catch(() => {})
    }

    // ── Validações de datas ──────────────────────────────────────────────────
    const dataInicio     = body.dataInicio     ? new Date(body.dataInicio)     : projeto.dataInicio
    const dataPrazo      = body.dataPrazo      ? new Date(body.dataPrazo)      : projeto.dataPrazo
    const dataConclusao  = body.dataConclusao  ? new Date(body.dataConclusao)  : null

    if (body.dataPrazo && dataInicio && dataPrazo) {
      if (dataPrazo < dataInicio) {
        return NextResponse.json(
          { error: 'O prazo do projeto não pode ser anterior à data de início.' },
          { status: 400 }
        )
      }
    }
    if (body.dataConclusao && dataInicio && dataConclusao) {
      if (dataConclusao < dataInicio) {
        return NextResponse.json(
          { error: 'A data de conclusão não pode ser anterior à data de início.' },
          { status: 400 }
        )
      }
    }
    if (body.dataInicio && dataPrazo && dataInicio) {
      if (dataPrazo < dataInicio) {
        return NextResponse.json(
          { error: 'A data de início não pode ser posterior ao prazo já definido.' },
          { status: 400 }
        )
      }
    }

    // Ao avançar de OPERACIONAL → EM_EXECUCAO, marca automaticamente como EM_ANDAMENTO
    const autoStatusOperacional =
      avancarPipeline &&
      projeto.etapaPipeline === 'OPERACIONAL' &&
      novaEtapa === 'EM_EXECUCAO' &&
      !body.statusOperacional
        ? 'EM_ANDAMENTO'
        : null

    const projetoAtualizado = await prisma.projeto.update({
      where: { id: params.id },
      data: {
        etapaPipeline: novaEtapa,
        ...((body.statusOperacional || autoStatusOperacional) && {
          statusOperacional: body.statusOperacional || autoStatusOperacional,
        }),
        ...(body.nome !== undefined && { nome: body.nome }),
        ...(body.descricao !== undefined && { descricao: body.descricao }),
        ...(body.observacoes !== undefined && { observacoes: body.observacoes }),
        ...(body.credenciais        !== undefined && { credenciais: body.credenciais }),
        ...(body.responsavelId !== undefined && { responsavelId: body.responsavelId || null }),
        ...(body.supervisorId !== undefined && { supervisorId: body.supervisorId || null }),
        ...(body.gestorResponsavelId !== undefined && { gestorResponsavelId: body.gestorResponsavelId || null }),
        ...(body.dataPrazo !== undefined && { dataPrazo: body.dataPrazo ? new Date(body.dataPrazo) : null }),
        ...(body.dataInicio !== undefined && { dataInicio: body.dataInicio ? new Date(body.dataInicio) : null }),
        ...(body.dataConclusao !== undefined && { dataConclusao: body.dataConclusao ? new Date(body.dataConclusao) : null }),
        ...(body.protocoloData !== undefined && { protocoloData: body.protocoloData ? new Date(body.protocoloData) : null }),
        ...(body.protocoloCodigoOrgao !== undefined && { protocoloCodigoOrgao: body.protocoloCodigoOrgao || null }),
      },
      include: {
        responsavel: { select: { id: true, nome: true } },
        supervisor: { select: { id: true, nome: true } },
      }
    })

    // Notificações para a nova etapa
    if (novaEtapa !== projeto.etapaPipeline) {
      await criarNotificacaoEtapa(novaEtapa, projetoAtualizado)
    }

    await prisma.log.create({
      data: {
        usuarioId: user.id,
        acao: 'ATUALIZAR_PROJETO',
        entidade: 'Projeto',
        entidadeId: params.id,
        detalhes: JSON.stringify({ etapa: novaEtapa, campos: Object.keys(body) }),
      }
    })

    return NextResponse.json({ projeto: projetoAtualizado })
  } catch (error) {
    console.error('Erro ao atualizar projeto:', error)
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await getCurrentUser()
    if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
    if (!['ADMIN', 'GESTOR_GERAL'].includes(user.role)) {
      return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
    }
    await prisma.projeto.delete({ where: { id: params.id } })
    return NextResponse.json({ success: true })
  } catch (error) {
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}
