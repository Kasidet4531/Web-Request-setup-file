import { useEffect, useRef, useState } from 'react'
import { X } from 'lucide-react'
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

function statusPsfAccessTrigger(entry: StatusCatalogEntry, configuration: WorkflowConfiguration | null): boolean {
  if (entry.kind === 'draft') return false
  return entry.psfAccessTrigger ?? (configuration?.psfVisibilityTriggerIds
    ? configuration.psfVisibilityTriggerIds.includes(entry.id)
    : configuration?.psfVisibilityTriggerId === entry.id)
}

export function AdminWorkflowTransitionPage() {
  const [configuration, setConfiguration] = useState<WorkflowConfiguration | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [feedback, setFeedback] = useState<Feedback | null>(null)
  const [newName, setNewName] = useState('')
  const [newKind, setNewKind] = useState<Exclude<WorkflowStatusKind, 'draft'>>('open')
  const [editName, setEditName] = useState('')
  const [deleting, setDeleting] = useState<StatusCatalogEntry | null>(null)
  const [replacementId, setReplacementId] = useState('')
  const [psfAccessTrigger, setPsfAccessTrigger] = useState(false)
  const [emailEditing, setEmailEditing] = useState<StatusCatalogEntry | null>(null)
  const [emailEnabled, setEmailEnabled] = useState(false)
  const [emailTo, setEmailTo] = useState<string[]>([])
  const [emailCc, setEmailCc] = useState<string[]>([])
  const [toInput, setToInput] = useState('')
  const [ccInput, setCcInput] = useState('')
  const [emailError, setEmailError] = useState<string | null>(null)
  const [users, setUsers] = useState<AdminUserProfile[] | null>(null)
  const [usersLoading, setUsersLoading] = useState(false)
  const [usersError, setUsersError] = useState<string | null>(null)
  const emailButtons = useRef(new Map<string, HTMLButtonElement>())
  const emailFocusTarget = useRef<string | null>(null)
  const catalogRegion = useRef<HTMLDivElement | null>(null)
  const dialogRef = useRef<HTMLDialogElement | null>(null)
  const dialogMode = emailEditing ? 'edit' : deleting ? 'delete' : null

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog || !dialogMode) return
    if (!dialog.open) dialog.showModal()
    dialog.querySelector<HTMLElement>(dialogMode === 'edit' ? '[data-initial-focus]' : '[data-dialog-cancel]')?.focus()
    return () => { if (dialog.open) dialog.close() }
  }, [dialogMode])

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
    if (emailEditing || deleting || busy || !emailFocusTarget.current) return
    const origin = emailButtons.current.get(emailFocusTarget.current)
    emailFocusTarget.current = null
    if (origin?.isConnected && !origin.disabled) origin.focus()
    else catalogRegion.current?.focus()
  }, [emailEditing, deleting, busy])

  async function mutate(operation: WorkflowOperationInput) {
    if (!configuration || busy) return
    setBusy(true)
    setFeedback(null)
    try {
      const refreshed = await api.replaceAdminWorkflowTransitionConfiguration({ ...operation, expectedUpdatedAt: configuration.updatedAt } as WorkflowConfigurationOperation)
      setConfiguration(refreshed)
      setDeleting(null)
      setEmailEditing(null)
      setFeedback({ kind: 'success', message: 'Status catalog updated.' })
    } catch (error) {
      setFeedback({ kind: 'error', message: errorMessage(error) })
      if (error instanceof ApiError && error.status === 409) {
        try {
          setConfiguration(await api.fetchAdminWorkflowTransitionConfiguration())
          setDeleting(null)
          setEmailEditing(null)
          setReplacementId('')
        } catch { /* Keep the user's conflict context visible. */ }
      }
    } finally { setBusy(false) }
  }

  async function editEmailPolicy(entry: StatusCatalogEntry) {
    if (busy || entry.kind === 'draft') return
    const policy = statusEmailPolicy(entry)
    emailFocusTarget.current = `edit:${entry.id}`
    setEmailEditing(entry)
    setEditName(entry.name)
    setPsfAccessTrigger(statusPsfAccessTrigger(entry, configuration))
    setEmailEnabled(policy.enabled)
    setEmailTo([...policy.to])
    setEmailCc([...policy.cc])
    setToInput('')
    setCcInput('')
    setEmailError(null)
    setFeedback(null)
    if (users !== null || usersLoading) return
    setUsersLoading(true)
    setUsersError(null)
    try { setUsers(await api.fetchAdminUsers()) }
    catch (error) { setUsersError(errorMessage(error)) }
    finally { setUsersLoading(false) }
  }

  function addRecipients(field: 'To' | 'CC', input: string) {
    if (busy || !emailEnabled) return
    const addresses = parseAddresses(input)
    if (addresses.length === 0) return
    if (addresses.some((address) => !isValidEmailAddress(address))) {
      setEmailError('Enter valid email addresses in To and CC, then add again.')
      return
    }
    if (field === 'To') {
      const to = [...new Set([...emailTo, ...addresses])]
      setEmailTo(to)
      setEmailCc(emailCc.filter((address) => !to.includes(address)))
      setToInput('')
    } else {
      setEmailCc([...new Set([...emailCc, ...addresses])].filter((address) => !emailTo.includes(address)))
      setCcInput('')
    }
    setEmailError(null)
  }

  function saveEmailPolicy() {
    if (!emailEditing || busy) return
    if (emailEnabled && (toInput.trim() || ccInput.trim())) {
      setEmailError('Click Add or clear the typed address before saving.')
      return
    }
    const to = emailTo
    const toSet = new Set(to)
    const cc = emailCc.filter((address) => !toSet.has(address))
    if (emailEnabled && to.length === 0) {
      setEmailError('At least one To address is required when email is enabled.')
      return
    }
    if ([...to, ...cc].some((address) => !isValidEmailAddress(address))) {
      setEmailError('Enter valid email addresses in To and CC, then save again.')
      return
    }
    setEmailError(null)
    void mutate({ action: 'rename', id: emailEditing.id, name: editName.trim(), psfAccessTrigger, emailPolicy: { enabled: emailEnabled, to, cc } })
  }

  function closeDialog() {
    if (busy) return
    setEmailEditing(null)
    setDeleting(null)
  }

  const catalogBusy = busy || dialogMode !== null
  const recipientControlsDisabled = busy || !emailEnabled
  const businessEntries = configuration?.entries.filter((entry) => entry.kind !== 'draft') ?? []
  const validReplacement = businessEntries.some((entry) => entry.id === replacementId && entry.id !== deleting?.id)
  const destination = businessEntries.find((entry) => entry.id === replacementId)
  const destinationPolicy = destination ? statusEmailPolicy(destination) : null
  const canDelete = Boolean(deleting && deleting.kind !== 'draft' &&
    (deleting.requestCount === 0 ? !replacementId || validReplacement : validReplacement))

  return (
    <article className="page-card admin-workflow-transition">
      <PageHeader title="Status Management" description="Manage exact status names and types. Draft is protected. Statuses form a catalog, with no fixed process sequence." />
      <div className="page-card__body admin-workflow-transition__body">
        {loading ? <AsyncNotice kind="loading" title="Loading status catalog…" /> : null}
        {feedback && !dialogMode ? <AsyncNotice kind={feedback.kind} title={feedback.message} /> : null}
        {configuration ? <>
          <form className="admin-workflow-transition__create" onSubmit={(event) => { event.preventDefault(); if (newName.trim()) void mutate({ action: 'create', name: newName, kind: newKind }) }}>
            <label className="ui-field"><span className="ui-label">New status name</span><input disabled={catalogBusy} value={newName} onChange={(event) => setNewName(event.target.value)} /></label>
            <label className="ui-field"><span className="ui-label">Status type</span><select disabled={catalogBusy} value={newKind} onChange={(event) => setNewKind(event.target.value as Exclude<WorkflowStatusKind, 'draft'>)}><option value="open">Open work</option><option value="completed">Completed</option><option value="cancelled">Cancel</option></select></label>
            <button className="primary-button" disabled={catalogBusy || !newName.trim()} type="submit">Add status</button>
          </form>
          <div className="admin-workflow-transition__catalog">
          <p className="table-scroll__hint">Scroll horizontally to see request counts and status actions.</p>
          <div className="data-table admin-workflow-transition__table" ref={catalogRegion} role="region" aria-label="Status catalog" tabIndex={0}><table>
            <thead><tr><th scope="col">Status</th><th scope="col">Status type</th><th scope="col">Requests</th><th scope="col">Email on entry</th><th scope="col">PSF access trigger</th><th scope="col"><span className="sr-only">Actions</span></th></tr></thead>
            <tbody>{configuration.entries.map((entry) => <tr key={entry.id}>
              <td><StatusLabel status={entry.name} kind={entry.kind} /></td>
              <td>{entry.kind === 'cancelled' ? 'Cancel' : entry.kind === 'open' ? 'Open work' : entry.kind === 'completed' ? 'Completed' : 'Draft'}</td><td>{entry.requestCount ?? '—'}</td>
              <td><div className="admin-workflow-transition__email-summary"><span>{statusEmailPolicy(entry).enabled ? 'Enabled' : 'Do not send'}</span>{statusEmailPolicy(entry).enabled ? <span className="ui-help">{statusEmailPolicy(entry).to.length} To · {statusEmailPolicy(entry).cc.length} CC</span> : null}</div></td>
              <td>{statusPsfAccessTrigger(entry, configuration) ? 'Trigger' : '—'}</td>
              <td><div className="admin-workflow-transition__row-actions">{entry.kind === 'draft' ? <span className="ui-help">Protected</span> : <>
                <button className="ui-button ui-button--secondary" disabled={catalogBusy} aria-label={`Edit ${entry.name}`} ref={(node) => { if (node) emailButtons.current.set(`edit:${entry.id}`, node); else emailButtons.current.delete(`edit:${entry.id}`) }} onClick={() => void editEmailPolicy(entry)} type="button">Edit</button>
                <button className="ui-button ui-button--danger" disabled={catalogBusy} ref={(node) => { if (node) emailButtons.current.set(`delete:${entry.id}`, node); else emailButtons.current.delete(`delete:${entry.id}`) }} onClick={() => { emailFocusTarget.current = `delete:${entry.id}`; setFeedback(null); setDeleting(entry); setReplacementId('') }} type="button">Delete</button>
              </>}</div></td>
            </tr>)}</tbody>
          </table></div></div>
          {dialogMode ? <dialog ref={dialogRef} className={`ui-dialog admin-status-dialog${dialogMode === 'edit' ? ' admin-status-dialog--edit' : ''}`} aria-labelledby={dialogMode === 'edit' ? 'edit-status-heading' : 'delete-status-heading'} aria-busy={busy}
            onCancel={(event) => { event.preventDefault(); closeDialog() }} onClick={(event) => { if (event.target === event.currentTarget) closeDialog() }}>
          {emailEditing ? <form className="ui-dialog__body" onSubmit={(event) => { event.preventDefault(); if (editName.trim()) saveEmailPolicy() }}>
            <div className="admin-status-dialog__header"><div><h2 id="edit-status-heading">Edit status</h2><p className="ui-help">Update the name, requester PSF access, and email recipients together.</p></div><button className="icon-button" type="button" aria-label="Close status editor" disabled={busy} onClick={closeDialog}><X size={18} aria-hidden="true" /></button></div>
            <div className="admin-status-dialog__content">
            <label className="ui-field"><span className="ui-label">Status name</span><input data-initial-focus aria-label="Status name" disabled={busy} value={editName} onChange={(event) => setEditName(event.target.value)} required /></label>
            <div className="admin-status-dialog__psf-access">
              <label className="admin-workflow-transition__checkbox"><input type="checkbox" aria-label="Allow requesters to view PSF Created Information" aria-describedby="psf-access-help" checked={psfAccessTrigger} disabled={busy} onChange={(event) => setPsfAccessTrigger(event.target.checked)} />Allow requesters to view PSF Created Information</label>
              <p className="ui-help" id="psf-access-help">Saving with this checked releases requester access for existing requests currently at this status. All required PSF fields must be complete, or none of your changes will be saved. Requesters keep access once released. Editing this configuration does not send email.</p>
            </div>
            <p className="ui-help">These recipients apply when a request enters this status, including submission and bulk replacement. Changes take effect after saving.</p>
            <label className="admin-workflow-transition__checkbox"><input type="checkbox" aria-label="Do not send email on entry" checked={!emailEnabled} disabled={busy} onChange={(event) => { setEmailEnabled(!event.target.checked); setEmailError(null) }} />Do not send email on entry</label>
            <p className="ui-help" id="email-recipients-help">Enter an individual or group address, then choose Add. You can paste several addresses separated by commas or semicolons. To takes precedence over CC.</p>
            {usersLoading ? <p className="ui-help" role="status">Loading system users… You can enter addresses now.</p> : null}
            {usersError ? <p className="ui-help" role="status">{`${usersError} — enter email addresses directly, or cancel and reopen to retry.`}</p> : null}
            <div className="admin-workflow-transition__email-fields">
              {(['To', 'CC'] as const).map((field) => <fieldset key={field} className="admin-workflow-transition__recipient-field">
                <legend className="ui-label">{field}{field === 'To' ? ' (required when enabled)' : ' (optional)'}</legend>

                <div className="admin-status-dialog__add-address"><input aria-label={`${field} addresses`} aria-describedby={`email-recipients-help${emailError ? ' email-policy-error' : ''}`} aria-invalid={Boolean(emailError)} disabled={recipientControlsDisabled} value={field === 'To' ? toInput : ccInput} placeholder="name@example.com" onChange={(event) => { (field === 'To' ? setToInput : setCcInput)(event.target.value); setEmailError(null) }} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); addRecipients(field, field === 'To' ? toInput : ccInput) } }} /><button className="ui-button ui-button--secondary" aria-label={`Add ${field}`} disabled={recipientControlsDisabled || !(field === 'To' ? toInput : ccInput).trim()} type="button" onClick={() => addRecipients(field, field === 'To' ? toInput : ccInput)}>Add {field}</button></div>
                <label className="ui-field"><span className="ui-label">Add system user to {field}</span><select aria-label={`Add system user to ${field}`} disabled={recipientControlsDisabled || usersLoading || users === null} value="" onChange={(event) => {
                  if (!isValidEmailAddress(event.target.value)) return
                  addRecipients(field, event.target.value)
                }}><option value="">Choose a user</option>{users?.map((user) => <option key={user.id} value={isValidEmailAddress(user.email) ? user.email.trim() : ''} disabled={!isValidEmailAddress(user.email)}>{user.displayName} ({user.username}) — {isValidEmailAddress(user.email) ? user.email.trim() : 'No valid email available'}</option>)}</select></label>
              </fieldset>)}
            </div>
            <div className="admin-status-dialog__recipient-lists">
              {(['To', 'CC'] as const).map((field) => <section key={field} className="admin-workflow-transition__recipient-field">
                <h3 className="ui-label">{field} recipients</h3>
                <ul className="admin-status-dialog__recipients" aria-label={`${field} recipients`}>{(field === 'To' ? emailTo : emailCc).map((address) => <li key={address}><span>{address}</span><button className="icon-button" aria-label={`Remove ${address} from ${field}`} type="button" disabled={recipientControlsDisabled} onClick={() => { (field === 'To' ? setEmailTo : setEmailCc)((field === 'To' ? emailTo : emailCc).filter((item) => item !== address)); setEmailError(null) }}><X size={14} aria-hidden="true" /></button></li>)}</ul>
              </section>)}
            </div>
            {emailError ? <p id="email-policy-error" className="admin-workflow-transition__email-error" role="alert">{emailError}</p> : null}
            {feedback?.kind === 'error' ? <AsyncNotice kind="error" title={feedback.message} /> : null}
            </div>
            <div className="ui-dialog__actions"><button className="ui-button ui-button--secondary" data-dialog-cancel disabled={busy} onClick={closeDialog} type="button">Cancel</button><button className="ui-button ui-button--primary" disabled={busy || !editName.trim()} onClick={saveEmailPolicy} type="button">{busy ? 'Saving…' : 'Save changes'}</button></div>
          </form> : null}
          {deleting ? <div className="ui-dialog__body">
            <div className="admin-status-dialog__header"><div><h2 id="delete-status-heading">{deleting.requestCount === 0 ? 'Delete status' : 'Replace and delete status'}</h2><p className="ui-help">{deleting.name}</p></div><button className="icon-button" type="button" aria-label="Close replacement dialog" disabled={busy} onClick={closeDialog}><X size={18} aria-hidden="true" /></button></div>
            <div className="admin-status-dialog__content">
            <p className="ui-help">{deleting.requestCount ?? 0} current request(s) use this status. {deleting.requestCount === 0 ? 'A request replacement is optional.' : 'Choose a replacement for these requests.'} Deletion is canceled until confirmed.</p>
            <label className="ui-field"><span className="ui-label">Replacement status</span><select aria-label="Replacement status" disabled={busy} value={replacementId} onChange={(event) => setReplacementId(event.target.value)}><option value="">{deleting.requestCount === 0 ? 'No request replacement' : 'Choose replacement'}</option>{businessEntries.filter((entry) => entry.id !== deleting.id).map((entry) => <option key={entry.id} value={entry.id}>{entry.name}</option>)}</select></label>
            {destination && destinationPolicy ? <div className="admin-workflow-transition__delivery-preview" role="status">
              <h3>Email on entry to {destination.name}</h3>
              <p>{destinationPolicy.enabled ? `One email will be queued for each of the ${deleting.requestCount ?? 0} affected requests.` : 'Email is disabled for this destination. No notification emails will be queued.'}</p>
              {destinationPolicy.enabled ? <><p>{`To: ${destinationPolicy.to.join(', ')}`}</p><p>{`CC: ${destinationPolicy.cc.length ? destinationPolicy.cc.join(', ') : 'None'}`}</p></> : null}
            </div> : null}
            {feedback?.kind === 'error' ? <AsyncNotice kind="error" title={feedback.message} /> : null}
            </div><div className="ui-dialog__actions">
            <button className="ui-button ui-button--secondary" data-dialog-cancel disabled={busy} onClick={closeDialog} type="button">Cancel</button>
            <button className="ui-button ui-button--danger" disabled={busy || !canDelete} onClick={() => { if (canDelete) void mutate({ action: 'delete', id: deleting.id, ...(replacementId ? { replacementId } : {}) }) }} type="button">{deleting.requestCount === 0 ? 'Delete status' : 'Replace and delete'}</button>
            </div>
          </div> : null}
          </dialog> : null}
        </> : null}
      </div>
    </article>
  )
}
