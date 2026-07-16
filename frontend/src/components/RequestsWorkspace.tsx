import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from '@tanstack/react-router'
import { ActiveSchemaForm } from './ActiveSchemaForm'
import {
  ApiError,
  api,
  fetchCurrentUser,
  type AuthenticatedUserProfile,
  type PsfRequestListItem,
  type PsfRequestQuery,
  type PsfRequestResponse,
} from '../services/api'

const WORKFLOW_STATUSES = [
  'Submitted',
  'Setup In Progress',
  'Need More Information',
  'PSF Created',
  'Completed',
  'Rejected',
  'Cancelled',
]

const ACTIONABLE_STATUSES = new Set(['Submitted', 'Setup In Progress', 'Need More Information'])

interface AsyncState<T> {
  loading: boolean
  error: string | null
  data: T
}

function formatDate(value: string | null | undefined): string {
  if (!value) {
    return '—'
  }

  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString('en-GB')
}

function statusClassName(status: string): string {
  return `status-badge status-badge--${status.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`
}

function requesterValueForCanonicalKey(request: PsfRequestResponse, canonicalKey: string): string | null {
  const matchingField = request.schemaSnapshot.sections
    .flatMap((section) => section.fields)
    .find((field) => field.canonicalKey === canonicalKey)
  const candidateValues = [
    matchingField ? request.requesterData[matchingField.fieldKey] : undefined,
    request.requesterData[canonicalKey],
  ]

  for (const value of candidateValues) {
    if (typeof value !== 'string') {
      continue
    }

    const trimmed = value.trim()
    if (trimmed) {
      return trimmed
    }
  }

  return null
}

function getRequestTitle(request: PsfRequestListItem | PsfRequestResponse): string {
  if ('title' in request && request.title) {
    return request.title
  }

  const snapshotTitle = 'schemaSnapshot' in request ? requesterValueForCanonicalKey(request, 'title') : null
  if (snapshotTitle) {
    return snapshotTitle
  }

  const productType = request.productType ?? ('schemaSnapshot' in request ? requesterValueForCanonicalKey(request, 'product_type') : null)
  return productType ? `${productType} PSF request` : 'Untitled PSF request'
}

function getOwnerLabel(request: PsfRequestListItem | PsfRequestResponse): string {
  const owner = request.setupOwner ?? 'Unassigned'
  const dept = request.setupOwnerRole ? ` / ${request.setupOwnerRole}` : ''
  return `${owner}${dept}`
}

interface RequestDetailSummary {
  requestNo: string
  title: string
  productType: string
  status: string
  priority: string
  dueDate: string | null
  requester: string
  owner: string
}

function buildRequestDetailSummary(request: PsfRequestResponse): RequestDetailSummary {
  return {
    requestNo: request.requestNo,
    title: getRequestTitle(request),
    productType: request.productType ?? requesterValueForCanonicalKey(request, 'product_type') ?? '—',
    status: request.status,
    priority: requesterValueForCanonicalKey(request, 'priority') ?? 'Normal',
    dueDate: requesterValueForCanonicalKey(request, 'due_date'),
    requester: request.requester ?? requesterValueForCanonicalKey(request, 'requester') ?? '—',
    owner: getOwnerLabel(request),
  }
}

export function RequestHeaderSummary({ request }: { request: PsfRequestResponse }) {
  const summary = buildRequestDetailSummary(request)

  return (
    <section className="detail-summary-grid" aria-label="Request header">
      <div><span>Request No.</span><strong>{summary.requestNo}</strong></div>
      <div><span>Title</span><strong>{summary.title}</strong></div>
      <div><span>Product Type</span><strong>{summary.productType}</strong></div>
      <div><span>Status</span><strong className={statusClassName(summary.status)}>{summary.status}</strong></div>
      <div><span>Priority</span><strong>{summary.priority}</strong></div>
      <div><span>Due Date</span><strong>{formatDate(summary.dueDate)}</strong></div>
      <div><span>Requester</span><strong>{summary.requester}</strong></div>
      <div><span>Owner / Dept</span><strong>{summary.owner}</strong></div>
    </section>
  )
}

