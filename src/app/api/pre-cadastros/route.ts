import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getCurrentUser, hasPermission, NIVEL_CADASTRO_BASE } from '@/lib/auth'

// dbgix não possui mais Comercial/Contratos/Financeiro, então este endpoint
// hoje só administra o catálogo de Tipos de Serviço (TipoServico).
export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser()
    if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

    const { searchParams } = new URL(request.url)
    const tipo = searchParams.get('tipo') || 'servicos'

    if (tipo === 'servicos') {
      const servicos = await prisma.tipoServico.findMany({
        where: { ativo: true },
        orderBy: { ordem: 'asc' }
      })
      return NextResponse.json({ servicos })
    }

    // Para a tela de configurações — retorna todos, inclusive inativos
    if (tipo === 'servicos_todos') {
      const servicos = await prisma.tipoServico.findMany({
        orderBy: { ordem: 'asc' }
      })
      return NextResponse.json({ servicos })
    }

    return NextResponse.json({ error: 'Tipo inválido' }, { status: 400 })
  } catch (error) {
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser()
    if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
    if (!hasPermission(user.role, NIVEL_CADASTRO_BASE)) {
      return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
    }

    const body = await request.json()
    const { tipo, ...data } = body

    if (tipo === 'servico') {
      const count = await prisma.tipoServico.count()
      const servico = await prisma.tipoServico.create({
        data: { ...data, ordem: data.ordem || count + 1 }
      })
      return NextResponse.json({ servico }, { status: 201 })
    }

    return NextResponse.json({ error: 'Tipo inválido' }, { status: 400 })
  } catch (error) {
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const user = await getCurrentUser()
    if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
    if (!hasPermission(user.role, NIVEL_CADASTRO_BASE)) {
      return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
    }

    const body = await request.json()
    const { tipo, id, ...data } = body

    if (!id) return NextResponse.json({ error: 'ID obrigatório' }, { status: 400 })

    if (tipo === 'servico') {
      const servico = await prisma.tipoServico.update({ where: { id }, data })
      return NextResponse.json({ servico })
    }

    return NextResponse.json({ error: 'Tipo inválido' }, { status: 400 })
  } catch (error) {
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const user = await getCurrentUser()
    if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
    if (!hasPermission(user.role, NIVEL_CADASTRO_BASE)) {
      return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
    }

    const { searchParams } = new URL(request.url)
    const tipo = searchParams.get('tipo')
    const id   = searchParams.get('id')

    if (!tipo || !id) return NextResponse.json({ error: 'tipo e id obrigatórios' }, { status: 400 })

    if (tipo === 'servico') {
      const servico = await prisma.tipoServico.findUnique({ where: { id }, select: { nome: true } })
      if (!servico) return NextResponse.json({ error: 'Serviço não encontrado' }, { status: 404 })

      await prisma.tipoServico.delete({ where: { id } })
      return NextResponse.json({ ok: true })
    }

    return NextResponse.json({ error: 'Tipo inválido' }, { status: 400 })
  } catch (error: any) {
    if (error?.code === 'P2003') {
      return NextResponse.json(
        { error: 'Este serviço possui dados vinculados e não pode ser excluído. Desative-o em vez disso.' },
        { status: 409 }
      )
    }
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}
