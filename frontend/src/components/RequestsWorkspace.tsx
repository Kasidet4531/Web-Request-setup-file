import { useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { RequestBreadcrumbContext, type RequestBreadcrumb } from './requestBreadcrumb'
import { Link, useBlocker, useNavigate, useParams } from '@tanstack/react-router'
import {
  AlertTriangle,
  Clock3,
  Check,
  Plus,
  FileText,
  Inbox,
  RotateCcw,
  Search,
} from 'lucide-react'
import { ActiveSchemaForm } from './ActiveSchemaForm'
import { DynamicFormRenderer } from './DynamicFormRenderer'
import { PageHeader } from './ui/PageHeader'
import { AsyncNotice } from './ui/AsyncNotice'
import { StatusLabel } from './ui/StatusLabel'
import { ConfirmDialog } from './ui/ConfirmDialog'
import { HistoryChanges } from './ui/HistoryChanges'
import { formatHistoryDateTime } from './ui/historyDateTime'
import {
  ApiError,
  api,
  fetchCurrentUser,
  type AuthenticatedUserProfile,
  type PsfRequestHistoryEntry,
  type PsfRequestListItem,
  type PsfRequestQuery,
  type PsfRequestResponse,
  type WorkflowStatusKind,
} from '../services/api'
import type { DynamicFormValues } from '../types/forms'

interface AsyncState<T> {
  loading: boolean
  error: string | null
  errorStatus?: number
  data: T
  statusKinds?: Record<string, WorkflowStatusKind>
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
    : formatHistoryDateTime(value)
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

function RequestMetadata({ request }: { request: PsfRequestResponse }) {
  const summary = buildRequestDetailSummary(request)
  return <section className="detail-summary-grid" aria-label="Request metadata">
    <div><span>Priority</span><strong className={priorityClassName(summary.priority)}>{summary.priority}</strong></div>
    <div><span>Due Date</span><strong>{formatDate(summary.dueDate)}</strong></div>
    <div><span>Requester</span><strong>{summary.requester}</strong></div>
    <div><span>Owner / Dept</span><strong>{summary.owner}</strong></div>
  </section>
}

export function RequestHeaderSummary({ request, includeMetadata = true, kind }: { request: PsfRequestResponse; includeMetadata?: boolean; kind?: WorkflowStatusKind }) {
  const summary = buildRequestDetailSummary(request)
  return <section className="detail-summary" aria-label="Request header">
    <div className="detail-summary__heading">
      <div><span className="detail-masthead__number font-mono-code">{summary.requestNo}</span><h1>{summary.title}</h1></div>
      <StatusLabel status={request.status} kind={kind ?? (request.status === 'Draft' ? 'draft' : 'neutral')} />
    </div>
    {includeMetadata ? <RequestMetadata request={request} /> : null}
  </section>
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
  const guidance = disabledReason ?? (!saving && !canUpdate
    ? options.length === 1
      ? 'No status changes are available for this request.'
      : isDraft
        ? 'Choose a status before submitting your draft.'
        : 'Choose a different status, then Save Status.'
    : null)

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
        {saving ? (isDraft ? 'Submitting request…' : 'Saving Status…') : isDraft ? 'Submit request' : 'Save Status'}
      </button>
      {guidance ? <p className={`page-card__description${guidance === 'Choose a different status, then Save Status.' ? ' sr-only' : ''}`} role="status">{guidance}</p> : null}
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
  dirty?: boolean
  editing?: boolean
  onEdit?: () => void
  onCancel?: () => void
  values: DynamicFormValues
}

export function PsfCreatedInformationPanel({
  onChange,
  onSave,
  request,
  saving,
  disabled = false,
  dirty = false,
  editing,
  onEdit,
  onCancel,
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
  const showEditor = canEdit && (editing ?? true)

  return (
    <section className={`psf-created-panel psf-created-panel--${canEdit ? 'editable' : 'read-only'}`} aria-labelledby="psf-created-heading">
      <div className="psf-created-panel__header"><h2 id="psf-created-heading">PSF Created Information</h2><div className="toolbar__actions"><span role="status">{canEdit ? saving ? 'Saving…' : dirty ? 'Unsaved changes' : 'Saved' : 'Read only'}</span>{canEdit && editing === false ? <button className="btn-secondary" type="button" onClick={onEdit} disabled={saving || disabled}>Edit information</button> : null}</div></div>
      {saving ? <p className="page-card__description" role="status">Saving PSF Created Information…</p> : null}
      <DynamicFormRenderer
        onChange={showEditor && !saving && !disabled ? onChange : undefined}
        onSubmit={showEditor && !saving && !disabled ? onSave : undefined}
        readOnly={!showEditor || saving || disabled}
        schema={request.psfCreatedInformationSchema}
        headerTitle="PSF Created Information"
        showSchemaHeader={false}
        submitLabel="Save PSF Created Information"
        footerActions={editing && onCancel ? <button className="btn-secondary" type="button" disabled={saving || disabled} onClick={onCancel}>Cancel</button> : undefined}
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
  onRetry,
}: {
  onRetry?: () => void
  entries: PsfRequestHistoryEntry[]
  error: string | null
  loading: boolean
}) {
  return (
    <section className="workflow-section request-history" aria-labelledby="request-history-heading">
      <div className="section-heading">
        <h2 id="request-history-heading">History</h2><span className="page-card__description">Times: Asia/Bangkok</span>
      </div>
      {loading ? <AsyncNotice kind="loading" title="Loading request history…" /> : null}
      {error ? <AsyncNotice kind="error" title={`Unable to load request history: ${error}`} action={onRetry ? <button className="btn-secondary" onClick={onRetry} type="button">Retry history</button> : undefined} /> : null}
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
                <HistoryChanges metadata={entry.metadata} />
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
  drafts = false,
  onOpenItem,
  statusKinds = {},
  emptyTitle = 'No PSF requests found',
  emptyDescription = 'No PSF requests match the current view.',
  onClearFilters,
}: {
  emptyTitle?: string
  emptyDescription?: string
  onClearFilters?: () => void
  statusKinds?: Readonly<Record<string, WorkflowStatusKind>>
  items: PsfRequestListItem[]
  compact?: boolean
  drafts?: boolean
  onOpenItem?: (requestId: string) => void
}) {
  const interactiveRows = Boolean(onOpenItem)

  if (items.length === 0) {
    return (
      <div className="table-empty">
        <span className="table-empty__icon">
          <Inbox size={22} />
        </span>
        <h3>{emptyTitle}</h3>
        <p>{emptyDescription}</p>
        {onClearFilters ? <button className="btn-secondary" type="button" onClick={onClearFilters}>Clear filters</button> : null}
      </div>
    )
  }

  return (
    <>
    <div className={`data-table requests-table${drafts ? ' requests-table--drafts' : ''}`} role="region" aria-label="PSF requests" tabIndex={0}>
      <table>
        <thead>
          <tr>
            <th scope="col">Request</th>
            <th scope="col">{drafts ? 'Product Type' : 'Status'}</th>
            <th scope="col">{drafts ? 'Visibility' : compact ? 'Due date' : 'Schedule'}</th>
            <th scope="col">{drafts ? 'Updated' : compact ? 'Owner / Dept' : 'Responsibility'}</th>
            {drafts || !interactiveRows ? <th scope="col">Action</th> : null}
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr
              aria-label={interactiveRows ? `Open ${item.requestNo} details` : undefined}
              className={interactiveRows ? 'data-table__row--interactive' : undefined}
              key={item.requestId}
              onClick={interactiveRows ? (event) => {
                if (!event?.target || !(event.target instanceof Element && event.target.closest('a, button, [popover]'))) onOpenItem?.(item.requestId)
              } : undefined}
              onKeyDown={interactiveRows ? (event) => {
                if (event.target === event.currentTarget && (event.key === 'Enter' || event.key === ' ')) {
                  event.preventDefault()
                  onOpenItem?.(item.requestId)
                }
              } : undefined}
              tabIndex={interactiveRows ? 0 : undefined}
            >
              <td data-label="Request">
                <div className="request-identity">
                  <Link className="request-identity__link" to="/requests/$requestId" params={{ requestId: item.requestId }}>
                    <span className="request-identity__title">{getRequestTitle(item)}</span>
                    <span className="font-mono-code">{item.requestNo}{compact && item.probecardName ? ` · ${item.probecardName}` : ''}</span>
                  </Link>
                  {!compact && !drafts ? <span className="request-identity__type">{item.productType ?? 'No product type'}</span> : null}
                </div>
              </td>
              {drafts ? <><td data-label="Product Type">{item.productType ?? '—'}</td>
                <td data-label="Visibility">Only you</td>
                <td data-label="Updated">{formatDateTime(item.updatedAt)}</td></> : <><td data-label="Status">
                <StatusLabel kind={statusKinds[item.status]} status={item.status} />
              </td>
              <td data-label="Schedule">
                <div className="request-cell-stack">
                  <span className={priorityClassName(item.priority)}>{item.priority ?? 'Normal'}</span>
                  <span className="cell-meta"><span className="request-cell-label">Due </span>{formatDate(item.dueDate)}</span>
                </div>
              </td>
              <td data-label="Responsibility">
                <div className="request-cell-stack">
                  {!compact ? <span className="cell-meta"><span className="request-cell-label">Requester </span>{item.requester ?? '—'}</span> : null}
                  <span><span className="request-cell-label">Owner / Dept </span>{getOwnerLabel(item)}</span>
                </div>
              </td>
              </>}
              {drafts || !interactiveRows ? (
                <td data-label="Action">
                  <Link className="table-action" to="/requests/$requestId" params={{ requestId: item.requestId }}>
                    {drafts ? 'Continue' : 'Open detail'}
                  </Link>
                </td>
              ) : null}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
    </>
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
  value: number | null
  icon: typeof FileText
  active: boolean
  onSelect: () => void
}) {
  return (
    <button aria-pressed={active} className={`summary-card summary-card--${label === 'Overdue' ? 'overdue' : label === 'Completed' ? 'completed' : 'open'}${active ? ' is-active' : ''}`}  onClick={onSelect} type="button">
      <span className="summary-card__top"><span>{label}</span><span aria-hidden="true" className="summary-card__icon"><Icon size={18} /></span></span>
      <strong>{value ?? '—'}</strong>{active ? <Check aria-hidden="true" className="summary-card__selected" size={16} /> : null}
    </button>
  )
}

function useDebouncedQueueText(value: string, resetOffset: () => void): string {
  const [committedValue, setCommittedValue] = useState(value)
  useEffect(() => {
    if (value === committedValue) return
    const timeout = setTimeout(() => { setCommittedValue(value); resetOffset() }, 300)
    return () => clearTimeout(timeout)
  }, [value, committedValue, resetOffset])
  return committedValue
}

export function DashboardPage() {
  const navigate = useNavigate()
  const [relation, setRelation] = useState<'all' | 'created' | 'department'>('all')
  const [workState, setWorkState] = useState<'all' | 'open' | 'overdue' | 'completed'>('open')
  const [keyword, setKeyword] = useState('')
  const [status, setStatus] = useState('')
  const [offset, setOffset] = useState(0)
  const resetOffset = useCallback(() => setOffset(0), [])
  const debouncedKeyword = useDebouncedQueueText(keyword.trim(), resetOffset)
  const requestGeneration = useRef(0)
  const queryKey = JSON.stringify([debouncedKeyword, offset, relation, status, workState])
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
    queryKey: string | null
  }>>({ loading: true, error: null, data: { user: null, items: [], total: 0, summary: null, summaryError: null, limit: 25, queryKey: null } })

  useEffect(() => {
    let mounted = true
    void api.fetchWorkflowStatuses().then((configuration) => {
      if (mounted) setCatalog({ loading: false, error: null, data: configuration.statuses.filter((item) => item !== 'Draft'), statusKinds: Object.fromEntries((configuration.entries ?? []).map((entry) => [entry.name, entry.kind])) })
    }).catch((error: unknown) => {
      if (mounted) setCatalog((current) => ({ ...current, loading: false, error: error instanceof Error ? error.message : 'Catalog unavailable', errorStatus: error instanceof ApiError ? error.status : undefined }))
    })
    return () => { mounted = false }
  }, [catalogRetry])

  useEffect(() => {
    let mounted = true
    const generation = ++requestGeneration.current
    const isCurrent = () => mounted && generation === requestGeneration.current
    async function loadDashboard() {
      setState((current) => ({ ...current, loading: true, error: null, errorStatus: undefined }))
      try {
        const user = await loadCurrentUser()
        if (!isCurrent()) return
        setState((current) => current.data.user && (current.data.user.id !== user.id || current.data.user.role !== user.role || current.data.user.setupOwnerDepartment !== user.setupOwnerDepartment)
          ? { ...current, data: { ...current.data, user: null, items: [], total: 0, summary: null, queryKey: null } }
          : current)
        const response = await api.queryPsfRequests({
          scope: 'related',
          relation: user?.role === 'setup_owner' ? relation : 'all',
          workState,
          keyword: debouncedKeyword || undefined,
          status: status || undefined,
          limit: 25,
          offset,
        })
        const summaryAvailable = response.summary && ['open', 'overdue', 'completed'].every((key) => Number.isFinite(response.summary[key as keyof typeof response.summary]))
        if (isCurrent()) setState({ loading: false, error: null, data: { user, items: response.items, total: response.total, summary: summaryAvailable ? response.summary : null, summaryError: summaryAvailable ? null : 'Dashboard totals are unavailable from the server.', limit: response.limit, queryKey } })
      } catch (error) {
        if (isCurrent()) setState((current) => ({ ...current, loading: false, error: error instanceof Error ? error.message : 'Unable to load dashboard requests', errorStatus: error instanceof ApiError ? error.status : undefined, data: { ...current.data, user: null, items: [], total: 0, summary: null, queryKey: null } }))
      }
    }
    void loadDashboard()
    return () => { mounted = false }
  }, [debouncedKeyword, offset, queryKey, relation, retry, status, workState])

  const pending = state.loading || keyword.trim() !== debouncedKeyword || state.data.queryKey !== queryKey
  const hasResults = !state.error && state.data.user !== null
  const summary = state.error ? null : state.data.summary
  const hasActiveFilters = Boolean(keyword.trim() || status || relation !== 'all' || workState !== 'open')
  const resetFilters = () => { setKeyword(''); setStatus(''); setRelation('all'); setWorkState('open'); setOffset(0) }
  return (
    <article className="workflow-page dashboard-page">
      <PageHeader title="Dashboard" description="Your related work, at a glance." actions={<Link className="btn-primary" to="/requests/new"><Plus size={16} /> New Request</Link>} />
      {pending && !state.error ? <p className="page-card__description" role="status">{hasResults ? 'Updating dashboard queue…' : 'Loading dashboard queue…'}</p> : null}
      {state.error ? <p className="status-pill status-pill--error" role="alert">{state.error}{state.errorStatus === 401 ? <> <Link to="/login">Sign in again</Link></> : null}</p> : null}
      {!state.loading && !state.error && state.data.summaryError ? <p className="status-pill status-pill--error" role="alert">{state.data.summaryError}</p> : null}
      {!state.loading && (state.error || state.data.summaryError) ? <button className="btn-secondary" onClick={() => { setState((current) => ({ ...current, loading: true })); setRetry((current) => current + 1) }} type="button">Retry dashboard requests</button> : null}
      {catalog.loading ? <p role="status">Loading status catalog…</p> : null}
      {catalog.error ? <div className="status-pill status-pill--error" role="alert">
        <span>{`Unable to load status catalog: ${catalog.error}`}</span>
        {catalog.errorStatus === 401 ? <Link to="/login">Sign in again</Link> : null}
        <button className="btn-secondary" disabled={catalog.loading} onClick={() => { setCatalog((current) => ({ ...current, loading: true, error: null, errorStatus: undefined })); setCatalogRetry((current) => current + 1) }} type="button">Retry status catalog</button>
      </div> : null}
      <div className="dashboard-workspace">
      <aside className="dashboard-overview" aria-label="Work overview">
        <div className="workspace-section-heading"><h2>Your related work</h2></div>
      {state.data.user?.role === 'setup_owner' ? <label>Work scope
        <select aria-label="Work scope" value={relation} onChange={(event) => { setRelation(event.target.value as typeof relation); setOffset(0) }}>
          <option value="all">Related work</option><option value="created">Created by me</option><option value="department">PSF department work</option>
        </select>
      </label> : null}
      {summary ? <div className="summary-grid dashboard-summary-grid" aria-busy={pending}>
        <SummaryCard active={workState === 'open'} icon={FileText} label="Open work" value={pending ? null : summary.open} onSelect={() => { setWorkState(workState === 'open' ? 'all' : 'open'); setOffset(0) }} />
        <SummaryCard active={workState === 'overdue'} icon={AlertTriangle} label="Overdue" value={pending ? null : summary.overdue} onSelect={() => { setWorkState(workState === 'overdue' ? 'all' : 'overdue'); setOffset(0) }} />
        <SummaryCard active={workState === 'completed'} icon={Clock3} label="Completed" value={pending ? null : summary.completed} onSelect={() => { setWorkState(workState === 'completed' ? 'all' : 'completed'); setOffset(0) }} />
      </div> : null}
      </aside>
      <section className="queue-surface" aria-label="Related request queue">
      <div className="queue-surface__heading"><h2>Related request queue</h2><span>{workState === 'all' ? 'All work' : workState === 'open' ? 'Open work' : workState === 'overdue' ? 'Overdue work' : 'Completed work'}</span></div>
      <div className="filter-bar dashboard-filters" aria-label="Dashboard filters">
        <label>Keyword<span className="filter-bar__control"><Search size={16} /><input className="input-with-icon" placeholder="Request no, title, PSF name…" value={keyword} onChange={(event) => { setKeyword(event.target.value) }} /></span></label>
        <label>Status<select disabled={catalog.loading || Boolean(catalog.error)} value={status} onChange={(event) => { setStatus(event.target.value); setOffset(0) }}><option value="">All statuses</option>{catalog.data.map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
        <button className="btn-secondary" disabled={!hasActiveFilters} onClick={resetFilters} type="button"><RotateCcw size={14} /> Clear filters</button>
      </div>
      {hasResults && (state.data.items.length > 0 || !pending) ? <div className={`request-results${pending ? ' request-results--updating' : ''}`} inert={pending} aria-busy={pending}>
        <RequestsTable compact statusKinds={catalog.statusKinds} items={state.data.items} emptyTitle={hasActiveFilters ? 'No requests match these filters' : 'No related open requests'} emptyDescription={hasActiveFilters ? 'Try another keyword or status, or clear the filters.' : 'Your related work queue has no open requests.'} onClearFilters={hasActiveFilters ? resetFilters : undefined} onOpenItem={(requestId) => void navigate({ to: '/requests/$requestId', params: { requestId } })} />
      </div> : null}
      {hasResults && !pending ? <div className="table-footer" aria-label="Dashboard pagination"><span>{state.data.items.length ? `${offset + 1}–${Math.min(offset + state.data.items.length, state.data.total)} of ${state.data.total} requests` : '0 requests'}</span>
        {offset > 0 || state.data.total > state.data.limit ? <div className="toolbar__actions">
          <button className="btn-secondary" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - state.data.limit))} type="button">Previous</button>
          <button className="btn-secondary" disabled={offset + state.data.limit >= state.data.total} onClick={() => setOffset(offset + state.data.limit)} type="button">Next</button>
        </div> : null}
      </div> : null}
      </section>
      </div>
    </article>
  )
}

