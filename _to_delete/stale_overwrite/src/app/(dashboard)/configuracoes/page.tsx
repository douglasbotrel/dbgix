'use client'

import React, { useState, useEffect } from 'react'
import { toast } from 'sonner'
import { Plus, X, Loader2, Check, ChevronDown, ChevronUp, Trash2, Edit2, ToggleLeft, ToggleRight } from 'lucide-react'
import { ROLE_LABELS, DEPARTAMENTO_LABELS, MODULOS_POR_ROLE } from '@/lib/utils'

const MODULOS = [
  { id: 'dashboard',      label: '📊 Dashboard' },
  { id: 'tarefas-semana', label: '🗓️ Tarefas da Semana' },
  { id: 'operacional',    label: '⚙️ Operacional' },
  { id: 'bi',             label: '📈 BI / Relatórios' },
  { id: 'configuracoes',  label: '🔧 Configurações' },
]

const ORG_HIERARQUIA = [
  {
    role: 'ADMIN', cor: 'bg-purple-100 text-purple-800 border-purple-200',
    sub: [
      {
        role: 'GESTOR_GERAL', cor: 'bg-blue-100 text-blue-800 border-blue-200',
        sub: [
          { role: 'GESTOR_ADMINISTRATIVO', cor: 'bg-indigo-100 text-indigo-800 border-indigo-200', sub: [] },
          {
            role: 'GESTOR_OPERACIONAL', cor: 'bg-cyan-100 text-cyan-800 border-cyan-200',
            sub: [
              {
                role: 'SUPERVISOR', cor: 'bg-teal-100 text-teal-800 border-teal-200',
                sub: [
                  { role: 'ANALISTA', cor: 'bg-green-100 text-green-800 border-green-200', sub: [] },
                  { role: 'ANALISTA_RAPIDO', cor: 'bg-lime-100 text-lime-800 border-lime-200', sub: [] },
                ],
              },
            ],
          },
          {
            role: 'GESTOR_CAMPO', cor: 'bg-orange-100 text-orange-800 border-orange-200',
            sub: [
              { role: 'TECNICO_CAMPO', cor: 'bg-amber-100 text-amber-800 border-amber-200', sub: [] },
            ],
          },
        ],
      },
    ],
  },
]

const TIPOS_USUARIO_DESC: Record<string, string> = {
  ADMIN:                'Acesso total ao sistema, incluindo configurações e gerenciamento de usuários.',
  GESTOR_GERAL:         'Visão completa do pipeline, relatórios e indicadores de toda a empresa.',
  GESTOR_ADMINISTRATIVO:'Gestão administrativa e aprovações de processos internos.',
  GESTOR_OPERACIONAL:   'Supervisão de projetos operacionais, equipes e prazos.',
  GESTOR_CAMPO:         'Coordenação de vistorias, frota e trabalho de campo.',
  SUPERVISOR:           'Supervisão de analistas e aprovação de etapas operacionais.',
  ANALISTA:             'Execução de tarefas, vistorias e projetos operacionais.',
  ANALISTA_RAPIDO:      'Análise técnica rápida de novas solicitações de serviço.',
  TECNICO_CAMPO:        'Realização de vistorias e coleta de dados técnicos em campo.',
}

type Aba = 'usuarios' | 'hierarquia' | 'servicos'

