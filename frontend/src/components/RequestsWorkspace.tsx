import { useCallback, useEffect, useState } from 'react'
import { Link, useBlocker, useNavigate, useParams } from '@tanstack/react-router'
import {
  AlertTriangle,
  ArrowLeft,
  Calendar,
  Clock3,
  FileSpreadsheet,
  FileText,
  Inbox,
  RotateCcw,
  Search,
  User,
} from 'lucide-react'
import { ActiveSchemaForm } from './ActiveSchemaForm'
import { DynamicFormRenderer } from './DynamicFormRenderer'
import {
  ApiError,
  api,
  fetchCurrentUser,
  type AuthenticatedUserProfile,
  type PsfRequestHistoryEntry,
  type PsfRequestListItem,
  type PsfRequestQuery,
  type PsfRequestResponse,
} from '../services/api'
import type { DynamicFormValues } from '../types/forms'

interface AsyncState<T> {
  loading: boolean
  error: string | null
  errorStatus?: number
  data: T
}

function formatDate(value: string | null | undefined): string {
  if (!value) {
    return '—'
  }

  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString('en-GB')
}

function formatDateTime(value: string): string {
  const date = new Date(value)
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'medium' })
}

function historyActionSummary(entry: PsfRequestHistoryEntry): string {
  switch (entry.actionType) {
    case 'DRAFT_CREATED':
      return 'Draft created'
    case 'DRAFT_REQUESTER_DATA_UPDATED':
      return 'Draft requester information updated'
    case 'REQUEST_SUBMITTED':
      return 'Request submitted'
    case 'REQUEST_STATUS_CHANGED': {
      const fromStatus = entry.metadata.fromStatus
      const toStatus = entry.metadata.toStatus

      if (typeof fromStatus === 'string' && typeof toStatus === 'string') {
        return `${fromStatus} → ${toStatus}`
      }

      return 'Request status changed'
    }
    case 'REQUESTER_INFORMATION_UPDATED': return 'Requester information updated'
    case 'PSF_CREATED_INFORMATION_UPDATED': return 'PSF Created Information updated'
    case 'WORKFLOW_CATALOG_UPDATED': return 'Workflow catalog updated'
  }
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
    priority: requesterValueForCanonicalKey(request, 'priority') ?? 'Normal',
    dueDate: requesterValueForCanonicalKey(request, 'due_date'),
    requester: request.requester ?? requesterValueForCanonicalKey(request, 'requester') ?? '—',
    owner: getOwnerLabel(request),
  }
}

export function RequestHeaderSummary({ request }: { request: PsfRequestResponse }) {
  const summary = buildRequestDetailSummary(request)

  return (
    <section className="detail-summary" aria-label="Request header">
      <div className="detail-summary__heading">
        <h1>{summary.title}</h1>
      </div>
      <div className="detail-summary-grid">
        <div><span>Request No.</span><strong className="font-mono-code">{summary.requestNo}</strong></div>
        <div><span>Product Type</span><strong>{summary.productType}</strong></div>
        <div><span>Priority</span><strong className={priorityClassName(summary.priority)}>{summary.priority}</strong></div>
        <div><span>Due Date</span><strong>{formatDate(summary.dueDate)}</strong></div>
        <div><span>Requester</span><strong>{summary.requester}</strong></div>
        <div><span>Owner / Dept</span><strong>{summary.owner}</strong></div>
      </div>
    </section>
  )
}

export interface WorkflowStatusActionsProps {
  allowedNextStatuses: string[]
  currentStatus: string
  onApply: () => void
  onStatusChange: (status: string) => void
  saving: boolean
  selectedStatus: string
  isDraft?: boolean
  disabledReason?: string | null
}

export function WorkflowStatusActions({
  allowedNextStatuses,
  currentStatus,
  onApply,
  onStatusChange,
  saving,
  selectedStatus,
  isDraft = false,
  disabledReason = null,
}: WorkflowStatusActionsProps) {
  const options = [currentStatus, ...allowedNextStatuses.filter((status) => status !== currentStatus)]
  const canUpdate = selectedStatus !== currentStatus && allowedNextStatuses.includes(selectedStatus)

  return (
    <div className="workflow-actions__control">
      <label>
        <span>Status</span>
        <select disabled={saving} onChange={(event) => onStatusChange(event.target.value)} value={selectedStatus}>
          {options.map((status) => (
            <option key={status} value={status}>
              {status}
            </option>
          ))}
        </select>
      </label>
      <button className="btn-primary workflow-actions__apply" disabled={saving || !canUpdate || Boolean(disabledReason)} onClick={onApply} type="button">
        {saving ? (isDraft ? 'Submitting request…' : 'Applying status…') : isDraft ? 'Submit request' : 'Apply status'}
      </button>
      {disabledReason ? <p className="page-card__description" role="status">{disabledReason}</p> : null}
    </div>
  )
}