export function QueueFilterPanel({ active, children }: { active: boolean; children: ReactNode }) {
  const panelRef = useRef<HTMLDetailsElement>(null)
  const mobileQuery = '(max-width: 899px)'
  useEffect(() => {
    const query = window.matchMedia(mobileQuery)
    const setLayout = () => { if (panelRef.current) panelRef.current.open = !query.matches }
    setLayout()
    query.addEventListener('change', setLayout)
    return () => query.removeEventListener('change', setLayout)
  }, [])
  return <details ref={panelRef} aria-label="Request filters" className={`queue-filters${active ? ' queue-filters--active' : ''}`} open={typeof window === 'undefined' || !window.matchMedia(mobileQuery).matches || undefined}>
    <summary onClick={(event) => { if (!window.matchMedia(mobileQuery).matches) event.preventDefault() }}><span>Filters</span><span className="queue-filters__state">{active ? 'Active' : 'All requests'}</span></summary>
    {children}
  </details>
}

export function RequestsListPage({ scope = 'all' }: { scope?: 'all' | 'my-drafts' }) {
  const navigate = useNavigate()
  const [filters, setFilters] = useState({ keyword: '', status: '', productType: '' })
  const [catalog, setCatalog] = useState<AsyncState<string[]>>({ loading: true, error: null, data: [] })
  const [catalogRetry, setCatalogRetry] = useState(0)
  const [retry, setRetry] = useState(0)
  const [offset, setOffset] = useState(0)
  const resetOffset = useCallback(() => setOffset(0), [])
  const debouncedText = useDebouncedQueueText(JSON.stringify([filters.keyword.trim(), filters.productType.trim()]), resetOffset)
  const [debouncedKeyword, debouncedProductType] = JSON.parse(debouncedText) as [string, string]
  const requestGeneration = useRef(0)
  const queryKey = JSON.stringify([debouncedKeyword, debouncedProductType, filters.status, offset, scope])
  const [state, setState] = useState<AsyncState<{ user: AuthenticatedUserProfile | null; items: PsfRequestListItem[]; total: number; limit: number; scope: typeof scope | null; queryKey: string | null }>>({
    loading: true,
    error: null,
    data: { user: null, items: [], total: 0, limit: 100, scope: null, queryKey: null },
  })

  useEffect(() => {
    let mounted = true
    if (scope === 'my-drafts') return
    void api.fetchWorkflowStatuses().then((response) => {
      if (mounted) setCatalog({ loading: false, error: null, data: response.statuses.filter((item) => item !== 'Draft'), statusKinds: Object.fromEntries((response.entries ?? []).map((entry) => [entry.name, entry.kind])) })
    }).catch((error: unknown) => {
      if (mounted) setCatalog((current) => ({ ...current, loading: false, error: error instanceof Error ? error.message : 'Catalog unavailable', errorStatus: error instanceof ApiError ? error.status : undefined }))
    })
    return () => { mounted = false }
  }, [catalogRetry, scope])

  useEffect(() => {
    let mounted = true
    const generation = ++requestGeneration.current
    const isCurrent = () => mounted && generation === requestGeneration.current

    async function loadRequests() {
      setState((current) => ({ ...current, loading: true, error: null, errorStatus: undefined }))

      try {
        const user = await loadCurrentUser()
        if (!isCurrent()) return
        setState((current) => current.data.user && (current.data.user.id !== user.id || current.data.user.role !== user.role || current.data.user.setupOwnerDepartment !== user.setupOwnerDepartment)
          ? { ...current, data: { ...current.data, user: null, items: [], total: 0, scope: null, queryKey: null } }
          : current)
        const response = await api.queryPsfRequests(
          roleAwareRequestQuery(user, {
            scope,
            keyword: debouncedKeyword || undefined,
            status: scope === 'all' ? filters.status || undefined : undefined,
            productType: debouncedProductType || undefined,
            limit: 100,
            offset,
          }),
        )

        if (isCurrent()) {
          setState({ loading: false, error: null, data: { user, items: response.items, total: response.total, limit: response.limit, scope, queryKey } })
        }
      } catch (error) {
        if (isCurrent()) {
          setState((current) => ({
            ...current,
            loading: false,
            error: error instanceof Error ? error.message : 'Unable to load PSF requests',
            errorStatus: error instanceof ApiError ? error.status : undefined,
            data: { ...current.data, user: null, items: [], total: 0, scope: null, queryKey: null },
          }))
        }
      }
    }

    void loadRequests()

    return () => {
      mounted = false
    }
  }, [debouncedKeyword, debouncedProductType, filters.status, offset, queryKey, retry, scope])

  const hasActiveFilters = Boolean(
    filters.keyword.trim() || filters.status || filters.productType.trim(),
  )
  const pending = state.loading || filters.keyword.trim() !== debouncedKeyword || filters.productType.trim() !== debouncedProductType || state.data.queryKey !== queryKey
  const hasResults = !state.error && state.data.user !== null && state.data.scope === scope
  const clearFilters = () => { setFilters({ keyword: '', status: '', productType: '' }); setOffset(0) }

  return (
    <article className="workflow-page requests-page">
      <PageHeader title={scope === 'my-drafts' ? 'My Drafts' : 'Requests'} description={scope === 'my-drafts' ? 'Private drafts you created. Save and review before submitting.' : 'Browse submitted requests and track engineering work.'}
        actions={hasResults ? <Link className="btn-primary" to="/requests/new"><Plus size={16} /> New Request</Link> : undefined} />

      <section className="request-browser" aria-label="PSF request browser">
        <div className="queue-surface__heading"><h2>{scope === 'my-drafts' ? 'Private drafts' : 'Request records'}</h2><span>{hasActiveFilters ? 'Filtered results' : 'All results'}</span></div>
        <QueueFilterPanel active={hasActiveFilters}>
        <div className="toolbar request-browser__toolbar" aria-label="Request filters">
          <form className={`filter-bar request-list-filters${scope === 'my-drafts' ? ' request-list-filters--drafts' : ''}`} onSubmit={(event) => event.preventDefault()}>
            <label>
              Keyword
              <span className="filter-bar__control">
                <Search size={16} />
                <input
                  className="input-base input-with-icon"
                  onChange={(event) => { setFilters((current) => ({ ...current, keyword: event.target.value })) }}
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
              <input value={filters.productType} onChange={(event) => { setFilters((current) => ({ ...current, productType: event.target.value })) }} placeholder="Search product type…" />
            </label>
          </form>
          <div className="toolbar__actions">
            <button
              className="btn-secondary"
              disabled={!hasActiveFilters}
              onClick={clearFilters}
              type="button"
            >
              <RotateCcw size={14} /> Clear filters
            </button>
          </div>
        </div>

        </QueueFilterPanel>
        <div className="queue-surface request-browser__results">
        {scope === 'all' && catalog.loading ? <p role="status">Loading status catalog…</p> : null}
        {scope === 'all' && catalog.error ? <div className="status-pill status-pill--error" role="alert">
          <span>{`Unable to load status catalog: ${catalog.error}`}</span>
          {catalog.errorStatus === 401 ? <Link to="/login">Sign in again</Link> : null}
          <button className="btn-secondary" disabled={catalog.loading} onClick={() => { setCatalog((current) => ({ ...current, loading: true, error: null, errorStatus: undefined })); setCatalogRetry((current) => current + 1) }} type="button">Retry status catalog</button>
        </div> : null}
        {pending && !state.error ? <p className="page-card__description" role="status">{hasResults ? 'Updating PSF requests…' : 'Loading PSF requests…'}</p> : null}
        {state.error ? (
          <p className="status-pill status-pill--error" role="alert">
            {state.error}{state.errorStatus === 401 ? <> <Link to="/login">Sign in again</Link></> : null}
          </p>
        ) : null}
        {!state.loading && state.error ? <button className="btn-secondary" onClick={() => { setState((current) => ({ ...current, loading: true })); setRetry((current) => current + 1) }} type="button">Retry requests</button> : null}
        {hasResults && (state.data.items.length > 0 || !pending) ? <div className={`request-results${pending ? ' request-results--updating' : ''}`} inert={pending} aria-busy={pending}><RequestsTable
          items={state.data.items}
          drafts={scope === 'my-drafts'}
          statusKinds={catalog.statusKinds}
          emptyTitle={hasActiveFilters ? 'No requests match these filters' : scope === 'my-drafts' ? 'No private drafts yet' : 'No submitted requests yet'}
          emptyDescription={hasActiveFilters ? 'Try another keyword, product type, or status, or clear the filters.' : scope === 'my-drafts' ? 'Save a new request as a draft to find it here.' : 'Submitted requests will appear here for shared work.'}
          onClearFilters={hasActiveFilters ? clearFilters : undefined}
          onOpenItem={(requestId) => void navigate({ to: '/requests/$requestId', params: { requestId } })}
        /></div> : null}
        {hasResults && !pending ? <div className="table-footer" aria-label="Request list pagination"><span>{state.data.items.length ? `${offset + 1}–${Math.min(offset + state.data.items.length, state.data.total)} of ${state.data.total} requests` : '0 requests'}</span>
          {offset > 0 || state.data.total > state.data.limit ? <div className="toolbar__actions">
            <button className="btn-secondary" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - state.data.limit))} type="button">Previous</button>
            <button className="btn-secondary" disabled={offset + state.data.limit >= state.data.total} onClick={() => setOffset(offset + state.data.limit)} type="button">Next</button>
          </div> : null}
        </div> : null}
        </div>
      </section>
    </article>
  )
}

