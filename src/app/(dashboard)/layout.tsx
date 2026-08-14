'use client'

import { useState, useEffect } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { Sidebar } from '@/components/layout/Sidebar'
import { Header } from '@/components/layout/Header'
import { cn, getModulosPermitidos } from '@/lib/utils'

interface Usuario {
  id: string
  nome: string
  email: string
  role: string
  departamento: string
  cargo?: string | null
  modulosAcesso?: string | null
}

// Mapeia o prefixo da rota para o id do módulo (mesmos ids usados em
// MODULOS_POR_ROLE / modulosAcesso e no Sidebar). Usado para bloquear o acesso
// direto por URL a um módulo que o usuário não tem permissão de ver —
// o Sidebar sozinho só esconde o link, não impede a navegação direta.
const ROTA_MODULO: { prefix: string; modulo: string }[] = [
  { prefix: '/dashboard', modulo: 'dashboard' },
  { prefix: '/tarefas-semana', modulo: 'tarefas-semana' },
  { prefix: '/operacional', modulo: 'operacional' },
  { prefix: '/bi', modulo: 'bi' },
  { prefix: '/configuracoes', modulo: 'configuracoes' },
]

function moduloDaRota(pathname: string): string | null {
  const encontrado = ROTA_MODULO.find(r => pathname === r.prefix || pathname.startsWith(r.prefix + '/'))
  return encontrado?.modulo ?? null
}

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const router = useRouter()
  const pathname = usePathname()
  const [collapsed, setCollapsed] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [usuario, setUsuario] = useState<Usuario | null>(null)
  const [loading, setLoading] = useState(true)
  const [bloqueado, setBloqueado] = useState(false)

  useEffect(() => {
    async function loadUser() {
      try {
        const res = await fetch('/api/auth/me')
        if (!res.ok) {
          router.push('/login')
          return
        }
        const data = await res.json()
        setUsuario(data.usuario)
      } catch {
        router.push('/login')
      } finally {
        setLoading(false)
      }
    }
    loadUser()

    // Carrega preferência de sidebar
    const savedCollapsed = localStorage.getItem('sidebar_collapsed')
    if (savedCollapsed) setCollapsed(JSON.parse(savedCollapsed))
  }, [router])

  // Bloqueia acesso direto por URL a um módulo fora da permissão do usuário
  // (ex: um perfil restrito a Operacional digitando /configuracoes na barra de
  // endereço). O Sidebar já esconde o link, mas isso sozinho não impede a
  // navegação — este é o guard que efetivamente impede o acesso à página.
  useEffect(() => {
    if (!usuario) return
    const modulosPermitidos = getModulosPermitidos(usuario.role, usuario.modulosAcesso)
    const modulo = moduloDaRota(pathname)
    if (modulo && modulosPermitidos !== null && !modulosPermitidos.includes(modulo)) {
      setBloqueado(true)
      router.replace('/dashboard')
    } else {
      setBloqueado(false)
    }
  }, [usuario, pathname, router])

  function handleToggleSidebar() {
    const newValue = !collapsed
    setCollapsed(newValue)
    localStorage.setItem('sidebar_collapsed', JSON.stringify(newValue))
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-4 border-green-600 border-t-transparent rounded-full animate-spin" />
          <p className="text-gray-500 text-sm">Carregando...</p>
        </div>
      </div>
    )
  }

  if (!usuario) return null

  const modulosPermitidos = getModulosPermitidos(usuario.role, usuario.modulosAcesso)

  return (
    <div className="min-h-screen bg-gray-50">
      <Sidebar
        collapsed={collapsed}
        onToggle={handleToggleSidebar}
        mobileOpen={mobileOpen}
        onMobileClose={() => setMobileOpen(false)}
        modulosPermitidos={modulosPermitidos}
      />

      {/* Main content */}
      <div className={cn(
        'flex flex-col min-h-screen transition-all duration-300',
        collapsed ? 'lg:pl-16' : 'lg:pl-64'
      )}>
        <Header
          onMobileMenuOpen={() => setMobileOpen(true)}
          usuario={usuario}
        />

        <main className="flex-1 p-4 md:p-6">
          {bloqueado ? null : children}
        </main>
      </div>
    </div>
  )
}
