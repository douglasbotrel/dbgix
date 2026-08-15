'use client'

import { useState, useEffect, useCallback } from 'react'
import { toast } from 'sonner'
import { RefreshCw, Loader2, Target, Zap, ClipboardCheck, AlertTriangle, ShieldCheck } from 'lucide-react'
import { ROLE_LABELS } from '@/lib/utils'

const OPCOES_PERIODO = [
  { semanas: 4,  label: 'Últimas 4 semanas' },
  { semanas: 8,  label: 'Últimas 8 semanas' },
  { semanas: 12, label: 'Últimas 12 semanas' },
  { semanas: 26, label: 'Últimos 6 meses' },
]

function corTaxa(taxa: number) {
  if (taxa >= 70) return 'bg-green-500'
  if (taxa >= 40) return 'bg-amber-500'
  return 'bg-red-400'
}

export default function GestaoPessoasPage() {
  const [semanas, setSemanas] = useState(8)
  const [dados, setDados] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [atualizando, setAtualizando] = useState(false)
  const [semPermissao, setSemPermissao] = useState(false)

  const carregar = useCallback(async () => {
    setAtualizando(true)
    try {
      const res = await fetch(`/api/gestao-pessoas?semanas=${semanas}`)
      if (res.status === 403) { setSemPermissao(true); return }
      if (!res.ok) { toast.error('Erro ao carregar dados'); return }
      setDados(await res.json())
      setSemPermissao(false)
    } catch {
      toast.error('Erro ao carregar dados')
    } finally {
      setLoading(false)
      setAtualizando(false)
    }
  }, [semanas])

  useEffect(() => { carregar() }, [carregar])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-4 border-green-600 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (semPermissao) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-400 text-sm">
        Gestão de Pessoas disponível apenas para perfis de gestão.
      </div>
    )
  }

  const pessoas = dados?.pessoas ?? []

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Gestão de Pessoas</h1>
          <p className="text-gray-500 text-sm mt-1">
            Eficiência, agilidade, missão do dia e qualidade de entrega por pessoa
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={semanas}
            onChange={e => setSemanas(Number(e.target.value))}
            className="px-3 py-2 border border-gray-200 rounded-xl text-sm bg-white"
          >
            {OPCOES_PERIODO.map(o => (
              <option key={o.semanas} value={o.semanas}>{o.label}</option>
            ))}
          </select>
          <button
            onClick={carregar}
            disabled={atualizando}
            className="flex items-center gap-2 px-4 py-2 border border-gray-200 rounded-xl text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors"
          >
            <RefreshCw className={`w-4 h-4 ${atualizando ? 'animate-spin' : ''}`} />
            Atualizar
          </button>
        </div>
      </div>

      {pessoas.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-100 p-10 text-center text-gray-400 text-sm">
          Nenhum dado no período selecionado ainda.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {pessoas.map((p: any) => (
            <div key={p.usuarioId} className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm space-y-4">
              <div>
                <p className="font-semibold text-gray-900">{p.nome}</p>
                <p className="text-xs text-gray-400">{p.cargo || ROLE_LABELS[p.role] || p.role}</p>
              </div>

              {/* Eficiência — cumprimento do planejamento semanal */}
              <div>
                <div className="flex items-center justify-between text-xs mb-1">
                  <span className="font-medium text-gray-600 flex items-center gap-1">
                    <ClipboardCheck className="w-3.5 h-3.5 text-gray-400" /> Eficiência (cumprimento)
                  </span>
                  <span className="text-gray-500">
                    {p.planejadasConcluidas}/{p.planejadas} · {p.taxaCumprimento}%
                  </span>
                </div>
                <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                  <div className={`h-full ${corTaxa(p.taxaCumprimento)}`} style={{ width: `${p.taxaCumprimento}%` }} />
                </div>
              </div>

              {/* Missão do dia */}
              <div>
                <div className="flex items-center justify-between text-xs mb-1">
                  <span className="font-medium text-gray-600 flex items-center gap-1">
                    <Target className="w-3.5 h-3.5 text-amber-500" /> Missão do dia
                  </span>
                  <span className="text-gray-500">
                    {p.missoesExecutadas}/{p.missoesIndicadas} · {p.taxaMissao}%
                  </span>
                </div>
                <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                  <div className="h-full bg-amber-400" style={{ width: `${p.taxaMissao}%` }} />
                </div>
              </div>

              {/* Grid de números */}
              <div className="grid grid-cols-2 gap-3 pt-1">
                <div className="bg-gray-50 rounded-xl p-2.5">
                  <p className="text-lg font-bold text-gray-900">{p.atividadesExecutadas}</p>
                  <p className="text-[11px] text-gray-400">Atividades executadas</p>
                </div>
                <div className="bg-gray-50 rounded-xl p-2.5">
                  <p className="text-lg font-bold text-gray-900 flex items-center gap-1">
                    <Zap className="w-3.5 h-3.5 text-blue-500" />
                    {p.agilidadeDias !== null ? `${p.agilidadeDias}d` : '—'}
                  </p>
                  <p className="text-[11px] text-gray-400">Agilidade média</p>
                </div>
                <div className="bg-gray-50 rounded-xl p-2.5">
                  <p className={`text-lg font-bold flex items-center gap-1 ${p.atrasadas > 0 ? 'text-red-500' : 'text-gray-900'}`}>
                    {p.atrasadas > 0 && <AlertTriangle className="w-3.5 h-3.5" />}
                    {p.atrasadas}
                  </p>
                  <p className="text-[11px] text-gray-400">Tarefas atrasadas</p>
                </div>
                <div className="bg-gray-50 rounded-xl p-2.5">
                  <p className="text-lg font-bold text-gray-900 flex items-center gap-1">
                    <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
                    {p.missoesIndicadas > 0 ? `${p.taxaJustificativa}%` : '—'}
                  </p>
                  <p className="text-[11px] text-gray-400">Justificativas registradas</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
