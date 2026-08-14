import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getCurrentUser } from '@/lib/auth'

// GET /api/tipos-servico — lista o catálogo de serviços (usado para montar
// o formulário de Novo Projeto e gerar as tarefas padrão automaticamente).
export async function GET() {
  try {
    const user = await getCurrentUser()
    if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

    const tiposServico = await prisma.tipoServico.findMany({
      where: { ativo: true },
      orderBy: { ordem: 'asc' },
      select: { id: true, nome: true, categoria: true, descricao: true },
    })

    return NextResponse.json({ tiposServico })
  } catch (error) {
    console.error('Erro ao buscar tipos de serviço:', error)
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}
