import { useRef, useState } from 'react'
import { api } from '../services/api'
import { ConfirmDialog } from './ui/ConfirmDialog'

export function DraftDeleteDialog({ draft, onCancel, onDeleted }: {
  draft: { requestId?: string; id?: string; requestNo: string; title?: string | null; updatedAt: string }
  onCancel: () => void
  onDeleted: () => void
}) {
  const pendingRef = useRef(false)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  async function remove() {
    if (pendingRef.current) return
    pendingRef.current = true
    setPending(true)
    setError(null)
    try {
      await api.deleteDraft(draft.requestId ?? draft.id!, draft.updatedAt)
      onDeleted()
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Unable to delete this Draft.')
    } finally {
      pendingRef.current = false
      setPending(false)
    }
  }
  return <ConfirmDialog open title={`Delete Draft ${draft.requestNo}?`} description={<>
    {draft.title ? <p>{draft.title}</p> : null}
    <p>This permanently removes the Draft and its saved information and history. It cannot be restored.</p>
    {error ? <p className="form-error" role="alert">{error}</p> : null}
  </>} confirmLabel="Delete Draft permanently" pending={pending} tone="danger" onCancel={() => { if (!pendingRef.current) onCancel() }} onConfirm={() => void remove()} />
}
