import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getCurrentUser, hasPermission, hashPassword, NIVEL_CADASTRO_BASE } from '@/lib/auth'

function validarSenha(senha: string): string | null {
  if (senha.length < 8)     return 'A senha deve ter pelo menos 8 caracteres'
  if (!/[A-Z]/.test(senha)) return 'A senha deve conter pelo menos uma letra maiúscula'
  if (!/[0-9]/.test(senha)) return 'A senha deve conter pelo menos um número'
  return null
}

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await getCurrentUser()
    if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
    if (!hasPermission(user.role, NIVEL_CADASTRO_BASE)) {
      return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
    }

    const usuario = await prisma.usuario.findUnique({
      where: { id: params.id },
      select: {
        id: true, nome: true, email: true, cargo: true, telefone: true,
        role: true, departamento: true, modulosAcesso: true, ativo: true, criadoEm: true,
      },
    })
    if (!usuario) return NextResponse.json({ error: 'Usuário não encontrado' }, { status: 404 })
    return NextResponse.json({ usuario })
  } catch {
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await getCurrentUser()
    if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
    if (!hasPermission(user.role, NIVEL_CADASTRO_BASE)) {
      return NextResponse.json({ error: 'Sem permissão para editar usuários' }, { status: 403 })
    }

    // Admin não pode desativar a si mesmo
    if (params.id === user.id && request.method === 'PATCH') {
      const body = await request.json()
      if (body.ativo === false) {
        return NextResponse.json({ error: 'Você não pode desativar sua própria conta' }, { status: 400 })
      }

      // Atualiza campos permitidos
      const data: any = {}
      if (body.nome       !== undefined) data.nome = body.nome.trim()
      if (body.cargo      !== undefined) data.cargo = body.cargo
      if (body.telefone   !== undefined) data.telefone = body.telefone
      if (body.role       !== undefined) data.role = body.role
      if (body.departamento !== undefined) data.departamento = body.departamento
      if (body.modulosAcesso !== undefined) data.modulosAcesso = body.modulosAcesso
      if (body.ativo      !== undefined) data.ativo = body.ativo

      // Se trocar senha, valida complexidade
      if (body.senha) {
        const erroSenha = validarSenha(body.senha)
        if (erroSenha) return NextResponse.json({ error: erroSenha }, { status: 400 })
        data.senha = await hashPassword(body.senha)
      }

      const usuario = await prisma.usuario.update({
        where: { id: params.id },
        data,
        select: {
          id: true, nome: true, email: true, cargo: true,
          role: true, departamento: true, modulosAcesso: true, ativo: true,
        },
      })

      await prisma.log.create({
        data: {
          usuarioId: user.id,
          acao: 'EDITAR_USUARIO',
          entidade: 'Usuario',
          entidadeId: params.id,
          detalhes: JSON.stringify({ campos: Object.keys(data) }),
        },
      })

      return NextResponse.json({ usuario })
    }

    // Leitura do body para outros casos (quando não é auto-edição)
    const body = await request.json()

    const data: any = {}
    if (body.nome         !== undefined) data.nome = body.nome.trim()
    if (body.cargo        !== undefined) data.cargo = body.cargo
    if (body.telefone     !== undefined) data.telefone = body.telefone
    if (body.role         !== undefined) data.role = body.role
    if (body.departamento !== undefined) data.departamento = body.departamento
    if (body.modulosAcesso !== undefined) data.modulosAcesso = body.modulosAcesso
    if (body.ativo        !== undefined) data.ativo = body.ativo

    if (body.senha) {
      const erroSenha = validarSenha(body.senha)
      if (erroSenha) return NextResponse.json({ error: erroSenha }, { status: 400 })
      data.senha = await hashPassword(body.senha)
    }

    const usuario = await prisma.usuario.update({
      where: { id: params.id },
      data,
      select: {
        id: true, nome: true, email: true, cargo: true,
        role: true, departamento: true, modulosAcesso: true, ativo: true,
      },
    })

    await prisma.log.create({
      data: {
        usuarioId: user.id,
        acao: 'EDITAR_USUARIO',
        entidade: 'Usuario',
        entidadeId: params.id,
        detalhes: JSON.stringify({ campos: Object.keys(data) }),
      },
    })

    return NextResponse.json({ usuario })
  } catch (error) {
    console.error('Erro ao editar usuário:', error)
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await getCurrentUser()
    if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
    if (user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Apenas administradores podem excluir usuários' }, { status: 403 })
    }
    if (params.id === user.id) {
      return NextResponse.json({ error: 'Você não pode excluir sua própria conta' }, { status: 400 })
    }

    // Soft delete: desativa ao invés de apagar (preserva histórico)
    await prisma.usuario.update({
      where: { id: params.id },
      data: { ativo: false },
    })

    await prisma.log.create({
      data: {
        usuarioId: user.id,
        acao: 'DESATIVAR_USUARIO',
        entidade: 'Usuario',
        entidadeId: params.id,
      },
    })

    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}
