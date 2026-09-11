import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getCurrentUser, hasPermission } from '@/lib/auth'

// ============================================================
// Lembretes/alertas "inteligentes" para a tela Início — nada aqui é
// persistido no banco (diferente do modelo Notificacao, que é um feed de
// eventos históricos). Cada alerta é recalculado do zero a cada visita,
// olhando o estado atual dos dados: assim que o usuário resolve a pendência
// (define o responsável, marca a missão do dia, etc.) o alerta some sozinho
// na próxima vez que a tela carregar — sem precisar "marcar como lida".
// ============================================================

function segundaFeiraDaSemana(data: Date): Date {
  const d = new Date(data)
  const dia = d.getDay() // 0=domingo..6=sábado
  const diff = dia === 0 ? -6 : 1 - dia
  d.setDate(d.getDate() + diff)
  d.setHours(0, 0, 0, 0)
  return d
}

// 0=Segunda .. 6=Domingo
function diaIndexDeData(data: Date): number {
  const dia = data.getDay()
  return dia === 0 ? 6 : dia - 1
}

const ETAPAS_ATIVAS = ['OPERACIONAL', 'EM_EXECUCAO']

type Alerta = {
  id: string
  tipo: 'aviso' | 'info'
  titulo: string
  mensagem: string
  link: string
  cta: string
}

export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser()
    if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

    const hoje = new Date()
    const hojeMeiaNoite = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate())
    const diaSemanaHoje = diaIndexDeData(hoje)
    const diaUtil = diaSemanaHoje <= 4 // Segunda a Sexta
    const semanaInicio = segundaFeiraDaSemana(hoje)

    const alertas: Alerta[] = []

    // ── Alertas individuais (qualquer perfil) ──────────────────────────
    const [missaoHoje, atrasadas, semPrazo] = await Promise.all([
      prisma.tarefaSemana.findFirst({
        where: { usuarioId: user.id, semanaInicio, diaSemana: diaSemanaHoje, missaoDia: true },
        select: { id: true },
      }),
      prisma.tarefa.count({
        where: {
          responsavelId: user.id,
          status: 'PENDENTE',
          prazo: { lt: hojeMeiaNoite },
          projeto: { etapaPipeline: { in: ETAPAS_ATIVAS } },
        },
      }),
      prisma.tarefa.count({
        where: {
          responsavelId: user.id,
          status: 'PENDENTE',
          prazo: null,
          projeto: { etapaPipeline: { in: ETAPAS_ATIVAS } },
        },
      }),
    ])

    if (diaUtil && !missaoHoje) {
      alertas.push({
        id: 'sem-missao-dia',
        tipo: 'info',
        titulo: '🎯 Defina sua missão do dia',
        mensagem: 'Você ainda não marcou nenhuma atividade como missão do dia hoje.',
        link: '/tarefas-semana',
        cta: 'Escolher agora',
      })
    }

    if (atrasadas > 0) {
      alertas.push({
        id: 'tarefas-atrasadas',
        tipo: 'aviso',
        titulo: `⚠️ ${atrasadas} atividade${atrasadas > 1 ? 's' : ''} atrasada${atrasadas > 1 ? 's' : ''}`,
        mensagem: 'O prazo já passou e a atividade ainda consta como pendente.',
        link: '/tarefas-semana',
        cta: 'Ver atividades',
      })
    }

    if (semPrazo > 0) {
      alertas.push({
        id: 'tarefas-sem-prazo',
        tipo: 'info',
        titulo: `📅 ${semPrazo} atividade${semPrazo > 1 ? 's' : ''} sem prazo definido`,
        mensagem: 'Definir um prazo ajuda a encaixar essa atividade na semana certa.',
        link: '/tarefas-semana',
        cta: 'Ver atividades',
      })
    }

    // ── Alertas de gestão (ADMIN e demais perfis de gestão) ────────────
    if (hasPermission(user.role, 'SUPERVISOR')) {
      const [semResponsavel, aguardandoPlanejamento] = await Promise.all([
        prisma.projeto.count({
          where: { responsavelId: null, etapaPipeline: { in: ETAPAS_ATIVAS } },
        }),
        prisma.projeto.count({ where: { etapaPipeline: 'OPERACIONAL' } }),
      ])

      if (semResponsavel > 0) {
        alertas.push({
          id: 'projetos-sem-responsavel',
          tipo: 'aviso',
          titulo: `👤 ${semResponsavel} projeto${semResponsavel > 1 ? 's' : ''} sem responsável`,
          mensagem: 'Defina quem vai tocar esse(s) projeto(s) para que ele(s) entre(m) na rotina de alguém.',
          link: '/operacional',
          cta: 'Ver projetos',
        })
      }

      if (aguardandoPlanejamento > 0) {
        alertas.push({
          id: 'projetos-aguardando-planejamento',
          tipo: 'info',
          titulo: `🗂️ ${aguardandoPlanejamento} projeto${aguardandoPlanejamento > 1 ? 's' : ''} aguardando planejamento`,
          mensagem: 'Ainda não têm tarefas com prazo definido — planeje para que entrem na rotina da equipe.',
          link: '/operacional',
          cta: 'Planejar',
        })
      }

      if (diaUtil) {
        const equipe = await prisma.usuario.findMany({
          where: { ativo: true, id: { not: user.id }, role: { not: 'ADMIN' } },
          select: { id: true, nome: true },
        })
        if (equipe.length > 0) {
          const idsEquipe = equipe.map((u: { id: string }) => u.id)
          const comMissaoHoje = await prisma.tarefaSemana.findMany({
            where: { usuarioId: { in: idsEquipe }, semanaInicio, diaSemana: diaSemanaHoje, missaoDia: true },
            select: { usuarioId: true },
          })
          const idsComMissao = new Set(comMissaoHoje.map((m: { usuarioId: string }) => m.usuarioId))
          const semMissao = equipe.filter((u: { id: string }) => !idsComMissao.has(u.id))

          if (semMissao.length > 0) {
            const nomes = semMissao.slice(0, 3).map((u: { nome: string }) => u.nome.split(' ')[0]).join(', ')
            const resto = semMissao.length > 3 ? ` e mais ${semMissao.length - 3}` : ''
            alertas.push({
              id: 'equipe-sem-missao-dia',
              tipo: 'info',
              titulo: `🎯 ${semMissao.length} da equipe sem missão do dia`,
              mensagem: `${nomes}${resto} ainda não ${semMissao.length > 1 ? 'definiram' : 'definiu'} a missão de hoje.`,
              link: '/gestao-pessoas',
              cta: 'Ver equipe',
            })
          }
        }
      }
    }

    return NextResponse.json({ alertas })
  } catch (err) {
    console.error('[alertas GET]', err)
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}