export const PSF_CREATED_INFORMATION_PLACEHOLDER =
  'PSF Created Information is not visible for this request. Requester access is released by the configured visibility trigger and remains available afterward; without a configured trigger, status changes do not release access.'

export interface PsfCreatedInformationPanelProps {
  onChange: (fieldKey: string, value: string) => void
  onSave: (values: DynamicFormValues) => void
  request: PsfRequestResponse
  saving: boolean
  disabled?: boolean
  values: DynamicFormValues
}

export function PsfCreatedInformationPanel({
  onChange,
  onSave,
  request,
  saving,
  disabled = false,
  values,
}: PsfCreatedInformationPanelProps) {
  if (!request.psfCreatedDataVisible) {
    return (
      <section className="psf-created-panel psf-created-panel--hidden" aria-labelledby="psf-created-heading">
        <h2 id="psf-created-heading">PSF Created Information</h2>
        <p className="page-card__description" role="status">
          {PSF_CREATED_INFORMATION_PLACEHOLDER}
        </p>
      </section>
    )
  }

  const canEdit = request.canEditPsfCreatedData

  return (
    <section className={`psf-created-panel psf-created-panel--${canEdit ? 'editable' : 'read-only'}`} aria-labelledby="psf-created-heading">
      <h2 id="psf-created-heading">PSF Created Information</h2>
      {saving ? <p className="page-card__description" role="status">Saving PSF Created Information…</p> : null}
      <DynamicFormRenderer
        onChange={canEdit && !saving && !disabled ? onChange : undefined}
        onSubmit={canEdit && !saving && !disabled ? onSave : undefined}
        readOnly={!canEdit || saving || disabled}
        schema={request.psfCreatedInformationSchema}
        showSchemaHeader={false}
        submitLabel="Save PSF Created Information"
        values={values}
      />
    </section>
  )
}

function buildPsfCreatedInformationValues(request: PsfRequestResponse): DynamicFormValues {
  return request.psfCreatedInformationSchema.sections.reduce<DynamicFormValues>((values, section) => {
    section.fields.forEach((field) => {
      const value = request.psfCreatedData[field.fieldKey]
      values[field.fieldKey] = typeof value === 'string' ? value : ''
    })

    return values
  }, {})
}

export function RequestHistoryPanel({
  entries,
  error,
  loading,
}: {
  entries: PsfRequestHistoryEntry[]
  error: string | null
  loading: boolean
}) {
  return (
    <section className="workflow-section request-history" aria-labelledby="request-history-heading">
      <div className="section-heading">
        <h2 id="request-history-heading">History</h2>
      </div>
      {loading ? <p className="page-card__description" role="status">Loading request history…</p> : null}
      {error ? (
        <p className="status-pill status-pill--error" role="alert">
          Unable to load request history: {error}
        </p>
      ) : null}
      {!loading && !error && entries.length === 0 ? (
        <p className="page-card__description" role="status">
          No request history has been recorded yet.
        </p>
      ) : null}
      {!loading && !error && entries.length > 0 ? (
        <ol className="request-history__timeline">
          {entries.map((entry, index) => (
            <li key={`${entry.createdAt}-${entry.actionType}-${index}`}>
              <time dateTime={entry.createdAt}>{formatDateTime(entry.createdAt)}</time>
              <div>
                <strong>{historyActionSummary(entry)}</strong>
                <span>{entry.actorDisplayName} · {entry.actorRole}</span>
              </div>
            </li>
          ))}
        </ol>
      ) : null}
    </section>
  )
}

function roleAwareRequestQuery(_user: AuthenticatedUserProfile | null, extra: PsfRequestQuery = {}): PsfRequestQuery {
  return extra
}

async function loadCurrentUser(): Promise<AuthenticatedUserProfile> {
  const response = await fetchCurrentUser()
  return response.user
}

function priorityClassName(priority: string | null): string {
  return `priority-badge priority-badge--${(priority ?? 'normal').toLowerCase().replace(/[^a-z0-9]+/g, '-')}`
}

