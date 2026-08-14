'use client'

import { useState, useEffect } from 'react'
import { Sidebar } from '@/components/layout/Sidebar'
import { Header } from '@/components/layout/Header'
import { cn, MODULOS_POR_ROLE } from '@/lib/utils'

interface Usuario {
  id: string
  nome: string
  email: string
  role: string
  departamento: string
  cargo?: string | null
  modulosAcesso?: string | null
}

export function DashboardShell({
  usuario,
  children,
}: {
  usuario: Usuario
  children: React.ReactNode
}) {
  // Parse módulos: ADMIN/GESTOR_GERAL veem tudo; demais usam modulosAcesso individual
  // ou os padrões definidos em MODULOS_POR_ROLE; fallback = só dashboard
  const modulosPermitidos: string[] | null =
    ['ADMIN', 'GESTOR_GERAL'].includes(usuario.role)
      ? null  // null = sem restrição
      : usuario.modulosAcesso
        ? JSON.parse(usuario.modulosAcesso)
        : MODULOS_POR_ROLE[usuario.role] ?? ['dashboard']
  const [collapsed, setCollapsed] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)

  useEffect(() => {
    const savedCollapsed = localStorage.getItem('sidebar_collapsed')
    if (savedCollapsed) setCollapsed(JSON.parse(savedCollapsed))
  }, [])

  function handleToggleSidebar() {
    const newValue = !collapsed
    setCollapsed(newValue)
    localStorage.setItem('sidebar_collapsed', JSON.stringify(newValue))
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Sidebar
        collapsed={collapsed}
        onToggle={handleToggleSidebar}
        mobileOpen={mobileOpen}
        onMobileClose={() => setMobileOpen(false)}
        modulosPermitidos={modulosPermitidos}
      />
      <div className={cn(
        'flex flex-col min-h-screen transition-all duration-300',
        collapsed ? 'lg:pl-16' : 'lg:pl-64'
      )}>
        <Header
          onMobileMenuOpen={() => setMobileOpen(true)}
          usuario={usuario}
        />
        <main className="flex-1 p-4 md:p-6">
          {children}
        </main>
      </div>
    </div>
  )
}
