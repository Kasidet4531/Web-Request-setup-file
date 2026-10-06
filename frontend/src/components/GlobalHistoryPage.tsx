import { HistoryChanges } from './ui/HistoryChanges'
import { formatHistoryDateTime } from './ui/historyDateTime'
import { Link } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { PageHeader } from './ui/PageHeader'
import { AsyncNotice } from './ui/AsyncNotice'
import {
  api,
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
  { label: 'Request assignee changed', value: 'REQUEST_ASSIGNEE_CHANGED' },
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

export function GlobalAuditLogTable({
  entries,
  error,
  loading,
}: {
  entries: GlobalAuditLogEntry[]
  error: string | null
  loading: boolean
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
    <p className="table-scroll__hint">Scroll horizontally to see audit actors, actions, and details.</p>
    <div className="data-table" role="region" aria-label="Global audit history" tabIndex={0} aria-busy={loading} inert={loading}>
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
              <td>
                <strong>{entry.actorDisplayName}</strong>
                <span>{entry.actorRole}</span>
              </td>
              <td>{actionLabel(entry.actionType)}</td>
              <td><HistoryChanges metadata={entry.metadata} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
    </>
  )
}

export function GlobalHistoryPage() {
  const [filters, setFilters] = useState<GlobalAuditLogFilterValues>({
    ...EMPTY_GLOBAL_AUDIT_LOG_FILTERS,
  })
  const [appliedFilters, setAppliedFilters] = useState<GlobalAuditLogQuery>({})
  const [history, setHistory] = useState<AsyncState<GlobalAuditLogEntry[]>>({
    loading: true,
    error: null,
    data: [],
  })

  useEffect(() => {
    let mounted = true

    async function loadHistory() {
      setHistory((current) => ({ ...current, loading: true, error: null }))

      try {
        const entries = await api.fetchGlobalAuditLogs(appliedFilters)

        if (mounted) {
          setHistory({ loading: false, error: null, data: entries })
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
  }, [appliedFilters])

  function updateFilter(field: keyof GlobalAuditLogFilterValues, value: string) {
    setFilters((currentFilters) => ({ ...currentFilters, [field]: value }))
  }

  function applyFilters() {
    setAppliedFilters(buildGlobalAuditLogQuery(filters))
  }

  function clearFilters() {
    setFilters({ ...EMPTY_GLOBAL_AUDIT_LOG_FILTERS })
    setAppliedFilters({})
  }

  return (
    <article className="page-card workflow-page global-history-page">
      <PageHeader title="Audit History" description="Review authorized request and configuration activity. Edit filters, then choose Apply to update the results." />

      <section className="workflow-section global-history-page__filters" aria-labelledby="global-history-filters-heading">
        <div className="section-heading">
          <h2 id="global-history-filters-heading">Filters</h2>
        </div>
        <GlobalAuditLogFilters
          filters={filters}
          onApply={applyFilters}
          onChange={updateFilter}
          onClear={clearFilters}
        />
      </section>

      <section className="workflow-section global-history-page__results" aria-labelledby="global-history-results-heading">
        <div className="section-heading">
          <h2 id="global-history-results-heading">Audit entries</h2>
          <p>Displayed times: Asia/Bangkok (UTC+07:00). Date filters use UTC.</p>
        </div>
        <GlobalAuditLogTable
          entries={history.data}
          error={history.error}
          loading={history.loading}
        />
      </section>
    </article>
  )
}
