import { HistoryChanges } from './ui/HistoryChanges'
import { formatHistoryDateTime } from './ui/historyDateTime'
import { Link } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { PageHeader } from './ui/PageHeader'
import { ROW_PX, pagedMinHeight } from './ui/tableLayout'
import { AsyncNotice } from './ui/AsyncNotice'
import {
  api,
  fetchCurrentUser,
  type DraftDeletion,
  type GlobalAuditLogEntry,
  type GlobalAuditLogQuery,
  type PsfRequestHistoryAction,
} from '../services/api'
import {
  EMPTY_GLOBAL_AUDIT_LOG_FILTERS,
  buildGlobalAuditLogQuery,
  type GlobalAuditLogFilterValues,
} from './global-history'

const AUDIT_ACTIONS: Array<{ label: string; value: PsfRequestHistoryAction }> = [
  { label: 'Draft created', value: 'DRAFT_CREATED' },
  { label: 'Draft requester information updated', value: 'DRAFT_REQUESTER_DATA_UPDATED' },
  { label: 'Request submitted', value: 'REQUEST_SUBMITTED' },
  { label: 'Request status changed', value: 'REQUEST_STATUS_CHANGED' },
  { label: 'Requester information updated', value: 'REQUESTER_INFORMATION_UPDATED' },
  { label: 'PSF Created Information updated', value: 'PSF_CREATED_INFORMATION_UPDATED' },
  { label: 'Workflow catalog updated', value: 'WORKFLOW_CATALOG_UPDATED' },
]

export interface GlobalAuditLogFiltersProps {
  filters: GlobalAuditLogFilterValues
  onApply: () => void
  onChange: (field: keyof GlobalAuditLogFilterValues, value: string) => void
  onClear: () => void
}

interface AsyncState<T> {
  loading: boolean
  error: string | null
  data: T
}

function actionLabel(actionType: PsfRequestHistoryAction): string {
  return AUDIT_ACTIONS.find((action) => action.value === actionType)?.label ?? actionType
}

export function GlobalAuditLogFilters({
  filters,
  onApply,
  onChange,
  onClear,
}: GlobalAuditLogFiltersProps) {
  return (
    <form
      className="filter-bar global-history-filters"
      onSubmit={(event) => {
        event.preventDefault()
        onApply()
      }}
    >
      <label className="global-history-filters__request-id">
        Request ID
        <input
          name="requestId"
          onChange={(event) => onChange('requestId', event.target.value)}
          type="text"
          value={filters.requestId}
        />
      </label>
      <label className="global-history-filters__user">
        User
        <input
          name="user"
          onChange={(event) => onChange('user', event.target.value)}
          type="text"
          value={filters.user}
        />
      </label>
      <label className="global-history-filters__action">
        Action
        <select
          name="actionType"
          onChange={(event) => onChange('actionType', event.target.value)}
          value={filters.actionType}
        >
          <option value="">All actions</option>
          {AUDIT_ACTIONS.map((action) => (
            <option key={action.value} value={action.value}>
              {action.label}
            </option>
          ))}
        </select>
      </label>
      <div className="global-history-filters__dates">
        <label>
          From (UTC)
          <input
            name="from"
            onChange={(event) => onChange('from', event.target.value)}
            type="date"
            value={filters.from}
          />
        </label>
        <label>
          To (UTC)
          <input
            name="to"
            onChange={(event) => onChange('to', event.target.value)}
            type="date"
            value={filters.to}
          />
        </label>
      </div>
      <div className="button-row global-history-filters__actions">
        <button className="btn-ghost" onClick={onClear} type="button">Clear</button>
        <button className="primary-button" type="submit">Apply</button>
      </div>
    </form>
  )
}

const PAGE_SIZES = [10, 25, 50, 100]
const PAGE_SIZE = 25

