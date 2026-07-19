import { Link } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
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
  { label: 'Request status changed', value: 'REQUEST_STATUS_CHANGED' },
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

function formatDateTime(value: string): string {
  const date = new Date(value)
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'medium' })
}

function actionLabel(actionType: PsfRequestHistoryAction): string {
  return AUDIT_ACTIONS.find((action) => action.value === actionType)?.label ?? actionType
}

function auditDetail(entry: GlobalAuditLogEntry): string {
  const fromStatus = entry.metadata.fromStatus
  const toStatus = entry.metadata.toStatus

  if (
    entry.actionType === 'REQUEST_STATUS_CHANGED' &&
    typeof fromStatus === 'string' &&
    typeof toStatus === 'string'
  ) {
    return `Status: ${fromStatus} → ${toStatus}`
  }

  return '—'
}

export function GlobalAuditLogFilters({
  filters,
  onApply,
  onChange,
  onClear,
}: GlobalAuditLogFiltersProps) {
  return (
    <form
      className="filter-bar"
      onSubmit={(event) => {
        event.preventDefault()
        onApply()
      }}
    >
      <label>
        Request ID
        <input
          name="requestId"
          onChange={(event) => onChange('requestId', event.target.value)}
          type="text"
          value={filters.requestId}
        />
      </label>
      <label>
        User
        <input
          name="user"
          onChange={(event) => onChange('user', event.target.value)}
          type="text"
          value={filters.user}
        />
      </label>
      <label>
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
      <div className="button-row">
        <button className="primary-button" type="submit">Apply</button>
        <button className="secondary-button" onClick={onClear} type="button">Clear</button>
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
  if (loading) {
    return <p className="page-card__description" role="status">Loading global audit history…</p>
  }

  if (error) {
    return (
      <p className="status-pill status-pill--error" role="alert">
        Unable to load global audit history: {error}
      </p>
    )
  }

  if (entries.length === 0) {
    return (
      <p className="page-card__description" role="status">
        No global audit history matches the current filters.
      </p>
    )
  }

  return (
    <div className="data-table" role="region" aria-label="Global audit history" tabIndex={0}>
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
              <td><time dateTime={entry.createdAt}>{formatDateTime(entry.createdAt)}</time></td>
              <td>
                <Link
                  className="table-action"
                  params={{ requestId: entry.requestId }}
                  to="/requests/$requestId"
                >
                  {entry.requestNo}
                </Link>
              </td>
              <td>
                <strong>{entry.actorDisplayName}</strong>
                <span>{entry.actorRole}</span>
              </td>
              <td>{actionLabel(entry.actionType)}</td>
              <td>{auditDetail(entry)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
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
      setHistory({ loading: true, error: null, data: [] })

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
    <article className="page-card workflow-page">
      <div className="page-card__header">
        <div>
          <p className="page-card__eyebrow">Administrator audit view</p>
          <h1>Global History</h1>
          <p className="page-card__description">
            Review authorized request audit events across the application. Filters are applied by the server.
          </p>
        </div>
      </div>

      <section className="workflow-section" aria-labelledby="global-history-filters-heading">
        <div className="section-heading">
          <div>
            <h2 id="global-history-filters-heading">Filters</h2>
            <p>From includes the UTC day start; To includes its UTC calendar day.</p>
          </div>
        </div>
        <GlobalAuditLogFilters
          filters={filters}
          onApply={applyFilters}
          onChange={updateFilter}
          onClear={clearFilters}
        />
      </section>

      <section className="workflow-section" aria-labelledby="global-history-results-heading">
        <div className="section-heading">
          <div>
            <h2 id="global-history-results-heading">Audit entries</h2>
            <p>Newest entries appear first.</p>
          </div>
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
