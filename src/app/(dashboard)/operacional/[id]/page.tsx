'use client'

import { useState, useEffect, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { toast } from 'sonner'
import {
  ArrowLeft, Plus, Check, FileText,
  User, Calendar, Loader2,
  Edit2, Save, Clock, AlertCircle, MessageSquare,
} from 'lucide-react'
import {
  formatDate,
  STATUS_OPERACIONAL_LABELS, STATUS_COLORS, STATUS_TAREFA_LABELS,
} from '@/lib/utils'
import NoteEditor from './NoteEditor'

// Estado inline de edição por tarefa
interface TarefaEdit {
  prazo: string
  responsavelId: string
}

export default function ProjetoDetalhe() {
  const params = useParams()
  const router = useRouter()
  const id     = params.id as string

  const [projeto, setProjeto]       = useState<any>(null)
  const [loading, setLoading]       = useState(true)
  const [aba, setAba]               = useState<'timeline' | 'tarefas' | 'documentos' | 'historico'>('tarefas')
  const [usuarios, setUsuarios]     = useState<any[]>([])

  // Edição inline de prazo/responsável (modo atribuição)
  const [editando, setEditando]     = useState<Record<string, TarefaEdit>>({})
  const [salvandoId, setSalvandoId] = useState<string | null>(null)
  // Nova tarefa avulsa
  const [novaT, setNovaT]           = useState(false)
  const [formTarefa, setFormTarefa] = useState({ titulo: '', prazo: '', responsavelId: '', observacao: '' })
  const [salvandoT, setSalvandoT]   = useState(false)

  // Usuário logado (para controle de permissões)
  const [currentUser, setCurrentUser]             = useState<any>(null)
  // Responsável em lote
  const [bulkResponsavelId, setBulkResponsavelId] = useState('')
  const [bulkPrazo, setBulkPrazo]                 = useState('')
  const [salvandoBulk, setSalvandoBulk]           = useState(false)
  // Iniciar execução manualmente (avança de OPERACIONAL para EM_EXECUCAO)
  const [iniciandoExecucao, setIniciandoExecucao] = useState(false)
  // Controle de linhas expandidas no painel de atribuição
  const [expandido, setExpandido]                 = useState<Record<string, boolean>>({})
  // Filtro: mostrar apenas tarefas sem atribuição completa
  const [filtroPendentes, setFiltroPendentes]     = useState(false)
  // Painel de atribuição aberto/fechado — começa sempre fechado
  const [painelAberto, setPainelAberto]           = useState<boolean | null>(null)
  // Observação / nota por tarefa
  const [editandoNota, setEditandoNota]           = useState<Record<string, string>>({})
  const [salvandoNota, setSalvandoNota]           = useState<string | null>(null)
  // Modal de credenciais (SIGLA / CTF)
  const [modalCredencial, setModalCredencial]     = useState<{ sistema: string } | null>(null)
  const [credForm, setCredForm]                   = useState({ login: '', senha: '' })
  const [salvandoCred, setSalvandoCred]           = useState(false)
  // Modal de Protocolo (data + código do processo no órgão)
  const [modalProtocolo, setModalProtocolo]       = useState(false)
  const [protocoloForm, setProtocoloForm]         = useState({ data: '', codigoOrgao: '' })
  const [salvandoProtocolo, setSalvandoProtocolo] = useState(false)

  const ROLES_GESTOR      = ['ADMIN', 'GESTOR_GERAL', 'GESTOR_OPERACIONAL', 'SUPERVISOR']
  const HOJE_STR          = new Date().toISOString().split('T')[0]
  const MAX_DATE_STR      = `${new Date().getFullYear() + 5}-12-31`

  // silent = true: re-busca os dados sem desmontar a tela (usado após salvar uma
  // atribuição/edição), evitando o "pulo" de scroll para o topo que acontecia
  // quando a tela inteira era trocada pelo spinner de carregamento a cada PATCH.
  const loadProjeto = useCallback(async (opts?: { silent?: boolean }) => {
    if (!opts?.silent) setLoading(true)
    try {
      const res = await fetch(`/api/projetos/${id}`)
      if (!res.ok) { router.push('/operacional'); return }
      const data = await res.json()
      setProjeto(data.projeto)
    } catch {
      toast.error('Erro ao carregar projeto')
    } finally {
      if (!opts?.silent) setLoading(false)
    }
  }, [id, router])

  useEffect(() => {
    loadProjeto()
    fetch('/api/usuarios?ativo=true')
      .then(r => r.json())
      .then(d => setUsuarios(d.usuarios || []))
    fetch('/api/auth/me')
      .then(r => r.json())
      .then(d => setCurrentUser(d.usuario || null))
  }, [loadProjeto])

  // Inicializa estado de edição quando projeto carrega (qualquer etapa)
  useEffect(() => {
    if (!projeto) return
    setEditando(prev => {
      const next = { ...prev }
      ;(projeto.tarefas || []).forEach((t: any) => {
        // só inicializa se ainda não tem estado local (evita sobrescrever edições em curso)
        if (!next[t.id]) {
          next[t.id] = {
            prazo: t.prazo ? t.prazo.split('T')[0] : '',
            responsavelId: t.responsavelId || '',
          }
        }
      })
      return next
    })
  }, [projeto])

  // ── Salvar atribuição de uma tarefa (fecha a linha ao salvar) ─
  async function salvarAtribuicao(tarefaId: string) {
    setSalvandoId(tarefaId)
    try {
      const e = editando[tarefaId]
      const tarefa = (projeto?.tarefas || []).find((t: any) => t.id === tarefaId)
      const podeEnviarPrazo = true
      await fetch('/api/tarefas', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: tarefaId,
          ...(podeEnviarPrazo && { prazo: e.prazo || null }),
          responsavelId: e.responsavelId || null,
        }),
      })
      // Fecha a linha automaticamente após salvar
      setExpandido(prev => ({ ...prev, [tarefaId]: false }))
      toast.success('Atribuição salva!')
      loadProjeto({ silent: true })
    } catch { toast.error('Erro ao salvar') }
    finally { setSalvandoId(null) }
  }

  // ── Aplicar responsável e/ou data a todas as tarefas pendentes ─
  async function aplicarBulkResponsavel() {
    if (!bulkResponsavelId && !bulkPrazo) {
      toast.error('Selecione pelo menos responsável ou data')
      return
    }
    const pendentes = (projeto?.tarefas || []).filter((t: any) =>
      (bulkResponsavelId && !t.responsavelId) || (bulkPrazo && !t.prazo)
    )
    const projetoSemResponsavel = bulkResponsavelId && !projeto?.responsavelId
    if (pendentes.length === 0 && !projetoSemResponsavel) {
      toast.info('Todas as tarefas já estão preenchidas')
      return
    }
    setSalvandoBulk(true)
    try {
      const promises: Promise<any>[] = pendentes.map((t: any) =>
        fetch('/api/tarefas', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: t.id,
            ...(bulkResponsavelId && !t.responsavelId && { responsavelId: bulkResponsavelId }),
            ...(bulkPrazo && !t.prazo && { prazo: bulkPrazo }),
          }),
        })
      )
      // Se o projeto ainda não tem responsável, define o do bulk como responsável do projeto
      if (projetoSemResponsavel) {
        promises.push(
          fetch(`/api/projetos/${id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ responsavelId: bulkResponsavelId }),
          })
        )
      }
      await Promise.all(promises)
      toast.success(pendentes.length > 0
        ? `Atribuição aplicada em ${pendentes.length} tarefa(s)!`
        : 'Responsável do projeto atualizado!')
      // Fecha todas as linhas expandidas
      setExpandido({})
      loadProjeto({ silent: true })
    } catch { toast.error('Erro ao aplicar em massa') }
    finally { setSalvandoBulk(false) }
  }

  // ── Atualizar status operacional ──────────────────────────
  async function atualizarStatus(novoStatus: string) {
    try {
      await fetch(`/api/projetos/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ statusOperacional: novoStatus }),
      })
      toast.success('Status atualizado')
      loadProjeto({ silent: true })
    } catch { toast.error('Erro') }
  }

  // ── Marcar tarefa como concluída/pendente ────────────────────
  async function toggleTarefa(tarefaId: string, atual: string) {
    const novoStatus = atual === 'CONCLUIDA' ? 'PENDENTE' : 'CONCLUIDA'
    const tarefa = (projeto?.tarefas || []).find((t: any) => t.id === tarefaId)
    // Atualiza localmente (optimistic)
    setProjeto((prev: any) => ({
      ...prev,
      tarefas: prev.tarefas.map((t: any) =>
        t.id === tarefaId ? { ...t, status: novoStatus } : t
      ),
    }))
    try {
      await fetch('/api/tarefas', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: tarefaId, status: novoStatus }),
      })
      // ── Abre modal de credenciais ao concluir tarefas SIGLA/CTF ──
      if (novoStatus === 'CONCLUIDA' && tarefa) {
        const titulo = tarefa.titulo.toUpperCase()
        if (titulo.includes('SIGLA')) {
          const creds = projeto?.credenciais ? JSON.parse(projeto.credenciais) : {}
          setCredForm({ login: creds.SIGLA?.login || '', senha: creds.SIGLA?.senha || '' })
          setModalCredencial({ sistema: 'SIGLA' })
        } else if (titulo.includes('CTF')) {
          const creds = projeto?.credenciais ? JSON.parse(projeto.credenciais) : {}
          setCredForm({ login: creds.CTF?.login || '', senha: creds.CTF?.senha || '' })
          setModalCredencial({ sistema: 'CTF' })
        } else if (titulo.includes('PROTOCOLO')) {
          setProtocoloForm({
            data: projeto?.protocoloData ? projeto.protocoloData.split('T')[0] : HOJE_STR,
            codigoOrgao: projeto?.protocoloCodigoOrgao || '',
          })
          setModalProtocolo(true)
        }
      }
    } catch {
      toast.error('Erro ao atualizar tarefa')
      loadProjeto({ silent: true })
    }
  }

  // ── Salvar credenciais do sistema (SIGLA / CTF / etc.) ────────
  async function salvarCredencial() {
    if (!modalCredencial) return
    setSalvandoCred(true)
    try {
      const credsAtuais = projeto?.credenciais ? JSON.parse(projeto.credenciais) : {}
      const novasCreds = {
        ...credsAtuais,
        [modalCredencial.sistema]: { login: credForm.login, senha: credForm.senha },
      }
      await fetch(`/api/projetos/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ credenciais: JSON.stringify(novasCreds) }),
      })
      toast.success(`Credenciais do ${modalCredencial.sistema} salvas!`)
      setModalCredencial(null)
      loadProjeto({ silent: true })
    } catch { toast.error('Erro ao salvar credenciais') }
    finally { setSalvandoCred(false) }
  }

  // ── Salvar dados do Protocolo (data + código do processo no órgão) ──
  async function salvarProtocolo() {
    if (!protocoloForm.data || !protocoloForm.codigoOrgao.trim()) {
      toast.error('Informe a data e o código do processo no órgão')
      return
    }
    setSalvandoProtocolo(true)
    try {
      await fetch(`/api/projetos/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          protocoloData: protocoloForm.data,
          protocoloCodigoOrgao: protocoloForm.codigoOrgao.trim(),
        }),
      })
      toast.success('Protocolo registrado!')
      setModalProtocolo(false)
      loadProjeto({ silent: true })
    } catch { toast.error('Erro ao salvar protocolo') }
    finally { setSalvandoProtocolo(false) }
  }

  // ── Nova tarefa avulsa ─────────────────────────────────────
  async function criarTarefa() {
    if (!formTarefa.titulo.trim()) { toast.error('Título obrigatório'); return }
    setSalvandoT(true)
    try {
      const res = await fetch('/api/tarefas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projetoId: id,
          titulo: formTarefa.titulo.trim(),
          prazo: formTarefa.prazo || null,
          responsavelId: formTarefa.responsavelId || null,
          observacao: formTarefa.observacao || null,
          ordem: (projeto?.tarefas?.length || 0) + 1,
        }),
      })
      const data = await res.json()
      if (!res.ok) { toast.error(data.error || 'Erro ao criar tarefa'); return }
      toast.success('Tarefa criada')
      setNovaT(false)
      setFormTarefa({ titulo: '', prazo: '', responsavelId: '', observacao: '' })
      loadProjeto({ silent: true })
    } catch { toast.error('Erro ao criar tarefa') }
    finally { setSalvandoT(false) }
  }

  // ── Avançar manualmente de OPERACIONAL para EM_EXECUCAO ──────
  async function iniciarExecucao() {
    setIniciandoExecucao(true)
    try {
      const res = await fetch(`/api/projetos/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ avancarPipeline: true }),
      })
      if (!res.ok) { toast.error('Erro ao iniciar execução'); return }
      toast.success('Execução iniciada!')
      loadProjeto({ silent: true })
    } catch { toast.error('Erro') }
    finally { setIniciandoExecucao(false) }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-4 border-green-600 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }
  if (!projeto) return null

  const emOperacional = projeto.etapaPipeline === 'OPERACIONAL'
  const modoGestor   = ROLES_GESTOR.includes(currentUser?.role)
  // Gestores podem editar em qualquer etapa (não há mais travas de pipeline)
  const modoEdicao   = emOperacional || modoGestor || projeto.etapaPipeline !== 'CANCELADO'
  const tarefas       = projeto.tarefas || []


  // Helper para exibir nome completo no select de usuário
  function labelUsuario(u: any) {
    const partes = [u.nome]
    if (u.cargo) partes.push(u.cargo)
    return partes.join(' — ')
  }

  // Porcentagem de tarefas com prazo/responsável definidos (para o banner)
  const comAtribuicao = tarefas.filter((t: any) => t.prazo && t.responsavelId).length
  const pctAtribuido  = tarefas.length > 0 ? Math.round((comAtribuicao / tarefas.length) * 100) : 0

  return (
    <div className="flex flex-col gap-5">

      {/* ── Header ──────────────────────────────────────────── */}
      <div className="flex flex-col gap-3">
        <button
          onClick={() => router.push('/operacional')}
          className="flex items-center gap-2 text-gray-500 hover:text-gray-700 font-medium text-sm w-fit"
        >
          <ArrowLeft className="w-4 h-4" />
          Voltar
        </button>

        <div className="flex flex-col sm:flex-row sm:items-start gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-mono text-xs text-gray-400">{projeto.codigo}</span>
              <h1 className="text-lg sm:text-xl font-bold text-gray-900 truncate">
                {projeto.nome}
              </h1>
            </div>
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${STATUS_COLORS[projeto.statusOperacional]}`}>
                {STATUS_OPERACIONAL_LABELS[projeto.statusOperacional]}
              </span>
              {emOperacional && (
                <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-amber-100 text-amber-700">
                  ⏳ Aguardando planejamento
                </span>
              )}
              <span className="text-xs text-gray-500 font-mono">{projeto.codigo}</span>
            </div>
          </div>
          {!emOperacional && (
            <select
              value={projeto.statusOperacional}
              onChange={e => atualizarStatus(e.target.value)}
              className="px-3 py-2 border border-gray-200 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-green-500 w-full sm:w-auto"
            >
              {Object.entries(STATUS_OPERACIONAL_LABELS).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          )}
        </div>
      </div>

      {/* ── Info Cards ──────────────────────────────────────── */}
      {(() => {
        // Prazo: usa dataPrazo do projeto; se vazio, deriva da última tarefa com prazo
        const prazoTarefas = tarefas
          .filter((t: any) => t.prazo)
          .map((t: any) => t.prazo)
          .sort()
          .pop() || null
        const prazoRef      = projeto.dataPrazo || prazoTarefas
        const prazoEstimado = !projeto.dataPrazo && !!prazoTarefas

        const cards = [
          { Icon: User,       label: 'Responsável',  value: projeto.responsavel?.nome || 'Não atribuído',  sub: null },
          { Icon: Calendar,   label: 'Criado em',     value: formatDate(projeto.dataEntrada) || '—',        sub: null },
          {
            Icon: Calendar,
            label: prazoEstimado ? 'Previsão de conclusão' : 'Prazo',
            value: formatDate(prazoRef) || '—',
            sub: prazoEstimado ? '* baseado na última tarefa' : null,
          },
        ]

        return (
          <div className="space-y-3">
            {/* Grid de cards principais */}
            <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
              {cards.map(({ Icon, label, value, sub }: any) => (
                <div key={label} className="bg-white rounded-xl border border-gray-100 p-3 sm:p-4">
                  <div className="flex items-center gap-1.5 text-gray-400 mb-1">
                    <Icon className="w-3.5 h-3.5" />
                    <span className="text-xs">{label}</span>
                  </div>
                  <p className="font-semibold text-sm text-gray-900 truncate">{value}</p>
                  {sub && <p className="text-xs text-amber-500 mt-0.5">{sub}</p>}
                </div>
              ))}
            </div>

            {/* Observações — linha própria, texto completo */}
            {projeto.observacoes && (
              <div className="bg-white rounded-xl border border-gray-100 p-3 sm:p-4">
                <div className="flex items-center gap-1.5 text-gray-400 mb-1">
                  <FileText className="w-3.5 h-3.5" />
                  <span className="text-xs">Observações</span>
                </div>
                <p className="font-medium text-sm text-gray-900 whitespace-pre-wrap">
                  {projeto.observacoes}
                </p>
              </div>
            )}
          </div>
        )
      })()}

      {/* ══════════════════════════════════════════════════════
          PAINEL DE ATRIBUIÇÃO — colapsável, aparece abaixo das abas
          ══════════════════════════════════════════════════════ */}
      {modoEdicao && (() => {
        // Tarefas filtradas (pendentes = sem responsável ou sem prazo)
        const tarefasFiltradas = filtroPendentes
          ? tarefas.filter((t: any) => !t.responsavelId || !t.prazo)
          : tarefas
        const totalPendentes = tarefas.filter((t: any) => !t.responsavelId || !t.prazo).length

        return (
        <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-sm" style={{ order: 99 }}>

          {/* ── Header clicável: abre/fecha o painel ───────────────── */}
          <button
            onClick={() => setPainelAberto(a => !a)}
            className="w-full px-4 sm:px-6 py-3 flex items-center justify-between hover:bg-gray-50 transition-colors"
          >
            <div className="flex items-center gap-2 min-w-0">
              <AlertCircle className="w-4 h-4 text-amber-500 flex-shrink-0" />
              <span className="font-semibold text-gray-800 text-sm sm:text-base truncate">
                {emOperacional ? 'Planejamento — Atribuir prazos e responsáveis' : 'Gerenciar Atividades'}
              </span>
            </div>
            <div className="flex items-center gap-3 flex-shrink-0 ml-3">
              {/* Mini barra de progresso (sempre visível) */}
              <div className="hidden sm:flex items-center gap-2">
                <div className="w-24 bg-gray-100 rounded-full h-1.5 overflow-hidden">
                  <div
                    className={`h-1.5 rounded-full transition-all duration-500 ${
                      pctAtribuido === 100 ? 'bg-green-500' : pctAtribuido > 50 ? 'bg-amber-400' : 'bg-amber-300'
                    }`}
                    style={{ width: `${pctAtribuido}%` }}
                  />
                </div>
                <span className="text-xs font-bold text-gray-600">{pctAtribuido}%</span>
              </div>
              <span className="text-xs font-bold text-gray-600 sm:hidden">{pctAtribuido}%</span>
              <span className="text-gray-400 text-sm">{painelAberto === true ? '▲' : '▼'}</span>
            </div>
          </button>

          {/* ── Conteúdo colapsável ─────────────────────────────────── */}
          {painelAberto === true && (
          <>
          {/* ── Sub-header: barra de progresso detalhada ───────────── */}
          <div className="px-4 sm:px-6 pb-3 pt-1 border-b border-gray-100">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-xs text-gray-400">{comAtribuicao} de {tarefas.length} atribuídas</span>
              <div className="flex items-center gap-2">
                {modoGestor && tarefas.length > 0 && (
                  <button
                    onClick={e => { e.stopPropagation(); setNovaT(true) }}
                    className="flex items-center gap-1 text-xs text-green-600 hover:text-green-700 font-medium px-2 py-1 rounded-lg hover:bg-green-50 transition-colors"
                  >
                    <Plus className="w-3.5 h-3.5" /> Tarefa
                  </button>
                )}
                {totalPendentes > 0 && (
                  <button
                    onClick={e => { e.stopPropagation(); setFiltroPendentes(f => !f) }}
                    className={`text-xs font-medium transition-colors ${
                      filtroPendentes ? 'text-amber-600 underline' : 'text-gray-400 hover:text-amber-600'
                    }`}
                  >
                    {filtroPendentes ? `Ver todas (${tarefas.length})` : `Ver só pendentes (${totalPendentes})`}
                  </button>
                )}
              </div>
            </div>
            <div className="w-full bg-gray-100 rounded-full h-2 overflow-hidden">
              <div
                className={`h-2 rounded-full transition-all duration-500 ${
                  pctAtribuido === 100 ? 'bg-green-500' : pctAtribuido > 50 ? 'bg-amber-400' : 'bg-amber-300'
                }`}
                style={{ width: `${pctAtribuido}%` }}
              />
            </div>
          </div>

          {/* ── Toolbar: atribuição em lote ──────────────────────────── */}
          {tarefas.length > 0 && (
            <div className="px-4 sm:px-6 py-3 bg-gray-50 border-b border-gray-100">
              <p className="text-xs font-semibold text-gray-500 mb-2 uppercase tracking-wide">Aplicar a todas sem atribuição</p>
              <div className="flex flex-col sm:flex-row gap-2">
                <select
                  value={bulkResponsavelId}
                  onChange={e => setBulkResponsavelId(e.target.value)}
                  className="flex-1 border border-gray-200 rounded-lg px-2.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 bg-white min-w-0"
                >
                  <option value="">Responsável...</option>
                  {usuarios.map(u => (
                    <option key={u.id} value={u.id}>{labelUsuario(u)}</option>
                  ))}
                </select>
                <input
                  type="date"
                  value={bulkPrazo}
                  min={HOJE_STR}
                  max={MAX_DATE_STR}
                  onChange={e => setBulkPrazo(e.target.value)}
                  className="border border-gray-200 rounded-lg px-2.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
                  placeholder="Prazo..."
                />
                <button
                  onClick={aplicarBulkResponsavel}
                  disabled={salvandoBulk || (!bulkResponsavelId && !bulkPrazo)}
                  className="flex items-center justify-center gap-1.5 px-4 py-2 bg-amber-500 hover:bg-amber-600 disabled:opacity-40 text-white rounded-lg text-sm font-semibold transition-colors flex-shrink-0"
                >
                  {salvandoBulk ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                  Aplicar
                </button>
              </div>
            </div>
          )}

          {/* ── Lista de tarefas ──────────────────────────────────────── */}
          {tarefas.length === 0 ? (
            // Estado vazio — sem tarefas
            <div className="px-6 py-10 text-center">
              <Clock className="w-9 h-9 mx-auto mb-3 text-amber-300" />
              <p className="text-sm font-semibold text-gray-700 mb-1">Nenhuma tarefa cadastrada</p>
              <p className="text-xs text-gray-500 mb-5 max-w-sm mx-auto">
                Adicione as tarefas deste projeto manualmente.
              </p>
              {modoGestor && (
                <div className="flex flex-col sm:flex-row gap-2 justify-center">
                  <button
                    onClick={() => setNovaT(true)}
                    className="flex items-center justify-center gap-2 px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-lg text-sm font-semibold"
                  >
                    <Plus className="w-4 h-4" /> Nova Tarefa
                  </button>
                  <button
                    onClick={iniciarExecucao}
                    disabled={iniciandoExecucao}
                    className="flex items-center justify-center gap-2 px-4 py-2 border border-green-400 text-green-700 hover:bg-green-50 disabled:opacity-50 rounded-lg text-sm font-medium"
                  >
                    {iniciandoExecucao ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                    Iniciar sem tarefas
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div>
              {/* Linhas de tarefa — compactas por padrão */}
              {tarefasFiltradas.map((tarefa: any) => {
                      const edit           = editando[tarefa.id] || { prazo: '', responsavelId: '' }
                      const isOpen         = !!expandido[tarefa.id]
                      const isSaving       = salvandoId === tarefa.id
                      const totalAtrib     = tarefa.prazo && tarefa.responsavelId
                      const semResponsavel = !tarefa.responsavelId
                      const semPrazo       = !tarefa.prazo
                      const aguardaCampo   = false
                      const campoAgendado  = false

                      // Status visual da linha
                      const statusCor = campoAgendado ? 'bg-green-500'
                        : aguardaCampo ? 'bg-blue-400'
                        : totalAtrib  ? 'bg-green-400'
                        : semResponsavel && semPrazo ? 'bg-red-400'
                        : 'bg-amber-400'

                      const linhaBg = isOpen
                        ? 'bg-amber-50'
                        : campoAgendado ? 'hover:bg-green-50/50'
                        : totalAtrib    ? 'hover:bg-green-50/40'
                        : 'hover:bg-amber-50/40'

                      return (
                        <div key={tarefa.id} className={`border-b border-gray-50 last:border-0 transition-colors ${linhaBg}`}>

                          {/* ── Linha compacta (sempre visível) ── */}
                          <div
                            className="flex items-center gap-3 px-4 sm:px-6 py-3 cursor-pointer"
                            onClick={() => setExpandido(prev => ({ ...prev, [tarefa.id]: !prev[tarefa.id] }))}
                          >
                            {/* Dot de status */}
                            <div className={`w-2 h-2 rounded-full flex-shrink-0 ${statusCor}`} />

                            {/* Título */}
                            <span className="text-sm text-gray-800 flex-1 min-w-0 truncate leading-snug">
                              {tarefa.titulo}
                            </span>

                            {/* Chips de atribuição (visíveis quando fechado) */}
                            {!isOpen && (
                              <div className="flex items-center gap-1.5 flex-shrink-0 flex-wrap justify-end">
                                {aguardaCampo && (
                                  <span className="text-xs bg-blue-50 text-blue-600 border border-blue-200 px-2 py-0.5 rounded-full font-medium">
                                    🔵 Campo
                                  </span>
                                )}
                                {campoAgendado && (
                                  <span className="text-xs bg-green-50 text-green-700 border border-green-200 px-2 py-0.5 rounded-full font-medium">
                                    📅 {new Date(tarefa.dataCampo).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', timeZone: 'UTC' })}
                                  </span>
                                )}
                                {tarefa.responsavel ? (
                                  <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full font-medium max-w-[100px] truncate">
                                    {tarefa.responsavel.nome.split(' ')[0]}
                                  </span>
                                ) : (
                                  <span className="text-xs bg-red-50 text-red-500 border border-red-200 px-2 py-0.5 rounded-full font-medium">
                                    Sem resp.
                                  </span>
                                )}
                                {tarefa.prazo && !campoAgendado ? (
                                  <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">
                                    {new Date(tarefa.prazo).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', timeZone: 'UTC' })}
                                  </span>
                                ) : !campoAgendado && !aguardaCampo ? (
                                  <span className="text-xs bg-amber-50 text-amber-500 border border-amber-200 px-2 py-0.5 rounded-full">
                                    Sem prazo
                                  </span>
                                ) : null}
                              </div>
                            )}

                            {/* Ícone expandir/fechar */}
                            <Edit2 className={`w-3.5 h-3.5 flex-shrink-0 transition-colors ${
                              isOpen ? 'text-amber-500' : 'text-gray-300 group-hover:text-gray-400'
                            }`} />
                          </div>

                          {/* ── Formulário expandido ── */}
                          {isOpen && (
                            <div className="px-4 sm:px-6 pb-4 pt-1">
                              <div className="bg-amber-50 rounded-xl p-3 border border-amber-100">
                                {aguardaCampo ? (
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <span className="text-xs text-blue-600 bg-blue-50 border border-blue-200 px-2.5 py-1.5 rounded-lg font-medium">
                                      🔵 Aguardando Campo definir data
                                    </span>
                                    {/* Ainda permite definir responsável */}
                                    <select
                                      value={edit.responsavelId}
                                      onChange={e => setEditando(prev => ({ ...prev, [tarefa.id]: { ...prev[tarefa.id], responsavelId: e.target.value } }))}
                                      className="flex-1 border border-gray-200 rounded-lg px-2.5 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-amber-400 min-w-40"
                                    >
                                      <option value="">Responsável...</option>
                                      {usuarios.map(u => <option key={u.id} value={u.id}>{labelUsuario(u)}</option>)}
                                    </select>
                                    <button
                                      onClick={() => salvarAtribuicao(tarefa.id)}
                                      disabled={isSaving}
                                      className="flex items-center gap-1.5 px-3 py-2 bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white rounded-lg text-sm font-medium"
                                    >
                                      {isSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                                      Salvar
                                    </button>
                                  </div>
                                ) : (
                                  <div className="flex flex-col sm:flex-row gap-2 flex-wrap">
                                    {/* Prazo */}
                                    {!campoAgendado ? (
                                      <div className="flex flex-col gap-1">
                                        <label className="text-xs text-gray-500 font-medium">Prazo</label>
                                        <input
                                          type="date"
                                          value={edit.prazo}
                                          min={HOJE_STR}
                                          max={MAX_DATE_STR}
                                          onChange={e => {
                                            const val = e.target.value
                                            const ano = parseInt(val.split('-')[0] || '0', 10)
                                            if (val && (ano < new Date().getFullYear() || ano > new Date().getFullYear() + 5)) return
                                            setEditando(prev => ({ ...prev, [tarefa.id]: { ...prev[tarefa.id], prazo: val } }))
                                          }}
                                          className="border border-gray-200 rounded-lg px-2.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
                                        />
                                      </div>
                                    ) : (
                                      <span className="text-xs text-green-700 bg-green-50 border border-green-200 px-2.5 py-2 rounded-lg font-medium self-end">
                                        📅 Campo: {new Date(tarefa.dataCampo).toLocaleDateString('pt-BR', { timeZone: 'UTC' })}
                                      </span>
                                    )}

                                    {/* Responsável */}
                                    <div className="flex flex-col gap-1 flex-1 min-w-36">
                                      <label className="text-xs text-gray-500 font-medium">Responsável</label>
                                      <select
                                        value={edit.responsavelId}
                                        onChange={e => setEditando(prev => ({ ...prev, [tarefa.id]: { ...prev[tarefa.id], responsavelId: e.target.value } }))}
                                        className="border border-gray-200 rounded-lg px-2.5 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-amber-400"
                                      >
                                        <option value="">Selecione...</option>
                                        {usuarios.map(u => <option key={u.id} value={u.id}>{labelUsuario(u)}</option>)}
                                      </select>
                                    </div>

                                    {/* Botões Salvar / Cancelar */}
                                    <div className="flex flex-col gap-1 justify-end">
                                      <label className="text-xs text-gray-500 font-medium invisible">.</label>
                                      <div className="flex gap-2">
                                        <button
                                          onClick={() => salvarAtribuicao(tarefa.id)}
                                          disabled={isSaving}
                                          className="flex items-center gap-1.5 px-4 py-2 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white rounded-lg text-sm font-semibold transition-colors"
                                        >
                                          {isSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                                          Salvar
                                        </button>
                                        <button
                                          onClick={() => setExpandido(prev => ({ ...prev, [tarefa.id]: false }))}
                                          className="px-3 py-2 border border-gray-200 text-gray-500 hover:bg-gray-100 rounded-lg text-sm transition-colors"
                                        >
                                          ✕
                                        </button>
                                      </div>
                                    </div>
                                  </div>
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                      )
              })}
            </div>
          )}

          {/* ── Rodapé: Iniciar Execução ─────────────────────────────── */}
          {emOperacional && modoGestor && tarefas.length > 0 && (
            <div className="px-4 sm:px-6 py-3 bg-gray-50 border-t border-gray-100 flex flex-col sm:flex-row items-center justify-between gap-3">
              <p className="text-xs text-gray-500">
                {pctAtribuido === 100
                  ? '✅ Tudo atribuído — execute o 1º check na linha do tempo para iniciar, ou clique em Iniciar.'
                  : `⏳ ${totalPendentes} tarefa(s) ainda sem atribuição completa.`}
              </p>
              <button
                onClick={iniciarExecucao}
                disabled={iniciandoExecucao}
                className="flex items-center gap-1.5 px-4 py-2 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white rounded-lg text-sm font-semibold transition-colors flex-shrink-0"
              >
                {iniciandoExecucao ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                Iniciar Execução
              </button>
            </div>
          )}
          </>
          )}
        </div>
        )
      })()}

      {/* ── Abas ────────────────────────────────────────────── */}
      <div className="border-b border-gray-100 overflow-x-auto">
        <div className="flex gap-0 min-w-max">
          {[
            { id: 'timeline',   label: 'Linha do Tempo' },
            { id: 'tarefas',    label: `Tarefas (${tarefas.length})` },
            { id: 'documentos', label: `Docs (${projeto.documentos?.length || 0})` },
            { id: 'historico',  label: 'Histórico' },
          ].map(a => (
            <button
              key={a.id}
              onClick={() => setAba(a.id as any)}
              className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                aba === a.id
                  ? 'border-green-600 text-green-700'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              {a.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Form Nova Tarefa — sempre visível aqui, qualquer que seja a aba ativa ── */}
      {novaT && modoGestor && (
        <div className="p-4 border-2 border-dashed border-green-200 rounded-xl bg-green-50/50">
          <h4 className="text-sm font-semibold text-gray-700 mb-3">Nova Tarefa</h4>
          <div className="space-y-3">
            <input
              type="text"
              value={formTarefa.titulo}
              onChange={e => setFormTarefa(p => ({ ...p, titulo: e.target.value }))}
              placeholder="Título da tarefa *"
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
              autoFocus
            />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <input
                type="date"
                value={formTarefa.prazo}
                min={HOJE_STR}
                max={MAX_DATE_STR}
                onChange={e => setFormTarefa(p => ({ ...p, prazo: e.target.value }))}
                className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
              />
              <select
                value={formTarefa.responsavelId}
                onChange={e => setFormTarefa(p => ({ ...p, responsavelId: e.target.value }))}
                className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500 bg-white"
              >
                <option value="">Responsável</option>
                {usuarios.map(u => (
                  <option key={u.id} value={u.id}>{labelUsuario(u)}</option>
                ))}
              </select>
            </div>
            <textarea
              value={formTarefa.observacao}
              onChange={e => setFormTarefa(p => ({ ...p, observacao: e.target.value }))}
              placeholder="Observações (opcional)"
              rows={2}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
            />
            <div className="flex gap-2">
              <button onClick={criarTarefa} disabled={salvandoT}
                className="flex items-center gap-1.5 px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm font-medium transition-colors">
                {salvandoT && <Loader2 className="w-3 h-3 animate-spin" />} Salvar
              </button>
              <button onClick={() => { setNovaT(false); setFormTarefa({ titulo: '', prazo: '', responsavelId: '', observacao: '' }) }}
                className="px-4 py-2 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50 transition-colors">
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Linha do Tempo ─────────────────────────────────── */}
      {aba === 'timeline' && (
        <div className="bg-white rounded-2xl border border-gray-100 p-4 sm:p-6">
          <div className="flex items-center justify-between mb-5">
            <h3 className="font-semibold text-gray-900">Linha do Tempo</h3>
            {modoGestor && (
              <button
                onClick={() => setNovaT(true)}
                className="flex items-center gap-1.5 text-sm text-green-600 hover:text-green-700 font-medium"
              >
                <Plus className="w-4 h-4" /> Adicionar
              </button>
            )}
          </div>

          {/* Tarefas do projeto */}
          <div className="space-y-2">
            {tarefas.length === 0 ? (
              <div className="text-center py-10 text-gray-400">
                <Clock className="w-10 h-10 mx-auto mb-2 opacity-30" />
                <p className="text-sm">
                  {emOperacional
                    ? 'Adicione as tarefas deste projeto manualmente usando o botão acima.'
                    : 'Nenhuma tarefa cadastrada.'
                  }
                </p>
              </div>
            ) : (
              tarefas.map((tarefa: any) => (
                      <div
                        key={tarefa.id}
                        className={`flex items-start gap-3 p-3 rounded-xl border transition-colors ${
                          tarefa.status === 'CONCLUIDA' ? 'bg-green-50 border-green-100'
                          : tarefa.status === 'ATRASADA' ? 'bg-red-50 border-red-100'
                          : 'bg-white border-gray-100'
                        }`}
                      >
                        <button
                          onClick={() => toggleTarefa(tarefa.id, tarefa.status)}
                          className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 mt-0.5 transition-colors ${
                            tarefa.status === 'CONCLUIDA'
                              ? 'bg-green-600 border-green-600'
                              : 'border-gray-300 hover:border-green-500'
                          }`}
                        >
                          {tarefa.status === 'CONCLUIDA' && <Check className="w-3 h-3 text-white" />}
                        </button>
                        <div className="flex-1 min-w-0">
                          <p className={`text-sm font-medium ${tarefa.status === 'CONCLUIDA' ? 'text-gray-400 line-through' : 'text-gray-900'}`}>
                            {tarefa.titulo}
                          </p>
                          <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                            {tarefa.responsavel && (
                              <span className="text-xs text-gray-400">{tarefa.responsavel.nome}</span>
                            )}
                            {tarefa.prazo && (
                              <span className="text-xs text-gray-400">{formatDate(tarefa.prazo)}</span>
                            )}
                            {!tarefa.responsavel && emOperacional && (
                              <span className="text-xs text-amber-500">Sem responsável</span>
                            )}
                          </div>
                          <NoteEditor tarefaId={tarefa.id} currentNote={tarefa.observacao ?? null} onSaved={() => loadProjeto({ silent: true })} />
                        </div>
                        <span className={`text-xs px-2 py-0.5 rounded-full flex-shrink-0 ${STATUS_COLORS[tarefa.status] || 'bg-gray-100 text-gray-600'}`}>
                          {STATUS_TAREFA_LABELS[tarefa.status]}
                        </span>
                      </div>
              ))
            )}
          </div>

        </div>
      )}

      {/* ── Tarefas do projeto ──────────────────────────────  */}
      {aba === 'tarefas' && (() => {
        const pendentes   = tarefas.filter((t: any) => t.status !== 'CONCLUIDA')
        const concluidas  = tarefas.filter((t: any) => t.status === 'CONCLUIDA')
        const pct         = tarefas.length > 0 ? Math.round((concluidas.length / tarefas.length) * 100) : 0
        const verConcl    = !!expandido['concl_projeto']
        const toggleConcl = () => setExpandido(prev => ({ ...prev, concl_projeto: !prev.concl_projeto }))

        return (
        <div className="space-y-4">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-semibold text-gray-900">Tarefas do Projeto</h3>
              <p className="text-xs text-gray-400 mt-0.5">
                {concluidas.length}/{tarefas.length} concluídas
              </p>
            </div>
            {modoGestor && (
              <button onClick={() => setNovaT(true)} className="flex items-center gap-1.5 text-sm text-green-600 font-medium">
                <Plus className="w-4 h-4" /> Nova
              </button>
            )}
          </div>

          {tarefas.length === 0 ? (
            <div className="bg-white rounded-2xl border border-gray-100 p-8 text-center">
              <Clock className="w-9 h-9 mx-auto mb-3 text-amber-300" />
              <p className="text-sm font-semibold text-gray-700 mb-1">Nenhuma tarefa cadastrada</p>
              <p className="text-xs text-gray-400 mb-4 max-w-sm mx-auto">
                Adicione as tarefas deste projeto manualmente.
              </p>
              <div className="flex flex-col sm:flex-row gap-2 justify-center">
                <button
                  onClick={() => setNovaT(true)}
                  className="flex items-center justify-center gap-2 px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-lg text-sm font-semibold"
                >
                  <Plus className="w-4 h-4" /> Nova Tarefa
                </button>
              </div>
            </div>
          ) : (
            <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">

              {/* Progresso geral */}
              <div className="px-4 py-3 border-b border-gray-50 bg-gray-50">
                <div className="flex items-center justify-between mb-1.5">
                  <span className={`text-xs font-bold ${pct === 100 ? 'text-green-600' : 'text-gray-400'}`}>
                    {pct}% concluído
                  </span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-1.5 overflow-hidden">
                  <div
                    className={`h-1.5 rounded-full transition-all duration-500 ${pct === 100 ? 'bg-green-500' : 'bg-green-400'}`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <p className="text-xs text-gray-400 mt-1">
                  {pendentes.length > 0 ? `${pendentes.length} pendente(s)` : '✅ Tudo concluído'}
                  {concluidas.length > 0 && ` · ${concluidas.length} concluída(s)`}
                </p>
              </div>

              {/* Tarefas PENDENTES */}
              <div className="divide-y divide-gray-50">
                {pendentes.length === 0 && !verConcl && (
                  <div className="px-4 py-4 text-center text-xs text-gray-400">
                    Todas as atividades concluídas ✅
                  </div>
                )}
                {pendentes.map((tarefa: any) => (
                  <div key={tarefa.id} className="flex items-start gap-3 px-4 py-3 hover:bg-gray-50 transition-colors">
                    <button
                      onClick={() => toggleTarefa(tarefa.id, tarefa.status)}
                      className="w-5 h-5 rounded-full border-2 border-gray-300 hover:border-green-500 flex items-center justify-center flex-shrink-0 mt-0.5 transition-colors"
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-gray-900 font-medium leading-snug">
                        {tarefa.titulo}
                      </p>
                      <div className="flex gap-2 text-xs text-gray-400 mt-0.5 flex-wrap">
                        {tarefa.responsavel && <span>👤 {tarefa.responsavel.nome}</span>}
                        {tarefa.prazo && <span>📅 {formatDate(tarefa.prazo)}</span>}
                        {!tarefa.responsavel && <span className="text-amber-400">Sem responsável</span>}
                      </div>
                      <NoteEditor tarefaId={tarefa.id} currentNote={tarefa.observacao ?? null} onSaved={() => loadProjeto({ silent: true })} />
                    </div>
                  </div>
                ))}
              </div>

              {/* Toggle de concluídas */}
              {concluidas.length > 0 && (
                <div className="border-t border-gray-50">
                  <button
                    onClick={toggleConcl}
                    className="w-full flex items-center justify-between px-4 py-2.5 text-xs text-gray-400 hover:text-gray-600 hover:bg-gray-50 transition-colors"
                  >
                    <span className="flex items-center gap-1.5">
                      <Check className="w-3.5 h-3.5 text-green-500" />
                      {concluidas.length} concluída(s) — {verConcl ? 'ocultar' : 'ver'}
                    </span>
                    <span className="text-lg leading-none">{verConcl ? '∧' : '∨'}</span>
                  </button>

                  {verConcl && (
                    <div className="divide-y divide-gray-50 bg-green-50/30">
                      {concluidas.map((tarefa: any) => (
                        <div key={tarefa.id} className="flex items-start gap-3 px-4 py-2.5 hover:bg-green-50/50 transition-colors">
                          <button
                            onClick={() => toggleTarefa(tarefa.id, tarefa.status)}
                            className="w-5 h-5 rounded-full bg-green-600 border-2 border-green-600 flex items-center justify-center flex-shrink-0 mt-0.5"
                          >
                            <Check className="w-3 h-3 text-white" />
                          </button>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm text-gray-400 line-through leading-snug">
                              {tarefa.titulo}
                            </p>
                            <div className="flex gap-2 text-xs text-gray-400 mt-0.5 flex-wrap">
                              {tarefa.responsavel && <span>{tarefa.responsavel.nome}</span>}
                              {tarefa.prazo && <span>{formatDate(tarefa.prazo)}</span>}
                            </div>
                            <NoteEditor tarefaId={tarefa.id} currentNote={tarefa.observacao ?? null} onSaved={() => loadProjeto({ silent: true })} />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
        )
      })()}

      {/* ── Documentos ────────────────────────────────────── */}
      {aba === 'documentos' && (
        <div className="bg-white rounded-2xl border border-gray-100 p-4 sm:p-6">
          <h3 className="font-semibold text-gray-900 mb-4">Documentos</h3>
          {projeto.documentos?.length === 0 ? (
            <div className="text-center py-8 text-gray-400">
              <FileText className="w-10 h-10 mx-auto mb-2 opacity-40" />
              <p className="text-sm">Nenhum documento enviado</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-50">
              {projeto.documentos?.map((doc: any) => (
                <div key={doc.id} className="flex items-center gap-3 py-3">
                  <FileText className="w-5 h-5 text-gray-400 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">{doc.nome}</p>
                    <p className="text-xs text-gray-400">{doc.categoria} • {doc.usuario?.nome}</p>
                  </div>
                  <a href={doc.url} target="_blank" rel="noopener noreferrer"
                    className="text-xs text-green-600 hover:text-green-700 font-medium flex-shrink-0">
                    Abrir
                  </a>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Histórico ─────────────────────────────────────── */}
      {aba === 'historico' && (
        <div className="bg-white rounded-2xl border border-gray-100 p-4 sm:p-6">
          <h3 className="font-semibold text-gray-900 mb-4">Histórico</h3>
          {projeto.historico?.length === 0 ? (
            <p className="text-center py-8 text-gray-400 text-sm">Nenhum histórico</p>
          ) : (
            <div className="relative space-y-4 pl-5">
              <div className="absolute left-1.5 top-0 bottom-0 w-0.5 bg-gray-100" />
              {projeto.historico?.map((h: any) => (
                <div key={h.id} className="relative">
                  <div className="absolute -left-3.5 w-2.5 h-2.5 rounded-full bg-green-500 mt-1" />
                  <p className="text-sm text-gray-900">
                    Alterado para <strong>{h.statusNovo}</strong>
                    {h.statusAnterior && <span className="text-gray-500"> (era {h.statusAnterior})</span>}
                  </p>
                  <p className="text-xs text-gray-400">{formatDate(h.criadoEm)}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Credenciais de Sistemas (SIGLA / CTF) ──────────── */}
      {(() => {
        const creds = projeto.credenciais ? (() => { try { return JSON.parse(projeto.credenciais) } catch { return {} } })() : {}
        const sistemas = Object.keys(creds)
        if (sistemas.length === 0) return null
        return (
          <div className="bg-white rounded-2xl border border-gray-100 p-4 sm:p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-gray-900">🔑 Credenciais de Sistemas</h3>
              {modoGestor && (
                <button
                  onClick={() => {
                    const s = prompt('Sistema (ex: SIGLA, CTF, IBAMA):')
                    if (s) {
                      const existing = creds[s.toUpperCase()] || {}
                      setCredForm({ login: existing.login || '', senha: existing.senha || '' })
                      setModalCredencial({ sistema: s.toUpperCase() })
                    }
                  }}
                  className="text-xs text-green-600 hover:text-green-700 font-medium"
                >
                  + Adicionar
                </button>
              )}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {sistemas.map(s => (
                <div key={s} className="bg-gray-50 rounded-xl p-3 border border-gray-100">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">{s}</span>
                    {modoGestor && (
                      <button
                        onClick={() => {
                          setCredForm({ login: creds[s].login || '', senha: creds[s].senha || '' })
                          setModalCredencial({ sistema: s })
                        }}
                        className="text-xs text-gray-400 hover:text-gray-600"
                      >
                        Editar
                      </button>
                    )}
                  </div>
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-gray-400 w-12 flex-shrink-0">Login:</span>
                      <span className="text-sm font-mono text-gray-800">{creds[s].login || '—'}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-gray-400 w-12 flex-shrink-0">Senha:</span>
                      <span className="text-sm font-mono text-gray-800">{creds[s].senha || '—'}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )
      })()}

      {/* ══════════════════════════════════════════════════════
          MODAL DE CREDENCIAIS — aparece ao concluir SIGLA/CTF
          ══════════════════════════════════════════════════════ */}
      {modalCredencial && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <div>
                <h2 className="font-bold text-gray-900">🔑 Credenciais do {modalCredencial.sistema}</h2>
                <p className="text-xs text-gray-500 mt-0.5">
                  Registre o login e senha obtidos no cadastro
                </p>
              </div>
              <button
                onClick={() => setModalCredencial(null)}
                className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg"
              >
                ✕
              </button>
            </div>

            {/* Formulário */}
            <div className="px-6 py-5 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Login / Usuário</label>
                <input
                  type="text"
                  value={credForm.login}
                  onChange={e => setCredForm(p => ({ ...p, login: e.target.value }))}
                  placeholder={`Login no sistema ${modalCredencial.sistema}`}
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Senha</label>
                <input
                  type="text"
                  value={credForm.senha}
                  onChange={e => setCredForm(p => ({ ...p, senha: e.target.value }))}
                  placeholder="Senha definida no cadastro"
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                />
              </div>
              <p className="text-xs text-amber-600 bg-amber-50 rounded-lg px-3 py-2">
                ⚠️ Essas informações ficam salvas no projeto e visíveis para toda a equipe.
              </p>
            </div>

            {/* Ações */}
            <div className="px-6 pb-5 flex gap-2">
              <button
                onClick={salvarCredencial}
                disabled={salvandoCred}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white rounded-xl text-sm font-semibold transition-colors"
              >
                {salvandoCred ? <Loader2 className="w-4 h-4 animate-spin" /> : '💾'}
                Salvar Credenciais
              </button>
              <button
                onClick={() => setModalCredencial(null)}
                className="px-5 py-2.5 border border-gray-200 text-gray-600 hover:bg-gray-50 rounded-xl text-sm font-medium"
              >
                Pular
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════
          MODAL DE PROTOCOLO — aparece ao concluir a tarefa "Protocolo"
          ══════════════════════════════════════════════════════ */}
      {modalProtocolo && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <div>
                <h2 className="font-bold text-gray-900">📋 Protocolo do Processo</h2>
                <p className="text-xs text-gray-500 mt-0.5">
                  Registre a data e o código do processo no órgão ambiental
                </p>
              </div>
              <button
                onClick={() => setModalProtocolo(false)}
                className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg"
              >
                ✕
              </button>
            </div>

            {/* Formulário */}
            <div className="px-6 py-5 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Data do Protocolo</label>
                <input
                  type="date"
                  value={protocoloForm.data}
                  max={HOJE_STR}
                  onChange={e => setProtocoloForm(p => ({ ...p, data: e.target.value }))}
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Código do Processo no Órgão</label>
                <input
                  type="text"
                  value={protocoloForm.codigoOrgao}
                  onChange={e => setProtocoloForm(p => ({ ...p, codigoOrgao: e.target.value }))}
                  placeholder="Ex: 2026.001234/SEMA"
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                />
              </div>
              <p className="text-xs text-green-700 bg-green-50 rounded-lg px-3 py-2">
                ✅ Após salvar, a data e o código do protocolo ficam registrados neste projeto.
              </p>
            </div>

            {/* Ações */}
            <div className="px-6 pb-5 flex gap-2">
              <button
                onClick={salvarProtocolo}
                disabled={salvandoProtocolo}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white rounded-xl text-sm font-semibold transition-colors"
              >
                {salvandoProtocolo ? <Loader2 className="w-4 h-4 animate-spin" /> : '💾'}
                Salvar Protocolo
              </button>
              <button
                onClick={() => setModalProtocolo(false)}
                className="px-5 py-2.5 border border-gray-200 text-gray-600 hover:bg-gray-50 rounded-xl text-sm font-medium"
              >
                Pular
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
