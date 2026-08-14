/**
 * Integração com Google Drive
 *
 * Estrutura de pastas criada automaticamente:
 *   [Pasta raiz configurada]
 *     └── PRJ-0001/
 *           ├── Operacional/
 *           └── Documentos/
 *
 * ── CONFIGURAÇÃO INICIAL ────────────────────────────────────────
 * 1. Acesse https://console.cloud.google.com
 * 2. Crie um projeto (ou use um existente)
 * 3. Ative a API "Google Drive API"
 * 4. Crie uma Service Account:
 *    IAM & Admin → Service Accounts → Create → sem roles necessárias
 * 5. Gere uma chave JSON: Service Account → Keys → Add Key → JSON
 * 6. Converta para base64 e cole no .env:
 *    Windows PowerShell: [Convert]::ToBase64String([IO.File]::ReadAllBytes("chave.json"))
 *    Linux/Mac:          base64 -i chave.json
 * 7. Na pasta do Google Drive, clique com botão direito → Compartilhar
 *    e adicione o email da Service Account (ex: ecdise@projeto.iam.gserviceaccount.com)
 *    com permissão de Editor.
 */

import { google } from 'googleapis'
import { Readable } from 'stream'

const ROOT_FOLDER_ID = process.env.GOOGLE_DRIVE_ROOT_FOLDER_ID

// Mapeamento de tipo de upload → subfolder no Google Drive
const SUBPASTA: Record<string, string> = {
  tarefa:     'Operacional',
  documento:  'Documentos',
  projeto:    'Documentos',
}

export function getSubpasta(tipo: string): string {
  return SUBPASTA[tipo] || 'Documentos'
}

function criarAuth() {
  const b64 = process.env.GOOGLE_SERVICE_ACCOUNT_JSON
  if (!b64) {
    throw new Error(
      'GOOGLE_SERVICE_ACCOUNT_JSON não configurado no .env. ' +
      'Siga o guia em src/lib/gdrive.ts para criar a service account.'
    )
  }
  if (!ROOT_FOLDER_ID) {
    throw new Error('GOOGLE_DRIVE_ROOT_FOLDER_ID não configurado no .env.')
  }
  const credentials = JSON.parse(Buffer.from(b64, 'base64').toString('utf-8'))
  return new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/drive'],
  })
}

export function isDriveConfigurado(): boolean {
  return !!(process.env.GOOGLE_SERVICE_ACCOUNT_JSON && process.env.GOOGLE_DRIVE_ROOT_FOLDER_ID)
}

async function getDrive() {
  const auth = criarAuth()
  return google.drive({ version: 'v3', auth })
}

/**
 * Busca ou cria uma pasta com o nome dado dentro de um parent.
 * Evita duplicatas consultando antes de criar.
 */
async function getOuCriarPasta(
  drive: Awaited<ReturnType<typeof getDrive>>,
  nome: string,
  parentId: string,
): Promise<string> {
  // Escapa apóstrofos no nome para a query
  const nomeEscapado = nome.replace(/'/g, "\\'")
  const res = await drive.files.list({
    q: `name='${nomeEscapado}' and '${parentId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`,
    fields: 'files(id, name)',
    spaces: 'drive',
    pageSize: 1,
  })
  if (res.data.files && res.data.files.length > 0) {
    return res.data.files[0].id!
  }
  const criada = await drive.files.create({
    requestBody: {
      name: nome,
      mimeType: 'application/vnd.google-apps.folder',
      parents: [parentId],
    },
    fields: 'id',
  })
  return criada.data.id!
}

export interface UploadDriveParams {
  buffer: Buffer
  nomeArquivo: string    // nome final do arquivo (com timestamp)
  nomeOriginal: string   // nome original do arquivo para exibição
  mimeType: string
  projetoCodigo: string  // ex: "PRJ-0001"
  tipo: string           // tarefa | documento | projeto
}

export interface UploadDriveResult {
  fileId: string
  url: string            // URL de visualização no Google Drive
  webViewLink: string
  webContentLink: string // URL de download direto
}

/**
 * Faz upload de um arquivo para o Google Drive na estrutura de pastas correta.
 * Cria as pastas automaticamente se não existirem.
 */
export async function uploadParaDrive(params: UploadDriveParams): Promise<UploadDriveResult> {
  const drive = await getDrive()

  // 1. Pasta do projeto: ROOT/PRJ-0001/
  const pastaProjetoId = await getOuCriarPasta(drive, params.projetoCodigo, ROOT_FOLDER_ID!)

  // 2. Subpasta por tipo: ROOT/PRJ-0001/Financeiro/
  const nomeSub = getSubpasta(params.tipo)
  const pastaSubId = await getOuCriarPasta(drive, nomeSub, pastaProjetoId)

  // 3. Upload do arquivo
  const stream = Readable.from(params.buffer)
  const uploaded = await drive.files.create({
    requestBody: {
      name: params.nomeArquivo,
      parents: [pastaSubId],
    },
    media: {
      mimeType: params.mimeType || 'application/octet-stream',
      body: stream,
    },
    fields: 'id,webViewLink,webContentLink',
  })

  return {
    fileId:         uploaded.data.id!,
    url:            uploaded.data.webViewLink!,
    webViewLink:    uploaded.data.webViewLink!,
    webContentLink: uploaded.data.webContentLink!,
  }
}

/**
 * Exclui um arquivo do Drive pelo ID.
 * Não lança erro se o arquivo não existir.
 */
export async function excluirDoDrive(fileId: string): Promise<void> {
  try {
    const drive = await getDrive()
    await drive.files.delete({ fileId })
  } catch {
    // Ignora — arquivo pode já ter sido excluído manualmente
  }
}