export function RequestCreatePage() {
  const navigate = useNavigate()
  const [dirty, setDirty] = useState(false)
  const [requesterIdentity, setRequesterIdentity] = useState<string | undefined>()
  useEffect(() => {
    let mounted = true
    void Promise.resolve(fetchCurrentUser()).then((response) => { if (mounted) setRequesterIdentity(response?.user.displayName) }).catch(() => { /* The session shell owns authentication recovery. */ })
    return () => { mounted = false }
  }, [])
  const [savedRequest, setSavedRequest] = useState<PsfRequestResponse | null>(null)
  const shouldBlockExit = useCallback(({ current, next }: { current: { pathname: string }; next: { pathname: string } }) =>
    dirty && current.pathname !== next.pathname, [dirty])
  const blocker = useBlocker({ shouldBlockFn: shouldBlockExit, enableBeforeUnload: dirty, withResolver: true })
  useEffect(() => {
    if (savedRequest && !dirty) void navigate({ to: '/requests/$requestId', params: { requestId: savedRequest.id } })
  }, [dirty, navigate, savedRequest])
  return (
    <article className="workflow-page request-create-page">
      <PageHeader title="New Request" description="Save a private draft, then review and submit from its detail page." />
      <ActiveSchemaForm headerTitle="Requester Information" mode="request" requesterIdentity={requesterIdentity} onDirtyChange={setDirty} onRequestSaved={setSavedRequest} />
      <ConfirmDialog open={blocker?.status === 'blocked'} title="Discard unsaved changes?" description="Your unsaved request changes will be lost when you leave this page." confirmLabel="Discard and leave" cancelLabel="Stay on page" tone="danger" onCancel={() => { if (blocker?.status === 'blocked') blocker.reset() }} onConfirm={() => { if (blocker?.status === 'blocked') blocker.proceed() }} />
    </article>
  )
}

