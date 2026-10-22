import { HistoryChanges } from './ui/HistoryChanges'
import { formatHistoryDateTime } from './ui/historyDateTime'
import { Link } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { Search, SlidersHorizontal, RotateCcw } from 'lucide-react'
import { PageHeader } from './ui/PageHeader'
import { ROW_PX, pagedMinHeight } from './ui/tableLayout'
import { AsyncNotice } from './ui/AsyncNotice'
import {
  api,
  fetchCurrentUser,
  type DraftDeletion,
  type GlobalAuditLogEntry,
  type PsfRequestHistoryAction,
} from '../services/api'
import {
  EMPTY_GLOBAL_AUDIT_LOG_FILTERS,
  buildGlobalAuditLogQuery,
  historyDateRangeError,
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
  { label: 'Attachment uploaded', value: 'ATTACHMENT_UPLOADED' },
  { label: 'Attachment deleted', value: 'ATTACHMENT_DELETED' },
]

export interface GlobalAuditLogFiltersProps {
  filters: GlobalAuditLogFilterValues
  onChange: (field: keyof GlobalAuditLogFilterValues, value: string) => void
  onClear: () => void
  moreFiltersOpen?: boolean
  onToggleMoreFilters?: () => void
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
  onChange,
  onClear,
  moreFiltersOpen = false,
  onToggleMoreFilters,
}: GlobalAuditLogFiltersProps) {
  const dateError = historyDateRangeError(filters.from, filters.to)
  const active = Boolean(filters.keyword.trim() || filters.actionType || filters.from || filters.to)
  return (
    <div>
      <form className="filter-bar global-history-filters" onSubmit={(event) => event.preventDefault()}>
        <label className="global-history-filters__search">
          Search
          <span className="filter-bar__control">
            <Search size={16} aria-hidden="true" />
            <input className="input-with-icon" name="keyword" type="search" placeholder="Search history…"
              aria-describedby="history-search-help" value={filters.keyword}
              onChange={(event) => onChange('keyword', event.target.value)} />
          </span>
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
        <button className="btn-secondary" type="button" aria-expanded={moreFiltersOpen}
          aria-controls="history-more-filters" onClick={onToggleMoreFilters}>
          <SlidersHorizontal size={14} aria-hidden="true" />More filters
        </button>
        <button className="btn-secondary" onClick={onClear} type="button" disabled={!active}>
          <RotateCcw size={14} aria-hidden="true" />Clear filters
        </button>
      </form>
      <p className="filter-help" id="history-search-help">Searches request no., product description, user name and username.</p>
      <div className="global-history-filters__dates" id="history-more-filters" hidden={!moreFiltersOpen}>
        <label>
          From (Bangkok)
          <input
            name="from"
            onChange={(event) => onChange('from', event.target.value)}
            type="date"
            value={filters.from}
            max={filters.to || undefined}
            aria-invalid={Boolean(dateError)}
            aria-describedby={dateError ? 'history-date-error' : undefined}
          />
        </label>
        <label>
          To (Bangkok)
          <input
            name="to"
            onChange={(event) => onChange('to', event.target.value)}
            type="date"
            value={filters.to}
            min={filters.from || undefined}
            aria-invalid={Boolean(dateError)}
            aria-describedby={dateError ? 'history-date-error' : undefined}
          />
        </label>
      </div>
      {filters.from || filters.to ? <p className="history-active-dates">Dates (Bangkok): {filters.from || 'Any start date'} – {filters.to || 'Any end date'}</p> : null}
      {dateError ? <p className="field-error" id="history-date-error" role="alert">{dateError}</p> : null}
    </div>
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
                {/* Product_Description reads better than a Draft number, which is not shown. */}
                {entry.requestId && entry.requestNo ? (
                  <span className="request-cell-stack">
                    <Link className="table-action" params={{ requestId: entry.requestId }} to="/requests/$requestId">
                      {entry.requestLabel ?? entry.requestNo}
                    </Link>
                    {entry.requestLabel && !entry.requestNo.startsWith('DRAFT-') ? <span className="font-mono-code">{entry.requestNo}</span> : null}
                  </span>
                ) : entry.requestLabel ?? entry.requestNo ?? 'Workflow configuration'}
              </td>
              <td>{entry.actorDisplayName}</td>
              <td>{actionLabel(entry.actionType)}</td>
              <td>
                {/* A Request Snapshot shows what its entry changed, so the row offers it alone (an Attachment keeps its file name);
                    an inline View changes would widen the column as it opens. */}
                {entry.requestId && entry.hasRequestSnapshot ? <>
                  {typeof entry.metadata.filename === 'string' ? <HistoryChanges metadata={entry.metadata} /> : null}
                  <Link className="table-action request-snapshot-link" params={{ requestId: entry.requestId, entryId: entry.id }} to="/requests/$requestId/history/$entryId">View Request Snapshot</Link>
                </> : <HistoryChanges metadata={entry.metadata} />}
              </td>
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
  const [debouncedKeyword, setDebouncedKeyword] = useState('')
  const [moreFiltersOpen, setMoreFiltersOpen] = useState(false)
  const [historyOffset, setHistoryOffset] = useState(0)
  const [pageSize, setPageSize] = useState(PAGE_SIZE)
  const { actionType, from, to } = filters
  const keyword = filters.keyword.trim()
  const dateError = historyDateRangeError(from, to)
  const queryKey = JSON.stringify([debouncedKeyword, actionType, from, to, historyOffset, pageSize])
  const [history, setHistory] = useState<AsyncState<GlobalAuditLogEntry[]> & { total: number; offset: number; limit: number; queryKey: string | null }>({
    loading: true,
    error: null,
    data: [],
    total: 0, offset: 0, limit: PAGE_SIZE, queryKey: null,
  })

  const [deletionOffset, setDeletionOffset] = useState(0)
  const [deletionRetry, setDeletionRetry] = useState(0)
  const [deletions, setDeletions] = useState<{ items: DraftDeletion[]; total: number; limit: number; offset: number } | null>(null)
  const [deletionLoading, setDeletionLoading] = useState(false)
  const [deletionError, setDeletionError] = useState<string | null>(null)

  useEffect(() => {
    if (keyword === debouncedKeyword) return
    const timer = setTimeout(() => { setDebouncedKeyword(keyword); setHistoryOffset(0) }, 300)
    return () => clearTimeout(timer)
  }, [keyword, debouncedKeyword])

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
    if (dateError || keyword !== debouncedKeyword) return
    let mounted = true

    async function loadHistory() {
      setHistory((current) => ({ ...current, loading: true, error: null }))

      try {
        const page = await api.fetchGlobalAuditLogs({
          ...buildGlobalAuditLogQuery({ keyword: debouncedKeyword, actionType, from, to }),
          limit: pageSize, offset: historyOffset,
        })

        if (mounted) {
          setHistory({ loading: false, error: null, data: page.items, total: page.total, offset: page.offset, limit: page.limit, queryKey })
        }
      } catch (loadError) {
        if (mounted) {
          setHistory({
            loading: false,
            error: loadError instanceof Error ? loadError.message : 'Unable to load global audit history',
            data: [],
            total: 0, offset: 0, limit: pageSize, queryKey,
          })
        }
      }
    }

    void loadHistory()

    return () => {
      mounted = false
    }
  }, [keyword, debouncedKeyword, actionType, from, to, dateError, queryKey, historyOffset, pageSize])

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
    if (field !== 'keyword') setHistoryOffset(0)
  }

  function clearFilters() {
    setFilters({ ...EMPTY_GLOBAL_AUDIT_LOG_FILTERS })
    setHistoryOffset(0)
    setDebouncedKeyword('')
  }

  const isAdmin = currentUser?.role === 'admin'
  const pending = history.loading || keyword !== debouncedKeyword || history.queryKey !== queryKey

  return (
    <article className="page-card workflow-page global-history-page">
      <PageHeader title="Audit History" description="Review request and configuration activity. Search and filters update automatically." />

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
              onChange={updateFilter}
              onClear={clearFilters}
              moreFiltersOpen={moreFiltersOpen}
              onToggleMoreFilters={() => setMoreFiltersOpen((open) => !open)}
            />
          </section>

          <section className="workflow-section global-history-page__results" aria-labelledby="global-history-results-heading">
            <h2 className="sr-only" id="global-history-results-heading">Audit entries</h2>
            <GlobalAuditLogTable
              entries={history.data}
              error={history.error}
              loading={pending && !dateError}
              offset={history.offset}
              onOffsetChange={setHistoryOffset}
              onPageSizeChange={(size) => { setHistoryOffset(0); setPageSize(size) }}
              pageSize={history.limit}
              total={history.total}
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
