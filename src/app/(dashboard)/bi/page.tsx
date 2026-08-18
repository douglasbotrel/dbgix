'use client'

import { useState, useEffect } from 'react'
import { toast } from 'sonner'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  LineChart, Line, PieChart, Pie, Cell,
} from 'recharts'
import { RefreshCw } from 'lucide-react'
import { ETAPA_LABELS } from '@/lib/utils'

const CORES = [
  '#22c55e', '#3b82f6', '#8b5cf6', '#f59e0b', '#ef4444',
  '#06b6d4', '#ec4899', '#84cc16', '#f43f5e', '#0ea5e9', '#a855f7', '#f97316',
]

export default function BIPage() {
  const [dadosDash, setDadosDash]     = useState<any>(null)
  const [dadosBi, setDadosBi]         = useState<any>(null)
  const [loading, setLoading]         = useState(true)
  const [atualizando, setAtualizando] = useState(false)

  async function load() {
    setAtualizando(true)
    try {
      const [resDash, resBi] = await Promise.all([
        fetch('/api/dashboard'),
        fetch('/api/bi'),
      ])
      if (resDash.ok) setDadosDash(await resDash.json())
      if (resBi.ok)   setDadosBi(await resBi.json())
    } catch {
      toast.error('Erro ao carregar dados')
    } finally {
      setLoading(false)
      setAtualizando(false)
    }
  }

  useEffect(() => { load() }, [])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-4 border-green-600 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (!dadosDash || dadosDash.tipoView !== 'gestor') {
    return (
      <div className="flex items-center justify-center h-64 text-gray-400 text-sm">
        BI / Relatórios disponível apenas para perfis de gestão.
      </div>
    )
  }

  const { estatisticas, porEtapa, evolucaoMensal } = dadosDash

  const pieData = (porEtapa || [])
    .filter((p: any) => p.count > 0)
    .map((p: any, i: number) => ({
      name:  ETAPA_LABELS[p.etapa] || p.etapa,
      value: p.count,
      color: CORES[i % CORES.length],
    }))

  const porStatusOperacional  = dadosBi?.porStatusOperacional  ?? []
  const tempos                = dadosBi?.tempos                ?? {}

  const totalProjetos = estatisticas.novos + estatisticas.andamento + estatisticas.concluidos

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">BI / Relatórios</h1>
          <p className="text-gray-500 text-sm mt-1">Análise gerencial e indicadores de desempenho</p>
        </div>
        <button
          onClick={load}
          disabled={atualizando}
          className="flex items-center gap-2 px-4 py-2 border border-gray-200 rounded-xl text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors"
        >
          <RefreshCw className={`w-4 h-4 ${atualizando ? 'animate-spin' : ''}`} />
          Atualizar
        </button>
      </div>

      {/* KPIs de projetos e tarefas */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Projetos Novos',        value: estatisticas.novos      ?? 0, color: 'bg-blue-600' },
          { label: 'Em Execução',           value: estatisticas.andamento  ?? 0, color: 'bg-green-600' },
          { label: 'Concluídos',            value: estatisticas.concluidos ?? 0, color: 'bg-purple-600' },
          { label: 'Tarefas Atrasadas',     value: estatisticas.tarefasAtrasadas ?? 0, color: 'bg-red-600' },
        ].map((kpi) => (
          <div key={kpi.label} className="bg-white rounded-2xl border border-gray-100 p-5">
            <div className={`w-1.5 h-8 ${kpi.color} rounded-full mb-3`} />
            <p className="text-3xl font-bold text-gray-900">{kpi.value}</p>
            <p className="text-xs text-gray-400 mt-1">{kpi.label}</p>
          </div>
        ))}
      </div>

      {/* Tempos Médios do fluxo operacional */}
      <div>
        <div className="mb-3">
          <h3 className="font-semibold text-gray-900">Tempos Médios</h3>
          <p className="text-xs text-gray-400 mt-0.5">Quanto tempo cada etapa da operação está levando, em média</p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-white rounded-2xl border border-gray-100 p-5">
            <div className="w-1.5 h-8 bg-indigo-500 rounded-full mb-3" />
            <p className="text-3xl font-bold text-gray-900">
              {tempos.protocoloDias != null ? `${tempos.protocoloDias}` : '—'}
              {tempos.protocoloDias != null && <span className="text-base font-medium text-gray-400"> dias</span>}
            </p>
            <p className="text-xs text-gray-400 mt-1">
              Tempo médio até o Protocolo (início da execução até o protocolo no órgão)
            </p>
            <p className="text-[11px] text-gray-300 mt-1">
              {tempos.protocoloAmostra ?? 0} projeto(s) considerado(s)
            </p>
          </div>
          <div className="bg-white rounded-2xl border border-gray-100 p-5">
            <div className="w-1.5 h-8 bg-emerald-500 rounded-full mb-3" />
            <p className="text-3xl font-bold text-gray-900">
              {tempos.conclusaoDias != null ? `${tempos.conclusaoDias}` : '—'}
              {tempos.conclusaoDias != null && <span className="text-base font-medium text-gray-400"> dias</span>}
            </p>
            <p className="text-xs text-gray-400 mt-1">
              Tempo médio até a Conclusão (entrada do projeto até o encerramento)
            </p>
            <p className="text-[11px] text-gray-300 mt-1">
              {tempos.conclusaoAmostra ?? 0} projeto(s) considerado(s)
            </p>
          </div>
          <div className="bg-white rounded-2xl border border-gray-100 p-5">
            <div className="w-1.5 h-8 bg-amber-500 rounded-full mb-3" />
            <p className="text-3xl font-bold text-gray-900">
              {tempos.tarefaDias != null ? `${tempos.tarefaDias}` : '—'}
              {tempos.tarefaDias != null && <span className="text-base font-medium text-gray-400"> dias</span>}
            </p>
            <p className="text-xs text-gray-400 mt-1">
              Tempo médio de execução de tarefa (criação até conclusão)
            </p>
            <p className="text-[11px] text-gray-300 mt-1">
              {tempos.tarefaAmostra ?? 0} tarefa(s) concluída(s)
            </p>
          </div>
        </div>
      </div>

      {/* Gráficos */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* Evolução de novos projetos */}
        <div className="bg-white rounded-2xl border border-gray-100 p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-gray-900">Novos Projetos por Mês</h3>
            <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">Últimos 6 meses</span>
          </div>
          <ResponsiveContainer width="100%" height={240}>
            <LineChart data={evolucaoMensal || []} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="mes" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} allowDecimals={false} />
              <Tooltip />
              <Line
                type="monotone"
                dataKey="projetos"
                stroke="#22c55e"
                strokeWidth={3}
                dot={{ r: 4, fill: '#22c55e' }}
                name="Projetos"
              />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* Status dos projetos no pipeline (pizza) */}
        <div className="bg-white rounded-2xl border border-gray-100 p-6">
          <h3 className="font-semibold text-gray-900 mb-4">Projetos por Etapa</h3>
          {pieData.length > 0 ? (
            <>
              <ResponsiveContainer width="100%" height={180}>
                <PieChart>
                  <Pie data={pieData} cx="50%" cy="50%" outerRadius={70} dataKey="value">
                    {pieData.map((entry: any, i: number) => (
                      <Cell key={i} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(v: any) => [v, 'Projetos']} />
                </PieChart>
              </ResponsiveContainer>
              <div className="grid grid-cols-2 gap-1.5 mt-2">
                {pieData.map((entry: any, i: number) => (
                  <div key={i} className="flex items-center gap-1.5">
                    <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: entry.color }} />
                    <span className="text-xs text-gray-600 truncate">{entry.name}: <strong>{entry.value}</strong></span>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className="flex items-center justify-center h-40 text-gray-400 text-sm">Sem dados</div>
          )}
        </div>

        {/* Status operacional dos projetos */}
        <div className="bg-white rounded-2xl border border-gray-100 p-6">
          <h3 className="font-semibold text-gray-900 mb-4">Status Operacional</h3>
          {porStatusOperacional.length === 0 ? (
            <div className="flex items-center justify-center h-40 text-gray-400 text-sm">Sem dados</div>
          ) : (
            <div className="space-y-3">
              {porStatusOperacional.map((item: any, i: number) => {
                const totalGeral = porStatusOperacional.reduce((s: number, p: any) => s + p.count, 0)
                const pct = totalGeral > 0 ? (item.count / totalGeral) * 100 : 0
                return (
                  <div key={i}>
                    <div className="flex justify-between text-sm mb-1">
                      <span className="text-gray-600 font-medium">{item.status}</span>
                      <span className="text-gray-900 font-semibold">{item.count}</span>
                    </div>
                    <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-700"
                        style={{ width: `${pct}%`, backgroundColor: CORES[i % CORES.length] }}
                      />
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

      </div>

      {/* Indicadores operacionais */}
      <div className="bg-white rounded-2xl border border-gray-100 p-6">
        <h3 className="font-semibold text-gray-900 mb-4">Indicadores Operacionais</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          {[
            {
              label: 'Taxa de Conclusão',
              value: totalProjetos > 0
                ? `${Math.round((estatisticas.concluidos / totalProjetos) * 100)}%`
                : '0%',
              pct: totalProjetos > 0 ? (estatisticas.concluidos / totalProjetos) * 100 : 0,
              color: 'bg-green-500',
              sub: `${estatisticas.concluidos} de ${totalProjetos} projetos`,
            },
            {
              label: 'Eficiência de Tarefas',
              value: `${estatisticas.taxaEficiencia ?? 0}%`,
              pct: estatisticas.taxaEficiencia ?? 0,
              color: 'bg-blue-500',
              sub: `${estatisticas.tarefasConcluidasMes ?? 0} tarefa(s) concluída(s) este mês`,
            },
          ].map((ind) => (
            <div key={ind.label}>
              <div className="flex justify-between text-sm mb-1.5">
                <span className="text-gray-600 font-medium">{ind.label}</span>
                <span className="font-bold text-gray-900">{ind.value}</span>
              </div>
              <div className="h-2.5 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className={`h-full ${ind.color} rounded-full transition-all duration-700`}
                  style={{ width: `${Math.min(ind.pct, 100)}%` }}
                />
              </div>
              <p className="text-xs text-gray-400 mt-1">{ind.sub}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
