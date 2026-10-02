import { useEffect, useState } from 'react'
import { api, ApiError, type StatusCatalogEntry, type WorkflowConfiguration, type WorkflowConfigurationOperation, type WorkflowStatusKind } from '../services/api'

type WorkflowOperationInput = WorkflowConfigurationOperation extends infer Operation
  ? Operation extends WorkflowConfigurationOperation
    ? Omit<Operation, 'expectedUpdatedAt'>
    : never
  : never

type Feedback = { kind: 'success'; message: string } | { kind: 'error'; message: string }

function errorMessage(error: unknown): string {
  return error instanceof ApiError || error instanceof Error ? error.message : 'Unable to update status catalog.'
}

export function AdminWorkflowTransitionPage() {
  const [configuration, setConfiguration] = useState<WorkflowConfiguration | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [feedback, setFeedback] = useState<Feedback | null>(null)
  const [newName, setNewName] = useState('')
  const [newKind, setNewKind] = useState<Exclude<WorkflowStatusKind, 'draft'>>('open')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [deleting, setDeleting] = useState<StatusCatalogEntry | null>(null)
  const [replacementId, setReplacementId] = useState('')
  const [replacementTriggerId, setReplacementTriggerId] = useState<string | null>(null)

  useEffect(() => {
    let mounted = true
    void api.fetchAdminWorkflowTransitionConfiguration().then((result) => {
      if (mounted) setConfiguration(result)
    }).catch((error: unknown) => {
      if (mounted) setFeedback({ kind: 'error', message: errorMessage(error) })
    }).finally(() => { if (mounted) setLoading(false) })
    return () => { mounted = false }
  }, [])

  async function mutate(operation: WorkflowOperationInput) {
    if (!configuration || busy) return
    setBusy(true)
    setFeedback(null)
    try {
      const refreshed = await api.replaceAdminWorkflowTransitionConfiguration({ ...operation, expectedUpdatedAt: configuration.updatedAt } as WorkflowConfigurationOperation)
      setConfiguration(refreshed)
      setDeleting(null)
      setEditingId(null)
      setFeedback({ kind: 'success', message: 'Status catalog updated.' })
    } catch (error) {
      setFeedback({ kind: 'error', message: errorMessage(error) })
      if (error instanceof ApiError && error.status === 409) {
        try {
          setConfiguration(await api.fetchAdminWorkflowTransitionConfiguration())
          setDeleting(null)
          setEditingId(null)
          setReplacementId('')
          setReplacementTriggerId(null)
        } catch { /* Keep the user's conflict context visible. */ }
      }
    } finally { setBusy(false) }
  }

  const businessEntries = configuration?.entries.filter((entry) => entry.kind !== 'draft') ?? []
  const validReplacement = businessEntries.some((entry) => entry.id === replacementId && entry.id !== deleting?.id)
  const deletingTrigger = Boolean(deleting && configuration?.psfVisibilityTriggerId === deleting.id)
  const canDelete = Boolean(deleting && deleting.kind !== 'draft' &&
    (deleting.requestCount === 0 ? !replacementId || validReplacement : validReplacement) &&
    (!deletingTrigger || replacementTriggerId === null || businessEntries.some((entry) => entry.id === replacementTriggerId && entry.id !== deleting.id)))

  return (
    <article className="page-card admin-workflow-transition">
      <div className="page-card__header"><div>
        <p className="page-card__eyebrow">Admin tools</p>
        <h1>Status Management</h1>
        <p className="page-card__description">Manage work-status names and meaning. Draft is protected; status names are displayed exactly as entered.</p>
      </div></div>
      <div className="page-card__body admin-workflow-transition__body">
        {loading ? <p role="status">Loading status catalog…</p> : null}
        {feedback ? <p className={`status-pill status-pill--${feedback.kind}`} role={feedback.kind === 'error' ? 'alert' : 'status'}>{feedback.message}</p> : null}
        {configuration ? <>
          <form className="toolbar" onSubmit={(event) => { event.preventDefault(); if (newName.trim()) void mutate({ action: 'create', name: newName, kind: newKind }) }}>
            <label>New status name<input value={newName} onChange={(event) => setNewName(event.target.value)} /></label>
            <label>Meaning<select value={newKind} onChange={(event) => setNewKind(event.target.value as Exclude<WorkflowStatusKind, 'draft'>)}><option value="open">Open work</option><option value="completed">Completed</option><option value="cancelled">Cancelled</option></select></label>
            <button className="primary-button" disabled={busy || !newName.trim()} type="submit">Add status</button>
          </form>
          <section aria-labelledby="visibility-trigger-heading">
            <h2 id="visibility-trigger-heading">Requester PSF visibility trigger</h2>
            <p className="page-card__description">{configuration.psfVisibilityTriggerId ? 'Requesters gain access on first entry and keep it afterward.' : 'Not configured; requester access is not released by status changes.'}</p>
            <label>Trigger status<select disabled={busy} value={configuration.psfVisibilityTriggerId ?? ''} onChange={(event) => void mutate({ action: 'settings', psfVisibilityTriggerId: event.target.value || null })}>
              <option value="">Not configured</option>{businessEntries.map((entry) => <option key={entry.id} value={entry.id}>{entry.name}</option>)}
            </select></label>
          </section>
          <div className="data-table admin-workflow-transition__table" role="region" aria-label="Status catalog" tabIndex={0}><table>
            <thead><tr><th>Status</th><th>Kind</th><th>Requests</th><th>Actions</th></tr></thead>
            <tbody>{configuration.entries.map((entry) => <tr key={entry.id}>
              <td>{editingId === entry.id ? <input aria-label={`Rename ${entry.name}`} value={editName} onChange={(event) => setEditName(event.target.value)} /> : <strong>{entry.name}</strong>}</td>
              <td>{entry.kind}</td><td>{entry.requestCount ?? '—'}</td>
              <td>{entry.kind === 'draft' ? <span>Protected</span> : editingId === entry.id ? <>
                <button disabled={busy || !editName.trim()} onClick={() => void mutate({ action: 'rename', id: entry.id, name: editName })} type="button">Save name</button>
                <button disabled={busy} onClick={() => setEditingId(null)} type="button">Cancel</button>
              </> : <>
                <button disabled={busy} onClick={() => { setEditingId(entry.id); setEditName(entry.name) }} type="button">Rename</button>
                <button disabled={busy} onClick={() => { setDeleting(entry); setReplacementId(''); setReplacementTriggerId(null) }} type="button">Delete</button>
              </>}</td>
            </tr>)}</tbody>
          </table></div>
          {deleting ? <section className="page-card" aria-labelledby="delete-status-heading">
            <h2 id="delete-status-heading">Delete {deleting.name}</h2>
            <p>{deleting.requestCount ?? 0} current request(s) use this status. {deleting.requestCount === 0 ? 'A request replacement is optional.' : 'Choose a replacement for these requests.'} Deletion is canceled until confirmed.</p>
            <label>Replacement status<select value={replacementId} onChange={(event) => setReplacementId(event.target.value)}><option value="">{deleting.requestCount === 0 ? 'No request replacement' : 'Choose replacement'}</option>{businessEntries.filter((entry) => entry.id !== deleting.id).map((entry) => <option key={entry.id} value={entry.id}>{entry.name}</option>)}</select></label>
            {configuration.psfVisibilityTriggerId === deleting.id ? <label>Replace visibility trigger<select value={replacementTriggerId ?? ''} onChange={(event) => setReplacementTriggerId(event.target.value || null)}><option value="">No trigger</option>{businessEntries.filter((entry) => entry.id !== deleting.id).map((entry) => <option key={entry.id} value={entry.id}>{entry.name}</option>)}</select></label> : null}
            <button className="primary-button" disabled={busy || !canDelete} onClick={() => { if (canDelete) void mutate({ action: 'delete', id: deleting.id, ...(replacementId ? { replacementId } : {}), ...(deletingTrigger ? { replacementTriggerId } : {}) }) }} type="button">{deleting.requestCount === 0 ? 'Delete status' : 'Replace and delete'}</button>
            <button disabled={busy} onClick={() => setDeleting(null)} type="button">Cancel</button>
          </section> : null}
        </> : null}
      </div>
    </article>
  )
}
