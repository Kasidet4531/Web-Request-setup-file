import { useEffect, useState } from 'react'
import { Link, useParams, useNavigate } from '@tanstack/react-router'
import { api, type AdminDraftListItem, type AdminDraftListResponse, type DraftReminder, type DraftDeletion, type PsfRequestResponse } from '../services/api'
import { PageHeader } from './ui/PageHeader'
import { AsyncNotice } from './ui/AsyncNotice'
import { DynamicFormRenderer } from './DynamicFormRenderer'
import { RequestHeaderSummary } from './RequestsWorkspace'
import { DraftDeleteDialog } from './DraftDeleteDialog'
import { productTypeLabel } from './productTypeLabel'
import { formatHistoryDateTime } from './ui/historyDateTime'

function ReminderStatus({ reminder, available = true }: { reminder?: DraftReminder; available?: boolean }) {
  return <><span>{available ? reminder?.state ?? 'Not yet due' : 'Unavailable'}</span>{reminder?.skippedRecipients.length ? <ul className="draft-recipient-issues">{reminder.skippedRecipients.map((recipient, index) => <li key={`${recipient.userId}-${index}`}>{recipient.displayName}: {recipient.reason}</li>)}</ul> : null}</>
}
export function AdminDraftTable({ items, reminders, onDelete }: { items: AdminDraftListItem[]; reminders: DraftReminder[] | null; onDelete: (draft: AdminDraftListItem) => void }) {
  return <div className="data-table admin-draft-table" role="region" aria-label="Admin Drafts" tabIndex={0}><table>
    <thead><tr><th scope="col">Draft</th><th scope="col">Creator</th><th scope="col">Product Type</th><th scope="col">Created / Updated</th><th scope="col">Reminder status</th><th scope="col">Actions</th></tr></thead>
    <tbody>{items.map(item => <tr key={item.requestId}><td data-label="Draft"><Link to="/admin/drafts/$requestId" params={{ requestId: item.requestId }}>{item.title || 'Untitled Draft'}<br /><span className="font-mono-code">{item.requestNo}</span></Link></td>
      <td data-label="Creator">{item.requester ?? '—'}</td><td data-label="Product Type">{productTypeLabel(item.productType)}</td>
      <td data-label="Created / Updated"><span>{formatHistoryDateTime(item.createdAt)}</span><br /><span>{formatHistoryDateTime(item.updatedAt)}</span></td>
      <td data-label="Reminder status"><ReminderStatus reminder={reminders?.find(reminder => reminder.requestId === item.requestId)} available={reminders !== null} /></td>
      <td data-label="Actions"><div className="toolbar__actions"><Link className="table-action" to="/admin/drafts/$requestId" params={{ requestId: item.requestId }}>Inspect</Link><button className="table-action" type="button" aria-label={`Delete ${item.requestNo}`} onClick={() => onDelete(item)}>Delete</button></div></td></tr>)}</tbody>
  </table></div>
}
export function AdminDraftManagementPage() {
  const [filters, setFilters] = useState({ keyword: '', creator: '', productType: '' })
  const [query, setQuery] = useState(filters)
  const [offset, setOffset] = useState(0)
  const [retry, setRetry] = useState(0)
  const [data, setData] = useState<AdminDraftListResponse | null>(null)
  const [reminders, setReminders] = useState<DraftReminder[] | null>(null)
  const [deletions, setDeletions] = useState<{ items: DraftDeletion[]; total: number; limit: number; offset: number } | null>(null)
  const [logOffset, setLogOffset] = useState(0)
  const [inspectionError, setInspectionError] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [deleting, setDeleting] = useState<AdminDraftListItem | null>(null)
  useEffect(() => {
    let active = true
    async function load() {
      setLoading(true)
      setError(null)
      try {
        const result = await api.fetchAdminDrafts({ ...query, limit: 25, offset })
        if (active) setData(result)
      } catch (failure) {
        if (active) {
          setData(null)
          setError(failure instanceof Error ? failure.message : 'Unable to load Drafts.')
        }
      } finally {
        if (active) setLoading(false)
      }
    }
    void load()
    return () => { active = false }
  }, [query, offset, retry])
  useEffect(() => {
    let active = true
    async function load() {
      setInspectionError(null)
      const [reminderResult, deletionResult] = await Promise.allSettled([
        api.fetchDraftReminders(),
        api.fetchDraftDeletions({ limit: 25, offset: logOffset }),
      ])
      if (!active) return
      const failures: string[] = []
      if (reminderResult.status === 'fulfilled') setReminders(reminderResult.value.items)
      else {
        setReminders(null)
        failures.push(reminderResult.reason instanceof Error ? reminderResult.reason.message : 'Unable to load reminders.')
      }
      if (deletionResult.status === 'fulfilled') setDeletions(deletionResult.value)
      else {
        setDeletions(null)
        failures.push(deletionResult.reason instanceof Error ? deletionResult.reason.message : 'Unable to load deletion records.')
      }
      setInspectionError(failures.length ? failures.join(' ') : null)
    }
    void load()
    return () => { active = false }
  }, [retry, logOffset])
  return <article className="workflow-page requests-page"><PageHeader title="Draft Management" description="Inspect unfinished Drafts, reminder recipient issues and permanent deletions. Times: Asia/Bangkok." />
    <section className="request-browser" aria-label="Draft Management">
      <form className="filter-bar draft-management-filters" onSubmit={event => { event.preventDefault(); setQuery({ ...filters }); setOffset(0) }}>
        <label>Keyword<input value={filters.keyword} placeholder="Draft number or title…" onChange={event => setFilters(current => ({ ...current, keyword: event.target.value }))} /></label>
        <label>Creator<input value={filters.creator} placeholder="Creator name…" onChange={event => setFilters(current => ({ ...current, creator: event.target.value }))} /></label>
        <label>Product Type<input value={filters.productType} placeholder="Product type…" onChange={event => setFilters(current => ({ ...current, productType: event.target.value }))} /></label>
        <button type="submit" className="btn-primary" disabled={loading}>Search Drafts</button>
        <button type="button" className="btn-secondary" onClick={() => { const empty = { keyword: '', creator: '', productType: '' }; setFilters(empty); setQuery(empty); setOffset(0) }}>Clear filters</button>
      </form>
      {loading ? <AsyncNotice kind="loading" title="Loading Drafts…" /> : null}
      {error ? <AsyncNotice kind="error" title={error} action={<button type="button" className="btn-secondary" onClick={() => setRetry(value => value + 1)}>Retry Drafts</button>} /> : null}
      {data ? <div aria-busy={loading} inert={loading}>{data.items.length ? <AdminDraftTable items={data.items} reminders={reminders} onDelete={setDeleting} /> : <AsyncNotice kind="empty" title="No Drafts match this view." />}
        <div className="table-footer" aria-label="Draft pagination"><span>{data.total} Drafts</span><div className="toolbar__actions"><button className="btn-secondary" disabled={loading || !offset} type="button" onClick={() => setOffset(Math.max(0, offset - data.limit))}>Previous</button><button className="btn-secondary" disabled={loading || offset + data.limit >= data.total} type="button" onClick={() => setOffset(offset + data.limit)}>Next</button></div></div>
      </div> : null}
    </section>
    {inspectionError ? <AsyncNotice kind="error" title={`Reminder / deletion records: ${inspectionError}`} action={<button type="button" className="btn-secondary" onClick={() => setRetry(value => value + 1)}>Retry records</button>} /> : null}
    <section className="workflow-section" aria-label="Reminder recipient issues"><h2>Reminder recipient issues</h2>{reminders?.some(reminder => reminder.skippedRecipients.length || reminder.state === 'unresolved') ? <ul>{reminders!.filter(reminder => reminder.skippedRecipients.length || reminder.state === 'unresolved').map(reminder => <li key={reminder.requestId}><Link to="/admin/drafts/$requestId" params={{ requestId: reminder.requestId }}>{reminder.requestNo}</Link> — <ReminderStatus reminder={reminder} /></li>)}</ul> : reminders !== null && !inspectionError ? <p>No unresolved recipient issues.</p> : null}</section>
    <section className="workflow-section" aria-label="Draft deletion log"><h2>Draft deletion log</h2><p className="ui-help">Only the Draft number, deleting account and time remain.</p>{deletions?.items.length ? <div className="data-table" role="region" aria-label="Deletion records" tabIndex={0}><table><thead><tr><th>Draft number</th><th>Deleted by</th><th>Role</th><th>Deleted at</th></tr></thead><tbody>{deletions.items.map((event, index) => <tr key={`${event.draftNo}-${index}`}><td>{event.draftNo}</td><td>{event.actorDisplayName}</td><td>{event.actorRole}</td><td>{formatHistoryDateTime(event.deletedAt)}</td></tr>)}</tbody></table></div> : deletions ? <p>No Draft deletions recorded.</p> : !inspectionError ? <p role="status">Loading deletion records…</p> : null}
      {deletions && deletions.total > deletions.limit ? <div className="table-footer"><button type="button" className="btn-secondary" disabled={!logOffset} onClick={() => setLogOffset(Math.max(0, logOffset - deletions.limit))}>Previous deletions</button><button type="button" className="btn-secondary" disabled={logOffset + deletions.limit >= deletions.total} onClick={() => setLogOffset(logOffset + deletions.limit)}>Next deletions</button></div> : null}
    </section>
    {deleting ? <DraftDeleteDialog draft={deleting} onCancel={() => setDeleting(null)} onDeleted={() => { setDeleting(null); setOffset(0); setLogOffset(0); setRetry(value => value + 1) }} /> : null}
  </article>
}
export function AdminDraftDetailPage() {
  const { requestId } = useParams({ from: '/admin/drafts/$requestId' })
  const navigate = useNavigate()
  const [draft, setDraft] = useState<PsfRequestResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [retry, setRetry] = useState(0)
  const [loading, setLoading] = useState(true)
  const [deleting, setDeleting] = useState(false)
  useEffect(() => {
    let active = true
    async function load() {
      setDraft(null)
      setError(null)
      setLoading(true)
      try {
        const result = await api.fetchAdminDraft(requestId)
        if (active) setDraft(result)
      } catch (failure) {
        if (active) setError(failure instanceof Error ? failure.message : 'Unable to load Draft.')
      } finally {
        if (active) setLoading(false)
      }
    }
    void load()
    return () => { active = false }
  }, [requestId, retry])
  const currentDraft = draft?.id === requestId ? draft : null
  return <article className="workflow-page detail-page"><Link className="btn-secondary" to="/admin/drafts">Back to Draft Management</Link>
    {loading ? <AsyncNotice kind="loading" title="Loading Draft detail…" /> : null}
    {error ? <AsyncNotice kind="error" title={error} action={<button type="button" className="btn-secondary" onClick={() => setRetry(value => value + 1)}>Retry Draft</button>} /> : null}
    {currentDraft ? <><RequestHeaderSummary request={currentDraft} /><button type="button" className="btn-secondary" onClick={() => setRetry(value => value + 1)}>Refresh Draft</button><p className="ui-help">Read only. Managing this Draft does not grant Edit or Submit access.</p>
      {currentDraft.status === 'Draft' ? <button type="button" className="ui-button ui-button--danger" onClick={() => setDeleting(true)}>Delete Draft</button> : null}
      <DynamicFormRenderer readOnly schema={currentDraft.schemaSnapshot} values={currentDraft.requesterData} headerTitle="Requester Information" />
      {currentDraft.psfCreatedDataVisible ? <DynamicFormRenderer readOnly schema={currentDraft.psfCreatedInformationSchema} values={currentDraft.psfCreatedData as Record<string, string>} headerTitle="PSF Created Information" /> : null}
      {deleting && currentDraft.status === 'Draft' ? <DraftDeleteDialog draft={currentDraft} onCancel={() => setDeleting(false)} onDeleted={() => void navigate({ to: '/admin/drafts' })} /> : null}
    </> : null}
  </article>
}
