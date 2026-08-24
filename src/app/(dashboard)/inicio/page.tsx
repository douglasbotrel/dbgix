'use client'

import { useState, useEffect, useCallback } from 'react'
import { toast } from 'sonner'
import {
  CheckCircle2, Circle, ChevronLeft, ChevronRight, Calendar, Loader2,
  Target, Sparkles, X,
} from 'lucide-react'

// Tela pessoal e simples: só as atividades do próprio usuário logado,
// começando pelas de hoje. Reaproveita a mesma API de Tarefas da Semana
// (única fonte de verdade) — o que muda aqui é remarcado/concluído lá
// também, e vice-versa.

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

function formatDataLonga(d: Date) {
  return d.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' })
}

export default function InicioPage() {
  const [me, setMe] = useState<any>(null)
  const [semanaInicio, setSemanaInicio] = useState<Date>(segundaFeiraDaSemana(new Date()))
  const [planejadas, setPlanejadas] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [processando, setProcessando] = useState<string | null>(null)

  const [modalJustificativa, setModalJustificativa] = useState<{
    modo: 'concluir' | 'remarcar'
    itemId: string; tarefaId: string; concluidaAtual: boolean; titulo: string
    diaNovo?: number | null
  } | null>(null)
  const [textoJustificativa, setTextoJustificativa] = useState('')

  useEffect(() => {
    (async () => {
      const res = await fetch('/api/auth/me')
      if (res.ok) {
        const data = await res.json()
        setMe(data.usuario || data)
      }
    })()
  }, [])

  const carregar = useCallback(async () => {
    if (!me) return
    setLoading(true)
    try {
      // Sempre a própria semana do usuário logado — nunca de outra pessoa,
      // mesmo para quem é gestor (essa tela é só a área pessoal).
      const res = await fetch(
        `/api/tarefas-semana?usuarioId=${me.id}&semanaInicio=${semanaInicio.toISOString()}`
      )
      const data = await res.json()
      setPlanejadas(data.planejadas || [])
    } catch {
      toast.error('Erro ao carregar suas atividades')
    } finally {
      setLoading(false)
    }
  }, [me, semanaInicio])

  useEffect(() => { carregar() }, [carregar])

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
      toast.success(concluida ? 'Reaberta' : 'Concluída!')
      carregar()
    } finally {
      setProcessando(null)
    }
  }

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

  const hoje = new Date()
  const hojeDiaIdx = (() => {
    const d = hoje.getDay()
    return d === 0 ? 6 : d - 1
  })()
  const ehSemanaAtual = segundaFeiraDaSemana(new Date()).getTime() === semanaInicio.getTime()

  const totalPlanejadas = planejadas.length
  const totalConcluidas = planejadas.filter(p => p.concluida).length
  const progresso = totalPlanejadas > 0 ? Math.round((totalConcluidas / totalPlanejadas) * 100) : 0

  // Ordem começando por hoje (só faz sentido girar a semana quando é a
  // semana atual sendo exibida) e terminando em "sem dia definido".
  const ordemDias = ehSemanaAtual
    ? Array.from({ length: 7 }, (_, i) => (hojeDiaIdx + i) % 7)
    : [0, 1, 2, 3, 4, 5, 6]
  const gruposPorDia: { dia: number; itens: any[] }[] = [...ordemDias, -1]
    .map(dia => ({ dia, itens: planejadas.filter(p => (p.diaSemana ?? -1) === dia) }))
    .filter(g => g.itens.length > 0)

  const semanaFim = new Date(semanaInicio)
  semanaFim.setDate(semanaFim.getDate() + 6)

  return (
    <div className="p-4 sm:p-6 space-y-5 max-w-3xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <Sparkles className="w-6 h-6 text-green-500" />
          {me ? `Olá, ${me.nome?.split(' ')[0]}` : 'Minhas Atividades'}
        </h1>
        <p className="text-sm text-gray-500 mt-0.5 capitalize">{formatDataLonga(hoje)}</p>
      </div>

      {/* Navegação de semana */}
      <div className="flex items-center justify-between bg-white rounded-2xl border border-gray-100 p-3 shadow-sm">
        <span className="text-sm font-medium text-gray-700 flex items-center gap-1.5">
          <Calendar className="w-3.5 h-3.5 text-gray-400" />
          {formatDataCurta(semanaInicio)} – {formatDataCurta(semanaFim)}
        </span>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setSemanaInicio(d => { const n = new Date(d); n.setDate(n.getDate() - 7); return n })}
            className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          {!ehSemanaAtual && (
            <button
              onClick={() => setSemanaInicio(segundaFeiraDaSemana(new Date()))}
              className="text-xs text-green-600 font-medium hover:text-green-700"
            >
              Hoje
            </button>
          )}
          <button
            onClick={() => setSemanaInicio(d => { const n = new Date(d); n.setDate(n.getDate() + 7); return n })}
            className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500"
          >
            <ChevronRight className="w-4 h-4" />
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
      ) : planejadas.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-100 p-10 text-center shadow-sm">
          <p className="text-sm text-gray-400">
            Nada planejado para esta semana ainda.
          </p>
          <p className="text-xs text-gray-300 mt-1">
            Atividades com prazo definido em um projeto entram aqui automaticamente, ou adicione em Tarefas da Semana.
          </p>
        </div>
      ) : (
        <div className="space-y-5">
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
                {grupo.itens.map((p: any) => (
                  <div
                    key={p.id}
                    className={`rounded-xl border overflow-hidden ${
                      p.missaoDia ? 'border-amber-200 bg-amber-50/50' : p.concluida ? 'border-green-100 bg-green-50/40' : 'border-gray-100'
                    }`}
                  >
                    <div className="flex items-start gap-2 p-3">
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
                    </div>
                    {/* Pílulas de dia — Seg Ter Qua Qui Sex Sáb Dom (remarcar) */}
                    <div className="flex items-center gap-1 px-3 pb-2.5 pl-10">
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
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Justificativa da missão do dia (executou/não executou ou remarcar) */}
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
