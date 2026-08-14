'use client'

import { useState, useEffect } from 'react'
import { toast } from 'sonner'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from 'recharts'
import { Briefcase, TrendingUp, AlertTriangle, Clock, CheckCircle } from 'lucide-react'
import { formatDate, ETAPA_LABELS } from '@/lib/utils'
import Link from 'next/link'

const ETAPA_CORES: Record<string, string> = {
  OPERACIONAL: '#6366f1',
  EM_EXECUCAO: '#22c55e',
  CONCLUIDO:   '#16a34a',
  CANCELADO:   '#ef4444',
}

const ETAPA_BADGES: Record<string, string> = {
  OPERACIONAL: 'bg-indigo-100 text-indigo-800',
  EM_EXECUCAO: 'bg-green-100 text-green-800',
  CONCLUIDO:   'bg-green-200 text-green-900',
  CANCELADO:   'bg-red-100 text-red-800',
}

const ETAPAS_PIPELINE = ['OPERACIONAL', 'EM_EXECUCAO', 'CONCLUIDO']

// ─── Views por perfil ──────────────────────────────────────────

function ViewAnalista({ dados }: { dados: any }) {
  const { estatisticas, projetos, minhasTarefas } = dados
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Minha Área — Operacional</h1>
        <p className="text-gray-500 text-sm mt-1">Projetos e atividades sob sua responsabilidade</p>
      </div>
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Projetos Ativos', value: estatisticas.ativos, cor: 'bg-blue-100 text-blue-700', icon: Briefcase },
          { label: 'Tarefas Pendentes', value: estatisticas.tarefasPendentes, cor: 'bg-yellow-100 text-yellow-700', icon: Clock },
          { label: 'Concluídos', value: estatisticas.concluidos, cor: 'bg-green-100 text-green-700', icon: CheckCircle },
        ].map((card) => {
          const Icon = card.icon
          return (
            <div key={card.label} className="bg-white rounded-2xl border border-gray-100 p-5 flex items-center gap-4">
              <div className={`w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 ${card.cor}`}>
                <Icon className="w-6 h-6" />
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-900">{card.value}</p>
                <p className="text-xs text-gray-500 mt-0.5">{card.label}</p>
              </div>
            </div>
          )
        })}
      </div>

      {minhasTarefas?.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-100">
          <div className="px-6 py-4 border-b border-gray-100">
            <h3 className="font-semibold text-gray-900">Minhas Atividades</h3>
            <p className="text-xs text-gray-400 mt-0.5">Tarefas que foram atribuídas a você</p>
          </div>
          <div className="divide-y divide-gray-50">
            {minhasTarefas.map((t: any) => {
              const atrasada = t.prazo && new Date(t.prazo) < new Date()
              return (
                <Link key={t.id} href={`/operacional/${t.projeto?.id}`}
                  className="flex items-center gap-3 px-6 py-3 hover:bg-gray-50 transition-colors">
                  <div className={`w-2 h-2 rounded-full flex-shrink-0 ${atrasada ? 'bg-red-500' : 'bg-yellow-400'}`} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">{t.titulo}</p>
                    <p className="text-xs text-gray-400">{t.projeto?.codigo} • {t.projeto?.nome}</p>
                  </div>
                  {t.prazo && (
                    <span className={`text-xs font-medium flex-shrink-0 ${atrasada ? 'text-red-600' : 'text-gray-500'}`}>
                      {atrasada ? '⚠️ ' : ''}{formatDate(t.prazo)}
                    </span>
                  )}
                </Link>
              )
            })}
          </div>
        </div>
      )}

      <div className="bg-white rounded-2xl border border-gray-100">
        <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center">
          <h3 className="font-semibold text-gray-900">Meus Projetos</h3>
          <Link href="/operacional" className="text-xs text-green-600 font-medium">Ver todos →</Link>
        </div>
        <div className="divide-y divide-gray-50">
          {projetos.length === 0 ? (
            <div className="py-8 text-center text-gray-400 text-sm">Nenhum projeto ativo</div>
          ) : projetos.map((p: any) => (
            <Link key={p.id} href={`/operacional/${p.id}`} className="flex items-center gap-3 px-6 py-3 hover:bg-gray-50">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900">{p.nome}</p>
                <p className="text-xs text-gray-400">{p.codigo}</p>
              </div>
              <span className={`text-xs px-2 py-0.5 rounded-full ${ETAPA_BADGES[p.etapaPipeline] || 'bg-gray-100 text-gray-700'}`}>
                {ETAPA_LABELS[p.etapaPipeline]}
              </span>
            </Link>
          ))}
        </div>
      </div>
    </div>
  )
}

