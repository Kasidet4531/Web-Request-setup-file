import { useEffect, useId, useRef, useState } from 'react'
import { ApiError, api, type PsfRequestResponse } from '../services/api'
import { RequestAssigneePicker } from './RequestAssigneePicker'

export interface RequestAssignmentDialogProps {
  request: PsfRequestResponse
  open: boolean
  onClose: () => void
  onSaved: (request: PsfRequestResponse) => void
  disabled?: boolean
  onSavingChange?: (saving: boolean) => void
}

export function RequestAssignmentDialog({ request, open, onClose, onSaved, disabled = false, onSavingChange }: RequestAssignmentDialogProps) {
  const titleId = useId()
  const dialogRef = useRef<HTMLDialogElement>(null)
  const pendingRef = useRef(false)
  const revisionRef = useRef(request.updatedAt)
  const [value, setValue] = useState<string | null | undefined>(() => request.setupOwnerUserId ?? (request.setupOwner ? undefined : null))
  const [available, setAvailable] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [revisionUnavailable, setRevisionUnavailable] = useState(false)

  useEffect(() => {
    revisionRef.current = request.updatedAt
  }, [request.updatedAt])

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog || !open) return
    const trigger = document.activeElement instanceof HTMLElement ? document.activeElement : null
    dialog.showModal()
    dialog.querySelector<HTMLButtonElement>('[data-dialog-cancel]')?.focus()
    return () => {
      if (dialog.open) dialog.close()
      trigger?.focus()
    }
  }, [open])

  async function refreshRevision() {
    try {
      const latest = await api.fetchPsfRequest(request.id)
      revisionRef.current = latest.updatedAt
      setRevisionUnavailable(false)
      onSaved(latest)
      setError('This request changed in another session. Your selected owner is preserved. Review the latest request before saving again.')
    } catch {
      setRevisionUnavailable(true)
      setError('This request changed in another session. Your selected owner is preserved; refresh the revision before saving again.')
    }
  }

  async function save() {
    if (disabled || !available || value === undefined || revisionUnavailable || pendingRef.current) return
    pendingRef.current = true
    setSaving(true)
    onSavingChange?.(true)
    setError(null)
    try {
      const updated = await api.updatePsfRequestAssignment(request.id, { setupOwnerUserId: value, expectedUpdatedAt: revisionRef.current })
      revisionRef.current = updated.updatedAt
      onSaved(updated)
      onClose()
    } catch (failure) {
      if (failure instanceof ApiError && failure.status === 409) await refreshRevision()
      else setError(failure instanceof Error ? failure.message : 'Unable to save assignment.')
    } finally {
      pendingRef.current = false
      setSaving(false)
      onSavingChange?.(false)
    }
  }

  return <dialog className="ui-dialog request-assignment-dialog" ref={dialogRef} aria-labelledby={titleId} onCancel={event => { event.preventDefault(); if (!pendingRef.current) onClose() }}>
    <div className="ui-dialog__body">
      <h2 id={titleId}>{request.setupOwner ? 'Change owner' : 'Assign owner'}</h2>
      <p className="ui-help">Choose one setup owner for this request.</p>
      <RequestAssigneePicker value={value} onChange={setValue} disabled={saving} recordedOwner={request.setupOwner ? `${request.setupOwner}${request.setupOwnerRole ? ` / ${request.setupOwnerRole}` : ''}` : undefined} onAvailabilityChange={setAvailable} />
      {disabled ? <p className="ui-help">Save or cancel pending information edits before saving assignment.</p> : null}
      {error ? <p role="alert" className="ui-help">{error}</p> : null}
      {revisionUnavailable ? <button type="button" className="btn-secondary" disabled={saving} onClick={() => void refreshRevision()}>Retry revision</button> : null}
      <div className="ui-dialog__actions">
        <button type="button" data-dialog-cancel className="ui-button ui-button--secondary" disabled={saving} onClick={() => { if (!pendingRef.current) onClose() }}>Cancel</button>
        <button type="button" className="ui-button ui-button--primary" disabled={disabled || !available || value === undefined || saving || revisionUnavailable} onClick={save}>{saving ? 'Saving assignment…' : 'Save assignment'}</button>
      </div>
    </div>
  </dialog>
}
