import { useEffect, useState } from 'react'
import { Link, useParams, useNavigate } from '@tanstack/react-router'
import { api, type AdminDraftListItem, type AdminDraftListResponse, type DraftReminder, type PsfRequestResponse } from '../services/api'
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

export function AdminDraftTable({
  items,
  reminders,
  onDelete,
  onOpenItem,
}: {
  items: AdminDraftListItem[]
  reminders: DraftReminder[] | null
  onDelete: (draft: AdminDraftListItem) => void
  onOpenItem?: (requestId: string) => void
}) {
  const navigate = useNavigate()
  const handleOpen = onOpenItem ?? ((requestId: string) => void navigate({ to: '/admin/drafts/$requestId', params: { requestId } }))

  return (
    <div className="data-table admin-draft-table" role="region" aria-label="Admin Drafts" tabIndex={0}>
      <table>
        <thead>
          <tr>
            <th scope="col">Draft</th>
            <th scope="col">Creator</th>
            <th scope="col">Product Type</th>
            <th scope="col">Created / Updated</th>
            <th scope="col">Reminder status</th>
            <th scope="col"><span className="sr-only">Actions</span></th>
          </tr>
        </thead>
        <tbody>
          {items.map(item => (
            <tr
              key={item.requestId}
              aria-label={`Open ${item.requestNo} details`}
              className="data-table__row--interactive"
              tabIndex={0}
              onClick={(event) => {
                if (!event?.target || !(event.target instanceof Element && event.target.closest('a, button, [popover]'))) {
                  handleOpen(item.requestId)
                }
              }}
              onKeyDown={(event) => {
                if (event.target === event.currentTarget && (event.key === 'Enter' || event.key === ' ')) {
                  event.preventDefault()
                  handleOpen(item.requestId)
                }
              }}
            >
              <td data-label="Draft">
                <Link to="/admin/drafts/$requestId" params={{ requestId: item.requestId }}>
                  {item.title || 'Untitled Draft'}<br />
                  <span className="font-mono-code">{item.requestNo}</span>
                </Link>
              </td>
              <td data-label="Creator">{item.requester ?? '—'}</td>
              <td data-label="Product Type">{productTypeLabel(item.productType)}</td>
              <td data-label="Created / Updated">
                <span>{formatHistoryDateTime(item.createdAt)}</span><br />
                <span>{formatHistoryDateTime(item.updatedAt)}</span>
              </td>
              <td data-label="Reminder status">
                <ReminderStatus reminder={reminders?.find(reminder => reminder.requestId === item.requestId)} available={reminders !== null} />
              </td>
              <td data-label="Actions">
                <div className="toolbar__actions">
                  <button
                    className="btn-secondary ui-button--danger"
                    type="button"
                    aria-label={`Delete ${item.requestNo}`}
                    onClick={(event) => {
                      event.stopPropagation()
                      onDelete(item)
                    }}
                  >
                    Delete
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export function AdminDraftManagementPage() {
  const [filters, setFilters] = useState({ keyword: '', creator: '' })
  const [debouncedKeyword, setDebouncedKeyword] = useState(filters.keyword)
  const [debouncedCreator, setDebouncedCreator] = useState(filters.creator)
  const [offset, setOffset] = useState(0)
  const [retry, setRetry] = useState(0)
  const [data, setData] = useState<AdminDraftListResponse | null>(null)
  const [reminders, setReminders] = useState<DraftReminder[] | null>(null)
  const [reminderError, setReminderError] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [deleting, setDeleting] = useState<AdminDraftListItem | null>(null)

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedKeyword(filters.keyword)
      setDebouncedCreator(filters.creator)
      setOffset(0)
    }, 300)
    return () => clearTimeout(timer)
  }, [filters.keyword, filters.creator])

  useEffect(() => {
    let active = true
    async function load() {
      setLoading(true)
      setError(null)
      try {
        const result = await api.fetchAdminDrafts({
          keyword: debouncedKeyword.trim() || undefined,
          creator: debouncedCreator.trim() || undefined,
          limit: 25,
          offset,
        })
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
  }, [debouncedKeyword, debouncedCreator, offset, retry])

  useEffect(() => {
    let active = true
    async function loadReminders() {
      setReminderError(null)
      try {
        const response = await api.fetchDraftReminders()
        if (active) setReminders(response.items)
      } catch (failure) {
        if (active) {
          setReminders(null)
          setReminderError(failure instanceof Error ? failure.message : 'Unable to load reminders.')
        }
      }
    }
    void loadReminders()
    return () => { active = false }
  }, [retry])

  const hasFilters = Boolean(filters.keyword.trim() || filters.creator.trim())

  return (
    <article className="workflow-page requests-page">
      <PageHeader title="Draft Management" />
      <section className="request-browser" aria-label="Draft Management">
        <form className="filter-bar draft-management-filters" onSubmit={event => event.preventDefault()}>
          <label>
            Keyword
            <input
              value={filters.keyword}
              placeholder="Draft number or title…"
              onChange={event => setFilters(current => ({ ...current, keyword: event.target.value }))}
            />
          </label>
          <label>
            Creator
            <input
              value={filters.creator}
              placeholder="Creator name…"
              onChange={event => setFilters(current => ({ ...current, creator: event.target.value }))}
            />
          </label>
          <button
            type="button"
            className="btn-secondary"
            disabled={!hasFilters}
            onClick={() => {
              setFilters({ keyword: '', creator: '' })
              setDebouncedKeyword('')
              setDebouncedCreator('')
              setOffset(0)
            }}
          >
            Clear filters
          </button>
        </form>

        {loading ? <AsyncNotice kind="loading" title="Loading Drafts…" /> : null}
        {error ? (
          <AsyncNotice
            kind="error"
            title={error}
            action={<button type="button" className="btn-secondary" onClick={() => setRetry(value => value + 1)}>Retry Drafts</button>}
          />
        ) : null}

        {data ? (
          <div aria-busy={loading} inert={loading}>
            {data.items.length ? (
              <AdminDraftTable items={data.items} reminders={reminders} onDelete={setDeleting} />
            ) : (
              <AsyncNotice kind="empty" title="No Drafts match this view." />
            )}
            <div className="table-footer" aria-label="Draft pagination">
              <span>{data.total} Drafts</span>
              <div className="toolbar__actions">
                <button
                  className="btn-secondary"
                  disabled={loading || !offset}
                  type="button"
                  onClick={() => setOffset(Math.max(0, offset - data.limit))}
                >
                  Previous
                </button>
                <button
                  className="btn-secondary"
                  disabled={loading || offset + data.limit >= data.total}
                  type="button"
                  onClick={() => setOffset(offset + data.limit)}
                >
                  Next
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </section>

      {reminderError ? (
        <AsyncNotice
          kind="error"
          title={`Reminder records: ${reminderError}`}
          action={<button type="button" className="btn-secondary" onClick={() => setRetry(value => value + 1)}>Retry reminders</button>}
        />
      ) : null}

      {deleting ? (
        <DraftDeleteDialog
          draft={deleting}
          onCancel={() => setDeleting(null)}
          onDeleted={() => {
            setDeleting(null)
            setOffset(0)
            setRetry(value => value + 1)
          }}
        />
      ) : null}
    </article>
  )
}

export function AdminDraftDetailPage() {
  const { requestId } = useParams({ from: '/admin/drafts/$requestId' })
  const navigate = useNavigate()
  const [draft, setDraft] = useState<PsfRequestResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [retry, setRetry] = useState(0)
  const [loading, setLoading] = useState(true)
  const [deleting, setDeleting] = useState(false)
  const [activeTab, setActiveTab] = useState<'requester' | 'psf'>('requester')

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

  return (
    <article className="workflow-page detail-page">
      <div className="toolbar">
        <Link className="btn-secondary" to="/admin/drafts">Back to Draft Management</Link>
      </div>

      {loading ? <AsyncNotice kind="loading" title="Loading Draft detail…" /> : null}
      {error ? (
        <AsyncNotice
          kind="error"
          title={error}
          action={<button type="button" className="btn-secondary" onClick={() => setRetry(value => value + 1)}>Retry Draft</button>}
        />
      ) : null}

      {currentDraft ? (
        <>
          <RequestHeaderSummary request={currentDraft} />

          <div className="detail-layout">
            <aside className="detail-layout__actions" aria-label="Draft actions">
              <section className="workflow-section">
                <div className="section-heading">
                  <h2>Draft Administration</h2>
                </div>
                <div className="workflow-actions">
                  <p className="ui-help">Read only. Managing this Draft does not grant Edit or Submit access.</p>
                  <div className="toolbar__actions">
                    {currentDraft.status === 'Draft' ? (
                      <button
                        type="button"
                        className="ui-button ui-button--danger"
                        onClick={() => setDeleting(true)}
                      >
                        Delete Draft
                      </button>
                    ) : null}
                  </div>
                </div>
              </section>
            </aside>

            {currentDraft.psfCreatedDataVisible ? (
              <div className="detail-tabs" role="tablist" aria-label="Draft information">
                <button
                  type="button"
                  id="admin-draft-tab-requester"
                  role="tab"
                  aria-selected={activeTab === 'requester'}
                  aria-controls="admin-draft-panel-requester"
                  tabIndex={activeTab === 'requester' ? 0 : -1}
                  onClick={() => setActiveTab('requester')}
                >
                  Requester Information
                </button>
                <button
                  type="button"
                  id="admin-draft-tab-psf"
                  role="tab"
                  aria-selected={activeTab === 'psf'}
                  aria-controls="admin-draft-panel-psf"
                  tabIndex={activeTab === 'psf' ? 0 : -1}
                  onClick={() => setActiveTab('psf')}
                >
                  PSF Created Information
                </button>
              </div>
            ) : null}

            <div className="detail-editors">
              <section
                className="workflow-section detail-layout__requester"
                id={currentDraft.psfCreatedDataVisible ? 'admin-draft-panel-requester' : undefined}
                role={currentDraft.psfCreatedDataVisible ? 'tabpanel' : undefined}
                aria-labelledby={currentDraft.psfCreatedDataVisible ? 'admin-draft-tab-requester' : undefined}
                hidden={currentDraft.psfCreatedDataVisible && activeTab !== 'requester'}
              >
                <DynamicFormRenderer
                  readOnly
                  schema={currentDraft.schemaSnapshot}
                  values={currentDraft.requesterData}
                  headerTitle="Requester Information"
                />
              </section>

              {currentDraft.psfCreatedDataVisible ? (
                <section
                  className="workflow-section detail-layout__psf"
                  id="admin-draft-panel-psf"
                  role="tabpanel"
                  aria-labelledby="admin-draft-tab-psf"
                  hidden={activeTab !== 'psf'}
                >
                  <DynamicFormRenderer
                    readOnly
                    schema={currentDraft.psfCreatedInformationSchema}
                    values={currentDraft.psfCreatedData as Record<string, string>}
                    headerTitle="PSF Created Information"
                  />
                </section>
              ) : null}
            </div>
          </div>

          {deleting && currentDraft.status === 'Draft' ? (
            <DraftDeleteDialog
              draft={currentDraft}
              onCancel={() => setDeleting(false)}
              onDeleted={() => void navigate({ to: '/admin/drafts' })}
            />
          ) : null}
        </>
      ) : null}
    </article>
  )
}
