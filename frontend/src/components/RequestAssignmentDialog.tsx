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
  const recoveryRef = useRef(false)
  const lifecycleRef = useRef({ active: open, generation: 0 })
  const revisionRef = useRef(request.updatedAt)
  const [value, setValue] = useState<string | null | undefined>(() => request.setupOwnerUserId ?? (request.setupOwner ? undefined : null))
  const [available, setAvailable] = useState(false)
  const [saving, setSaving] = useState(false)
  const [recovering, setRecovering] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [revisionUnavailable, setRevisionUnavailable] = useState(false)

  useEffect(() => {
    const lifecycle = lifecycleRef.current
    lifecycle.active = open
    return () => {
      lifecycle.active = false
      lifecycle.generation += 1
    }
  }, [open, request.id])

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

  function closeDialog() {
    lifecycleRef.current.active = false
    lifecycleRef.current.generation += 1
    onClose()
  }

  async function refreshRevision() {
    if (recoveryRef.current || !lifecycleRef.current.active) return
    recoveryRef.current = true
    const generation = ++lifecycleRef.current.generation
    const isCurrent = () => lifecycleRef.current.active && lifecycleRef.current.generation === generation
    setRecovering(true)
    try {
      const latest = await api.fetchPsfRequest(request.id)
      if (!isCurrent()) return
      revisionRef.current = latest.updatedAt
      setRevisionUnavailable(false)
      onSaved(latest)
      setError('This request changed in another session. Your selected owner is preserved. Review the latest request before saving again.')
    } catch {
      if (!isCurrent()) return
      setRevisionUnavailable(true)
      setError('This request changed in another session. Your selected owner is preserved; refresh the revision before saving again.')
    } finally {
      if (isCurrent()) {
        recoveryRef.current = false
        setRecovering(false)
      }
    }
  }

  async function save() {
    if (disabled || !available || value === undefined || revisionUnavailable || pendingRef.current || recoveryRef.current || !lifecycleRef.current.active) return
    pendingRef.current = true
    setSaving(true)
    onSavingChange?.(true)
    setError(null)
    try {
      const updated = await api.updatePsfRequestAssignment(request.id, { setupOwnerUserId: value, expectedUpdatedAt: revisionRef.current })
      if (!lifecycleRef.current.active) return
      revisionRef.current = updated.updatedAt
      onSaved(updated)
      closeDialog()
    } catch (failure) {
      if (!lifecycleRef.current.active) return
      if (failure instanceof ApiError && failure.status === 409) await refreshRevision()
      else setError(failure instanceof Error ? failure.message : 'Unable to save assignment.')
    } finally {
      pendingRef.current = false
      setSaving(false)
      onSavingChange?.(false)
    }
  }

  return <dialog className="ui-dialog request-assignment-dialog" ref={dialogRef} aria-labelledby={titleId} onCancel={event => { event.preventDefault(); if (!pendingRef.current) closeDialog() }}>
    <div className="ui-dialog__body">
      <h2 id={titleId}>{request.setupOwner ? 'Change owner' : 'Assign owner'}</h2>
      <p className="ui-help">Choose one setup owner for this request.</p>
      <RequestAssigneePicker value={value} onChange={setValue} disabled={saving || recovering} recordedOwner={request.setupOwner ? `${request.setupOwner}${request.setupOwnerRole ? ` / ${request.setupOwnerRole}` : ''}` : undefined} onAvailabilityChange={setAvailable} />
      {disabled ? <p className="ui-help">Save or cancel pending information edits before saving assignment.</p> : null}
      {error ? <p role="alert" className="ui-help">{error}</p> : null}
      {revisionUnavailable ? <button type="button" className="btn-secondary" disabled={saving || recovering} onClick={() => void refreshRevision()}>Retry revision</button> : null}
      <div className="ui-dialog__actions">
        <button type="button" data-dialog-cancel className="ui-button ui-button--secondary" disabled={saving} onClick={() => { if (!pendingRef.current) closeDialog() }}>Cancel</button>
        <button type="button" className="ui-button ui-button--primary" disabled={disabled || !available || value === undefined || saving || recovering || revisionUnavailable} onClick={save}>{saving ? 'Saving assignment…' : 'Save assignment'}</button>
      </div>
    </div>
  </dialog>
}
