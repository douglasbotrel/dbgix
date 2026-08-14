import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getCurrentUser } from '@/lib/auth'

export async function GET() {
  try {
    const userPayload = await getCurrentUser()
    if (!userPayload) {
      return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
    }

    const usuario = await prisma.usuario.findUnique({
      where: { id: userPayload.id },
      select: {
        id: true,
        nome: true,
        email: true,
        cargo: true,
        role: true,
        departamento: true,
        modulosAcesso: true,
        avatar: true,
        ativo: true,
        criadoEm: true,
      },
    })

    if (!usuario || !usuario.ativo) {
      return NextResponse.json({ error: 'Usuário não encontrado' }, { status: 404 })
    }

    return NextResponse.json({ usuario })
  } catch (error) {
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}
