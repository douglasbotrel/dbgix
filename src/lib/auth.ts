import jwt from 'jsonwebtoken'
import bcrypt from 'bcryptjs'
import { cookies } from 'next/headers'
import { prisma } from './prisma'
import { getModulosPermitidos } from './utils'

// Acessa JWT_SECRET de forma lazy (só na hora de usar), nunca no carregamento do módulo.
// Isso permite que o Next.js compile as rotas sem precisar do env durante o build.
function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET
  if (!secret) {
    throw new Error('JWT_SECRET não definido nas variáveis de ambiente.')
  }
  return secret
}

const JWT_EXPIRES_IN = () => process.env.JWT_EXPIRES_IN || '7d'

export interface JWTPayload {
  id: string
  email: string
  nome: string
  role: string
  departamento: string
}

export function signToken(payload: JWTPayload): string {
  return jwt.sign(payload, getJwtSecret(), {
    expiresIn: JWT_EXPIRES_IN() as jwt.SignOptions['expiresIn'],
  })
}

export function verifyToken(token: string): JWTPayload | null {
  try {
    return jwt.verify(token, getJwtSecret()) as JWTPayload
  } catch {
    return null
  }
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12)
}

export async function comparePassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash)
}

export async function getCurrentUser(): Promise<JWTPayload | null> {
  try {
    const cookieStore = cookies()
    const token = cookieStore.get('dbgix_token')?.value
    if (!token) return null

    const payload = verifyToken(token)
    if (!payload) return null

    const usuario = await prisma.usuario.findUnique({
      where: { id: payload.id },
      select: { ativo: true },
    })
    if (!usuario || !usuario.ativo) return null

    return payload
  } catch {
    return null
  }
}

export async function requireAuth(): Promise<JWTPayload> {
  const user = await getCurrentUser()
  if (!user) throw new Error('Não autenticado')
  return user
}

// Versão "completa" do usuário atual, incluindo modulosAcesso — necessária para
// checar restrição de módulo (a diferença entre a permissão POR CARGO e a
// personalizada POR USUÁRIO) diretamente nas rotas de API. getCurrentUser() sozinho
// não é suficiente aqui porque o JWT não carrega modulosAcesso.
export async function getCurrentUserFull() {
  const payload = await getCurrentUser()
  if (!payload) return null

  const usuario = await prisma.usuario.findUnique({
    where: { id: payload.id },
    select: { id: true, nome: true, email: true, role: true, departamento: true, modulosAcesso: true, ativo: true },
  })
  if (!usuario || !usuario.ativo) return null

  return usuario
}

// Checa se um usuário (já carregado com role + modulosAcesso) pode acessar um módulo.
// Espelha exatamente a regra usada no Sidebar/layout — ver getModulosPermitidos em lib/utils.
export function podeAcessarModulo(usuario: { role: string; modulosAcesso?: string | null }, modulo: string): boolean {
  const permitidos = getModulosPermitidos(usuario.role, usuario.modulosAcesso)
  return permitidos === null || permitidos.includes(modulo)
}

// Nível mínimo para administrar o Cadastro Base (usuários e tipos de serviço).
// GESTOR_ADMINISTRATIVO é o perfil mais baixo que recebe o módulo "configuracoes"
// por padrão (ver MODULOS_POR_ROLE em lib/utils) — as rotas de escrita precisam
// usar o mesmo piso, senão o perfil vê a tela mas toda ação falha com "sem permissão".
export const NIVEL_CADASTRO_BASE = 'GESTOR_ADMINISTRATIVO'

export const ROLE_HIERARCHY: Record<string, number> = {
  TECNICO_CAMPO: 1,
  ANALISTA_RAPIDO: 2,
  ANALISTA: 2,
  SUPERVISOR: 3,
  GESTOR_CAMPO: 4,
  GESTOR_OPERACIONAL: 5,
  GESTOR_ADMINISTRATIVO: 6,
  GESTOR_GERAL: 7,
  ADMIN: 8,
}

export function hasPermission(userRole: string, requiredRole: string): boolean {
  return (ROLE_HIERARCHY[userRole] || 0) >= (ROLE_HIERARCHY[requiredRole] || 0)
}
