'use client'

import { useState, useEffect, useCallback } from 'react'
import { toast } from 'sonner'
import {
  Plus, X, CheckCircle2, Circle, ChevronLeft, ChevronRight, ChevronDown,
  Calendar, Loader2, Users, TrendingUp, AlertTriangle, Star, Target
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

// Prazo de tarefa vem gravado como meia-noite UTC exata (campo de "só
// data"). Formatar com o fuso UTC evita que, num fuso atrás de UTC (ex:
// Brasil), a data exibida "ande" um dia pra trás — diferente de
// formatDataCurta acima, que formata datas já calculadas no fuso local
// (início/fim da semana), essas sim sem esse problema.
function formatPrazoCurta(d: string | Date) {
  return new Date(d).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', timeZone: 'UTC' })
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

  // Justificativa obrigatória ao executar/não executar OU ao remarcar de dia
  // a "missão do dia" — fica registrada para a análise de performance.
  const [modalJustificativa, setModalJustificativa] = useState<{
    modo: 'concluir' | 'remarcar'
    itemId: string; tarefaId: string; concluidaAtual: boolean; titulo: string
    diaNovo?: number | null
  } | null>(null)
  const [textoJustificativa, setTextoJustificativa] = useState('')

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

  // Clique numa pílula de dia: item comum remarca direto. Se já for a
  // "missão do dia", não pode remarcar direto — pede justificativa antes
  // (fica registrada para a análise de performance).
  function clicarDia(p: any, diaClicado: number) {
    if (!p.missaoDia) {
      alterarDia(p.id, p.diaSemana, diaClicado)
      return
    }
    const novoDia = p.diaSemana === diaClicado ? null : diaClicado
    setTextoJustificativa('')
    setModalJustificativa({
      modo: 'remarcar', itemId: p.id, tarefaId: p.itemId, concluidaAtual: p.concluida, titulo: p.titulo, diaNovo: novoDia,
    })
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

  // Clique no check de um item planejado: se for a "missão do dia", pede
  // justificativa (executou ou não) antes de confirmar a mudança de status.
  function clicarConcluir(p: any) {
    if (p.missaoDia) {
      setTextoJustificativa(p.justificativa || '')
      setModalJustificativa({ modo: 'concluir', itemId: p.id, tarefaId: p.itemId, concluidaAtual: p.concluida, titulo: p.titulo })
      return
    }
    marcarConcluida(p.itemId, p.concluida)
  }

  async function confirmarJustificativa() {
    if (!modalJustificativa) return
    if (!textoJustificativa.trim()) { toast.error('Descreva o motivo antes de confirmar'); return }
    setProcessando(modalJustificativa.itemId)
    try {
      if (modalJustificativa.modo === 'remarcar') {
        const res = await fetch('/api/tarefas-semana', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: modalJustificativa.itemId,
            diaSemana: modalJustificativa.diaNovo,
            justificativa: textoJustificativa.trim(),
          }),
        })
        if (!res.ok) { const err = await res.json(); toast.error(err.error || 'Erro ao remarcar'); return }
        toast.success('Missão do dia remarcada!')
        setModalJustificativa(null)
        setTextoJustificativa('')
        carregar()
        return
      }

      await fetch('/api/tarefas-semana', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: modalJustificativa.itemId, justificativa: textoJustificativa.trim() }),
      })
      const res = await fetch('/api/tarefas', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: modalJustificativa.tarefaId,
          status: modalJustificativa.concluidaAtual ? 'PENDENTE' : 'CONCLUIDA',
        }),
      })
      if (!res.ok) { toast.error('Erro ao atualizar'); return }
      toast.success('Justificativa salva!')
      setModalJustificativa(null)
      setTextoJustificativa('')
      carregar()
    } finally {
      setProcessando(null)
    }
  }

  async function alternarMissaoDia(p: any) {
    setProcessando(p.id)
    try {
      const res = await fetch('/api/tarefas-semana', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: p.id, missaoDia: !p.missaoDia }),
      })
      if (!res.ok) { const err = await res.json(); toast.error(err.error || 'Erro ao atualizar'); return }
      toast.success(p.missaoDia ? 'Missão do dia removida' : 'Marcada como missão do dia!')
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
                                        prazo {formatPrazoCurta(t.prazo)}
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
                            className={`rounded-xl border overflow-hidden ${
                              p.missaoDia ? 'border-amber-200 bg-amber-50/50' : p.concluida ? 'border-green-100 bg-green-50/40' : 'border-gray-100'
                            }`}
                          >
                            <div className="flex items-start gap-2 p-2.5">
                              <button
                                onClick={() => clicarConcluir(p)}
                                disabled={processando === p.itemId || processando === p.id}
                                className="mt-0.5 flex-shrink-0 disabled:opacity-50"
                                title={p.concluida ? 'Reabrir' : 'Marcar como concluída'}
                              >
                                {p.concluida
                                  ? <CheckCircle2 className="w-5 h-5 text-green-600" />
                                  : <Circle className="w-5 h-5 text-gray-300 hover:text-green-500" />}
                              </button>
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-1.5">
                                  {p.missaoDia && (
                                    <span className="flex items-center gap-0.5 text-[10px] font-bold text-amber-700 bg-amber-100 px-1.5 py-0.5 rounded-full flex-shrink-0">
                                      <Target className="w-2.5 h-2.5" /> MISSÃO DO DIA
                                    </span>
                                  )}
                                  <p className={`text-sm ${p.concluida ? 'text-gray-400 line-through' : 'text-gray-800'} truncate`}>
                                    {p.titulo}
                                  </p>
                                </div>
                                <p className="text-xs text-gray-400 truncate">
                                  {p.projeto?.codigo} · {p.projeto?.nome || ''}
                                </p>
                                {p.missaoDia && p.justificativa && (
                                  <p className="text-xs text-amber-700 mt-1 bg-white/70 rounded-lg px-2 py-1 border border-amber-100">
                                    "{p.justificativa}"
                                  </p>
                                )}
                              </div>
                              {(ehSemanaAtual || p.missaoDia) && (
                                <button
                                  onClick={() => alternarMissaoDia(p)}
                                  disabled={processando === p.id || !ehSemanaAtual}
                                  className={`p-1 flex-shrink-0 disabled:opacity-50 ${p.missaoDia ? 'text-amber-500 hover:text-amber-600' : 'text-gray-300 hover:text-amber-500'}`}
                                  title={
                                    p.missaoDia
                                      ? 'Remover missão do dia'
                                      : ehSemanaAtual
                                        ? 'Marcar como missão de hoje'
                                        : 'Só é possível marcar a missão do dia na semana atual'
                                  }
                                >
                                  <Star className={`w-4 h-4 ${p.missaoDia ? 'fill-amber-400' : ''}`} />
                                </button>
                              )}
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
                                  onClick={() => clicarDia(p, i)}
                                  disabled={processando === p.id}
                                  title={p.missaoDia ? `${DIAS_NOME[i]} (remarcar exige justificativa)` : DIAS_NOME[i]}
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
                      {u.missoesIndicadas > 0 && (
                        <div className="flex items-center gap-1 text-[11px] text-amber-700 mt-1">
                          <Target className="w-3 h-3" />
                          Missão do dia: {u.missoesExecutadas}/{u.missoesIndicadas} executadas ({u.taxaMissao}%)
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Justificativa da missão do dia (executou ou não executou) */}
      {modalJustificativa && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setModalJustificativa(null)}>
          <div className="bg-white rounded-2xl max-w-md w-full" onClick={e => e.stopPropagation()}>
            <div className="p-5 border-b border-gray-100 flex items-center justify-between">
              <div>
                <h3 className="font-semibold text-gray-900 flex items-center gap-2">
                  <Target className="w-4 h-4 text-amber-500" />
                  {modalJustificativa.modo === 'remarcar' ? 'Remarcar missão do dia' : 'Missão do dia'}
                </h3>
                <p className="text-xs text-gray-400 mt-0.5 truncate max-w-xs">{modalJustificativa.titulo}</p>
              </div>
              <button onClick={() => setModalJustificativa(null)} className="text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-5 space-y-3">
              <p className="text-sm text-gray-600">
                {modalJustificativa.modo === 'remarcar'
                  ? 'A missão do dia não pode ser simplesmente remarcada — descreva o motivo da mudança de dia (fica registrado para a análise de performance):'
                  : modalJustificativa.concluidaAtual
                    ? 'Você está reabrindo esta missão do dia. Descreva o motivo:'
                    : 'Antes de marcar como concluída, descreva como foi a execução (ou o motivo, caso não tenha sido concluída):'}
              </p>
              <textarea
                value={textoJustificativa}
                onChange={e => setTextoJustificativa(e.target.value)}
                autoFocus
                rows={3}
                placeholder="Justificativa..."
                className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
              />
              <div className="flex justify-end gap-3 pt-1">
                <button onClick={() => setModalJustificativa(null)}
                  className="px-4 py-2 border border-gray-200 rounded-xl text-sm text-gray-700 hover:bg-gray-50">
                  Cancelar
                </button>
                <button onClick={confirmarJustificativa} disabled={processando === modalJustificativa.itemId}
                  className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-xl text-sm font-semibold flex items-center gap-2">
                  {processando === modalJustificativa.itemId && <Loader2 className="w-4 h-4 animate-spin" />}
                  Confirmar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
