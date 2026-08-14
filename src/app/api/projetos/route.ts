import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getCurrentUser, hasPermission } from '@/lib/auth'
import { ROLES_RESTRITOS_AO_PROPRIO } from '@/lib/utils'

export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser()
    if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

    const { searchParams } = new URL(request.url)
    const etapaPipeline = searchParams.get('etapaPipeline')
    const responsavelId = searchParams.get('responsavelId')
    const search = searchParams.get('search')
    const limit = parseInt(searchParams.get('limit') || '50')
    const page = parseInt(searchParams.get('page') || '1')

    // suporta múltiplas etapas via "etapas=A,B,C"
    const etapasParam = searchParams.get('etapas')

    const where: any = {}
    if (etapaPipeline) where.etapaPipeline = etapaPipeline
    if (etapasParam) where.etapaPipeline = { in: etapasParam.split(',').map(e => e.trim()) }
    if (responsavelId) where.responsavelId = responsavelId
    if (search) {
      where.OR = [
        { codigo: { contains: search } },
        { nome: { contains: search } },
      ]
    }

    // Restrição por role: perfis operacionais individuais só veem os projetos deles
    if (ROLES_RESTRITOS_AO_PROPRIO.includes(user.role)) {
      where.responsavelId = user.id
    }

    const [projetos, total] = await Promise.all([
      prisma.projeto.findMany({
        where,
        include: {
          responsavel: { select: { id: true, nome: true } },
          supervisor: { select: { id: true, nome: true } },
          _count: { select: { tarefas: true, documentos: true } },
        },
        orderBy: { criadoEm: 'desc' },
        take: limit,
        skip: (page - 1) * limit,
      }),
      prisma.projeto.count({ where }),
    ])

    return NextResponse.json({ projetos, total, page, limit })
  } catch (error) {
    console.error('Erro ao buscar projetos:', error)
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}

// POST /api/projetos
// Cria um projeto diretamente em Operacional — só o essencial (nome, responsável,
// prazo). Não existe mais esteira comercial/contrato/financeiro, nem cadastro de
// cliente/imóvel/tipo de serviço.
export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser()
    if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
    // Criar projeto é uma decisão de gestão do trabalho da equipe — perfis
    // operacionais individuais (analista/técnico) não devem abrir projetos novos.
    if (!hasPermission(user.role, 'SUPERVISOR')) {
      return NextResponse.json({ error: 'Sem permissão para criar projetos' }, { status: 403 })
    }

    const body = await request.json()
    const {
      nome, descricao, observacoes,
      responsavelId, supervisorId, dataPrazo,
    } = body

    if (!nome?.trim()) {
      return NextResponse.json({ error: 'Nome do projeto é obrigatório' }, { status: 400 })
    }

    // Código sequencial
    const count = await prisma.projeto.count()
    const codigo = `PRJ-${String(count + 1).padStart(4, '0')}`

    const projeto = await prisma.projeto.create({
      data: {
        codigo,
        nome: nome.trim(),
        descricao: descricao || null,
        observacoes: observacoes || null,
        responsavelId: responsavelId || null,
        supervisorId: supervisorId || null,
        dataPrazo: dataPrazo ? new Date(dataPrazo) : null,
        etapaPipeline: 'OPERACIONAL',
        statusOperacional: 'NAO_INICIADO',
      },
      include: {
        responsavel: { select: { id: true, nome: true, email: true } },
      },
    })

    // Notifica o responsável designado
    if (responsavelId) {
      await prisma.notificacao.create({
        data: {
          usuarioId: responsavelId,
          titulo: 'Novo projeto atribuído',
          mensagem: `Projeto ${codigo} — ${nome} foi atribuído a você.`,
          tipo: 'info',
          link: `/operacional/${projeto.id}`,
        },
      })
    }

    await prisma.log.create({
      data: {
        usuarioId: user.id,
        acao: 'CRIAR_PROJETO',
        entidade: 'Projeto',
        entidadeId: projeto.id,
        detalhes: `Projeto ${codigo} — ${nome} criado diretamente em Operacional`,
      },
    })

    return NextResponse.json({ projeto }, { status: 201 })
  } catch (error) {
    console.error('Erro ao criar projeto:', error)
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}
