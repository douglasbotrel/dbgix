'use client'

import Link from 'next/link'
import Image from 'next/image'
import { usePathname } from 'next/navigation'
import {
  LayoutDashboard, Settings,
  ClipboardList, BarChart3, ChevronLeft, ChevronRight, X, ListChecks
} from 'lucide-react'
import { cn } from '@/lib/utils'

const navItems = [
  {
    href: '/dashboard',
    label: 'Dashboard',
    icon: LayoutDashboard,
    modulo: 'dashboard',
  },
  {
    href: '/tarefas-semana',
    label: 'Tarefas da Semana',
    icon: ListChecks,
    modulo: 'tarefas-semana',
  },
  {
    href: '/operacional',
    label: 'Operacional',
    icon: ClipboardList,
    modulo: 'operacional',
  },
  {
    href: '/bi',
    label: 'BI / Relatórios',
    icon: BarChart3,
    modulo: 'bi',
  },
]

const configItems = [
  {
    href: '/configuracoes',
    label: 'Cadastro Base',
    icon: Settings,
    modulo: 'configuracoes',
  },
]

interface SidebarProps {
  collapsed: boolean
  onToggle: () => void
  mobileOpen?: boolean
  onMobileClose?: () => void
  modulosPermitidos?: string[] | null  // null = sem restrição (admin)
}

export function Sidebar({ collapsed, onToggle, mobileOpen, onMobileClose, modulosPermitidos }: SidebarProps) {
  const pathname = usePathname()

  // null = sem restrição; array vazio ou preenchido = filtrar
  function podeVer(modulo: string) {
    if (modulosPermitidos === null || modulosPermitidos === undefined) return true
    return modulosPermitidos.includes(modulo)
  }

  return (
    <>
      {/* Overlay mobile */}
      {mobileOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={onMobileClose}
        />
      )}

      <aside
        className={cn(
          'fixed left-0 top-0 h-full bg-white border-r border-gray-100 shadow-sm z-50 flex flex-col transition-all duration-300 ease-in-out',
          collapsed ? 'w-16' : 'w-64',
          'lg:translate-x-0',
          mobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        )}
      >
        {/* Logo */}
        <div className={cn(
          'flex items-center border-b border-gray-100 bg-blue-50 flex-shrink-0',
          collapsed ? 'justify-center p-3' : 'px-4 py-3 gap-3'
        )}>
          {collapsed ? (
            <div className="w-9 h-9 flex items-center justify-center flex-shrink-0">
              <Image
                src="/logo.png"
                alt="dbgix"
                width={36}
                height={36}
                className="object-contain"
              />
            </div>
          ) : (
            <>
              <div className="w-9 h-9 flex items-center justify-center flex-shrink-0">
                <Image
                  src="/logo.png"
                  alt="dbgix"
                  width={36}
                  height={36}
                  className="object-contain"
                />
              </div>
              <div>
                <h1 className="font-bold text-gray-900 text-lg leading-none">dbgix</h1>
                <p className="text-xs text-gray-400 leading-none mt-0.5">Gestão Operacional</p>
              </div>
            </>
          )}

          {/* Close button mobile */}
          {mobileOpen && !collapsed && (
            <button
              onClick={onMobileClose}
              className="ml-auto lg:hidden text-gray-400 hover:text-gray-600"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto py-4 px-2 space-y-1">
          {navItems.filter(item => podeVer(item.modulo)).map((item) => {
            const Icon = item.icon
            const isActive = pathname === item.href || pathname.startsWith(item.href + '/')

            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={onMobileClose}
                className={cn(
                  'flex items-center rounded-xl transition-all duration-150 group relative',
                  collapsed ? 'justify-center p-2.5' : 'gap-3 px-3 py-2.5',
                  isActive
                    ? 'bg-green-50 text-green-700'
                    : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                )}
                title={collapsed ? item.label : undefined}
              >
                <Icon className={cn(
                  'w-5 h-5 flex-shrink-0',
                  isActive ? 'text-green-600' : 'text-gray-400 group-hover:text-gray-600'
                )} />
                {!collapsed && (
                  <span className="font-medium text-sm">{item.label}</span>
                )}
                {isActive && !collapsed && (
                  <div className="ml-auto w-1.5 h-1.5 rounded-full bg-green-600" />
                )}

                {/* Tooltip quando collapsed */}
                {collapsed && (
                  <div className="absolute left-full ml-2 px-2 py-1 bg-gray-900 text-white text-xs rounded-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-50">
                    {item.label}
                  </div>
                )}
              </Link>
            )
          })}
        </nav>

        {/* Config items */}
        <div className="px-2 py-3 border-t border-gray-100 space-y-1">
          {configItems.filter(item => podeVer(item.modulo)).map((item) => {
            const Icon = item.icon
            const isActive = pathname === item.href || pathname.startsWith(item.href + '/')
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={onMobileClose}
                className={cn(
                  'flex items-center rounded-xl transition-all duration-150 group relative',
                  collapsed ? 'justify-center p-2.5' : 'gap-3 px-3 py-2.5',
                  isActive
                    ? 'bg-green-50 text-green-700'
                    : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                )}
                title={collapsed ? item.label : undefined}
              >
                <Icon className={cn(
                  'w-5 h-5 flex-shrink-0',
                  isActive ? 'text-green-600' : 'text-gray-400 group-hover:text-gray-600'
                )} />
                {!collapsed && <span className="font-medium text-sm">{item.label}</span>}
              </Link>
            )
          })}
        </div>

        {/* Toggle button */}
        <button
          onClick={onToggle}
          className="hidden lg:flex items-center justify-center w-full py-3 border-t border-gray-100 text-gray-400 hover:text-gray-600 hover:bg-gray-50 transition-colors"
        >
          {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
        </button>
      </aside>
    </>
  )
}