export function RequestsTable({
  items,
  compact = false,
  onOpenItem,
}: {
  items: PsfRequestListItem[]
  compact?: boolean
  onOpenItem?: (requestId: string) => void
}) {
  const interactiveRows = Boolean(onOpenItem)

  if (items.length === 0) {
    return (
      <div className="table-empty">
        <span className="table-empty__icon">
          <Inbox size={22} />
        </span>
        <h3>No PSF requests found</h3>
        <p>No PSF requests match the current view.</p>
      </div>
    )
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
            {!interactiveRows ? <th>Action</th> : null}
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr
              aria-label={interactiveRows ? `Open ${item.requestNo} details` : undefined}
              className={interactiveRows ? 'data-table__row--interactive' : undefined}
              key={item.requestId}
              onClick={interactiveRows ? () => onOpenItem?.(item.requestId) : undefined}
              onKeyDown={interactiveRows ? (event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault()
                  onOpenItem?.(item.requestId)
                }
              } : undefined}
              tabIndex={interactiveRows ? 0 : undefined}
            >
              <td>
                <span className="cell-strong font-mono-code">{item.requestNo}</span>
              </td>
              <td>
                <span className="cell-strong">{getRequestTitle(item)}</span>
                <span className="chip">{item.productType ?? 'No product type'}</span>
              </td>
              <td>
                <span className={statusClassName(item.status)}>{item.status}</span>
              </td>
              <td>
                <span className={priorityClassName(item.priority)}>
                  {item.priority ?? 'Normal'}
                </span>
              </td>
              <td>
                <span className="cell-meta">
                  <Calendar size={13} />
                  {formatDate(item.dueDate)}
                </span>
              </td>
              {!compact ? (
                <td>
                  <span className="cell-meta">
                    <User size={12} />
                    {item.requester ?? '—'}
                  </span>
                </td>
              ) : null}
              <td>
                <span className="cell-strong">{item.setupOwner ?? 'Unassigned'}</span>
                {item.setupOwnerRole ? <span className="chip">{item.setupOwnerRole}</span> : null}
              </td>
              {!interactiveRows ? (
                <td>
                  <Link className="table-action" to="/requests/$requestId" params={{ requestId: item.requestId }}>
                    Open detail
                  </Link>
                </td>
              ) : null}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function SummaryCard({
  label,
  value,
  icon: Icon,
  active,
  onSelect,
}: {
  label: string
  value: number
  icon: typeof FileText
  active: boolean
  onSelect: () => void
}) {
  return (
    <button aria-pressed={active} className={`summary-card summary-card--filter${active ? ' is-active' : ''}`} onClick={onSelect} type="button">
      <span className="summary-card__top"><span>{label}</span><span aria-hidden="true" className="summary-card__icon"><Icon size={18} /></span></span>
      <strong>{value}</strong>
    </button>
  )
}

export function DashboardPage() {
  const navigate = useNavigate()
  const [relation, setRelation] = useState<'all' | 'created' | 'department'>('all')
  const [workState, setWorkState] = useState<'all' | 'open' | 'overdue' | 'completed'>('open')
  const [keyword, setKeyword] = useState('')
  const [status, setStatus] = useState('')
  const [offset, setOffset] = useState(0)
  const [catalog, setCatalog] = useState<AsyncState<string[]>>({ loading: true, error: null, data: [] })
  const [catalogRetry, setCatalogRetry] = useState(0)
  const [retry, setRetry] = useState(0)
  const [state, setState] = useState<AsyncState<{
    user: AuthenticatedUserProfile | null
    items: PsfRequestListItem[]
    total: number
    summary: { open: number; overdue: number; completed: number } | null
    summaryError: string | null
    limit: number
  }>>({ loading: true, error: null, data: { user: null, items: [], total: 0, summary: null, summaryError: null, limit: 25 } })

  useEffect(() => {
    let mounted = true
    void api.fetchWorkflowStatuses().then((configuration) => {
      if (mounted) setCatalog({ loading: false, error: null, data: configuration.statuses.filter((item) => item !== 'Draft') })
    }).catch((error: unknown) => {
      if (mounted) setCatalog((current) => ({ ...current, loading: false, error: error instanceof Error ? error.message : 'Catalog unavailable', errorStatus: error instanceof ApiError ? error.status : undefined }))
    })
    return () => { mounted = false }
  }, [catalogRetry])

  useEffect(() => {
    let mounted = true
    async function loadDashboard() {
      setState((current) => ({ ...current, loading: true, error: null, errorStatus: undefined }))
      try {
        const user = await loadCurrentUser()
        if (!mounted) return
        const response = await api.queryPsfRequests({
          scope: 'related',
          relation: user?.role === 'setup_owner' ? relation : 'all',
          workState,
          keyword: keyword.trim() || undefined,
          status: status || undefined,
          limit: 25,
          offset,
        })
        const summaryAvailable = response.summary && ['open', 'overdue', 'completed'].every((key) => Number.isFinite(response.summary[key as keyof typeof response.summary]))
        if (mounted) setState({ loading: false, error: null, data: { user, items: response.items, total: response.total, summary: summaryAvailable ? response.summary : null, summaryError: summaryAvailable ? null : 'Dashboard totals are unavailable from the server.', limit: response.limit } })
      } catch (error) {
        if (mounted) setState((current) => ({ ...current, loading: false, error: error instanceof Error ? error.message : 'Unable to load dashboard requests', errorStatus: error instanceof ApiError ? error.status : undefined }))
      }
    }
    void loadDashboard()
    return () => { mounted = false }
  }, [keyword, offset, relation, retry, status, workState])

  const summary = state.loading || state.error ? null : state.data.summary
  return (
    <article className="workflow-page dashboard-page">
      <div className="page-header dashboard-page__header"><h1>Dashboard</h1></div>
      {state.loading ? <p className="page-card__description" role="status">Loading dashboard queue…</p> : null}
      {state.error ? <p className="status-pill status-pill--error" role="alert">{state.error}{state.errorStatus === 401 ? <> <Link to="/login">Sign in again</Link></> : null}</p> : null}
      {!state.loading && !state.error && state.data.summaryError ? <p className="status-pill status-pill--error" role="alert">{state.data.summaryError}</p> : null}
      {!state.loading && (state.error || state.data.summaryError) ? <button className="btn-secondary" onClick={() => { setState((current) => ({ ...current, loading: true })); setRetry((current) => current + 1) }} type="button">Retry dashboard requests</button> : null}
      {catalog.loading ? <p role="status">Loading status catalog…</p> : null}
      {catalog.error ? <div className="status-pill status-pill--error" role="alert">
        <span>{`Unable to load status catalog: ${catalog.error}`}</span>
        {catalog.errorStatus === 401 ? <Link to="/login">Sign in again</Link> : null}
        <button className="btn-secondary" disabled={catalog.loading} onClick={() => { setCatalog((current) => ({ ...current, loading: true, error: null, errorStatus: undefined })); setCatalogRetry((current) => current + 1) }} type="button">Retry status catalog</button>
      </div> : null}
      {state.data.user?.role === 'setup_owner' ? <label>Related work
        <select value={relation} onChange={(event) => { setRelation(event.target.value as typeof relation); setOffset(0) }}>
          <option value="all">Related work</option><option value="created">Created by me</option><option value="department">PSF department work</option>
        </select>
      </label> : null}
      {summary ? <div className="summary-grid dashboard-summary-grid">
        <SummaryCard active={workState === 'open'} icon={FileText} label="Open work" value={summary.open} onSelect={() => { setWorkState(workState === 'open' ? 'all' : 'open'); setOffset(0) }} />
        <SummaryCard active={workState === 'overdue'} icon={AlertTriangle} label="Overdue" value={summary.overdue} onSelect={() => { setWorkState(workState === 'overdue' ? 'all' : 'overdue'); setOffset(0) }} />
        <SummaryCard active={workState === 'completed'} icon={Clock3} label="Completed" value={summary.completed} onSelect={() => { setWorkState(workState === 'completed' ? 'all' : 'completed'); setOffset(0) }} />
      </div> : null}
      <div className="toolbar request-browser__toolbar" aria-label="Dashboard filters">
        <label>Keyword<input value={keyword} onChange={(event) => { setKeyword(event.target.value); setOffset(0) }} /></label>
        <label>Status<select disabled={catalog.loading || Boolean(catalog.error)} value={status} onChange={(event) => { setStatus(event.target.value); setOffset(0) }}><option value="">All statuses</option>{catalog.data.map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
        <button className="btn-secondary" disabled={!keyword && !status && relation === 'all' && workState === 'open'} onClick={() => { setKeyword(''); setStatus(''); setRelation('all'); setWorkState('open'); setOffset(0) }} type="button"><RotateCcw size={14} /> Reset</button>
      </div>
      {!state.loading && !state.error && state.data.total === 0 ? <p className="page-card__description" role="status">No requests match the current dashboard filters.</p> : null}
      {!state.loading && !state.error ? <RequestsTable compact items={state.data.items} onOpenItem={(requestId) => void navigate({ to: '/requests/$requestId', params: { requestId } })} /> : null}
      {!state.error && (offset > 0 || state.data.total > state.data.limit) ? <div className="toolbar__actions" aria-label="Dashboard pagination">
        {!state.loading ? <span>{state.data.items.length ? `${offset + 1}–${Math.min(offset + state.data.items.length, state.data.total)}` : '0 shown'} of {state.data.total}</span> : null}
        <button className="btn-secondary" disabled={offset === 0 || state.loading} onClick={() => setOffset(Math.max(0, offset - state.data.limit))} type="button">Previous</button>
        <button className="btn-secondary" disabled={offset + state.data.limit >= state.data.total || state.loading} onClick={() => setOffset(offset + state.data.limit)} type="button">Next</button>
      </div> : null}
    </article>
  )
}

export function RequestsListPage({ scope = 'all' }: { scope?: 'all' | 'my-drafts' }) {
  const navigate = useNavigate()
  const [filters, setFilters] = useState({ keyword: '', status: '', productType: '' })
  const [catalog, setCatalog] = useState<AsyncState<string[]>>({ loading: true, error: null, data: [] })
  const [catalogRetry, setCatalogRetry] = useState(0)
  const [retry, setRetry] = useState(0)
  const [offset, setOffset] = useState(0)
  const [state, setState] = useState<AsyncState<{ user: AuthenticatedUserProfile | null; items: PsfRequestListItem[]; total: number; limit: number }>>({
    loading: true,
    error: null,
    data: { user: null, items: [], total: 0, limit: 100 },
  })

  useEffect(() => {
    let mounted = true
    if (scope === 'my-drafts') return
    void api.fetchWorkflowStatuses().then((response) => {
      if (mounted) setCatalog({ loading: false, error: null, data: response.statuses.filter((item) => item !== 'Draft') })
    }).catch((error: unknown) => {
      if (mounted) setCatalog((current) => ({ ...current, loading: false, error: error instanceof Error ? error.message : 'Catalog unavailable', errorStatus: error instanceof ApiError ? error.status : undefined }))
    })
    return () => { mounted = false }
  }, [catalogRetry, scope])

  useEffect(() => {
    let mounted = true

    async function loadRequests() {
      setState((current) => ({ ...current, loading: true, error: null, errorStatus: undefined }))

      try {
        const user = await loadCurrentUser()
        if (!mounted) return
        const response = await api.queryPsfRequests(
          roleAwareRequestQuery(user, {
            scope,
            keyword: filters.keyword.trim() || undefined,
            status: scope === 'all' ? filters.status || undefined : undefined,
            productType: filters.productType.trim() || undefined,
            limit: 100,
            offset,
          }),
        )

        if (mounted) {
          setState({ loading: false, error: null, data: { user, items: response.items, total: response.total, limit: response.limit } })
        }
      } catch (error) {
        if (mounted) {
          setState((current) => ({
            ...current,
            loading: false,
            error: error instanceof Error ? error.message : 'Unable to load PSF requests',
            errorStatus: error instanceof ApiError ? error.status : undefined,
          }))
        }
      }
    }

    void loadRequests()

    return () => {
      mounted = false
    }
  }, [filters.keyword, filters.productType, filters.status, offset, retry, scope])

  const hasActiveFilters = Boolean(
    filters.keyword.trim() || filters.status || filters.productType.trim(),
  )

  return (
    <article className="workflow-page requests-page">
      <div className="page-header requests-page__header">
        <div className="page-header__title">
          <span className="page-header__icon"><FileText size={20} /></span>
          <div><p className="page-card__eyebrow">Request browser</p><h1>{scope === 'my-drafts' ? 'My draft' : 'All PSF Requests'}</h1></div>
        </div>
        <div className="button-row">
          <Link className="btn-secondary" to="/admin/export-profile">
            <FileSpreadsheet size={16} /> Export to Excel
          </Link>
        </div>
      </div>

      <section className="request-browser" aria-label="PSF request browser">
        <div className="toolbar request-browser__toolbar" aria-label="Request filters">
          <form className="filter-bar" onSubmit={(event) => event.preventDefault()}>
            <label>
              Keyword
              <span className="filter-bar__control">
                <Search size={16} />
                <input
                  className="input-base input-with-icon"
                  onChange={(event) => { setFilters((current) => ({ ...current, keyword: event.target.value })); setOffset(0) }}
                  placeholder="Request no, title, PSF name…"
                  value={filters.keyword}
                />
              </span>
            </label>
            {scope === 'all' ? <label>
              Status
              <select disabled={catalog.loading || Boolean(catalog.error)} value={filters.status} onChange={(event) => { setFilters((current) => ({ ...current, status: event.target.value })); setOffset(0) }}>
                <option value="">All statuses</option>
                {catalog.data.map((status) => (
                  <option key={status} value={status}>{status}</option>
                ))}
              </select>
            </label> : null}
            <label>
              Product Type
              <input value={filters.productType} onChange={(event) => { setFilters((current) => ({ ...current, productType: event.target.value })); setOffset(0) }} placeholder="Existing Product" />
            </label>
          </form>
          <div className="toolbar__actions">
            <button
              className="btn-secondary"
              disabled={!hasActiveFilters}
              onClick={() => { setFilters({ keyword: '', status: '', productType: '' }); setOffset(0) }}
              type="button"
            >
              <RotateCcw size={14} /> Clear filters
            </button>
          </div>
        </div>

        {scope === 'all' && catalog.loading ? <p role="status">Loading status catalog…</p> : null}
        {scope === 'all' && catalog.error ? <div className="status-pill status-pill--error" role="alert">
          <span>{`Unable to load status catalog: ${catalog.error}`}</span>
          {catalog.errorStatus === 401 ? <Link to="/login">Sign in again</Link> : null}
          <button className="btn-secondary" disabled={catalog.loading} onClick={() => { setCatalog((current) => ({ ...current, loading: true, error: null, errorStatus: undefined })); setCatalogRetry((current) => current + 1) }} type="button">Retry status catalog</button>
        </div> : null}
        {state.loading ? <p className="page-card__description" role="status">Loading PSF requests…</p> : null}
        {state.error ? (
          <p className="status-pill status-pill--error" role="alert">
            {state.error}{state.errorStatus === 401 ? <> <Link to="/login">Sign in again</Link></> : null}
          </p>
        ) : null}
        {!state.loading && state.error ? <button className="btn-secondary" onClick={() => { setState((current) => ({ ...current, loading: true })); setRetry((current) => current + 1) }} type="button">Retry requests</button> : null}
        {!state.error && !state.loading ? <p className="page-card__description" role="status">{state.data.total} request(s)</p> : null}
        {!state.loading && !state.error ? <RequestsTable
          items={state.data.items}
          onOpenItem={(requestId) => void navigate({ to: '/requests/$requestId', params: { requestId } })}
        /> : null}
        {!state.error && (offset > 0 || state.data.total > state.data.limit) ? <div className="toolbar__actions" aria-label="Request list pagination">
          <button className="btn-secondary" disabled={offset === 0 || state.loading} onClick={() => setOffset(Math.max(0, offset - state.data.limit))} type="button">Previous</button>
          <button className="btn-secondary" disabled={offset + state.data.limit >= state.data.total || state.loading} onClick={() => setOffset(offset + state.data.limit)} type="button">Next</button>
        </div> : null}
      </section>
    </article>
  )
}

export function RequestCreatePage() {
  const navigate = useNavigate()
  const [dirty, setDirty] = useState(false)
  const [savedRequest, setSavedRequest] = useState<PsfRequestResponse | null>(null)
  const shouldBlockExit = useCallback(({ current, next }: { current: { pathname: string }; next: { pathname: string } }) =>
    dirty && current.pathname !== next.pathname && !window.confirm('Discard unsaved request changes and leave this page?'), [dirty])
  useBlocker({ shouldBlockFn: shouldBlockExit, enableBeforeUnload: dirty })
  useEffect(() => {
    if (savedRequest && !dirty) void navigate({ to: '/requests/$requestId', params: { requestId: savedRequest.id } })
  }, [dirty, navigate, savedRequest])
  return (
    <article className="workflow-page request-create-page">
      <div className="page-header request-create-page__header"><h1>Create PSF Request</h1></div>
      <ActiveSchemaForm mode="request" onDirtyChange={setDirty} onRequestSaved={setSavedRequest} />
    </article>
  )
}

export function RequestDetailRoutePage() {
  const { requestId } = useParams({ from: '/requests/$requestId/' })
  return <RequestDetailShell requestId={requestId} />
}

export function RequestDetailShell({ requestId }: { requestId: string }) {
  const [request, setRequest] = useState<PsfRequestResponse | null>(null)
  const [history, setHistory] = useState<AsyncState<PsfRequestHistoryEntry[]>>({
    loading: true,
    error: null,
    data: [],
  })
  const [requesterDirty, setRequesterDirty] = useState(false)
  const [draftSchemaSubmitAllowed, setDraftSchemaSubmitAllowed] = useState(false)
  const [psfCreatedValues, setPsfCreatedValues] = useState<DynamicFormValues>({})
  const [psfCreatedDirty, setPsfCreatedDirty] = useState(false)
  const [allowedNextStatuses, setAllowedNextStatuses] = useState<string[]>([])
  const [status, setStatus] = useState('')
  const [submissionConflict, setSubmissionConflict] = useState(0)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [savingPsfCreatedData, setSavingPsfCreatedData] = useState(false)
  const [savingRequesterData, setSavingRequesterData] = useState(false)
  const [savingStatus, setSavingStatus] = useState(false)

  const dirty = requesterDirty || psfCreatedDirty
  const shouldBlockExit = useCallback(({ current, next }: { current: { pathname: string }; next: { pathname: string } }) =>
    dirty && current.pathname !== next.pathname && !window.confirm('Discard unsaved request changes and leave this page?'), [dirty])
  useBlocker({ shouldBlockFn: shouldBlockExit, enableBeforeUnload: dirty })

  useEffect(() => {
    let mounted = true

    async function loadRequest() {
      try {
        const response = await api.fetchPsfRequest(requestId)
        let nextAllowedStatuses: string[] = []

        try {
          const statusOptions = await api.fetchPsfRequestStatusOptions(requestId)
          nextAllowedStatuses = statusOptions.allowedNextStatuses
        } catch (statusOptionsError) {
          if (!(statusOptionsError instanceof ApiError && statusOptionsError.status === 401)) {
            throw statusOptionsError
          }
        }

        if (mounted) {
          setRequest(response)
          setPsfCreatedValues(buildPsfCreatedInformationValues(response))
          setPsfCreatedDirty(false)
          setAllowedNextStatuses(nextAllowedStatuses)
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

    async function loadHistory() {
      setHistory({ loading: true, error: null, data: [] })

      try {
        const entries = await api.fetchPsfRequestHistory(requestId)

        if (mounted) {
          setHistory({ loading: false, error: null, data: entries })
        }
      } catch (loadError) {
        if (mounted) {
          setHistory({
            loading: false,
            error: loadError instanceof Error ? loadError.message : 'Unable to load request history',
            data: [],
          })
        }
      }
    }

    void loadRequest()
    void loadHistory()

    return () => {
      mounted = false
    }
  }, [requestId])

  async function updateStatus() {
    if (
      !request ||
      !status ||
      !allowedNextStatuses.includes(status) ||
      requesterDirty ||
      psfCreatedDirty ||
      savingStatus ||
      savingPsfCreatedData ||
      savingRequesterData
    ) {
      return
    }
    if (request.status === 'Draft' && (!request.canSubmitDraft || !draftSchemaSubmitAllowed)) {
      setError('This Draft cannot be submitted yet.')
      return
    }

    setSavingStatus(true)
    setError(null)
    setMessage(null)
    let conflictReconciliationPending = false

    try {
      const updatedRequest = request.status === 'Draft'
        ? await api.submitPsfRequest(request.id, {
            formVersion: request.formVersion,
            status,
            expectedUpdatedAt: request.updatedAt,
          })
        : await api.updatePsfRequestStatus(request.id, {
            status,
            expectedUpdatedAt: request.updatedAt,
          })
      setRequest(updatedRequest)
      setPsfCreatedValues(buildPsfCreatedInformationValues(updatedRequest))
      setMessage(request.status === 'Draft'
        ? `Request ${updatedRequest.requestNo} submitted to ${updatedRequest.status}.`
        : `Request ${updatedRequest.requestNo} moved to ${updatedRequest.status}.`)
      setStatus(updatedRequest.status)

      try {
        const statusOptions = await api.fetchPsfRequestStatusOptions(request.id)
        setAllowedNextStatuses(statusOptions.allowedNextStatuses)
        setStatus(updatedRequest.status)
      } catch (statusOptionsError) {
        setAllowedNextStatuses([])
        setStatus(updatedRequest.status)
        setError(
          `Request status was updated, but workflow options could not be refreshed: ${
            statusOptionsError instanceof Error
              ? statusOptionsError.message
              : 'Unable to refresh workflow status options'
          }`,
        )
      }
    } catch (statusError) {
      if (request.status === 'Draft' && statusError instanceof ApiError && statusError.status === 409) {
        conflictReconciliationPending = true
        setSubmissionConflict((currentConflict) => currentConflict + 1)
      }
      setError(statusError instanceof Error ? statusError.message : 'Unable to update workflow status')
    } finally {
      if (!conflictReconciliationPending) {
        setSavingStatus(false)
      }
    }
  }

  function updatePsfCreatedInformation(fieldKey: string, value: string) {
    const nextValues = { ...psfCreatedValues, [fieldKey]: value }
    setPsfCreatedValues(nextValues)
    setPsfCreatedDirty(JSON.stringify(nextValues) !== JSON.stringify(buildPsfCreatedInformationValues(request!)))
    setError(null)
    setMessage(null)
  }

  async function savePsfCreatedInformation(values: DynamicFormValues) {
    if (
      !request ||
      !request.canEditPsfCreatedData ||
      savingStatus ||
      savingPsfCreatedData ||
      savingRequesterData
    ) {
      return
    }

    setSavingPsfCreatedData(true)
    setError(null)
    setMessage(null)

    try {
      const savedRequest = await api.updatePsfCreatedData(request.id, {
        expectedUpdatedAt: request.updatedAt,
        psfCreatedData: values,
      })
      setRequest(savedRequest)
      setPsfCreatedValues(buildPsfCreatedInformationValues(savedRequest))
      setPsfCreatedDirty(false)
      setMessage(`PSF Created Information for ${savedRequest.requestNo} saved.`)
    } catch (saveError) {
      if (saveError instanceof ApiError && saveError.status === 409) {
        try {
          const refreshedRequest = await api.fetchPsfRequest(request.id)
          setRequest(refreshedRequest)
          setError(
            'PSF Created Information changed while you were editing. Your unsaved values are preserved; review them against the latest revision before saving again.',
          )
        } catch {
          setError(
            'PSF Created Information changed while you were editing. Reload the request and try again.',
          )
        }
      } else {
        setError(saveError instanceof Error ? saveError.message : 'Unable to save PSF Created Information')
      }
    } finally {
      setSavingPsfCreatedData(false)
    }
  }

  const mutationPending = savingStatus || savingPsfCreatedData || savingRequesterData
  const disabledReason = requesterDirty || psfCreatedDirty
    ? `Save ${requesterDirty ? 'requester information' : 'PSF Created Information'} before changing status or submitting.`
    : request?.status === 'Draft' && (!request.canSubmitDraft || !draftSchemaSubmitAllowed)
      ? 'Resolve the Draft schema or required fields before submitting.'
      : null

  return (
    <article className="workflow-page detail-page">
      <div className="page-header">
        <div className="page-header__title">
          <Link className="btn-ghost" to="/requests">
            <ArrowLeft size={15} /> Back to Requests
          </Link>
          {request ? (
            <span className="detail-topbar__id font-mono-code">{request.requestNo}</span>
          ) : (
            <h1>PSF Request Detail</h1>
          )}
        </div>
        {request ? (
          <div className="detail-topbar__status">
            <span>Current status</span>
            <span className={statusClassName(request.status)}>{request.status}</span>
          </div>
        ) : null}
      </div>

      {loading ? <p className="page-card__description" role="status">Loading request detail…</p> : null}
      {error ? <p className="status-pill status-pill--error" role="alert">{error}</p> : null}
      {message ? <p className="status-pill status-pill--success" role="status">{message}</p> : null}

      {request ? (
        <div className="detail-layout">
          <div className="detail-layout__main">
            <RequestHeaderSummary request={request} />

            <section className="workflow-section">
              <ActiveSchemaForm
                disabled={mutationPending}
                mode="request"
                requestId={requestId}
                onDirtyChange={setRequesterDirty}
                onDraftSchemaSubmitAllowedChange={setDraftSchemaSubmitAllowed}
                onRequestSaved={setRequest}
                onSavingChange={setSavingRequesterData}
                onSubmissionConflictSettled={setSavingStatus}
                requestSnapshot={request}
                submissionConflict={submissionConflict}
              />
            </section>

            <section className="workflow-section">
              <PsfCreatedInformationPanel
                onChange={updatePsfCreatedInformation}
                onSave={(values) => void savePsfCreatedInformation(values)}
                request={request}
                saving={savingPsfCreatedData}
                disabled={mutationPending}
                values={psfCreatedValues}
              />
            </section>
          </div>

          <aside className="detail-layout__rail">
            <section className="workflow-section">
              <div className="section-heading">
                <h2>Action center</h2>
              </div>
              <div className="workflow-actions">
                <WorkflowStatusActions
                  allowedNextStatuses={allowedNextStatuses}
                  currentStatus={request.status}
                  onApply={() => void updateStatus()}
                  onStatusChange={setStatus}
                  saving={mutationPending}
                  selectedStatus={status}
                  isDraft={request.status === 'Draft'}
                  disabledReason={disabledReason}
                />
              </div>
            </section>

            <RequestHistoryPanel
              entries={history.data}
              error={history.error}
              loading={history.loading}
            />
          </aside>
        </div>
      ) : null}
    </article>
  )
}
