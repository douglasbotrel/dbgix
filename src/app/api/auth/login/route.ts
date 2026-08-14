import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { comparePassword, signToken } from '@/lib/auth'

// ── Rate Limiting em memória ─────────────────────────────────────
// Limita tentativas de login por IP: 10 tentativas em 15 minutos.
// O estado persiste enquanto o servidor Node.js estiver rodando.
const loginAttempts = new Map<string, { count: number; resetAt: number }>()
const MAX_ATTEMPTS = 10
const WINDOW_MS   = 15 * 60 * 1000 // 15 minutos

function getClientIP(request: NextRequest): string {
  return (
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    request.headers.get('x-real-ip') ||
    'unknown'
  )
}

function checkRateLimit(ip: string): { ok: boolean; remaining?: number; retryAfter?: number } {
  const now = Date.now()
  const entry = loginAttempts.get(ip)

  if (!entry || entry.resetAt <= now) {
    loginAttempts.set(ip, { count: 1, resetAt: now + WINDOW_MS })
    return { ok: true, remaining: MAX_ATTEMPTS - 1 }
  }

  if (entry.count >= MAX_ATTEMPTS) {
    return { ok: false, retryAfter: Math.ceil((entry.resetAt - now) / 1000) }
  }

  entry.count++
  return { ok: true, remaining: MAX_ATTEMPTS - entry.count }
}

function clearRateLimit(ip: string) {
  loginAttempts.delete(ip)
}
// ────────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  try {
    const ip = getClientIP(request)

    // Verifica rate limit antes de qualquer coisa
    const rateCheck = checkRateLimit(ip)
    if (!rateCheck.ok) {
      return NextResponse.json(
        { error: `Muitas tentativas de login. Tente novamente em ${Math.ceil((rateCheck.retryAfter || 60) / 60)} minutos.` },
        {
          status: 429,
          headers: { 'Retry-After': String(rateCheck.retryAfter) },
        }
      )
    }

    const body = await request.json()
    const { email, senha } = body

    if (!email || !senha) {
      return NextResponse.json(
        { error: 'Email e senha são obrigatórios' },
        { status: 400 }
      )
    }

    const usuario = await prisma.usuario.findUnique({
      where: { email: email.toLowerCase().trim() },
    })

    // Usuário não encontrado ou inativo — mesma mensagem para não revelar se o email existe
    if (!usuario || !usuario.ativo) {
      await prisma.log.create({
        data: {
          acao: 'LOGIN_FALHOU',
          entidade: 'Usuario',
          detalhes: `Tentativa com email inexistente ou inativo: ${email} | IP: ${ip}`,
          ip,
        },
      }).catch(() => {})
      return NextResponse.json({ error: 'Credenciais inválidas' }, { status: 401 })
    }

    const senhaValida = await comparePassword(senha, usuario.senha)
    if (!senhaValida) {
      // Log de tentativa com senha errada (sem revelar o motivo ao cliente)
      await prisma.log.create({
        data: {
          usuarioId: usuario.id,
          acao: 'LOGIN_FALHOU',
          entidade: 'Usuario',
          entidadeId: usuario.id,
          detalhes: `Senha incorreta | IP: ${ip} | Tentativa ${(loginAttempts.get(ip)?.count ?? 1)}/${MAX_ATTEMPTS}`,
          ip,
        },
      }).catch(() => {})
      return NextResponse.json({ error: 'Credenciais inválidas' }, { status: 401 })
    }

    // Login bem-sucedido — zera o rate limit para esse IP
    clearRateLimit(ip)

    const token = signToken({
      id: usuario.id,
      email: usuario.email,
      nome: usuario.nome,
      role: usuario.role,
      departamento: usuario.departamento,
    })

    await prisma.log.create({
      data: {
        usuarioId: usuario.id,
        acao: 'LOGIN',
        entidade: 'Usuario',
        entidadeId: usuario.id,
        detalhes: `Login realizado com sucesso | IP: ${ip}`,
        ip,
      },
    })

    const response = NextResponse.json({
      success: true,
      usuario: {
        id: usuario.id,
        nome: usuario.nome,
        email: usuario.email,
        role: usuario.role,
        departamento: usuario.departamento,
        cargo: usuario.cargo,
      },
    })

    response.cookies.set('dbgix_token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 60 * 60 * 24 * 7,
      path: '/',
    })

    return response
  } catch (error) {
    console.error('Erro no login:', error)
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 })
  }
}
