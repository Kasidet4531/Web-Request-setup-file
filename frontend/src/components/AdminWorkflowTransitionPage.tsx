import { useEffect, useRef, useState } from 'react'
import './AdminWorkflowTransitionPage.css'
import { PageHeader } from './ui/PageHeader'
import { AsyncNotice } from './ui/AsyncNotice'
import { StatusLabel } from './ui/StatusLabel'
import { api, ApiError, type AdminUserProfile, type StatusEmailPolicy, type StatusCatalogEntry, type WorkflowConfiguration, type WorkflowConfigurationOperation, type WorkflowStatusKind } from '../services/api'

type WorkflowOperationInput = WorkflowConfigurationOperation extends infer Operation
  ? Operation extends WorkflowConfigurationOperation
    ? Omit<Operation, 'expectedUpdatedAt'>
    : never
  : never

type Feedback = { kind: 'success'; message: string } | { kind: 'error'; message: string }

function errorMessage(error: unknown): string {
  return error instanceof ApiError || error instanceof Error ? error.message : 'Unable to update status catalog.'
}

function parseAddresses(value: string): string[] {
  return [...new Set(value.split(/[\s,;]+/).map((address) => address.trim().toLowerCase()).filter(Boolean))]
}

function isValidEmailAddress(value: string | null): value is string {
  if (!value || /[\r\n]/.test(value)) return false
  const address = value.trim().toLowerCase()
  const [local, domain] = address.split('@')
  return address.length <= 254 &&
    /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/.test(address) &&
    local.length <= 64 && !local.startsWith('.') && !local.endsWith('.') &&
    !address.includes('..') && domain.split('.').every((label) => label.length <= 63)
}

