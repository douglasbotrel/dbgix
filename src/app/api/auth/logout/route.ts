import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getCurrentUser } from '@/lib/auth'

export async function POST(request: NextRequest) {
  try {
    // Registra o logout no log de auditoria
    const user = await getCurrentUser()
    if (user) {
      await prisma.log.create({
        data: {
          usuarioId: user.id,
          acao: 'LOGOUT',
          entidade: 'Usuario',
          entidadeId: user.id,
          ip: request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || undefined,
        },
      }).catch(() => {})
    }
  } catch {}

  const response = NextResponse.json({ success: true })
  // Expira o cookie imediatamente com maxAge=0
  response.cookies.set('dbgix_token', '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: 0,
    path: '/',
  })
  return response
}
