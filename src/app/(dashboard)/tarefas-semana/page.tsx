'use client'

import { useState, useEffect, useCallback } from 'react'
import { toast } from 'sonner'
import {
  Plus, X, CheckCircle2, Circle, ChevronLeft, ChevronRight, ChevronDown,
  Calendar, Loader2, Users, TrendingUp, AlertTriangle
} from 'lucide-react'

const ROLES_GESTAO = ['ADMIN', 'GESTOR_GERAL', 'GESTOR_OPERACIONAL', 'GESTOR_ADMINISTRATIVO', 'SUPERVISOR']

const DIAS_LETRA = ['S', 'T', 'Q', 'Q', 'S', 'S', 'D']
const DIAS_NOME  = ['Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado', 'Domingo']
const DIAS_COR   = [
  'bg-indigo-500', 'bg-blue-500', 'bg-cyan-500', 'bg-teal-500',
  'bg-emerald-500', 'bg-amber-500', 'bg-rose-500',
]

function segundaFeiraDaSemana(data: Date): Date {
  const d = new Date(data)
  const dia = d.getDay()
  const diff = dia === 0 ? -6 : 1 - dia
  d.setDate(d.getDate() + diff)
  d.setHours(0, 0, 0, 0)
  return d
}

function formatDataCurta(d: string | Date) {
  return new Date(d).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
}

function agruparPorProjeto(lista: any[]) {
  const grupos = new Map<string, { projeto: any; itens: any[] }>()
  for (const t of lista) {
    const pid = t.projeto?.id || 'sem-projeto'
    if (!grupos.has(pid)) grupos.set(pid, { projeto: t.projeto, itens: [] })
    grupos.get(pid)!.itens.push(t)
  }
  return Array.from(grupos.values()).sort((a, b) =>
    (a.projeto?.codigo || '').localeCompare(b.projeto?.codigo || '')
  )
}

function corUrgencia(prazo: string | null | undefined): { barra: string; texto: string } {
  if (!prazo) return { barra: 'bg-gray-200', texto: 'text-gray-400' }
  const dias = Math.floor((new Date(prazo).getTime() - Date.now()) / 86_400_000)
  if (dias < 0) return { barra: 'bg-red-500', texto: 'text-red-600' }
  if (dias <= 2) return { barra: 'bg-amber-500', texto: 'text-amber-600' }
  return { barra: 'bg-emerald-400', texto: 'text-gray-400' }
}

