'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { MessageSquare, Save, Loader2 } from 'lucide-react'

interface Props {
  tarefaId:    string
  currentNote: string | null
  onSaved:     () => void
}

export default function NoteEditor({ tarefaId, currentNote, onSaved }: Props) {
  const [editMode, setEditMode] = useState(false)
  const [texto, setTexto]       = useState('')
  const [saving, setSaving]     = useState(false)

  async function salvar(override?: string) {
    setSaving(true)
    const t = override !== undefined ? override : texto
    try {
      const res = await fetch('/api/tarefas', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: tarefaId, observacao: t || null }),
      })
      if (!res.ok) throw new Error('api error')
      toast.success(t ? 'Observação salva!' : 'Observação removida')
      setEditMode(false)
      onSaved()
    } catch {
      toast.error('Erro ao salvar observação')
    } finally {
      setSaving(false)
    }
  }

  if (!editMode) {
    return (
      <div>
        {currentNote && (
          <p className="text-xs text-amber-600 mt-1.5 italic leading-snug bg-amber-50 px-2 py-1 rounded-md">
            📝 {currentNote}
          </p>
        )}
        <button
          onClick={() => { setTexto(currentNote || ''); setEditMode(true) }}
          className={`mt-1 flex items-center gap-1 text-xs transition-colors ${
            currentNote
              ? 'text-amber-500 hover:text-amber-700'
              : 'text-gray-300 hover:text-gray-500'
          }`}
          title={currentNote ? 'Editar observação' : 'Adicionar observação'}
        >
          <MessageSquare className="w-3 h-3" />
          {currentNote ? 'Editar nota' : 'Nota'}
        </button>
      </div>
    )
  }

  return (
    <div className="mt-2">
      <textarea
        value={texto}
        onChange={e => setTexto(e.target.value)}
        placeholder="Ex: cadastro não bate com receita, verificar dados..."
        rows={2}
        className="w-full text-xs px-2.5 py-2 border border-amber-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-300 resize-none bg-amber-50 placeholder-amber-300"
        autoFocus
      />
      <div className="flex gap-1.5 mt-1.5">
        <button
          onClick={() => salvar()}
          disabled={saving}
          className="flex items-center gap-1 px-2.5 py-1 bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white text-xs rounded-md font-medium transition-colors"
        >
          {saving
            ? <Loader2 className="w-3 h-3 animate-spin" />
            : <Save className="w-3 h-3" />
          }
          Salvar
        </button>
        {texto && (
          <button
            onClick={() => salvar('')}
            disabled={saving}
            className="px-2.5 py-1 text-xs text-red-400 hover:text-red-600 border border-red-200 hover:bg-red-50 rounded-md transition-colors"
          >
            Apagar
          </button>
        )}
        <button
          onClick={() => setEditMode(false)}
          className="px-2.5 py-1 text-xs text-gray-400 hover:text-gray-600 border border-gray-200 hover:bg-gray-50 rounded-md transition-colors"
        >
          Cancelar
        </button>
      </div>
    </div>
  )
}