export function RequestDetailRoutePage() {
  const { requestId } = useParams({ from: '/requests/$requestId/' })
  const setRequestBreadcrumb = useContext(RequestBreadcrumbContext)
  return <RequestDetailShell key={requestId} requestId={requestId} onIdentityResolved={setRequestBreadcrumb} />
}

export function RequestDetailShell({ requestId, onIdentityResolved }: { requestId: string; onIdentityResolved?: (value: RequestBreadcrumb | null) => void }) {
  const [loadedRequest, setRequest] = useState<PsfRequestResponse | null>(null)
  const request = loadedRequest?.id === requestId ? loadedRequest : null
  const [history, setHistory] = useState<AsyncState<PsfRequestHistoryEntry[]>>({
    loading: true,
    error: null,
    data: [],
  })
  const [requesterDirty, setRequesterDirty] = useState(false)
  const [draftSchemaSubmitAllowed, setDraftSchemaSubmitAllowed] = useState(false)
  const [psfCreatedValues, setPsfCreatedValues] = useState<DynamicFormValues>({})
  const [psfCreatedDirty, setPsfCreatedDirty] = useState(false)
  const currentRequestId = useRef(requestId)
  const psfDraft = useRef({ values: psfCreatedValues, dirty: psfCreatedDirty })
  useEffect(() => { currentRequestId.current = requestId }, [requestId])
  useEffect(() => { psfDraft.current = { values: psfCreatedValues, dirty: psfCreatedDirty } }, [psfCreatedValues, psfCreatedDirty])
  const [allowedNextStatuses, setAllowedNextStatuses] = useState<string[]>([])
  const [status, setStatus] = useState('')
  const [submissionConflict, setSubmissionConflict] = useState(0)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [savingPsfCreatedData, setSavingPsfCreatedData] = useState(false)
  const [savingRequesterData, setSavingRequesterData] = useState(false)
  const [savingStatus, setSavingStatus] = useState(false)
  const [loadAttempt, setLoadAttempt] = useState(0)
  const [historyRetry, setHistoryRetry] = useState(0)
  const [activeTab, setActiveTab] = useState<'requester' | 'psf' | 'history' | null>(null)
  const [psfEditing, setPsfEditing] = useState(false)
  const [statusKinds, setStatusKinds] = useState<Record<string, WorkflowStatusKind>>({})
  useEffect(() => {
    let active = true
    void Promise.resolve(api.fetchWorkflowStatuses()).then((configuration) => { if (active) setStatusKinds(Object.fromEntries((configuration?.entries ?? []).map((entry) => [entry.name, entry.kind]))) }).catch(() => { /* Unknown catalog kinds remain neutral. */ })
    return () => { active = false }
  }, [loadAttempt])

  const dirty = requesterDirty || psfCreatedDirty
  const shouldBlockExit = useCallback(({ current, next }: { current: { pathname: string }; next: { pathname: string } }) =>
    dirty && current.pathname !== next.pathname, [dirty])
  const blocker = useBlocker({ shouldBlockFn: shouldBlockExit, enableBeforeUnload: dirty, withResolver: true })

  useEffect(() => {
    let mounted = true

    async function loadRequest() {
      setLoading(true)
      setError(null)
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
          setPsfEditing(false)
          setActiveTab(null)
          psfDraft.current = { values: buildPsfCreatedInformationValues(response), dirty: false }
          setPsfCreatedValues(psfDraft.current.values)
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

    void loadRequest()
    return () => { mounted = false }
  }, [requestId, loadAttempt])

  useEffect(() => {
    let mounted = true
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

    void loadHistory()
    return () => { mounted = false }
  }, [requestId, historyRetry])

  useEffect(() => {
    if (request && typeof document !== 'undefined') document.title = `${request.requestNo} · PSF Request Portal`
    onIdentityResolved?.(request && request.id === requestId ? { requestId, requestNo: request.requestNo, isDraft: request.status === 'Draft' } : null)
    return () => onIdentityResolved?.(null)
  }, [request, requestId, onIdentityResolved])

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

  function acceptRequesterSnapshot(snapshot: PsfRequestResponse) {
    if (snapshot.id !== requestId || currentRequestId.current !== requestId) return
    const baseline = buildPsfCreatedInformationValues(snapshot)
    const nextValues = psfDraft.current.dirty ? psfDraft.current.values : baseline
    const nextDirty = JSON.stringify(nextValues) !== JSON.stringify(baseline)
    psfDraft.current = { values: nextValues, dirty: nextDirty }
    setRequest(snapshot)
    setPsfCreatedValues(nextValues)
    setPsfCreatedDirty(nextDirty)
  }

  function updatePsfCreatedInformation(fieldKey: string, value: string) {
    if (!request || currentRequestId.current !== requestId) return
    const nextValues = { ...psfDraft.current.values, [fieldKey]: value }
    const nextDirty = JSON.stringify(nextValues) !== JSON.stringify(buildPsfCreatedInformationValues(request))
    psfDraft.current = { values: nextValues, dirty: nextDirty }
    setPsfCreatedValues(nextValues)
    setPsfCreatedDirty(nextDirty)
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
      setPsfEditing(false)
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

  const selectedTab = activeTab ?? (request?.canEditPsfCreatedData && request.status !== 'Draft' ? 'psf' : 'requester')
  const detailTabs = [{ key: 'requester', label: 'Requester Information' }, { key: 'psf', label: 'PSF Created Information' }, { key: 'history', label: 'History' }] as const

  return (
    <article className={`workflow-page detail-page${request?.status === 'Draft' ? ' detail-page--draft' : ''}`}>
      {!request && !loading ? <h1>Request Detail</h1> : null}

      {loading ? <AsyncNotice kind="loading" title="Loading request detail…" /> : null}
      {error ? <AsyncNotice kind="error" title={error} action={!request && !loading ? <button className="btn-secondary" type="button" onClick={() => setLoadAttempt((value) => value + 1)}>Retry request</button> : undefined} /> : null}
      {message ? <AsyncNotice kind="success" title={message} /> : null}

      {request ? (
        <>
        <RequestHeaderSummary request={request} kind={statusKinds[request.status]} />
        <div className="detail-layout">
          <aside className="detail-layout__actions" aria-label="Request actions">
            <section className="workflow-section">
              <div className="section-heading">
                <h2>{request.status === 'Draft' ? 'Submit request' : 'Change Status'}</h2>
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

          </aside>
          {request.status !== 'Draft' ? <div className="detail-tabs" role="tablist" aria-label="Request information">
            {detailTabs.map((tab, index) => <button type="button" key={tab.key} id={`detail-tab-${tab.key}`} role="tab" aria-selected={selectedTab === tab.key} aria-controls={`detail-panel-${tab.key}`} tabIndex={selectedTab === tab.key ? 0 : -1} onClick={() => setActiveTab(tab.key)} onKeyDown={(event) => {
              const next = event.key === 'ArrowRight' ? (index + 1) % 3 : event.key === 'ArrowLeft' ? (index + 2) % 3 : event.key === 'Home' ? 0 : event.key === 'End' ? 2 : null
              if (next !== null) { event.preventDefault(); setActiveTab(detailTabs[next].key); event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('[role="tab"]')[next]?.focus() }
            }}>{tab.label}</button>)}
          </div> : null}
          <div className="detail-editors">

            <section className="workflow-section detail-layout__requester" id="detail-panel-requester" role={request.status === 'Draft' ? undefined : 'tabpanel'} aria-labelledby={request.status === 'Draft' ? undefined : 'detail-tab-requester'} hidden={request.status !== 'Draft' && selectedTab !== 'requester'}>
              <ActiveSchemaForm
                explicitEdit
                disabled={mutationPending}
                headerTitle="Requester Information"
                mode="request"
                requestId={requestId}
                onDirtyChange={setRequesterDirty}
                onDraftSchemaSubmitAllowedChange={setDraftSchemaSubmitAllowed}
                onRequestSaved={acceptRequesterSnapshot}
                onSavingChange={setSavingRequesterData}
                onSubmissionConflictSettled={setSavingStatus}
                requestSnapshot={request}
                submissionConflict={submissionConflict}
              />
            </section>

            <section className="workflow-section detail-layout__psf" id="detail-panel-psf" role="tabpanel" aria-labelledby="detail-tab-psf" hidden={request.status === 'Draft' || selectedTab !== 'psf'}>
              <PsfCreatedInformationPanel
                editing={psfEditing}
                onEdit={() => { if (!mutationPending) setPsfEditing(true) }}
                onCancel={() => { if (!mutationPending) { setPsfCreatedValues(buildPsfCreatedInformationValues(request)); setPsfCreatedDirty(false); setPsfEditing(false) } }}
                onChange={updatePsfCreatedInformation}
                onSave={(values) => void savePsfCreatedInformation(values)}
                request={request}
                saving={savingPsfCreatedData}
                dirty={psfCreatedDirty}
                disabled={mutationPending}
                values={psfCreatedValues}
              />
            </section>
          </div>

          <div className="detail-layout__history" id="detail-panel-history" role="tabpanel" aria-labelledby="detail-tab-history" hidden={request.status === 'Draft' || selectedTab !== 'history'}><RequestHistoryPanel
              onRetry={() => setHistoryRetry((value) => value + 1)}
              entries={history.data}
              error={history.error}
              loading={history.loading}
            /></div>
        </div>
        </>
      ) : null}
      <ConfirmDialog open={blocker?.status === 'blocked'} title="Discard unsaved changes?" description="Unsaved requester or PSF information will be lost when you leave this page." confirmLabel="Discard and leave" cancelLabel="Stay on page" tone="danger" onCancel={() => { if (blocker?.status === 'blocked') blocker.reset() }} onConfirm={() => { if (blocker?.status === 'blocked') blocker.proceed() }} />
    </article>
  )
}

export function RequestHistoryRoutePage() {
  const { requestId } = useParams({ from: '/requests/$requestId/history' })
  const setRequestBreadcrumb = useContext(RequestBreadcrumbContext)
  return <RequestHistoryPage requestId={requestId} onIdentityResolved={setRequestBreadcrumb} />
}

export function RequestHistoryPage({ requestId, onIdentityResolved }: { requestId: string; onIdentityResolved?: (value: RequestBreadcrumb | null) => void }) {
  const [request, setRequest] = useState<PsfRequestResponse | null>(null)
  const [state, setState] = useState<AsyncState<PsfRequestHistoryEntry[]> & { requestId: string }>({ requestId, loading: true, error: null, data: [] })
  const [retry, setRetry] = useState(0)
  const currentRequest = request?.id === requestId ? request : null
  const currentHistory = state.requestId === requestId ? state : { loading: true, error: null, data: [] }
  useEffect(() => {
    let active = true
    async function loadHistory() {
      setState({ requestId, loading: true, error: null, data: [] })
      try {
        const entries = await api.fetchPsfRequestHistory(requestId)
        if (active) setState({ requestId, loading: false, error: null, data: entries })
      } catch (error) {
        if (active) setState({ requestId, loading: false, error: error instanceof Error ? error.message : 'Unable to load request history', data: [] })
      }
    }
    void api.fetchPsfRequest(requestId).then((response) => { if (active) setRequest(response) }).catch(() => { /* History authorization remains with its own endpoint. */ })
    void loadHistory()
    return () => { active = false }
  }, [requestId, retry])
  useEffect(() => {
    if (request?.id === requestId && typeof document !== 'undefined') document.title = `${request.requestNo} history · PSF Request Portal`
    onIdentityResolved?.(request && request.id === requestId ? { requestId, requestNo: request.requestNo, isDraft: request.status === 'Draft' } : null)
    return () => onIdentityResolved?.(null)
  }, [request, requestId, onIdentityResolved])
  return <article className="workflow-page request-history-page">
    <PageHeader title="Request History" description={currentRequest ? `${currentRequest.requestNo} · ${getRequestTitle(currentRequest)}` : 'Activity visible to you for this request.'} />
    <RequestHistoryPanel entries={currentHistory.data} error={currentHistory.error} loading={currentHistory.loading} onRetry={() => setRetry((value) => value + 1)} />
  </article>
}