function statusEmailPolicy(entry: StatusCatalogEntry): StatusEmailPolicy {
  return entry.kind === 'draft' || !entry.emailPolicy
    ? { enabled: false, to: [], cc: [] }
    : entry.emailPolicy
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
  const [emailEditing, setEmailEditing] = useState<StatusCatalogEntry | null>(null)
  const [emailEnabled, setEmailEnabled] = useState(false)
  const [emailTo, setEmailTo] = useState('')
  const [emailCc, setEmailCc] = useState('')
  const [emailError, setEmailError] = useState<string | null>(null)
  const [users, setUsers] = useState<AdminUserProfile[] | null>(null)
  const [usersLoading, setUsersLoading] = useState(false)
  const [usersError, setUsersError] = useState<string | null>(null)
  const emailButtons = useRef(new Map<string, HTMLButtonElement>())
  const emailFocusTarget = useRef<string | null>(null)
  const catalogRegion = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    let mounted = true
    void api.fetchAdminWorkflowTransitionConfiguration().then((result) => {
      if (mounted) setConfiguration(result)
    }).catch((error: unknown) => {
      if (mounted) setFeedback({ kind: 'error', message: errorMessage(error) })
    }).finally(() => { if (mounted) setLoading(false) })
    return () => { mounted = false }
  }, [])

  useEffect(() => {
    if (emailEditing || busy || !emailFocusTarget.current) return
    const origin = emailButtons.current.get(emailFocusTarget.current)
    emailFocusTarget.current = null
    if (origin?.isConnected && !origin.disabled) origin.focus()
    else catalogRegion.current?.focus()
  }, [emailEditing, busy])

  async function mutate(operation: WorkflowOperationInput) {
    if (!configuration || busy) return
    setBusy(true)
    setFeedback(null)
    try {
      const refreshed = await api.replaceAdminWorkflowTransitionConfiguration({ ...operation, expectedUpdatedAt: configuration.updatedAt } as WorkflowConfigurationOperation)
      setConfiguration(refreshed)
      setDeleting(null)
      setEditingId(null)
      setEmailEditing(null)
      setFeedback({ kind: 'success', message: 'Status catalog updated.' })
    } catch (error) {
      setFeedback({ kind: 'error', message: errorMessage(error) })
      if (error instanceof ApiError && error.status === 409) {
        try {
          setConfiguration(await api.fetchAdminWorkflowTransitionConfiguration())
          setDeleting(null)
          setEditingId(null)
          setEmailEditing(null)
          setReplacementId('')
          setReplacementTriggerId(null)
        } catch { /* Keep the user's conflict context visible. */ }
      }
    } finally { setBusy(false) }
  }

  async function editEmailPolicy(entry: StatusCatalogEntry) {
    if (busy || entry.kind === 'draft') return
    const policy = statusEmailPolicy(entry)
    emailFocusTarget.current = entry.id
    setEmailEditing(entry)
    setEmailEnabled(policy.enabled)
    setEmailTo(policy.to.join(', '))
    setEmailCc(policy.cc.join(', '))
    setEmailError(null)
    setFeedback(null)
    if (users !== null || usersLoading) return
    setUsersLoading(true)
    setUsersError(null)
    try { setUsers(await api.fetchAdminUsers()) }
    catch (error) { setUsersError(errorMessage(error)) }
    finally { setUsersLoading(false) }
  }

  function saveEmailPolicy() {
    if (!emailEditing || busy) return
    const to = parseAddresses(emailTo)
    const toSet = new Set(to)
    const cc = parseAddresses(emailCc).filter((address) => !toSet.has(address))
    if (emailEnabled && to.length === 0) {
      setEmailError('At least one To address is required when email is enabled.')
      return
    }
    if ([...to, ...cc].some((address) => !isValidEmailAddress(address))) {
      setEmailError('Enter valid email addresses in To and CC, then save again.')
      return
    }
    setEmailError(null)
    void mutate({ action: 'email-policy', id: emailEditing.id, emailPolicy: { enabled: emailEnabled, to, cc } })
  }

  const catalogBusy = busy || emailEditing !== null
  const recipientControlsDisabled = busy || !emailEnabled
  const businessEntries = configuration?.entries.filter((entry) => entry.kind !== 'draft') ?? []
  const validReplacement = businessEntries.some((entry) => entry.id === replacementId && entry.id !== deleting?.id)
  const destination = businessEntries.find((entry) => entry.id === replacementId)
  const destinationPolicy = destination ? statusEmailPolicy(destination) : null
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
            <label className="ui-field"><span className="ui-label">New status name</span><input disabled={catalogBusy} value={newName} onChange={(event) => setNewName(event.target.value)} /></label>
            <label className="ui-field"><span className="ui-label">Status type</span><select disabled={catalogBusy} value={newKind} onChange={(event) => setNewKind(event.target.value as Exclude<WorkflowStatusKind, 'draft'>)}><option value="open">Open work</option><option value="completed">Completed</option><option value="cancelled">Cancel</option></select></label>
            <button className="primary-button" disabled={catalogBusy || !newName.trim()} type="submit">Add status</button>
          </form>
          <section className="page-card__section admin-workflow-transition__visibility" aria-labelledby="visibility-trigger-heading">
            <h2 id="visibility-trigger-heading">Requester PSF visibility trigger</h2>
            <p className="page-card__description">{configuration.psfVisibilityTriggerId ? 'Requesters gain access on first entry and keep it afterward.' : 'Not configured; requester access is not released by status changes.'}</p>
            <label className="ui-field"><span className="ui-label">Trigger status</span><select disabled={catalogBusy} value={configuration.psfVisibilityTriggerId ?? ''} onChange={(event) => void mutate({ action: 'settings', psfVisibilityTriggerId: event.target.value || null })}>
              <option value="">Not configured</option>{businessEntries.map((entry) => <option key={entry.id} value={entry.id}>{entry.name}</option>)}
            </select></label>
          </section>
          <div className="admin-workflow-transition__catalog">
          <p className="table-scroll__hint">Scroll horizontally to see request counts and status actions.</p>
          <div className="data-table admin-workflow-transition__table" ref={catalogRegion} role="region" aria-label="Status catalog" tabIndex={0}><table>
            <thead><tr><th scope="col">Status</th><th scope="col">Status type</th><th scope="col">Requests</th><th scope="col">Email on entry</th><th scope="col">Actions</th></tr></thead>
            <tbody>{configuration.entries.map((entry) => <tr key={entry.id}>
              <td>{editingId === entry.id ? <input disabled={catalogBusy} aria-label={`Rename ${entry.name}`} value={editName} onChange={(event) => setEditName(event.target.value)} /> : <StatusLabel status={entry.name} kind={entry.kind} />}</td>
              <td>{entry.kind === 'cancelled' ? 'Cancel' : entry.kind === 'open' ? 'Open work' : entry.kind === 'completed' ? 'Completed' : 'Draft'}</td><td>{entry.requestCount ?? '—'}</td>
              <td><div className="admin-workflow-transition__email-summary"><span>{statusEmailPolicy(entry).enabled ? 'Enabled' : 'Do not send'}</span>{statusEmailPolicy(entry).enabled ? <span className="ui-help">{statusEmailPolicy(entry).to.length} To · {statusEmailPolicy(entry).cc.length} CC</span> : null}</div></td>
              <td><div className="admin-workflow-transition__row-actions">{entry.kind === 'draft' ? <span className="ui-help">Protected</span> : editingId === entry.id ? <>
                <button className="ui-button ui-button--primary" disabled={catalogBusy || !editName.trim()} onClick={() => void mutate({ action: 'rename', id: entry.id, name: editName })} type="button">Save name</button>
                <button className="ui-button ui-button--secondary" disabled={catalogBusy} onClick={() => setEditingId(null)} type="button">Cancel</button>
              </> : <>
                <button className="ui-button ui-button--secondary" disabled={catalogBusy || deleting !== null || editingId !== null} aria-label={`Edit email policy for ${entry.name}`} ref={(node) => { if (node) emailButtons.current.set(entry.id, node); else emailButtons.current.delete(entry.id) }} onClick={() => void editEmailPolicy(entry)} type="button">Email policy</button>
                <button className="ui-button ui-button--secondary" disabled={catalogBusy} onClick={() => { setEditingId(entry.id); setEditName(entry.name) }} type="button">Rename</button>
                <button className="ui-button ui-button--danger" disabled={catalogBusy} onClick={() => { setDeleting(entry); setReplacementId(''); setReplacementTriggerId(null) }} type="button">Delete</button>
              </>}</div></td>
            </tr>)}</tbody>
          </table></div></div>
          {emailEditing ? <section className="page-card__section admin-workflow-transition__email-editor" aria-labelledby="email-policy-heading" aria-busy={busy}>
            <h2 id="email-policy-heading">Email on entry: {emailEditing.name}</h2>
            <p className="ui-help">These recipients apply when a request enters this status, including submission and bulk replacement. Changes take effect after saving.</p>
            <label className="admin-workflow-transition__checkbox"><input autoFocus type="checkbox" aria-label="Do not send email on entry" checked={!emailEnabled} disabled={busy} onChange={(event) => { setEmailEnabled(!event.target.checked); setEmailError(null) }} />Do not send email on entry</label>
            <p className="ui-help" id="email-recipients-help">Enter group or individual email addresses, separated by commas, semicolons or new lines. Adding a system user stores their current email address.</p>
            {usersLoading ? <p className="ui-help" role="status">Loading system users… You can enter addresses now.</p> : null}
            {usersError ? <p className="ui-help" role="status">{`${usersError} — enter email addresses directly, or cancel and reopen to retry.`}</p> : null}
            <div className="admin-workflow-transition__email-fields">
              {(['To', 'CC'] as const).map((field) => <div key={field} className="admin-workflow-transition__recipient-field">
                <label className="ui-field"><span className="ui-label">{field}{field === 'To' ? ' (required when enabled)' : ' (optional)'}</span><textarea rows={3} aria-label={`${field} addresses`} aria-describedby={`email-recipients-help${emailError ? ' email-policy-error' : ''}`} aria-invalid={Boolean(emailError)} disabled={recipientControlsDisabled} value={field === 'To' ? emailTo : emailCc} onChange={(event) => { (field === 'To' ? setEmailTo : setEmailCc)(event.target.value); setEmailError(null) }} /></label>
                <label className="ui-field"><span className="ui-label">Add system user to {field}</span><select aria-label={`Add system user to ${field}`} disabled={recipientControlsDisabled || usersLoading || users === null} value="" onChange={(event) => {
                  if (!isValidEmailAddress(event.target.value)) return
                  const existing = field === 'To' ? emailTo : emailCc
                  ;(field === 'To' ? setEmailTo : setEmailCc)([existing, event.target.value].filter(Boolean).join(', '))
                  setEmailError(null)
                }}><option value="">Choose a user</option>{users?.map((user) => <option key={user.id} value={isValidEmailAddress(user.email) ? user.email.trim() : ''} disabled={!isValidEmailAddress(user.email)}>{user.displayName} ({user.username}) — {isValidEmailAddress(user.email) ? user.email.trim() : 'No valid email available'}</option>)}</select></label>
              </div>)}
            </div>
            {emailError ? <p id="email-policy-error" className="admin-workflow-transition__email-error" role="alert">{emailError}</p> : null}
            <div className="button-row"><button className="ui-button ui-button--primary" disabled={busy} onClick={saveEmailPolicy} type="button">{busy ? 'Saving…' : 'Save email policy'}</button><button className="ui-button ui-button--secondary" disabled={busy} onClick={() => setEmailEditing(null)} type="button">Cancel email editing</button></div>
          </section> : null}
          {deleting ? <section className="page-card__section admin-workflow-transition__delete" aria-labelledby="delete-status-heading">
            <h2 id="delete-status-heading">Delete {deleting.name}</h2>
            <p className="ui-help">{deleting.requestCount ?? 0} current request(s) use this status. {deleting.requestCount === 0 ? 'A request replacement is optional.' : 'Choose a replacement for these requests.'} Deletion is canceled until confirmed.</p>
            <label className="ui-field"><span className="ui-label">Replacement status</span><select disabled={catalogBusy} value={replacementId} onChange={(event) => setReplacementId(event.target.value)}><option value="">{deleting.requestCount === 0 ? 'No request replacement' : 'Choose replacement'}</option>{businessEntries.filter((entry) => entry.id !== deleting.id).map((entry) => <option key={entry.id} value={entry.id}>{entry.name}</option>)}</select></label>
            {destination && destinationPolicy ? <div className="admin-workflow-transition__delivery-preview" role="status">
              <h3>Email on entry to {destination.name}</h3>
              <p>{destinationPolicy.enabled ? `One email will be queued for each of the ${deleting.requestCount ?? 0} affected requests.` : 'Email is disabled for this destination. No notification emails will be queued.'}</p>
              {destinationPolicy.enabled ? <><p>{`To: ${destinationPolicy.to.join(', ')}`}</p><p>{`CC: ${destinationPolicy.cc.length ? destinationPolicy.cc.join(', ') : 'None'}`}</p></> : null}
            </div> : null}
            {configuration.psfVisibilityTriggerId === deleting.id ? <label className="ui-field"><span className="ui-label">Replace visibility trigger</span><select disabled={catalogBusy} value={replacementTriggerId ?? ''} onChange={(event) => setReplacementTriggerId(event.target.value || null)}><option value="">No trigger</option>{businessEntries.filter((entry) => entry.id !== deleting.id).map((entry) => <option key={entry.id} value={entry.id}>{entry.name}</option>)}</select></label> : null}
            <div className="button-row">
            <button className="ui-button ui-button--secondary" disabled={catalogBusy} onClick={() => setDeleting(null)} type="button">Cancel</button>
            <button className="ui-button ui-button--danger" disabled={busy || !canDelete} onClick={() => { if (canDelete) void mutate({ action: 'delete', id: deleting.id, ...(replacementId ? { replacementId } : {}), ...(deletingTrigger ? { replacementTriggerId } : {}) }) }} type="button">{deleting.requestCount === 0 ? 'Delete status' : 'Replace and delete'}</button>
            </div>
          </section> : null}
        </> : null}
      </div>
    </article>
  )
}
