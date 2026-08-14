import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import path from 'path'
import { writeFile, mkdir } from 'fs/promises'
import { ROLES_RESTRITOS_AO_PROPRIO } from '@/lib/utils'

const EXTENSOES_PERMITIDAS = [
  '.pdf', '.kml', '.kmz',
  '.jpg', '.jpeg', '.png', '.tif', '.tiff',
  '.zip', '.xlsx', '.xls', '.xml', '.docx', '.doc',
]

export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser()
    if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

    const formData   = await request.formData()
    const arquivo    = formData.get('arquivo')   as File   | null
    const projetoId  = formData.get('projetoId') as string | null
    const entidadeId = formData.get('entidadeId') as string | null
    const tipo       = (formData.get('tipo')      as string) || 'documento'
    const categoria  = (formData.get('categoria') as string) || 'GERAL'

    if (!arquivo) {
      return NextResponse.json({ error: 'Nenhum arquivo enviado' }, { status: 400 })
    }

    // Perfis operacionais individuais só podem anexar arquivos ao próprio projeto
    if (projetoId && ROLES_RESTRITOS_AO_PROPRIO.includes(user.role)) {
      const projetoDoUpload = await prisma.projeto.findUnique({
        where: { id: projetoId },
        select: { responsavelId: true },
      })
      if (!projetoDoUpload || projetoDoUpload.responsavelId !== user.id) {
        return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
      }
    }

    const nomeArquivo = arquivo.name.toLowerCase()
    if (!EXTENSOES_PERMITIDAS.some(ext => nomeArquivo.endsWith(ext))) {
      return NextResponse.json({
        error: `Tipo de arquivo não permitido. Use: ${EXTENSOES_PERMITIDAS.join(', ')}`,
      }, { status: 400 })
    }

    const maxSize = parseInt(process.env.MAX_FILE_SIZE || '52428800')
    if (arquivo.size > maxSize) {
      return NextResponse.json({
        error: `Arquivo muito grande. Máximo ${Math.round(maxSize / 1024 / 1024)} MB.`,
      }, { status: 400 })
    }

    // Salva em public/uploads/
    const timestamp        = Date.now()
    const nomeSanitizado   = arquivo.name.replace(/[^a-zA-Z0-9._\-()]/g, '_')
    const nomeArquivoFinal = `${timestamp}_${nomeSanitizado}`
    const uploadDir        = path.join(process.cwd(), 'public', 'uploads')

    await mkdir(uploadDir, { recursive: true })

    const bytes  = await arquivo.arrayBuffer()
    const buffer = Buffer.from(bytes)
    await writeFile(path.join(uploadDir, nomeArquivoFinal), buffer)

    const url = `/uploads/${nomeArquivoFinal}`

    // Registra no banco
    let documento = null
    if (projetoId || entidadeId) {
      const tarefaId = tipo === 'tarefa' ? (entidadeId ?? undefined) : undefined

      documento = await prisma.documento.create({
        data: {
          nome:        arquivo.name,
          tipo:        arquivo.type || 'application/octet-stream',
          categoria,
          url,
          tamanho:     arquivo.size,
          ...(projetoId && { projetoId }),
          ...(tarefaId  && { tarefaId }),
          uploadadoPor: user.id,
        },
      })
    }

    return NextResponse.json({
      url,
      nome:        arquivo.name,
      tamanho:     arquivo.size,
      documentoId: documento?.id,
    }, { status: 201 })

  } catch (error: any) {
    console.error('Erro no upload:', error?.message)
    return NextResponse.json({ error: 'Erro ao fazer upload do arquivo' }, { status: 500 })
  }
}