function ViewGestor({ dados }: { dados: any }) {
  const { estatisticas, projetos, porEtapa, evolucaoMensal } = dados
  const { novos, andamento, concluidos, tarefasAtrasadas, tarefasConcluidasMes, tarefasTotais, taxaEficiencia } = estatisticas

  const eficienciaCor = taxaEficiencia >= 70 ? 'text-green-600' : taxaEficiencia >= 40 ? 'text-yellow-600' : 'text-red-600'
  const eficienciaBar = taxaEficiencia >= 70 ? 'bg-green-500' : taxaEficiencia >= 40 ? 'bg-yellow-500' : 'bg-red-500'
  const etapaMap = Object.fromEntries((porEtapa || []).map((e: any) => [e.etapa, e.count]))

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Dashboard Gerencial</h1>
        <p className="text-gray-500 text-sm mt-1">Visão geral dos projetos em execução e análise de eficiência</p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: 'Para atribuir', value: novos, cor: 'bg-orange-100 text-orange-700', icon: AlertTriangle },
          { label: 'Em execução', value: andamento, cor: 'bg-blue-100 text-blue-700', icon: TrendingUp },
          { label: 'Concluídos', value: concluidos, cor: 'bg-green-100 text-green-700', icon: CheckCircle },
          { label: 'Tarefas atrasadas', value: tarefasAtrasadas ?? 0, cor: 'bg-red-100 text-red-700', icon: AlertTriangle },
        ].map((card) => {
          const Icon = card.icon
          return (
            <div key={card.label} className="bg-white rounded-2xl border border-gray-100 p-4 flex items-center gap-3">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${card.cor}`}>
                <Icon className="w-5 h-5" />
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-900">{card.value}</p>
                <p className="text-xs text-gray-500 mt-0.5">{card.label}</p>
              </div>
            </div>
          )
        })}
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 p-5">
        <h3 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
          <TrendingUp className="w-4 h-4 text-green-600" />
          Análise de Eficiência Operacional
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <p className="text-sm text-gray-500">Taxa de conclusão de atividades</p>
              <p className={`text-lg font-bold ${eficienciaCor}`}>{taxaEficiencia ?? 0}%</p>
            </div>
            <div className="w-full bg-gray-100 rounded-full h-2">
              <div className={`h-2 rounded-full transition-all ${eficienciaBar}`} style={{ width: `${taxaEficiencia ?? 0}%` }} />
            </div>
            <p className="text-xs text-gray-400">{tarefasConcluidasMes ?? 0} concluídas de {(tarefasConcluidasMes ?? 0) + (tarefasTotais ?? 0)} no mês</p>
          </div>
          <div className="flex flex-col justify-center border-l border-gray-100 pl-6">
            <p className="text-xs text-gray-400 mb-1">Tarefas pendentes (projetos ativos)</p>
            <p className="text-2xl font-bold text-gray-900">{tarefasTotais ?? 0}</p>
            {(tarefasAtrasadas ?? 0) > 0 && (
              <p className="text-xs text-red-600 mt-1">⚠️ {tarefasAtrasadas} atrasada(s)</p>
            )}
          </div>
          <div className="flex flex-col justify-center border-l border-gray-100 pl-6">
            <p className="text-xs text-gray-400 mb-1">Projetos em execução</p>
            <p className="text-2xl font-bold text-blue-600">{andamento}</p>
            <p className="text-xs text-gray-400 mt-1">+ {novos} aguardando início</p>
          </div>
        </div>
      </div>

      {novos > 0 && (
        <div className="bg-orange-50 border border-orange-200 rounded-2xl p-4 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-orange-500 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-orange-800">Atenção: {novos} projeto(s) aguardando atribuição de analista</p>
            <p className="text-xs text-orange-600 mt-0.5">Acesse o módulo Operacional para designar responsáveis e definir prazos.</p>
          </div>
          <Link href="/operacional" className="ml-auto text-xs font-medium text-orange-700 bg-orange-100 hover:bg-orange-200 px-3 py-1.5 rounded-lg transition-colors whitespace-nowrap">
            Ir para Operacional
          </Link>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-2xl border border-gray-100 p-6">
          <h3 className="font-semibold text-gray-900 mb-4">Projetos por Mês</h3>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={evolucaoMensal} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="mes" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} allowDecimals={false} />
              <Tooltip />
              <Bar dataKey="projetos" fill="#22c55e" radius={[4, 4, 0, 0]} name="Projetos" />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="bg-white rounded-2xl border border-gray-100 p-6">
          <h3 className="font-semibold text-gray-900 mb-4">Distribuição do Pipeline</h3>
          <ResponsiveContainer width="100%" height={200}>
            <PieChart>
              <Pie
                data={ETAPAS_PIPELINE.filter((e) => (etapaMap[e] || 0) > 0).map((e) => ({
                  name: ETAPA_LABELS[e] || e,
                  value: etapaMap[e],
                  color: ETAPA_CORES[e] || '#94a3b8',
                }))}
                cx="50%" cy="50%" innerRadius={45} outerRadius={75} paddingAngle={3} dataKey="value"
              >
                {ETAPAS_PIPELINE.filter((e) => (etapaMap[e] || 0) > 0).map((e, i) => (
                  <Cell key={i} fill={ETAPA_CORES[e] || '#94a3b8'} />
                ))}
              </Pie>
              <Tooltip formatter={(v: any) => [v, 'Projetos']} />
              <Legend iconType="circle" iconSize={8} formatter={(v: string) => <span className="text-xs">{v}</span>} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-gray-100">
        <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center">
          <h3 className="font-semibold text-gray-900">Projetos em Operação</h3>
          <Link href="/operacional" className="text-xs text-green-600 font-medium">Ver todos →</Link>
        </div>
        <div className="divide-y divide-gray-50">
          {projetos.length === 0 ? (
            <div className="py-8 text-center text-gray-400 text-sm">Nenhum projeto em operação</div>
          ) : projetos.map((p: any) => (
            <Link key={p.id} href={`/operacional/${p.id}`} className="flex items-center gap-4 px-6 py-3 hover:bg-gray-50">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 truncate">{p.nome}</p>
                <p className="text-xs text-gray-400">
                  {p.codigo}
                  {p.responsavel?.nome ? ` • Resp: ${p.responsavel.nome}` : ' • Sem responsável'}
                </p>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                {p._count?.tarefas > 0 && (
                  <span className="text-xs text-gray-400">{p._count.tarefas} tarefa(s)</span>
                )}
                <span className={`text-xs px-2 py-0.5 rounded-full ${ETAPA_BADGES[p.etapaPipeline] || 'bg-gray-100 text-gray-700'}`}>
                  {ETAPA_LABELS[p.etapaPipeline]}
                </span>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  )
}

// ─── Página principal ──────────────────────────────────────────

export default function DashboardPage() {
  const [dados, setDados] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch('/api/dashboard')
        if (!res.ok) throw new Error()
        setDados(await res.json())
      } catch {
        toast.error('Erro ao carregar dashboard')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-4 border-green-600 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (!dados) return null

  return dados.tipoView === 'gestor' ? <ViewGestor dados={dados} /> : <ViewAnalista dados={dados} />
}
