import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'
import { format, formatDistanceToNow, isAfter, isBefore } from 'date-fns'
import { ptBR } from 'date-fns/locale'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// Campos de "só data" (prazo, dataConclusao, dataPrazo, dataCampo, etc.) vêm
// de um <input type="date"> — sem fuso horário — e são gravados como meia-
// -noite UTC exata (new Date("2026-08-25") = 2026-08-25T00:00:00.000Z).
// Se isso for formatado usando o fuso LOCAL do navegador (o que o date-fns
// faz por padrão), num fuso atrás de UTC (ex: Brasil, UTC-3) a meia-noite UTC
// vira 21h do dia anterior — a data exibida "anda" um dia pra trás.
// Detecta esse caso (hora exata 00:00:00.000 UTC — na prática só acontece
// em campo de data pura, nunca num timestamp real como criadoEm) e
// compensa o deslocamento do fuso antes de formatar, pra sempre mostrar o
// dia certo, em qualquer fuso horário de quem está vendo.
function ajustarSeDataPura(d: Date): Date {
  const ehDataPura =
    d.getUTCHours() === 0 && d.getUTCMinutes() === 0 &&
    d.getUTCSeconds() === 0 && d.getUTCMilliseconds() === 0
  if (!ehDataPura) return d
  return new Date(d.getTime() + d.getTimezoneOffset() * 60000)
}

export function formatDate(date: Date | string | null): string {
  if (!date) return '-'
  return format(ajustarSeDataPura(new Date(date)), 'dd/MM/yyyy', { locale: ptBR })
}

export function formatDateTime(date: Date | string | null): string {
  if (!date) return '-'
  return format(ajustarSeDataPura(new Date(date)), 'dd/MM/yyyy HH:mm', { locale: ptBR })
}

export function formatRelativeDate(date: Date | string | null): string {
  if (!date) return '-'
  return formatDistanceToNow(new Date(date), { locale: ptBR, addSuffix: true })
}

export function formatCurrency(value: number | null | undefined): string {
  if (value === null || value === undefined) return 'R$ 0,00'
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(value)
}

export function formatCPFCNPJ(value: string): string {
  const clean = value.replace(/\D/g, '')
  if (clean.length === 11) {
    return clean.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4')
  } else if (clean.length === 14) {
    return clean.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5')
  }
  return value
}

export function truncate(str: string, maxLength: number): string {
  if (str.length <= maxLength) return str
  return str.slice(0, maxLength) + '...'
}

export function isExpired(date: Date | string | null): boolean {
  if (!date) return false
  return isBefore(new Date(date), new Date())
}

export function isExpiringSoon(date: Date | string | null, days = 7): boolean {
  if (!date) return false
  const target = new Date(date)
  const now = new Date()
  const future = new Date(now.getTime() + days * 24 * 60 * 60 * 1000)
  return isAfter(target, now) && isBefore(target, future)
}

export const STATUS_OPERACIONAL_LABELS: Record<string, string> = {
  NAO_INICIADO: 'Não Iniciado',
  EM_ANDAMENTO: 'Em Andamento',
  EM_CAMPO: 'Em Campo',
  AGUARDANDO_INFO: 'Aguardando Info',
  EM_REVISAO: 'Em Revisão',
  CONCLUIDO: 'Concluído',
  CANCELADO: 'Cancelado',
}

export const STATUS_TAREFA_LABELS: Record<string, string> = {
  PENDENTE: 'Pendente',
  EM_ANDAMENTO: 'Em Andamento',
  CONCLUIDA: 'Concluída',
  ATRASADA: 'Atrasada',
  CANCELADA: 'Cancelada',
  AGUARDANDO: 'Aguardando',
}