function roleAwareRequestQuery(user: AuthenticatedUserProfile | null, extra: PsfRequestQuery = {}): PsfRequestQuery {
  if (!user) {
    return extra
  }

  if (user.role === 'requester') {
    return { ...extra, requester: user.displayName }
  }

  return extra
}

async function loadCurrentUserOrNull(): Promise<AuthenticatedUserProfile | null> {
  try {
    const response = await fetchCurrentUser()
    return response.user
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) {
      return null
    }

    throw error
  }
}

function RequestsTable({ items, compact = false }: { items: PsfRequestListItem[]; compact?: boolean }) {
  if (items.length === 0) {
    return <p className="page-card__description">No PSF requests match the current view.</p>
  }

  return (
    <div className="data-table" role="region" aria-label="PSF requests" tabIndex={0}>
      <table>
        <thead>
          <tr>
            <th>Request No.</th>
            <th>Title / Product Type</th>
            <th>Status</th>
            <th>Priority</th>
            <th>Due Date</th>
            {!compact ? <th>Requester</th> : null}
            <th>Owner / Dept</th>
            <th>Action</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.requestId}>
              <td>{item.requestNo}</td>
              <td>
                <strong>{getRequestTitle(item)}</strong>
                <span>{item.productType ?? 'No product type'}</span>
              </td>
              <td>
                <span className={statusClassName(item.status)}>{item.status}</span>
              </td>
              <td>{item.priority ?? 'Normal'}</td>
              <td>{formatDate(item.dueDate)}</td>
              {!compact ? <td>{item.requester ?? '—'}</td> : null}
              <td>{getOwnerLabel(item)}</td>
              <td>
                <Link className="table-action" to="/requests/$requestId" params={{ requestId: item.requestId }}>
                  Open detail
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function SummaryCard({ label, value, helper }: { label: string; value: number; helper: string }) {
  return (
    <section className="summary-card">
      <p>{label}</p>
      <strong>{value}</strong>
      <span>{helper}</span>
    </section>
  )
}

export function DashboardPage() {
  const [state, setState] = useState<AsyncState<{ user: AuthenticatedUserProfile | null; items: PsfRequestListItem[]; loadedAt: number }>>({
    loading: true,
    error: null,
    data: { user: null, items: [], loadedAt: 0 },
  })

  useEffect(() => {
    let mounted = true

    async function loadDashboard() {
      try {
        const user = await loadCurrentUserOrNull()
        const response = await api.queryPsfRequests(roleAwareRequestQuery(user, { limit: 100 }))

        if (mounted) {
          setState({ loading: false, error: null, data: { user, items: response.items, loadedAt: Date.now() } })
        }
      } catch (error) {
        if (mounted) {
          setState({
            loading: false,
            error: error instanceof Error ? error.message : 'Unable to load dashboard requests',
            data: { user: null, items: [], loadedAt: 0 },
          })
        }
      }
    }

    void loadDashboard()

    return () => {
      mounted = false
    }
  }, [])

  const cards = useMemo(() => {
    const items = state.data.items
    return [
      {
        label: 'My Open Requests',
        value: items.filter((item) => !['Completed', 'Rejected', 'Cancelled'].includes(item.status)).length,
        helper: state.data.user?.role === 'requester' ? 'Your active requester work' : 'Open requests in current view',
      },
      {
        label: 'Waiting for Setup',
        value: items.filter((item) => item.status === 'Submitted').length,
        helper: 'Submitted and ready for setup owner action',
      },
      {
        label: 'Setup In Progress',
        value: items.filter((item) => item.status === 'Setup In Progress').length,
        helper: 'Requests already being prepared',
      },
      {
        label: 'Overdue',
        value: items.filter((item) => item.dueDate && new Date(item.dueDate).getTime() < state.data.loadedAt).length,
        helper: 'Due date has passed',
      },
    ]
  }, [state.data.items, state.data.loadedAt, state.data.user?.role])

  return (
    <article className="page-card workflow-page">
      <div className="page-card__header">
        <div>
          <p className="page-card__eyebrow">Operational queue</p>
          <h1>Dashboard</h1>
          <p className="page-card__description">
            Four-card Phase 2 queue view. Setup Owners and Admins see all statuses by default; cards are highlights, not visibility limits.
          </p>
        </div>
        <Link className="primary-button" to="/requests/new">
          New request
        </Link>
      </div>

      {state.loading ? <p className="page-card__description">Loading dashboard queue…</p> : null}
      {state.error ? <p className="status-pill status-pill--error">{state.error}</p> : null}

      <div className="summary-grid">
        {cards.map((card) => (
          <SummaryCard key={card.label} {...card} />
        ))}
      </div>

      <section className="workflow-section">
        <div className="section-heading">
          <div>
            <h2>Queue</h2>
            <p>{state.data.items.length} visible request(s) across available statuses.</p>
          </div>
          <Link className="secondary-button" to="/requests">
            Full PSF Requests search
          </Link>
        </div>
        <RequestsTable compact items={state.data.items} />
      </section>
    </article>
  )
}

export function RequestsListPage() {
  const [filters, setFilters] = useState({ keyword: '', status: '', productType: '' })
  const [state, setState] = useState<AsyncState<{ user: AuthenticatedUserProfile | null; items: PsfRequestListItem[]; total: number }>>({
    loading: true,
    error: null,
    data: { user: null, items: [], total: 0 },
  })

  useEffect(() => {
    let mounted = true

    async function loadRequests() {
      setState((current) => ({ ...current, loading: true, error: null }))

      try {
        const user = await loadCurrentUserOrNull()
        const response = await api.queryPsfRequests(
          roleAwareRequestQuery(user, {
            keyword: filters.keyword.trim() || undefined,
            status: filters.status || undefined,
            productType: filters.productType.trim() || undefined,
            limit: 100,
          }),
        )

        if (mounted) {
          setState({ loading: false, error: null, data: { user, items: response.items, total: response.total } })
        }
      } catch (error) {
        if (mounted) {
          setState((current) => ({
            ...current,
            loading: false,
            error: error instanceof Error ? error.message : 'Unable to load PSF requests',
          }))
        }
      }
    }

    void loadRequests()

    return () => {
      mounted = false
    }
  }, [filters.keyword, filters.productType, filters.status])

  return (
    <article className="page-card workflow-page">
      <div className="page-card__header">
        <div>
          <p className="page-card__eyebrow">Search and browse</p>
          <h1>PSF Requests</h1>
          <p className="page-card__description">
            API-backed list/search for all visible requests. Use Dashboard for focused queue work and this page for lookup.
          </p>
        </div>
        <div className="button-row">
          <Link className="primary-button" to="/requests/new">
            New request
          </Link>
          <Link className="secondary-button" to="/admin/export-profile">
            Export entry point
          </Link>
        </div>
      </div>

      <form className="filter-bar" onSubmit={(event) => event.preventDefault()}>
        <label>
          Keyword
          <input value={filters.keyword} onChange={(event) => setFilters((current) => ({ ...current, keyword: event.target.value }))} placeholder="Request no, title, PSF name…" />
        </label>
        <label>
          Status
          <select value={filters.status} onChange={(event) => setFilters((current) => ({ ...current, status: event.target.value }))}>
            <option value="">All statuses</option>
            {WORKFLOW_STATUSES.map((status) => (
              <option key={status} value={status}>
                {status}
              </option>
            ))}
          </select>
        </label>
        <label>
          Product Type
          <input value={filters.productType} onChange={(event) => setFilters((current) => ({ ...current, productType: event.target.value }))} placeholder="Existing Product" />
        </label>
      </form>

      {state.loading ? <p className="page-card__description">Loading request list…</p> : null}
      {state.error ? <p className="status-pill status-pill--error">{state.error}</p> : null}
      <p className="page-card__description">Showing {state.data.items.length} of {state.data.total} matched request(s).</p>
      <RequestsTable items={state.data.items} />
    </article>
  )
}

export function RequestDetailRoutePage() {
  const { requestId } = useParams({ from: '/requests/$requestId/' })
  return <RequestDetailShell requestId={requestId} />
}

export function RequestDetailShell({ requestId }: { requestId: string }) {
  const [request, setRequest] = useState<PsfRequestResponse | null>(null)
  const [status, setStatus] = useState('')
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [savingStatus, setSavingStatus] = useState(false)

  useEffect(() => {
    let mounted = true

    async function loadRequest() {
      try {
        const response = await api.fetchPsfRequest(requestId)
        if (mounted) {
          setRequest(response)
          setStatus(response.status)
          setLoading(false)
        }
      } catch (loadError) {
        if (mounted) {
          setError(loadError instanceof Error ? loadError.message : 'Unable to load PSF request')
          setLoading(false)
        }
      }
    }

    void loadRequest()

    return () => {
      mounted = false
    }
  }, [requestId])

  async function updateStatus() {
    if (!request || !status || status === request.status) {
      return
    }

    setSavingStatus(true)
    setError(null)
    setMessage(null)

    try {
      const updated = await api.updatePsfRequestStatus(request.id, { status })
      setRequest(updated)
      setStatus(updated.status)
      setMessage(`Request ${updated.requestNo} moved to ${updated.status}.`)
    } catch (statusError) {
      setError(statusError instanceof Error ? statusError.message : 'Unable to update workflow status')
    } finally {
      setSavingStatus(false)
    }
  }

  return (
    <article className="page-card workflow-page">
      <div className="page-card__header">
        <div>
          <p className="page-card__eyebrow">{request ? `Request ${request.requestNo}` : 'Workflow detail'}</p>
          <h1>{request ? getRequestTitle(request) : 'PSF Request Detail'}</h1>
          <p className="page-card__description">
            Header summary, workflow actions, manual status transition, and schema-driven requester information.
          </p>
        </div>
        <div className="button-row">
          <Link className="secondary-button" to="/requests/$requestId/history" params={{ requestId }}>
            Request history
          </Link>
          <Link className="secondary-button" to="/history">
            Global History
          </Link>
        </div>
      </div>

      {loading ? <p className="page-card__description">Loading request detail…</p> : null}
      {error ? <p className="status-pill status-pill--error" role="alert">{error}</p> : null}
      {message ? <p className="status-pill status-pill--success" role="status">{message}</p> : null}

      {request ? (
        <>
          <RequestHeaderSummary request={request} />

          <section className="workflow-section">
            <div className="section-heading">
              <div>
                <h2>Workflow actions</h2>
                <p>Quick action candidates are shown by status; the manual dropdown is validated by the backend session role.</p>
              </div>
            </div>
            <div className="workflow-actions">
              {ACTIONABLE_STATUSES.has(request.status) ? <span className="status-pill">Action needed</span> : null}
              {request.status === 'Draft' ? (
                <p className="page-card__description">Draft requests must be submitted through the requester form before workflow status changes are available.</p>
              ) : (
                <>
                  <label>
                    Manual status
                    <select value={status} onChange={(event) => setStatus(event.target.value)}>
                      {[request.status, ...WORKFLOW_STATUSES.filter((candidate) => candidate !== request.status)].map((candidate) => (
                        <option key={candidate} value={candidate}>{candidate}</option>
                      ))}
                    </select>
                  </label>
                  <button className="primary-button" disabled={savingStatus || status === request.status} onClick={() => void updateStatus()} type="button">
                    {savingStatus ? 'Updating…' : 'Update status'}
                  </button>
                </>
              )}
            </div>
          </section>

          <section className="workflow-section">
            <h2>Requester Information</h2>
            <ActiveSchemaForm mode="request" requestId={requestId} />
          </section>

          <section className="workflow-section">
            <h2>PSF Created Information</h2>
            {request.status === 'PSF Created' || request.status === 'Completed' ? (
              <pre className="json-preview">{JSON.stringify(request.psfCreatedData, null, 2)}</pre>
            ) : (
              <p className="page-card__description">
                PSF Created Information is reserved for Setup Owners and becomes visible to Requesters after PSF Created or Completed.
              </p>
            )}
          </section>
        </>
      ) : null}
    </article>
  )
}