export default function ConfiguracoesPage() {
  const [aba, setAba] = useState<Aba>('usuarios')
  const [currentUser, setCurrentUser] = useState<any>(null)
  const [usuarios, setUsuarios]   = useState<any[]>([])
  const [servicos, setServicos]   = useState<any[]>([])
  const [loading, setLoading]     = useState(true)
  const [modalUsuario, setModalUsuario] = useState(false)
  const [novoServico, setNovoServico]   = useState(false)
  const [novaServNome, setNovaServNome] = useState('')
  const [novaServCateg, setNovaServCateg] = useState('')
  const [salvando, setSalvando]   = useState(false)

  // Tarefas padrão por serviço
  const [servicoExpandido, setServicoExpandido] = useState<string | null>(null)
  const [tarefasEdicao, setTarefasEdicao] = useState<{ titulo: string; etapa: string; ordem: number }[]>([])
  const [salvandoTarefas, setSalvandoTarefas] = useState(false)

  // Edição de serviço
  const [servicoEditando, setServicoEditando] = useState<any | null>(null)
  const [formServico, setFormServico] = useState({ nome: '', categoria: '' })

  // Confirmação de exclusão
  const [confirmandoExclusao, setConfirmandoExclusao] = useState<string | null>(null)
  const [confirmandoExclusaoUsuario, setConfirmandoExclusaoUsuario] = useState<string | null>(null)
  const [excluindoUsuario, setExcluindoUsuario] = useState<string | null>(null)

  // Form novo usuário
  const [formUser, setFormUser] = useState({
    nome: '', email: '', senha: '', cargo: '', telefone: '',
    role: 'ANALISTA', departamento: 'OPERACIONAL_AMBIENTAL',
    modulosAcesso: ['dashboard', 'operacional'] as string[],
  })

  // Matriz de permissões por perfil
  const [matrizEdit, setMatrizEdit] = useState<Record<string, string[]>>(() => {
    const base: Record<string, string[]> = {}
    Object.keys(ROLE_LABELS).forEach(role => {
      const mods = MODULOS_POR_ROLE[role]
      base[role] = mods === null ? MODULOS.map(m => m.id) : [...(mods ?? [])]
    })
    return base
  })
  const [aplicandoPerfil, setAplicandoPerfil] = useState<string | null>(null)

  // Edição de usuário existente
  const [usuarioEditando, setUsuarioEditando] = useState<any | null>(null)
  const [formEdit, setFormEdit] = useState({
    nome: '', cargo: '', telefone: '',
    role: 'ANALISTA', departamento: 'OPERACIONAL_AMBIENTAL',
    modulosAcesso: [] as string[],
    ativo: true,
    novaSenha: '',
  })

  function abrirEdicao(u: any) {
    setFormEdit({
      nome: u.nome || '',
      cargo: u.cargo || '',
      telefone: u.telefone || '',
      role: u.role || 'ANALISTA',
      departamento: u.departamento || 'OPERACIONAL_AMBIENTAL',
      modulosAcesso: u.modulosAcesso ? JSON.parse(u.modulosAcesso) : [],
      ativo: u.ativo,
      novaSenha: '',
    })
    setUsuarioEditando(u)
  }

  function toggleMatrizModulo(role: string, moduloId: string) {
    setMatrizEdit(prev => ({
      ...prev,
      [role]: prev[role]?.includes(moduloId)
        ? prev[role].filter(m => m !== moduloId)
        : [...(prev[role] ?? []), moduloId],
    }))
  }

  async function aplicarAoPerfil(role: string) {
    if (['ADMIN', 'GESTOR_GERAL'].includes(role)) return
    setAplicandoPerfil(role)
    try {
      const res = await fetch('/api/usuarios')
      if (!res.ok) throw new Error()
      const { usuarios: lista } = await res.json()
      const doPerfil = lista.filter((u: any) => u.role === role)
      await Promise.all(doPerfil.map((u: any) =>
        fetch(`/api/usuarios/${u.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ modulosAcesso: JSON.stringify(matrizEdit[role] ?? []) }),
        })
      ))
      toast.success(`Módulos aplicados a ${doPerfil.length} usuário(s) do perfil "${ROLE_LABELS[role]}"`)
    } catch {
      toast.error('Erro ao aplicar permissões')
    } finally {
      setAplicandoPerfil(null)
    }
  }

  function toggleModuloEdit(id: string) {
    setFormEdit(p => ({
      ...p,
      modulosAcesso: p.modulosAcesso.includes(id)
        ? p.modulosAcesso.filter(m => m !== id)
        : [...p.modulosAcesso, id],
    }))
  }

  async function salvarEdicao() {
    if (!usuarioEditando) return
    setSalvando(true)
    try {
      const body: any = {
        nome: formEdit.nome,
        cargo: formEdit.cargo,
        telefone: formEdit.telefone,
        role: formEdit.role,
        departamento: formEdit.departamento,
        modulosAcesso: JSON.stringify(formEdit.modulosAcesso),
        ativo: formEdit.ativo,
      }
      if (formEdit.novaSenha) body.senha = formEdit.novaSenha

      const res = await fetch(`/api/usuarios/${usuarioEditando.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        const err = await res.json()
        toast.error(err.error || 'Erro ao salvar')
        return
      }
      toast.success('Usuário atualizado com sucesso!')
      setUsuarioEditando(null)
      loadDados()
    } finally { setSalvando(false) }
  }

  useEffect(() => { loadDados() }, [aba])

  useEffect(() => {
    fetch('/api/auth/me').then(r => r.json()).then(d => setCurrentUser(d.usuario || null))
  }, [])

  async function excluirUsuario(usuarioId: string) {
    setExcluindoUsuario(usuarioId)
    try {
      const res = await fetch(`/api/usuarios/${usuarioId}`, { method: 'DELETE' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { toast.error(data.error || 'Erro ao excluir usuário'); return }
      toast.success('Usuário desativado')
      setConfirmandoExclusaoUsuario(null)
      loadDados()
    } catch {
      toast.error('Erro ao excluir usuário')
    } finally {
      setExcluindoUsuario(null)
    }
  }

  async function loadDados() {
    setLoading(true)
    try {
      if (aba === 'usuarios') {
        const res = await fetch('/api/usuarios')
        if (res.ok) setUsuarios((await res.json()).usuarios)
      } else if (aba === 'servicos') {
        const res = await fetch('/api/pre-cadastros?tipo=servicos_todos')
        if (res.ok) setServicos((await res.json()).servicos)
      }
    } finally { setLoading(false) }
  }

  function toggleModulo(id: string) {
    setFormUser(p => ({
      ...p,
      modulosAcesso: p.modulosAcesso.includes(id)
        ? p.modulosAcesso.filter(m => m !== id)
        : [...p.modulosAcesso, id],
    }))
  }

  async function criarUsuario() {
    if (!formUser.nome || !formUser.email || !formUser.senha) {
      toast.error('Nome, email e senha são obrigatórios')
      return
    }
    setSalvando(true)
    try {
      const res = await fetch('/api/usuarios', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...formUser,
          modulosAcesso: JSON.stringify(formUser.modulosAcesso),
        }),
      })
      if (!res.ok) {
        const err = await res.json()
        toast.error(err.error || 'Erro ao criar usuário')
        return
      }
      toast.success('Usuário criado com sucesso!')
      setModalUsuario(false)
      setFormUser({ nome: '', email: '', senha: '', cargo: '', telefone: '', role: 'ANALISTA', departamento: 'OPERACIONAL_AMBIENTAL', modulosAcesso: ['dashboard', 'operacional'] })
      loadDados()
    } finally { setSalvando(false) }
  }

  async function criarServico() {
    if (!novaServNome || !novaServCateg) { toast.error('Preencha nome e categoria'); return }
    setSalvando(true)
    try {
      const res = await fetch('/api/pre-cadastros', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tipo: 'servico', nome: novaServNome, categoria: novaServCateg }),
      })
      if (!res.ok) throw new Error()
      toast.success('Serviço adicionado!')
      setNovoServico(false); setNovaServNome(''); setNovaServCateg('')
      loadDados()
    } finally { setSalvando(false) }
  }

  async function toggleAtivoServico(s: any) {
    try {
      await fetch('/api/pre-cadastros', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tipo: 'servico', id: s.id, ativo: !s.ativo }),
      })
      loadDados()
    } catch { toast.error('Erro') }
  }

  function abrirTarefas(s: any) {
    if (servicoExpandido === s.id) { setServicoExpandido(null); return }
    setServicoExpandido(s.id)
    setTarefasEdicao(s.tarefasPadrao ? JSON.parse(s.tarefasPadrao) : [])
  }

  function addTarefa() {
    setTarefasEdicao(p => [...p, { titulo: '', etapa: '', ordem: p.length + 1 }])
  }

  function removeTarefa(i: number) {
    setTarefasEdicao(p => p.filter((_, idx) => idx !== i).map((t, idx) => ({ ...t, ordem: idx + 1 })))
  }

  function updateTarefa(i: number, field: string, value: string) {
    setTarefasEdicao(p => p.map((t, idx) => idx === i ? { ...t, [field]: value } : t))
  }

  function abrirEdicaoServico(s: any) {
    setFormServico({ nome: s.nome, categoria: s.categoria || '' })
    setServicoEditando(s)
  }

  async function salvarEdicaoServico() {
    if (!servicoEditando || !formServico.nome) { toast.error('Nome é obrigatório'); return }
    setSalvando(true)
    try {
      const res = await fetch('/api/pre-cadastros', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tipo: 'servico', id: servicoEditando.id, nome: formServico.nome, categoria: formServico.categoria,
        }),
      })
      if (!res.ok) { const err = await res.json(); toast.error(err.error || 'Erro ao salvar'); return }
      toast.success('Serviço atualizado!')
      setServicoEditando(null)
      loadDados()
    } finally { setSalvando(false) }
  }

  async function excluirServico(id: string) {
    try {
      const res = await fetch(`/api/pre-cadastros?tipo=servico&id=${id}`, { method: 'DELETE' })
      const data = await res.json()
      if (!res.ok) { toast.error(data.error || 'Erro ao excluir'); return }
      toast.success('Serviço excluído!')
      setConfirmandoExclusao(null)
      loadDados()
    } catch { toast.error('Erro ao excluir') }
  }

  async function salvarTarefas(servicoId: string) {
    setSalvandoTarefas(true)
    try {
      const res = await fetch('/api/pre-cadastros', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tipo: 'servico', id: servicoId, tarefasPadrao: JSON.stringify(tarefasEdicao) }),
      })
      if (!res.ok) throw new Error()
      toast.success('Tarefas salvas!')
      loadDados()
    } catch { toast.error('Erro ao salvar tarefas') }
    finally { setSalvandoTarefas(false) }
  }

  function renderOrgNode(nodes: any[], depth = 0): React.ReactNode {
    return (
      <div className={depth > 0 ? 'ml-8 mt-2 border-l-2 border-gray-100 pl-4' : ''}>
        {nodes.map((node: any) => (
          <div key={node.role} className="mb-2">
            <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-xl border text-sm font-medium ${node.cor}`}>
              <span>{ROLE_LABELS[node.role]}</span>
              {MODULOS_POR_ROLE[node.role] === null && (
                <span className="text-xs bg-white/60 px-1.5 py-0.5 rounded-full">Acesso Total</span>
              )}
            </div>
            {node.sub?.length > 0 && renderOrgNode(node.sub, depth + 1)}
          </div>
        ))}
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Cadastro Base</h1>
        <p className="text-gray-500 text-sm mt-1">Usuários, perfis, tipos de serviço e tarefas padrão</p>
      </div>

      {/* Abas */}
      <div className="border-b border-gray-100">
        <div className="flex gap-0 overflow-x-auto">
          {([
            { id: 'usuarios',   label: '👥 Usuários' },
            { id: 'hierarquia', label: '🏢 Hierarquia' },
            { id: 'servicos',   label: '🌿 Tipos de Serviço' },
          ] as { id: Aba; label: string }[]).map(a => (
            <button key={a.id} onClick={() => setAba(a.id)}
              className={`px-4 py-2.5 text-sm font-medium border-b-2 whitespace-nowrap transition-colors ${
                aba === a.id ? 'border-green-600 text-green-700' : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}>
              {a.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── USUÁRIOS ── */}
      {aba === 'usuarios' && (
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <p className="text-sm text-gray-500">{usuarios.length} usuário(s) cadastrado(s)</p>
            <button onClick={() => setModalUsuario(true)}
              className="flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white font-semibold px-4 py-2 rounded-xl text-sm transition-colors">
              <Plus className="w-4 h-4" /> Novo Usuário
            </button>
          </div>

          {loading ? (
            <div className="flex items-center justify-center h-32">
              <div className="w-8 h-8 border-4 border-green-600 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : (
            <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
              <table className="w-full">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-100">
                    <th className="text-left text-xs font-semibold text-gray-500 px-4 py-3">Nome</th>
                    <th className="text-left text-xs font-semibold text-gray-500 px-4 py-3">Email</th>
                    <th className="text-left text-xs font-semibold text-gray-500 px-4 py-3">Perfil</th>
                    <th className="text-left text-xs font-semibold text-gray-500 px-4 py-3">Módulos</th>
                    <th className="text-left text-xs font-semibold text-gray-500 px-4 py-3">Status</th>
                    <th className="text-right text-xs font-semibold text-gray-500 px-4 py-3">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {usuarios.map(u => {
                    const modulos: string[] = u.modulosAcesso ? JSON.parse(u.modulosAcesso) : []
                    return (
                      <tr key={u.id} className="hover:bg-gray-50 transition-colors">
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <div className="w-8 h-8 bg-green-100 rounded-full flex items-center justify-center text-green-700 text-sm font-semibold">
                              {u.nome[0]}
                            </div>
                            <div>
                              <p className="text-sm font-medium text-gray-900">{u.nome}</p>
                              <p className="text-xs text-gray-400">{u.cargo || '—'}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-600">{u.email}</td>
                        <td className="px-4 py-3">
                          <span className="text-xs bg-gray-100 text-gray-700 px-2 py-0.5 rounded-full">
                            {ROLE_LABELS[u.role] || u.role}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          {modulos.length > 0 ? (
                            <div className="flex flex-wrap gap-1">
                              {modulos.slice(0, 3).map(m => (
                                <span key={m} className="text-xs bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded">{m}</span>
                              ))}
                              {modulos.length > 3 && (
                                <span className="text-xs text-gray-400">+{modulos.length - 3}</span>
                              )}
                            </div>
                          ) : (
                            <span className="text-xs text-gray-300">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${u.ativo ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-500'}`}>
                            {u.ativo ? 'Ativo' : 'Inativo'}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex items-center justify-end gap-1">
                            <button
                              onClick={() => abrirEdicao(u)}
                              className="flex items-center gap-1.5 text-xs text-blue-600 hover:text-blue-800 hover:bg-blue-50 px-2.5 py-1.5 rounded-lg transition-colors font-medium"
                            >
                              <Edit2 className="w-3.5 h-3.5" /> Editar
                            </button>
                            {currentUser?.role === 'ADMIN' && u.id !== currentUser.id && (
                              confirmandoExclusaoUsuario === u.id ? (
                                <div className="flex items-center gap-1 bg-red-50 border border-red-200 rounded-lg px-2 py-1">
                                  <span className="text-xs text-red-700 font-medium">Confirmar?</span>
                                  <button
                                    onClick={() => excluirUsuario(u.id)}
                                    disabled={excluindoUsuario === u.id}
                                    className="text-xs bg-red-600 text-white px-2 py-0.5 rounded font-medium hover:bg-red-700 disabled:opacity-50"
                                  >
                                    {excluindoUsuario === u.id ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Sim'}
                                  </button>
                                  <button
                                    onClick={() => setConfirmandoExclusaoUsuario(null)}
                                    className="text-xs text-gray-500 hover:text-gray-700 px-1"
                                  >
                                    Não
                                  </button>
                                </div>
                              ) : (
                                <button
                                  onClick={() => setConfirmandoExclusaoUsuario(u.id)}
                                  className="flex items-center gap-1.5 text-xs text-red-500 hover:text-red-700 hover:bg-red-50 px-2.5 py-1.5 rounded-lg transition-colors font-medium"
                                >
                                  <Trash2 className="w-3.5 h-3.5" /> Excluir
                                </button>
                              )
                            )}
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── HIERARQUIA ── */}
      {aba === 'hierarquia' && (
        <div className="space-y-6">
          <div>
            <h2 className="text-base font-semibold text-gray-900">Organograma da Empresa</h2>
            <p className="text-sm text-gray-500 mt-0.5">Estrutura hierárquica e módulos de acesso por perfil</p>
          </div>

          <div className="bg-white rounded-2xl border border-gray-100 p-6 overflow-x-auto">
            {renderOrgNode(ORG_HIERARQUIA)}
          </div>

          <div>
            <h2 className="text-base font-semibold text-gray-900">Matriz de Permissões por Perfil</h2>
            <p className="text-sm text-gray-500 mt-0.5">
              Defina quais módulos cada perfil pode acessar. Clique em <strong>Aplicar</strong> para atualizar todos os usuários do perfil.
            </p>
          </div>

          <div className="bg-white rounded-2xl border border-gray-100 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 w-48">Perfil</th>
                  {MODULOS.map(m => (
                    <th key={m.id} className="text-center px-2 py-3 text-xs font-semibold text-gray-500 min-w-[80px]">
                      <div>{m.label.replace(/^[^\s]+\s/, '')}</div>
                    </th>
                  ))}
                  <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 w-32">Ação</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {Object.entries(ROLE_LABELS).map(([role, label]) => {
                  const isUnlimited = ['ADMIN', 'GESTOR_GERAL'].includes(role)
                  return (
                    <tr key={role} className="hover:bg-gray-50/50 transition-colors">
                      <td className="px-4 py-3">
                        <p className="font-medium text-gray-900 text-sm">{label}</p>
                        {isUnlimited && (
                          <span className="text-xs text-purple-600 font-medium">Acesso irrestrito</span>
                        )}
                      </td>
                      {MODULOS.map(m => (
                        <td key={m.id} className="text-center px-2 py-3">
                          {isUnlimited ? (
                            <span className="text-green-500 text-base">✓</span>
                          ) : (
                            <input
                              type="checkbox"
                              checked={matrizEdit[role]?.includes(m.id) ?? false}
                              onChange={() => toggleMatrizModulo(role, m.id)}
                              className="accent-green-600 w-4 h-4 cursor-pointer"
                            />
                          )}
                        </td>
                      ))}
                      <td className="px-4 py-3 text-right">
                        {!isUnlimited && (
                          <button
                            onClick={() => aplicarAoPerfil(role)}
                            disabled={aplicandoPerfil === role}
                            className="text-xs bg-green-600 hover:bg-green-700 text-white px-3 py-1.5 rounded-lg font-medium transition-colors flex items-center gap-1.5 ml-auto disabled:opacity-50"
                          >
                            {aplicandoPerfil === role
                              ? <><Loader2 className="w-3 h-3 animate-spin" /> Aplicando...</>
                              : 'Aplicar'}
                          </button>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            <div className="px-4 py-3 bg-amber-50 border-t border-amber-100 rounded-b-2xl">
              <p className="text-xs text-amber-700">
                <strong>Atenção:</strong> "Aplicar" atualiza os módulos de <em>todos</em> os usuários daquele perfil. Para personalizar individualmente, use a aba <strong>Usuários</strong>.
              </p>
            </div>
          </div>

          <div>
            <h2 className="text-base font-semibold text-gray-900">Descrição dos Perfis</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {Object.entries(ROLE_LABELS).map(([role, label]) => (
              <div key={role} className="bg-white rounded-xl border border-gray-100 p-4 hover:shadow-sm transition-shadow">
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <p className="font-semibold text-gray-900">{label}</p>
                    <p className="text-xs text-gray-400 font-mono">{role}</p>
                  </div>
                  <span className="text-xs bg-green-50 text-green-700 px-2 py-0.5 rounded-full font-medium">Ativo</span>
                </div>
                <p className="text-sm text-gray-600">{TIPOS_USUARIO_DESC[role] || 'Perfil de acesso do sistema.'}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── TIPOS DE SERVIÇO ── */}
      {aba === 'servicos' && (
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <p className="text-sm text-gray-500">{servicos.length} tipo(s) de serviço cadastrado(s)</p>
            <button onClick={() => setNovoServico(true)}
              className="flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white font-semibold px-4 py-2 rounded-xl text-sm transition-colors">
              <Plus className="w-4 h-4" /> Novo Tipo
            </button>
          </div>

          {novoServico && (
            <div className="bg-green-50 border border-green-200 rounded-xl p-4 flex gap-3">
              <input type="text" value={novaServNome} onChange={e => setNovaServNome(e.target.value)}
                placeholder="Nome do serviço" autoFocus
                className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
              <select value={novaServCateg} onChange={e => setNovaServCateg(e.target.value)}
                className="w-52 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500 bg-white">
                <option value="">Tipo *</option>
                <option value="ambiental">Licenciamento Ambiental</option>
                <option value="regularizacao">Regularização</option>
              </select>
              <button onClick={criarServico} disabled={salvando}
                className="px-3 py-2 bg-green-600 text-white rounded-lg">
                {salvando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
              </button>
              <button onClick={() => setNovoServico(false)} className="px-3 py-2 border border-gray-200 rounded-lg">
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

          <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
            {loading ? (
              <div className="flex items-center justify-center h-32">
                <div className="w-8 h-8 border-4 border-green-600 border-t-transparent rounded-full animate-spin" />
              </div>
            ) : servicos.map((s, idx) => (
              <div key={s.id} className={idx < servicos.length - 1 ? 'border-b border-gray-50' : ''}>
                <div className="flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition-colors">
                  <div className="flex items-center gap-3">
                    <div>
                      <p className="text-sm font-medium text-gray-900">{s.nome}</p>
                      <p className="text-xs text-gray-400">
                        {s.categoria === 'ambiental' ? '🌿 Licenciamento Ambiental' :
                         s.categoria === 'regularizacao' ? '📋 Regularização' :
                         s.categoria || '—'}
                      </p>
                    </div>
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${s.ativo ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-500'}`}>
                      {s.ativo ? 'Ativo' : 'Inativo'}
                    </span>
                    {s.tarefasPadrao && (
                      <span className="text-xs text-blue-500 font-medium">
                        {JSON.parse(s.tarefasPadrao).length} tarefa(s)
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1">
                    <button onClick={() => toggleAtivoServico(s)}
                      className="text-xs text-gray-500 hover:text-gray-700 font-medium px-2 py-1.5 rounded-lg hover:bg-gray-100 transition-colors">
                      {s.ativo ? 'Desativar' : 'Ativar'}
                    </button>
                    <button onClick={() => abrirEdicaoServico(s)}
                      className="flex items-center gap-1 text-xs text-blue-600 hover:bg-blue-50 px-2 py-1.5 rounded-lg font-medium transition-colors">
                      <Edit2 className="w-3.5 h-3.5" /> Editar
                    </button>
                    <button onClick={() => abrirTarefas(s)}
                      className={`flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg transition-colors ${
                        servicoExpandido === s.id
                          ? 'bg-blue-600 text-white'
                          : 'text-blue-600 hover:bg-blue-50'
                      }`}>
                      {servicoExpandido === s.id ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                      Tarefas Padrão
                    </button>
                    {confirmandoExclusao === s.id ? (
                      <div className="flex items-center gap-1 bg-red-50 border border-red-200 rounded-lg px-2 py-1">
                        <span className="text-xs text-red-700 font-medium">Confirmar?</span>
                        <button onClick={() => excluirServico(s.id)}
                          className="text-xs bg-red-600 text-white px-2 py-0.5 rounded font-medium hover:bg-red-700">
                          Sim
                        </button>
                        <button onClick={() => setConfirmandoExclusao(null)}
                          className="text-xs text-gray-500 hover:text-gray-700 px-1">
                          Não
                        </button>
                      </div>
                    ) : (
                      <button onClick={() => setConfirmandoExclusao(s.id)}
                        className="flex items-center gap-1 text-xs text-red-500 hover:bg-red-50 px-2 py-1.5 rounded-lg font-medium transition-colors">
                        <Trash2 className="w-3.5 h-3.5" /> Excluir
                      </button>
                    )}
                  </div>
                </div>

                {servicoExpandido === s.id && (
                  <div className="bg-blue-50/40 border-t border-blue-100 px-4 py-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-semibold text-gray-800">📋 Sequência de Tarefas — {s.nome}</p>
                        <p className="text-xs text-gray-500 mt-0.5">
                          Estas tarefas serão criadas automaticamente quando o projeto entrar em execução.
                        </p>
                      </div>
                      <div className="flex gap-2">
                        <button onClick={addTarefa}
                          className="flex items-center gap-1 text-xs bg-white border border-blue-300 text-blue-700 hover:bg-blue-50 px-3 py-1.5 rounded-lg font-medium transition-colors">
                          <Plus className="w-3 h-3" /> Adicionar
                        </button>
                        <button onClick={() => salvarTarefas(s.id)} disabled={salvandoTarefas}
                          className="flex items-center gap-1 text-xs bg-green-600 hover:bg-green-700 text-white px-3 py-1.5 rounded-lg font-medium transition-colors">
                          {salvandoTarefas ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                          Salvar
                        </button>
                      </div>
                    </div>

                    {tarefasEdicao.length === 0 ? (
                      <div className="text-center py-6 text-gray-400 text-sm border-2 border-dashed border-gray-200 rounded-xl">
                        Nenhuma tarefa definida para este serviço.<br />
                        Clique em <strong>Adicionar</strong> para criar a sequência.
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {tarefasEdicao.map((t, i) => (
                          <div key={i} className="flex items-center gap-2 bg-white rounded-lg px-3 py-2 border border-gray-100 shadow-sm">
                            <span className="w-6 h-6 bg-blue-100 text-blue-700 rounded-full text-xs font-bold flex items-center justify-center flex-shrink-0">
                              {i + 1}
                            </span>
                            <input type="text" value={t.titulo}
                              onChange={e => updateTarefa(i, 'titulo', e.target.value)}
                              placeholder="Descrição da tarefa"
                              className="flex-1 px-2 py-1 border border-gray-200 rounded text-sm focus:outline-none focus:ring-1 focus:ring-blue-400" />
                            <input type="text" value={t.etapa}
                              onChange={e => updateTarefa(i, 'etapa', e.target.value)}
                              placeholder="Etapa (ex: VISTORIA)"
                              className="w-40 px-2 py-1 border border-gray-200 rounded text-sm focus:outline-none focus:ring-1 focus:ring-blue-400" />
                            <button onClick={() => removeTarefa(i)}
                              className="text-red-400 hover:text-red-600 p-1 rounded transition-colors flex-shrink-0">
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── MODAL EDITAR SERVIÇO ── */}
      {servicoEditando && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm">
            <div className="flex items-center justify-between p-5 border-b border-gray-100">
              <div>
                <h2 className="text-base font-semibold text-gray-900">Editar Tipo de Serviço</h2>
                <p className="text-xs text-gray-400 mt-0.5">Altere o nome ou a categoria</p>
              </div>
              <button onClick={() => setServicoEditando(null)} className="text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nome *</label>
                <input type="text" value={formServico.nome}
                  onChange={e => setFormServico(p => ({ ...p, nome: e.target.value }))}
                  autoFocus
                  className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Tipo / Categoria</label>
                <select value={formServico.categoria}
                  onChange={e => setFormServico(p => ({ ...p, categoria: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-green-500 bg-white">
                  <option value="">Selecione...</option>
                  <option value="ambiental">Licenciamento Ambiental</option>
                  <option value="regularizacao">Regularização</option>
                </select>
              </div>
              <div className="flex justify-end gap-3 pt-2 border-t border-gray-100">
                <button onClick={() => setServicoEditando(null)}
                  className="px-4 py-2 border border-gray-200 rounded-xl text-sm text-gray-700 hover:bg-gray-50">
                  Cancelar
                </button>
                <button onClick={salvarEdicaoServico} disabled={salvando}
                  className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-xl text-sm font-semibold flex items-center gap-2">
                  {salvando && <Loader2 className="w-4 h-4 animate-spin" />}
                  Salvar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL EDITAR USUÁRIO ── */}
      {usuarioEditando && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-6 border-b border-gray-100">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">Editar Usuário</h2>
                <p className="text-xs text-gray-400 mt-0.5">{usuarioEditando.email}</p>
              </div>
              <button onClick={() => setUsuarioEditando(null)} className="text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div className="flex items-center justify-between p-3 bg-gray-50 rounded-xl">
                <div>
                  <p className="text-sm font-medium text-gray-700">Status do usuário</p>
                  <p className="text-xs text-gray-400">Desativar impede o login imediatamente</p>
                </div>
                <button type="button" onClick={() => setFormEdit(p => ({ ...p, ativo: !p.ativo }))}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-xl text-sm font-medium transition-colors ${
                    formEdit.ativo
                      ? 'bg-green-100 text-green-800 hover:bg-green-200'
                      : 'bg-gray-200 text-gray-600 hover:bg-gray-300'
                  }`}>
                  {formEdit.ativo
                    ? <><ToggleRight className="w-4 h-4" /> Ativo</>
                    : <><ToggleLeft className="w-4 h-4" /> Inativo</>
                  }
                </button>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Nome *</label>
                  <input type="text" value={formEdit.nome} onChange={e => setFormEdit(p => ({ ...p, nome: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Cargo</label>
                  <input type="text" value={formEdit.cargo} onChange={e => setFormEdit(p => ({ ...p, cargo: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Telefone</label>
                <input type="text" value={formEdit.telefone} onChange={e => setFormEdit(p => ({ ...p, telefone: e.target.value }))}
                  placeholder="(00) 00000-0000"
                  className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Perfil de Acesso</label>
                  <select value={formEdit.role} onChange={e => {
                    const novoRole = e.target.value
                    const mods = MODULOS_POR_ROLE[novoRole]
                    setFormEdit(p => ({
                      ...p,
                      role: novoRole,
                      modulosAcesso: mods === null ? MODULOS.map(m => m.id) : [...(mods ?? ['dashboard'])],
                    }))
                  }}
                    className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-green-500 bg-white">
                    {Object.entries(ROLE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Departamento</label>
                  <select value={formEdit.departamento} onChange={e => setFormEdit(p => ({ ...p, departamento: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-green-500 bg-white">
                    {Object.entries(DEPARTAMENTO_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Módulos com Acesso
                  <span className="text-xs text-gray-400 font-normal ml-1">({formEdit.modulosAcesso.length} selecionado(s))</span>
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {MODULOS.map(m => (
                    <label key={m.id}
                      className={`flex items-center gap-2.5 p-2.5 rounded-lg border cursor-pointer transition-all ${
                        formEdit.modulosAcesso.includes(m.id)
                          ? 'border-green-400 bg-green-50 shadow-sm'
                          : 'border-gray-200 bg-white hover:border-gray-300'
                      }`}>
                      <input type="checkbox" checked={formEdit.modulosAcesso.includes(m.id)}
                        onChange={() => toggleModuloEdit(m.id)}
                        className="accent-green-600 w-4 h-4 flex-shrink-0" />
                      <span className="text-sm text-gray-700">{m.label}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Nova Senha <span className="text-gray-400 font-normal">(deixe em branco para não alterar)</span>
                </label>
                <input type="password" value={formEdit.novaSenha} onChange={e => setFormEdit(p => ({ ...p, novaSenha: e.target.value }))}
                  placeholder="Mín. 8 chars, 1 maiúscula, 1 número"
                  className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
              </div>

              <div className="flex justify-end gap-3 pt-2 border-t border-gray-100">
                <button onClick={() => setUsuarioEditando(null)}
                  className="px-4 py-2 border border-gray-200 rounded-xl text-sm text-gray-700 hover:bg-gray-50">
                  Cancelar
                </button>
                <button onClick={salvarEdicao} disabled={salvando}
                  className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-xl text-sm font-semibold flex items-center gap-2">
                  {salvando && <Loader2 className="w-4 h-4 animate-spin" />}
                  Salvar Alterações
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL NOVO USUÁRIO ── */}
      {modalUsuario && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-6 border-b border-gray-100">
              <h2 className="text-lg font-semibold text-gray-900">Novo Usuário</h2>
              <button onClick={() => setModalUsuario(false)} className="text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Nome *</label>
                  <input type="text" value={formUser.nome} onChange={e => setFormUser(p => ({ ...p, nome: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Cargo</label>
                  <input type="text" value={formUser.cargo} onChange={e => setFormUser(p => ({ ...p, cargo: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Email *</label>
                <input type="email" value={formUser.email} onChange={e => setFormUser(p => ({ ...p, email: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Senha *</label>
                <input type="password" value={formUser.senha} onChange={e => setFormUser(p => ({ ...p, senha: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Perfil de Acesso</label>
                  <select value={formUser.role} onChange={e => {
                    const novoRole = e.target.value
                    const mods = MODULOS_POR_ROLE[novoRole]
                    setFormUser(p => ({
                      ...p,
                      role: novoRole,
                      modulosAcesso: mods === null ? MODULOS.map(m => m.id) : [...(mods ?? ['dashboard'])],
                    }))
                  }}
                    className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-green-500 bg-white">
                    {Object.entries(ROLE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Departamento</label>
                  <select value={formUser.departamento} onChange={e => setFormUser(p => ({ ...p, departamento: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-green-500 bg-white">
                    {Object.entries(DEPARTAMENTO_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Módulos com Acesso
                  <span className="text-xs text-gray-400 font-normal ml-1">({formUser.modulosAcesso.length} selecionado(s))</span>
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {MODULOS.map(m => (
                    <label key={m.id}
                      className={`flex items-center gap-2.5 p-2.5 rounded-lg border cursor-pointer transition-all ${
                        formUser.modulosAcesso.includes(m.id)
                          ? 'border-green-400 bg-green-50 shadow-sm'
                          : 'border-gray-200 bg-white hover:border-gray-300'
                      }`}>
                      <input type="checkbox" checked={formUser.modulosAcesso.includes(m.id)}
                        onChange={() => toggleModulo(m.id)}
                        className="accent-green-600 w-4 h-4 flex-shrink-0" />
                      <span className="text-sm text-gray-700">{m.label}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-2 border-t border-gray-100">
                <button onClick={() => setModalUsuario(false)}
                  className="px-4 py-2 border border-gray-200 rounded-xl text-sm text-gray-700 hover:bg-gray-50">
                  Cancelar
                </button>
                <button onClick={criarUsuario} disabled={salvando}
                  className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-xl text-sm font-semibold flex items-center gap-2">
                  {salvando && <Loader2 className="w-4 h-4 animate-spin" />}
                  Criar Usuário
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