export const STATUS_COLORS: Record<string, string> = {
  // Operacional
  NAO_INICIADO: 'bg-gray-100 text-gray-800',
  EM_ANDAMENTO: 'bg-blue-100 text-blue-800',
  EM_CAMPO: 'bg-indigo-100 text-indigo-800',
  AGUARDANDO_INFO: 'bg-yellow-100 text-yellow-800',
  EM_REVISAO: 'bg-purple-100 text-purple-800',
  CONCLUIDO: 'bg-green-100 text-green-800',
  CANCELADO: 'bg-red-100 text-red-800',
  // Tarefas
  PENDENTE: 'bg-gray-100 text-gray-800',
  CONCLUIDA: 'bg-green-100 text-green-800',
  ATRASADA: 'bg-red-100 text-red-800',
  AGUARDANDO: 'bg-yellow-100 text-yellow-800',
}

export const ROLE_LABELS: Record<string, string> = {
  ADMIN: 'Administrador',
  GESTOR_GERAL: 'Gestor Geral',
  GESTOR_ADMINISTRATIVO: 'Gestor Administrativo',
  GESTOR_OPERACIONAL: 'Gestor Operacional',
  GESTOR_CAMPO: 'Gestor de Campo',
  SUPERVISOR: 'Supervisor',
  ANALISTA: 'Analista',
  ANALISTA_RAPIDO: 'Analista de Serviço Rápido',
  TECNICO_CAMPO: 'Técnico de Campo',
}

export const ETAPA_LABELS: Record<string, string> = {
  OPERACIONAL:  'Operacional',
  EM_EXECUCAO:  'Em Execução',
  CONCLUIDO:    'Concluído',
  CANCELADO:    'Cancelado',
}

// Módulos padrão por perfil — usados quando o usuário não tem modulosAcesso definido individualmente
// null = acesso irrestrito; array = lista exata de módulos permitidos
export const MODULOS_POR_ROLE: Record<string, string[] | null> = {
  ADMIN:                  null,
  GESTOR_GERAL:           null,
  GESTOR_ADMINISTRATIVO:  ['dashboard', 'tarefas-semana', 'operacional', 'bi', 'gestao-pessoas', 'configuracoes'],
  GESTOR_OPERACIONAL:     ['dashboard', 'tarefas-semana', 'operacional', 'bi', 'gestao-pessoas'],
  GESTOR_CAMPO:           ['dashboard', 'tarefas-semana', 'operacional'],
  SUPERVISOR:             ['dashboard', 'tarefas-semana', 'operacional', 'gestao-pessoas'],
  ANALISTA:               ['dashboard', 'tarefas-semana', 'operacional'],
  ANALISTA_RAPIDO:        ['dashboard', 'tarefas-semana', 'operacional'],
  TECNICO_CAMPO:          ['dashboard', 'tarefas-semana', 'operacional'],
}

export const DEPARTAMENTO_LABELS: Record<string, string> = {
  GESTAO_GERAL: 'Gestão Geral',
  OPERACIONAL_AMBIENTAL: 'Operacional Ambiental',
  OPERACIONAL_REGULARIZACAO: 'Operacional Regularização',
  BI: 'BI',
}

// Calcula a lista de módulos que um usuário pode acessar.
// null = acesso irrestrito (ADMIN/GESTOR_GERAL); array = lista exata de módulos permitidos.
// Usado tanto no cliente (Sidebar/layout) quanto no servidor (rotas de API) —
// é a ÚNICA fonte de verdade para essa regra, para não haver duas lógicas divergentes.
export function getModulosPermitidos(role: string, modulosAcesso?: string | null): string[] | null {
  if (['ADMIN', 'GESTOR_GERAL'].includes(role)) return null
  if (modulosAcesso) {
    try {
      const parsed = JSON.parse(modulosAcesso)
      if (Array.isArray(parsed)) return parsed
    } catch {
      // modulosAcesso inválido/corrompido — cai para o padrão do perfil
    }
  }
  return MODULOS_POR_ROLE[role] ?? ['dashboard']
}

// Perfis que só devem enxergar/gerenciar o que é seu (projetos e tarefas onde
// são o responsável) — usado nas rotas de API para restringir consultas e escritas.
export const ROLES_RESTRITOS_AO_PROPRIO = ['ANALISTA', 'ANALISTA_RAPIDO', 'TECNICO_CAMPO']