export function GlobalAuditLogTable({
  entries,
  error,
  loading,
  offset = 0,
  onOffsetChange,
  onPageSizeChange,
  pageSize = PAGE_SIZE,
  total = entries.length,
}: {
  entries: GlobalAuditLogEntry[]
  error: string | null
  loading: boolean
  offset?: number
  onOffsetChange?: (offset: number) => void
  onPageSizeChange?: (size: number) => void
  pageSize?: number
  total?: number
}) {
  if (loading && entries.length === 0) {
    return <AsyncNotice kind="loading" title="Loading global audit history…" />
  }

  if (error) {
    return <AsyncNotice kind="error" title={`Unable to load global audit history: ${error}`} />
  }

  if (entries.length === 0) {
    return <AsyncNotice kind="empty" title="No global audit history matches the current filters." />
  }

  return (
    <>
    <p className="sr-only" role="status">{loading ? 'Updating global audit history…' : ''}</p>
        <div className="data-table" role="region" aria-label="Global audit history" tabIndex={0} aria-busy={loading} inert={loading} style={pagedMinHeight(total, pageSize, ROW_PX.audit)}>
      <table>
        <thead>
          <tr>
            <th scope="col">Time</th>
            <th scope="col">Request</th>
            <th scope="col">User</th>
            <th scope="col">Action</th>
            <th scope="col">Detail</th>
          </tr>
        </thead>
        <tbody>
          {entries.map((entry, index) => (
            <tr key={`${entry.requestId}-${entry.createdAt}-${entry.actionType}-${index}`}>
              <td><time dateTime={entry.createdAt}>{formatHistoryDateTime(entry.createdAt)}</time></td>
              <td>
                {entry.requestId && entry.requestNo ? (
                  <Link className="table-action font-mono-code" params={{ requestId: entry.requestId }} to="/requests/$requestId">
                    {entry.requestNo}
                  </Link>
                ) : entry.requestNo ?? 'Workflow configuration'}
              </td>
              <td>{entry.actorDisplayName}</td>
              <td>{actionLabel(entry.actionType)}</td>
              <td><HistoryChanges metadata={entry.metadata} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
    {onOffsetChange ? (
      <div className="table-footer" aria-label="Audit history pagination">
        <span>{offset + 1}–{offset + entries.length} of {total} entries</span>
        <div className="toolbar__actions">
          {onPageSizeChange ? (
            <label className="page-size">
              Rows per page
              <select value={pageSize} disabled={loading} onChange={(event) => onPageSizeChange(Number(event.target.value))}>
                {PAGE_SIZES.map((size) => <option key={size} value={size}>{size}</option>)}
              </select>
            </label>
          ) : null}
          <button type="button" className="btn-secondary" disabled={loading || !offset} onClick={() => onOffsetChange(Math.max(0, offset - pageSize))}>Previous</button>
          <button type="button" className="btn-secondary" disabled={loading || offset + pageSize >= total} onClick={() => onOffsetChange(offset + pageSize)}>Next</button>
        </div>
      </div>
    ) : null}
    </>
  )
}

export function DraftDeletionsTable({
  deletions,
  loading,
  error,
  offset,
  onOffsetChange,
  onRetry,
}: {
  deletions: { items: DraftDeletion[]; total: number; limit: number; offset: number } | null
  loading: boolean
  error: string | null
  offset: number
  onOffsetChange: (newOffset: number) => void
  onRetry: () => void
}) {
  if (loading && (!deletions || deletions.items.length === 0)) {
    return <AsyncNotice kind="loading" title="Loading draft deletion records…" />
  }

  if (error) {
    return (
      <AsyncNotice
        kind="error"
        title={`Unable to load draft deletions: ${error}`}
        action={<button type="button" className="btn-secondary" onClick={onRetry}>Retry draft deletions</button>}
      />
    )
  }

  if (!deletions || deletions.items.length === 0) {
    return <AsyncNotice kind="empty" title="No draft deletions recorded." />
  }

  return (
    <>
      <p className="sr-only" role="status">{loading ? 'Updating draft deletions…' : ''}</p>
      <div className="data-table" role="region" aria-label="Draft deletion records" tabIndex={0} aria-busy={loading} inert={loading}>
        <table>
          <thead>
            <tr>
              <th scope="col">Draft number</th>
              <th scope="col">Deleted by</th>
              <th scope="col">Role</th>
              <th scope="col">Deleted at</th>
            </tr>
          </thead>
          <tbody>
            {deletions.items.map((event, index) => (
              <tr key={`${event.draftNo}-${event.deletedAt}-${index}`}>
                <td data-label="Draft number"><span className="font-mono-code">{event.draftNo}</span></td>
                <td data-label="Deleted by">{event.actorDisplayName}</td>
                <td data-label="Role">{event.actorRole}</td>
                <td data-label="Deleted at"><time dateTime={event.deletedAt}>{formatHistoryDateTime(event.deletedAt)}</time></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="table-footer" aria-label="Draft deletion pagination">
        <span>{deletions.total} deletion records</span>
        <div className="toolbar__actions">
          <button
            type="button"
            className="btn-secondary"
            disabled={loading || !offset}
            onClick={() => onOffsetChange(Math.max(0, offset - deletions.limit))}
          >
            Previous
          </button>
          <button
            type="button"
            className="btn-secondary"
            disabled={loading || offset + deletions.limit >= deletions.total}
            onClick={() => onOffsetChange(offset + deletions.limit)}
          >
            Next
          </button>
        </div>
      </div>
    </>
  )
}

export function GlobalHistoryPage() {
  const [activeTab, setActiveTab] = useState<'system' | 'deletions'>('system')
  const [currentUser, setCurrentUser] = useState<{ role: string } | null>(null)
  const [filters, setFilters] = useState<GlobalAuditLogFilterValues>({
    ...EMPTY_GLOBAL_AUDIT_LOG_FILTERS,
  })
  const [appliedFilters, setAppliedFilters] = useState<GlobalAuditLogQuery>({})
  const [historyOffset, setHistoryOffset] = useState(0)
  const [pageSize, setPageSize] = useState(PAGE_SIZE)
  const [historyTotal, setHistoryTotal] = useState(0)
  const [history, setHistory] = useState<AsyncState<GlobalAuditLogEntry[]>>({
    loading: true,
    error: null,
    data: [],
  })

  const [deletionOffset, setDeletionOffset] = useState(0)
  const [deletionRetry, setDeletionRetry] = useState(0)
  const [deletions, setDeletions] = useState<{ items: DraftDeletion[]; total: number; limit: number; offset: number } | null>(null)
  const [deletionLoading, setDeletionLoading] = useState(false)
  const [deletionError, setDeletionError] = useState<string | null>(null)

  useEffect(() => {
    let mounted = true
    async function checkUser() {
      try {
        const response = await fetchCurrentUser()
        if (mounted) setCurrentUser(response.user)
      } catch {
        if (mounted) setCurrentUser(null)
      }
    }
    void checkUser()
    return () => {
      mounted = false
    }
  }, [])

  useEffect(() => {
    let mounted = true

    async function loadHistory() {
      setHistory((current) => ({ ...current, loading: true, error: null }))

      try {
        const page = await api.fetchGlobalAuditLogs({ ...appliedFilters, limit: pageSize, offset: historyOffset })

        if (mounted) {
          setHistoryTotal(page.total)
          setHistory({ loading: false, error: null, data: page.items })
        }
      } catch (loadError) {
        if (mounted) {
          setHistory({
            loading: false,
            error: loadError instanceof Error ? loadError.message : 'Unable to load global audit history',
            data: [],
          })
        }
      }
    }

    void loadHistory()

    return () => {
      mounted = false
    }
  }, [appliedFilters, historyOffset, pageSize])

  useEffect(() => {
    if (activeTab !== 'deletions' || currentUser?.role !== 'admin') return
    let mounted = true

    async function loadDeletions() {
      setDeletionLoading(true)
      setDeletionError(null)

      try {
        const result = await api.fetchDraftDeletions({ limit: 25, offset: deletionOffset })
        if (mounted) setDeletions(result)
      } catch (loadError) {
        if (mounted) {
          setDeletions(null)
          setDeletionError(loadError instanceof Error ? loadError.message : 'Unable to load draft deletions')
        }
      } finally {
        if (mounted) setDeletionLoading(false)
      }
    }

    void loadDeletions()

    return () => {
      mounted = false
    }
  }, [activeTab, currentUser?.role, deletionOffset, deletionRetry])

  function updateFilter(field: keyof GlobalAuditLogFilterValues, value: string) {
    setFilters((currentFilters) => ({ ...currentFilters, [field]: value }))
  }

  function applyFilters() {
    setHistoryOffset(0)
    setAppliedFilters(buildGlobalAuditLogQuery(filters))
  }

  function clearFilters() {
    setFilters({ ...EMPTY_GLOBAL_AUDIT_LOG_FILTERS })
    setHistoryOffset(0)
    setAppliedFilters({})
  }

  const isAdmin = currentUser?.role === 'admin'

  return (
    <article className="page-card workflow-page global-history-page">
      <PageHeader title="Audit History" description="Review authorized request and configuration activity. Edit filters, then choose Apply to update the results." />

      {isAdmin ? (
        <div className="detail-tabs" role="tablist" aria-label="Audit history sections">
          <button
            type="button"
            id="history-tab-system"
            role="tab"
            aria-selected={activeTab === 'system'}
            aria-controls="history-panel-system"
            tabIndex={activeTab === 'system' ? 0 : -1}
            onClick={() => setActiveTab('system')}
          >
            System Audit Trail
          </button>
          <button
            type="button"
            id="history-tab-deletions"
            role="tab"
            aria-selected={activeTab === 'deletions'}
            aria-controls="history-panel-deletions"
            tabIndex={activeTab === 'deletions' ? 0 : -1}
            onClick={() => setActiveTab('deletions')}
          >
            Draft Deletions
          </button>
        </div>
      ) : null}

      {activeTab === 'system' || !isAdmin ? (
        <div
          id={isAdmin ? 'history-panel-system' : undefined}
          role={isAdmin ? 'tabpanel' : undefined}
          aria-labelledby={isAdmin ? 'history-tab-system' : undefined}
        >
          <section className="workflow-section global-history-page__filters" aria-labelledby="global-history-filters-heading">
            <h2 className="sr-only" id="global-history-filters-heading">Filters</h2>
            <GlobalAuditLogFilters
              filters={filters}
              onApply={applyFilters}
              onChange={updateFilter}
              onClear={clearFilters}
            />
          </section>

          <section className="workflow-section global-history-page__results" aria-labelledby="global-history-results-heading">
            <h2 className="sr-only" id="global-history-results-heading">Audit entries</h2>
            <GlobalAuditLogTable
              entries={history.data}
              error={history.error}
              loading={history.loading}
              offset={historyOffset}
              onOffsetChange={setHistoryOffset}
              onPageSizeChange={(size) => { setHistoryOffset(0); setPageSize(size) }}
              pageSize={pageSize}
              total={historyTotal}
            />
          </section>
        </div>
      ) : (
        <div id="history-panel-deletions" role="tabpanel" aria-labelledby="history-tab-deletions">
          <section className="workflow-section global-history-page__results" aria-labelledby="draft-deletions-heading">
            <div className="section-heading">
              <h2 id="draft-deletions-heading">Draft Deletions</h2>
              <p>Only the Draft number, deleting account and time remain. Displayed times: Asia/Bangkok (UTC+07:00).</p>
            </div>
            <DraftDeletionsTable
              deletions={deletions}
              loading={deletionLoading}
              error={deletionError}
              offset={deletionOffset}
              onOffsetChange={setDeletionOffset}
              onRetry={() => setDeletionRetry(r => r + 1)}
            />
          </section>
        </div>
      )}
    </article>
  )
}
