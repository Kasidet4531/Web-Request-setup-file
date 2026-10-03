import { useEffect, useState } from 'react'
import { PageHeader } from './ui/PageHeader'
import { AsyncNotice } from './ui/AsyncNotice'
import { StatusLabel } from './ui/StatusLabel'
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
      <PageHeader title="Status Management" description="Manage exact status names and types. Draft is protected. Statuses form a catalog, with no fixed process sequence." />
      <div className="page-card__body admin-workflow-transition__body">
        {loading ? <AsyncNotice kind="loading" title="Loading status catalog…" /> : null}
        {feedback ? <AsyncNotice kind={feedback.kind} title={feedback.message} /> : null}
        {configuration ? <>
          <form className="admin-workflow-transition__create" onSubmit={(event) => { event.preventDefault(); if (newName.trim()) void mutate({ action: 'create', name: newName, kind: newKind }) }}>
            <label className="ui-field"><span className="ui-label">New status name</span><input disabled={busy} value={newName} onChange={(event) => setNewName(event.target.value)} /></label>
            <label className="ui-field"><span className="ui-label">Status type</span><select disabled={busy} value={newKind} onChange={(event) => setNewKind(event.target.value as Exclude<WorkflowStatusKind, 'draft'>)}><option value="open">Open work</option><option value="completed">Completed</option><option value="cancelled">Cancel</option></select></label>
            <button className="primary-button" disabled={busy || !newName.trim()} type="submit">Add status</button>
          </form>
          <section className="page-card__section admin-workflow-transition__visibility" aria-labelledby="visibility-trigger-heading">
            <h2 id="visibility-trigger-heading">Requester PSF visibility trigger</h2>
            <p className="page-card__description">{configuration.psfVisibilityTriggerId ? 'Requesters gain access on first entry and keep it afterward.' : 'Not configured; requester access is not released by status changes.'}</p>
            <label className="ui-field"><span className="ui-label">Trigger status</span><select disabled={busy} value={configuration.psfVisibilityTriggerId ?? ''} onChange={(event) => void mutate({ action: 'settings', psfVisibilityTriggerId: event.target.value || null })}>
              <option value="">Not configured</option>{businessEntries.map((entry) => <option key={entry.id} value={entry.id}>{entry.name}</option>)}
            </select></label>
          </section>
          <div className="admin-workflow-transition__catalog">
          <p className="table-scroll__hint">Scroll horizontally to see request counts and status actions.</p>
          <div className="data-table admin-workflow-transition__table" role="region" aria-label="Status catalog" tabIndex={0}><table>
            <thead><tr><th scope="col">Status</th><th scope="col">Status type</th><th scope="col">Requests</th><th scope="col">Actions</th></tr></thead>
            <tbody>{configuration.entries.map((entry) => <tr key={entry.id}>
              <td>{editingId === entry.id ? <input disabled={busy} aria-label={`Rename ${entry.name}`} value={editName} onChange={(event) => setEditName(event.target.value)} /> : <StatusLabel status={entry.name} kind={entry.kind} />}</td>
              <td>{entry.kind === 'cancelled' ? 'Cancel' : entry.kind === 'open' ? 'Open work' : entry.kind === 'completed' ? 'Completed' : 'Draft'}</td><td>{entry.requestCount ?? '—'}</td>
              <td><div className="admin-workflow-transition__row-actions">{entry.kind === 'draft' ? <span className="ui-help">Protected</span> : editingId === entry.id ? <>
                <button className="ui-button ui-button--primary" disabled={busy || !editName.trim()} onClick={() => void mutate({ action: 'rename', id: entry.id, name: editName })} type="button">Save name</button>
                <button className="ui-button ui-button--secondary" disabled={busy} onClick={() => setEditingId(null)} type="button">Cancel</button>
              </> : <>
                <button className="ui-button ui-button--secondary" disabled={busy} onClick={() => { setEditingId(entry.id); setEditName(entry.name) }} type="button">Rename</button>
                <button className="ui-button ui-button--danger" disabled={busy} onClick={() => { setDeleting(entry); setReplacementId(''); setReplacementTriggerId(null) }} type="button">Delete</button>
              </>}</div></td>
            </tr>)}</tbody>
          </table></div></div>
          {deleting ? <section className="page-card__section admin-workflow-transition__delete" aria-labelledby="delete-status-heading">
            <h2 id="delete-status-heading">Delete {deleting.name}</h2>
            <p className="ui-help">{deleting.requestCount ?? 0} current request(s) use this status. {deleting.requestCount === 0 ? 'A request replacement is optional.' : 'Choose a replacement for these requests.'} Deletion is canceled until confirmed.</p>
            <label className="ui-field"><span className="ui-label">Replacement status</span><select disabled={busy} value={replacementId} onChange={(event) => setReplacementId(event.target.value)}><option value="">{deleting.requestCount === 0 ? 'No request replacement' : 'Choose replacement'}</option>{businessEntries.filter((entry) => entry.id !== deleting.id).map((entry) => <option key={entry.id} value={entry.id}>{entry.name}</option>)}</select></label>
            {configuration.psfVisibilityTriggerId === deleting.id ? <label className="ui-field"><span className="ui-label">Replace visibility trigger</span><select disabled={busy} value={replacementTriggerId ?? ''} onChange={(event) => setReplacementTriggerId(event.target.value || null)}><option value="">No trigger</option>{businessEntries.filter((entry) => entry.id !== deleting.id).map((entry) => <option key={entry.id} value={entry.id}>{entry.name}</option>)}</select></label> : null}
            <div className="button-row">
            <button className="ui-button ui-button--secondary" disabled={busy} onClick={() => setDeleting(null)} type="button">Cancel</button>
            <button className="ui-button ui-button--danger" disabled={busy || !canDelete} onClick={() => { if (canDelete) void mutate({ action: 'delete', id: deleting.id, ...(replacementId ? { replacementId } : {}), ...(deletingTrigger ? { replacementTriggerId } : {}) }) }} type="button">{deleting.requestCount === 0 ? 'Delete status' : 'Replace and delete'}</button>
            </div>
          </section> : null}
        </> : null}
      </div>
    </article>
  )
}
