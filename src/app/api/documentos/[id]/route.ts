import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { excluirDoDrive, isDriveConfigurado } from '@/lib/gdrive'
import { ROLES_RESTRITOS_AO_PROPRIO } from '@/lib/utils'

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await getCurrentUser()
    if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

    const doc = await prisma.documento.findUnique({
      where: { id: params.id },
      include: { projeto: { select: { responsavelId: true } } },
    })
    if (!doc) return NextResponse.json({ error: 'Documento não encontrado' }, { status: 404 })

    // Perfis operacionais individuais só apagam documentos que eles mesmos
    // enviaram, ou que pertencem a um projeto do qual são o responsável.
    if (
      ROLES_RESTRITOS_AO_PROPRIO.includes(user.role) &&
      doc.uploadadoPor !== user.id &&
      doc.projeto?.responsavelId !== user.id
    ) {
      return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
    }

    // Exclui do Google Drive (se configurado e tiver ID)
    if (isDriveConfigurado() && doc.driveFileId) {
      await excluirDoDrive(doc.driveFileId)
    }

    // Exclui do banco
    await prisma.documento.delete({ where: { id: params.id } })

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('Erro ao excluir documento:', error)
    return NextResponse.json({ error: 'Erro ao excluir documento' }, { status: 500 })
  }
}