export default function TarefasSemanaPage() {
  const [me, setMe] = useState<any>(null)
  const [usuarios, setUsuarios] = useState<any[]>([])
  const [usuarioId, setUsuarioId] = useState<string>('')
  const [semanaInicio, setSemanaInicio] = useState<Date>(segundaFeiraDaSemana(new Date()))

  const [backlog, setBacklog] = useState<any[]>([])
  const [planejadas, setPlanejadas] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [processando, setProcessando] = useState<string | null>(null)

  const [verPainelEquipe, setVerPainelEquipe] = useState(false)
  const [kpi, setKpi] = useState<any>(null)
  const [carregandoKpi, setCarregandoKpi] = useState(false)
  const [colapsados, setColapsados] = useState<Record<string, boolean>>({})

  const podeGerenciarEquipe = me && ROLES_GESTAO.includes(me.role)

  const carregar = useCallback(async () => {
    if (!usuarioId) return
    setLoading(true)
    try {
      const res = await fetch(
        `/api/tarefas-semana?usuarioId=${usuarioId}&semanaInicio=${semanaInicio.toISOString()}`
      )
      const data = await res.json()
      setBacklog(data.backlog || [])
      setPlanejadas(data.planejadas || [])
    } catch {
      toast.error('Erro ao carregar tarefas')
    } finally {
      setLoading(false)
    }
  }, [usuarioId, semanaInicio])

  useEffect(() => {
    (async () => {
      const res = await fetch('/api/auth/me')
      if (res.ok) {
        const data = await res.json()
        setMe(data.usuario || data)
        setUsuarioId((data.usuario || data).id)
      }
    })()
  }, [])

  useEffect(() => {
    if (!podeGerenciarEquipe) return
    fetch('/api/usuarios?ativo=true')
      .then(r => r.json())
      .then(d => setUsuarios(d.usuarios || []))
      .catch(() => {})
  }, [podeGerenciarEquipe])

  useEffect(() => { carregar() }, [carregar])

  async function adicionarNaSemana(itemId: string) {
    setProcessando(itemId)
    try {
      const res = await fetch('/api/tarefas-semana', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ itemId, usuarioId, semanaInicio: semanaInicio.toISOString() }),
      })
      if (!res.ok) { toast.error('Erro ao adicionar'); return }
      carregar()
    } finally {
      setProcessando(null)
    }
  }

  async function removerDaSemana(itemId: string) {
    setProcessando(itemId)
    try {
      const res = await fetch(`/api/tarefas-semana?id=${itemId}`, { method: 'DELETE' })
      if (!res.ok) { toast.error('Erro ao remover'); return }
      carregar()
    } finally {
      setProcessando(null)
    }
  }

  async function alterarDia(itemId: string, diaAtual: number | null, diaClicado: number) {
    setProcessando(itemId)
    try {
      const novoDia = diaAtual === diaClicado ? null : diaClicado
      const res = await fetch('/api/tarefas-semana', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: itemId, diaSemana: novoDia }),
      })
      if (!res.ok) { toast.error('Erro ao definir o dia'); return }
      carregar()
    } finally {
      setProcessando(null)
    }
  }

  async function marcarConcluida(itemId: string, concluida: boolean) {
    setProcessando(itemId)
    try {
      const res = await fetch('/api/tarefas', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: itemId, status: concluida ? 'PENDENTE' : 'CONCLUIDA' }),
      })
      if (!res.ok) { toast.error('Erro ao atualizar'); return }
      toast.success(concluida ? 'Reaberta' : 'Concluída! Também atualizado no Operacional.')
      carregar()
    } finally {
      setProcessando(null)
    }
  }

  async function abrirPainelEquipe() {
    setVerPainelEquipe(true)
    setCarregandoKpi(true)
    try {
      const res = await fetch('/api/tarefas-semana/kpi?semanas=4')
      const data = await res.json()
      setKpi(data)
    } finally {
      setCarregandoKpi(false)
    }
  }

  const totalPlanejadas = planejadas.length
  const totalConcluidas = planejadas.filter(p => p.concluida).length
  const progresso = totalPlanejadas > 0 ? Math.round((totalConcluidas / totalPlanejadas) * 100) : 0

  const semanaFim = new Date(semanaInicio)
  semanaFim.setDate(semanaFim.getDate() + 6)

  const hojeDiaIdx = (() => {
    const d = new Date().getDay()
    return d === 0 ? 6 : d - 1
  })()
  const ehSemanaAtual = segundaFeiraDaSemana(new Date()).getTime() === semanaInicio.getTime()

  // Agrupa planejadas por dia (0-6) + "sem dia" (-1), na ordem certa
  const gruposPorDia: { dia: number; itens: any[] }[] = [-1, 0, 1, 2, 3, 4, 5, 6].map(dia => ({
    dia,
    itens: planejadas.filter(p => (p.diaSemana ?? -1) === dia),
  })).filter(g => g.itens.length > 0)

  return (
    <div className="p-4 sm:p-6 space-y-5 max-w-7xl mx-auto">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Tarefas da Semana</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Escolha o que você vai fazer, defina o dia, e marque conforme for concluindo.
          </p>
        </div>
        {podeGerenciarEquipe && (
          <button
            onClick={abrirPainelEquipe}
            className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 rounded-xl text-sm font-medium text-gray-700 hover:bg-gray-50 shadow-sm"
          >
            <Users className="w-4 h-4" /> Painel da Equipe
          </button>
        )}
      </div>

      {/* Seletor de usuário (gestores) + navegação de semana */}
      <div className="flex items-center justify-between flex-wrap gap-3 bg-white rounded-2xl border border-gray-100 p-3 shadow-sm">
        {podeGerenciarEquipe ? (
          <select
            value={usuarioId}
            onChange={e => setUsuarioId(e.target.value)}
            className="px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white"
          >
            {me && <option value={me.id}>Minhas tarefas ({me.nome})</option>}
            {usuarios.filter(u => u.id !== me?.id).map(u => (
              <option key={u.id} value={u.id}>{u.nome}</option>
            ))}
          </select>
        ) : <div />}

        <div className="flex items-center gap-2">
          <button
            onClick={() => setSemanaInicio(d => { const n = new Date(d); n.setDate(n.getDate() - 7); return n })}
            className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="text-sm font-medium text-gray-700 flex items-center gap-1.5">
            <Calendar className="w-3.5 h-3.5 text-gray-400" />
            {formatDataCurta(semanaInicio)} – {formatDataCurta(semanaFim)}
          </span>
          <button
            onClick={() => setSemanaInicio(d => { const n = new Date(d); n.setDate(n.getDate() + 7); return n })}
            className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
          <button
            onClick={() => setSemanaInicio(segundaFeiraDaSemana(new Date()))}
            className="text-xs text-green-600 font-medium hover:text-green-700 ml-1"
          >
            Hoje
          </button>
        </div>
      </div>

      {/* Progresso da semana */}
      {totalPlanejadas > 0 && (
        <div className="bg-white rounded-2xl border border-gray-100 p-4 shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-gray-700">Progresso da semana</span>
            <span className="text-sm text-gray-500">{totalConcluidas} de {totalPlanejadas} concluídas</span>
          </div>
          <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-green-400 to-green-600 transition-all duration-500"
              style={{ width: `${progresso}%` }}
            />
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-gray-300" /></div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {/* Backlog */}
          <div className="bg-white rounded-2xl border border-gray-100 p-4 shadow-sm">
            <h2 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-1.5">
              Minhas tarefas pendentes
              <span className="text-xs font-normal text-gray-400">({backlog.length})</span>
            </h2>
            {backlog.length === 0 ? (
              <p className="text-sm text-gray-400 py-6 text-center">Nenhuma tarefa pendente fora da semana.</p>
            ) : (
              <div>
                {agruparPorProjeto(backlog).map(grupo => {
                  const pid = grupo.projeto?.id || 'sem-projeto'
                  const fechado = colapsados[pid]
                  return (
                    <div key={pid} className="mb-3 last:mb-0">
                      <button
                        onClick={() => setColapsados(p => ({ ...p, [pid]: !p[pid] }))}
                        className="w-full flex items-center justify-between py-1.5 px-0.5 text-left"
                      >
                        <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide truncate">
                          {grupo.projeto?.codigo || 'Sem projeto'}
                          {grupo.projeto?.nome && ` · ${grupo.projeto.nome}`}
                          <span className="ml-1.5 text-gray-300 font-normal normal-case">({grupo.itens.length})</span>
                        </span>
                        {fechado
                          ? <ChevronRight className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                          : <ChevronDown className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />}
                      </button>
                      {!fechado && (
                        <div className="space-y-1.5 mt-1">
                          {grupo.itens.map((t: any) => {
                            const urg = corUrgencia(t.prazo)
                            return (
                              <div
                                key={t.id}
                                className="flex items-stretch gap-0 rounded-xl border border-gray-100 hover:border-gray-200 hover:shadow-sm transition-all overflow-hidden"
                              >
                                <div className={`w-1 flex-shrink-0 ${urg.barra}`} />
                                <div className="flex items-start gap-2 p-2.5 flex-1 min-w-0">
                                  <button
                                    onClick={() => adicionarNaSemana(t.id)}
                                    disabled={processando === t.id}
                                    className="mt-0.5 p-1 rounded-md bg-green-50 text-green-600 hover:bg-green-100 flex-shrink-0 disabled:opacity-50"
                                    title="Colocar nesta semana"
                                  >
                                    {processando === t.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                                  </button>
                                  <div className="min-w-0 flex-1">
                                    <div className="flex items-center gap-1.5">
                                      <p className="text-sm text-gray-800 truncate">{t.titulo}</p>
                                    </div>
                                    {t.prazo && (
                                      <p className={`text-xs truncate flex items-center gap-1 ${urg.texto}`}>
                                        {urg.texto === 'text-red-600' && <AlertTriangle className="w-3 h-3" />}
                                        prazo {formatDataCurta(t.prazo)}
                                      </p>
                                    )}
                                  </div>
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* Esta semana — agrupado por dia, estilo Bitrix */}
          <div className="bg-white rounded-2xl border border-gray-100 p-4 shadow-sm">
            <h2 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-1.5">
              Planejado para esta semana
              <span className="text-xs font-normal text-gray-400">({planejadas.length})</span>
            </h2>
            {planejadas.length === 0 ? (
              <p className="text-sm text-gray-400 py-6 text-center">
                Nada planejado ainda — adicione tarefas do lado esquerdo.
              </p>
            ) : (
              <div className="space-y-4">
                {gruposPorDia.map(grupo => (
                  <div key={grupo.dia}>
                    <div className="flex items-center gap-2 mb-1.5">
                      {grupo.dia >= 0 ? (
                        <>
                          <span className={`w-2 h-2 rounded-full ${DIAS_COR[grupo.dia]}`} />
                          <span className="text-xs font-semibold text-gray-600">
                            {DIAS_NOME[grupo.dia]}
                          </span>
                          {ehSemanaAtual && grupo.dia === hojeDiaIdx && (
                            <span className="text-[10px] bg-green-100 text-green-700 font-semibold px-1.5 py-0.5 rounded-full">HOJE</span>
                          )}
                        </>
                      ) : (
                        <span className="text-xs font-semibold text-gray-400">Sem dia definido</span>
                      )}
                    </div>
                    <div className="space-y-1.5">
                      {grupo.itens.map((p: any) => {
                        return (
                          <div
                            key={p.id}
                            className={`rounded-xl border overflow-hidden ${p.concluida ? 'border-green-100 bg-green-50/40' : 'border-gray-100'}`}
                          >
                            <div className="flex items-start gap-2 p-2.5">
                              <button
                                onClick={() => marcarConcluida(p.itemId, p.concluida)}
                                disabled={processando === p.itemId}
                                className="mt-0.5 flex-shrink-0 disabled:opacity-50"
                                title={p.concluida ? 'Reabrir' : 'Marcar como concluída'}
                              >
                                {p.concluida
                                  ? <CheckCircle2 className="w-5 h-5 text-green-600" />
                                  : <Circle className="w-5 h-5 text-gray-300 hover:text-green-500" />}
                              </button>
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-1.5">
                                  <p className={`text-sm ${p.concluida ? 'text-gray-400 line-through' : 'text-gray-800'} truncate`}>
                                    {p.titulo}
                                  </p>
                                </div>
                                <p className="text-xs text-gray-400 truncate">
                                  {p.projeto?.codigo} · {p.projeto?.nome || ''}
                                </p>
                              </div>
                              <button
                                onClick={() => removerDaSemana(p.id)}
                                disabled={processando === p.id}
                                className="p-1 text-gray-300 hover:text-red-500 flex-shrink-0"
                                title="Tirar da semana"
                              >
                                <X className="w-3.5 h-3.5" />
                              </button>
                            </div>
                            {/* Pílulas de dia — Seg Ter Qua Qui Sex Sáb Dom */}
                            <div className="flex items-center gap-1 px-2.5 pb-2 pl-9">
                              {DIAS_LETRA.map((letra, i) => (
                                <button
                                  key={i}
                                  onClick={() => alterarDia(p.id, p.diaSemana, i)}
                                  disabled={processando === p.id}
                                  title={DIAS_NOME[i]}
                                  className={`w-5 h-5 rounded-md text-[10px] font-bold flex items-center justify-center transition-colors disabled:opacity-50 ${
                                    p.diaSemana === i
                                      ? `${DIAS_COR[i]} text-white`
                                      : 'bg-gray-100 text-gray-400 hover:bg-gray-200'
                                  }`}
                                >
                                  {letra}
                                </button>
                              ))}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Painel da equipe (gestores) */}
      {verPainelEquipe && podeGerenciarEquipe && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setVerPainelEquipe(false)}>
          <div className="bg-white rounded-2xl max-w-lg w-full max-h-[80vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="p-5 border-b border-gray-100 flex items-center justify-between">
              <div>
                <h3 className="font-semibold text-gray-900 flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-green-600" /> Cumprimento semanal — últimas 4 semanas
                </h3>
                <p className="text-xs text-gray-400 mt-0.5">% do que cada um planejou e realmente concluiu</p>
              </div>
              <button onClick={() => setVerPainelEquipe(false)} className="text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-5">
              {carregandoKpi ? (
                <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-gray-300" /></div>
              ) : !kpi?.usuarios?.length ? (
                <p className="text-sm text-gray-400 text-center py-8">Ainda sem dados suficientes.</p>
              ) : (
                <div className="space-y-3">
                  {kpi.usuarios.map((u: any) => (
                    <div key={u.usuarioId}>
                      <div className="flex items-center justify-between text-sm mb-1">
                        <span className="font-medium text-gray-800">{u.nome}</span>
                        <span className="text-gray-500">{u.concluidas}/{u.planejadas} · {u.taxa}%</span>
                      </div>
                      <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                        <div
                          className={`h-full ${u.taxa >= 70 ? 'bg-green-500' : u.taxa >= 40 ? 'bg-amber-500' : 'bg-red-400'}`}
                          style={{ width: `${u.taxa}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
