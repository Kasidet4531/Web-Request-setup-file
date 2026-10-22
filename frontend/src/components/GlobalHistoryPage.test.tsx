import { renderToStaticMarkup } from 'react-dom/server'
import { createElement, type ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  GlobalAuditLogFilters,
  GlobalAuditLogTable,
  DraftDeletionsTable,
  GlobalHistoryPage,
} from './GlobalHistoryPage'
import {
  EMPTY_GLOBAL_AUDIT_LOG_FILTERS,
  buildGlobalAuditLogQuery,
} from './global-history'
import { Route as HistoryRoute } from '../routes/history'
import { formatHistoryDateTime } from './ui/historyDateTime'
import { HistoryChanges } from './ui/HistoryChanges'
import { createHookHarness, requireRenderedElement } from '../test-utils/componentHarness'

const hooks = vi.hoisted(() => ({ current: null as ReturnType<typeof createHookHarness> | null }))
const service = vi.hoisted(() => ({
  fetchCurrentUser: vi.fn(),
  fetchDraftDeletions: vi.fn(),
  fetchGlobalAuditLogs: vi.fn(),
}))

vi.mock('../services/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../services/api')>()
  return {
    ...actual,
    fetchCurrentUser: service.fetchCurrentUser,
    api: {
      ...actual.api,
      fetchDraftDeletions: service.fetchDraftDeletions,
      fetchGlobalAuditLogs: service.fetchGlobalAuditLogs,
    },
  }
})

vi.mock('@tanstack/react-router', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tanstack/react-router')>()
  return {
    ...actual,
    Link: ({ children, params }: { children: ReactNode; params: { requestId: string; entryId?: string } }) =>
      createElement('a', { href: `/requests/${params.requestId}${params.entryId ? `/history/${params.entryId}` : ''}` }, children),
  }
})

vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react')>()
  return {
    ...actual,
    useState: (value: unknown) => (hooks.current ? hooks.current.useState(value) : actual.useState(value)),
    useEffect: (effect: () => void, deps: unknown[]) =>
      hooks.current ? hooks.current.useEffect(effect, deps) : actual.useEffect(effect, deps),
    useRef: <T,>(value: T) => (hooks.current ? hooks.current.useRef(value) : actual.useRef(value)),
  }
})

describe('History route', () => {
  it('shows multiple PSF trigger names and the retrospective release count', () => {
    const html = renderToStaticMarkup(<HistoryChanges metadata={{
      operation: { action: 'rename', name: 'Work' }, releasedRequestCount: 2,
      before: { entries: [{ id: 'first', name: 'Work', kind: 'open' }, { id: 'second', name: 'Review', kind: 'open' }], psfVisibilityTriggerIds: ['first'] },
      after: { entries: [{ id: 'first', name: 'Work', kind: 'open' }, { id: 'second', name: 'Review', kind: 'open' }], psfVisibilityTriggerIds: ['first', 'second'] },
    }} />)
    expect(html).toContain('PSF visibility triggers: Work, Review')
    expect(html).toContain('Requester PSF access released for 2 request(s).')
  })
  it('uses Asia/Bangkok independently of the host timezone and preserves invalid timestamp fallback', () => {
    vi.stubEnv('TZ', 'UTC')
    try {
      expect(formatHistoryDateTime('2026-10-04T23:30:00Z')).toBe('05 Oct 2026, 06:30:00')
      expect(formatHistoryDateTime('invalid timestamp')).toBe('invalid timestamp')
    } finally {
      vi.unstubAllEnvs()
    }
  })

  it('does not invent diffs from malformed or missing old/new field values', () => {
    const html = renderToStaticMarkup(<HistoryChanges metadata={{ fieldChanges: [null, { fieldLabel: 'Unknown', after: 'New only' }] }} />)
    expect(html).toBe('—')
  })

  it('names catalog values and release settings without exposing internal configuration identifiers', () => {
    const html = renderToStaticMarkup(<HistoryChanges metadata={{
      operation: { action: 'rename', name: 'New exact status' },
      before: { entries: [{ id: 'internal-catalog-id', name: 'Old exact status', kind: 'open' }], psfVisibilityTriggerId: 'internal-catalog-id' },
      after: { entries: [{ id: 'internal-catalog-id', name: 'New exact status', kind: 'open' }], psfVisibilityTriggerId: null },
    }} />)
    expect(html).toContain('Old exact status')
    expect(html).toContain('New exact status')
    expect(html).toContain('PSF visibility trigger: Old exact status')
    expect(html).toContain('PSF visibility trigger: None')
    expect(html).not.toContain('internal-catalog-id')
  })

  it('replaces the placeholder with the global history page', () => {
    const options = Reflect.get(HistoryRoute, 'options') as { component?: unknown }

    expect(options.component).toBe(GlobalHistoryPage)
  })
})

describe('GlobalAuditLogFilters', () => {
  it('explains one Search field, keeps selected Bangkok dates visible and has no Apply or Status control', () => {
    const html = renderToStaticMarkup(<GlobalAuditLogFilters
      filters={{ keyword: 'Chip', actionType: 'REQUEST_STATUS_CHANGED', from: '2026-10-22', to: '2026-10-22' }}
      onChange={vi.fn()} onClear={vi.fn()} moreFiltersOpen={false} onToggleMoreFilters={vi.fn()}
    />)
    expect(html).toContain('name="keyword"')
    expect(html).toContain('Searches request no., product description, user name and username.')
    expect(html).toContain('More filters')
    expect(html).toContain('aria-expanded="false"')
    expect(html).toContain('Dates (Bangkok):')
    expect(html).toContain('2026-10-22')
    expect(html).not.toContain('>Apply<')
    expect(html).not.toContain('name="requestId"')
    expect(html).not.toContain('name="user"')
    expect(html).not.toContain('name="status"')
  })

  it('serializes only non-empty Search, Action and date filters', () => {
    expect(buildGlobalAuditLogQuery({ keyword: ' Chip ', actionType: 'REQUEST_STATUS_CHANGED', from: '2026-10-22', to: '' })).toEqual({ keyword: 'Chip', actionType: 'REQUEST_STATUS_CHANGED', from: '2026-10-22' })
    expect(buildGlobalAuditLogQuery(EMPTY_GLOBAL_AUDIT_LOG_FILTERS)).toEqual({})
  })
})

describe('GlobalAuditLogTable', () => {
  it('links only the entries that have a Request Snapshot to its page', () => {
    const entry = {
      id: 'entry-1', hasRequestSnapshot: false, requestId: 'request-1', requestNo: 'PSF-0001', requestLabel: null, actionType: 'REQUESTER_INFORMATION_UPDATED' as const,
      actorDisplayName: 'Editor', actorRole: 'requester' as const, createdAt: '2026-10-06T01:00:00Z', metadata: {},
    }
    const html = renderToStaticMarkup(GlobalAuditLogTable({
      entries: [{ ...entry, id: 'entry-old', hasRequestSnapshot: false }, { ...entry, id: 'entry-new', hasRequestSnapshot: true }],
      error: null, loading: false,
    }))
    expect(html).toContain('<a href="/requests/request-1/history/entry-new">View Request Snapshot</a>')
    expect(html.match(/View Request Snapshot/g)).toHaveLength(1)
  })

  it('offers only the Request Snapshot for an entry that has one, keeping an Attachment file name', () => {
    const base = { requestId: 'request-1', requestNo: 'PSF-0001', requestLabel: null, actorDisplayName: 'Editor', actorRole: 'requester' as const, createdAt: '2026-10-06T01:00:00Z' }
    const edit = { fieldChanges: [{ fieldKey: 'priority', fieldLabel: 'Priority', before: 'Normal', after: 'Urgent' }] }
    const row = (html: string, id: string) => html.slice(html.indexOf(`/history/${id}`) - 400, html.indexOf(`/history/${id}`) + 200)
    const html = renderToStaticMarkup(GlobalAuditLogTable({
      entries: [
        { ...base, id: 'entry-file', hasRequestSnapshot: true, actionType: 'ATTACHMENT_UPLOADED', metadata: { filename: 'layout.dpl', sizeBytes: 2048 } },
        { ...base, id: 'entry-new', hasRequestSnapshot: true, actionType: 'REQUESTER_INFORMATION_UPDATED', metadata: edit },
        { ...base, id: 'entry-old', hasRequestSnapshot: false, actionType: 'REQUESTER_INFORMATION_UPDATED', metadata: edit },
      ],
      error: null, loading: false,
    }))

    expect(html.match(/<summary>View changes<\/summary>/g)).toHaveLength(1)
    expect(row(html, 'entry-new')).not.toContain('View changes')
    expect(row(html, 'entry-file')).toContain('layout.dpl (2.0 KB)')
    expect(html.indexOf('View changes')).toBeGreaterThan(html.indexOf('/history/entry-new'))
  })

  it('separates Product Description and Request No. while keeping Draft labels and Attachment changes', () => {
    const base = { hasRequestSnapshot: false, actorDisplayName: 'Editor', actorRole: 'requester' as const, createdAt: '2026-10-20T01:00:00Z' }
    const html = renderToStaticMarkup(GlobalAuditLogTable({
      entries: [
        { ...base, id: 'entry-3', requestId: 'request-1', requestNo: 'PSF-005571', requestLabel: 'Chip A', actionType: 'ATTACHMENT_UPLOADED', metadata: { filename: 'layout.dpl', sizeBytes: 2048, mimeType: 'application/octet-stream' } },
        { ...base, id: 'entry-2', requestId: 'request-2', requestNo: 'DRAFT-20261020-0001', requestLabel: 'Untitled Draft (#5572)', actionType: 'ATTACHMENT_DELETED', metadata: { filename: 'old.png', sizeBytes: 10, mimeType: 'image/png' } },
        { ...base, id: 'entry-1', requestId: 'request-3', requestNo: 'DRAFT-20261020-0002', requestLabel: 'Product_Description', actionType: 'DRAFT_CREATED', metadata: {} },
      ],
      error: null, loading: false,
    }))
    expect(html).toContain('<td><a href="/requests/request-1">Chip A</a></td><td class="font-mono-code"><a href="/requests/request-1">PSF-005571</a></td>')
    expect(html).toContain('<td><a href="/requests/request-2">Untitled Draft (#5572)</a></td><td class="font-mono-code">—</td>')
    expect(html).toContain('<td><a href="/requests/request-3">Product_Description</a></td><td class="font-mono-code">—</td>')
    expect(html).not.toContain('DRAFT-2026')
    expect(html).toContain('<td>Attachment uploaded</td>')
    expect(html).toContain('<td>Attachment deleted</td>')
    expect(html).toContain('layout.dpl (2.0 KB)')
    expect(html).toContain('old.png (10 B)')
  })

  it('keeps loaded audit rows visible and inert while refreshing instead of replacing the table', () => {
    const html = renderToStaticMarkup(GlobalAuditLogTable({
      entries: [{
        id: 'entry-1', hasRequestSnapshot: false, requestId: 'request-1', requestNo: 'PSF-0001', requestLabel: null, actionType: 'REQUEST_SUBMITTED',
        actorDisplayName: 'Requester', actorRole: 'requester', createdAt: '2026-10-06T01:00:00Z', metadata: {},
      }], error: null, loading: true,
    }))
    expect(html).toContain('PSF-0001')
    expect(html).toContain('aria-busy="true"')
    expect(html).toContain('inert=""')
  })

  it('displays Bangkok time and readable server-provided field changes without inventing missing history', () => {
    const html = renderToStaticMarkup(GlobalAuditLogTable({
      entries: [{
        id: 'entry-1', hasRequestSnapshot: false, requestId: 'request-1', requestNo: 'PSF-0001', requestLabel: null,
        actionType: 'REQUESTER_INFORMATION_UPDATED', actorDisplayName: 'Editor', actorRole: 'requester',
        createdAt: '2026-10-04T23:30:00Z', metadata: {
          fieldChanges: [{ fieldKey: 'priority', fieldLabel: 'Priority', before: 'Normal', after: 'Urgent' }],
        },
      }], error: null, loading: false,
    }))
    expect(html).toContain('05 Oct 2026, 06:30:00')
    expect(html).toContain('<summary>View changes</summary>')
    expect(html).toContain('Priority')
    expect(html).toContain('Normal')
    expect(html).toContain('Urgent')
    expect(html).toContain('Before')
    expect(html).toContain('After')
  })

  it('renders factual catalog metadata and escapes untrusted values', () => {
    const html = renderToStaticMarkup(GlobalAuditLogTable({ entries: [{
      id: 'entry-1', hasRequestSnapshot: false, requestId: null, requestNo: null, requestLabel: null, actionType: 'WORKFLOW_CATALOG_UPDATED',
      actorDisplayName: 'Admin', actorRole: 'admin', createdAt: 'invalid-date',
      metadata: { operation: { action: 'rename', name: '<script>new status</script>' } },
    }], error: null, loading: false }))
    expect(html).toContain('rename')
    expect(html).toContain('&lt;script&gt;new status&lt;/script&gt;')
    expect(html).not.toContain('<script>')
    expect(html).toContain('invalid-date')
    expect(html).toContain('<td>Workflow configuration</td><td class="font-mono-code">—</td>')
    expect(html).not.toContain('Before')
  })

  it('renders accessible loading, empty, and error states', () => {
    expect(renderToStaticMarkup(
      GlobalAuditLogTable({ entries: [], error: null, loading: true }),
    )).toContain('Loading global audit history…')
    expect(renderToStaticMarkup(
      GlobalAuditLogTable({ entries: [], error: null, loading: false }),
    )).toContain('No global audit history matches the current filters.')

    const errorHtml = renderToStaticMarkup(
      GlobalAuditLogTable({
        entries: [],
        error: 'Audit service unavailable',
        loading: false,
      }),
    )
    expect(errorHtml).toContain('Unable to load global audit history: Audit service unavailable')
    expect(errorHtml).toContain('role="alert"')
  })

  it('renders time, request detail link, user, action, and factual detail columns without invented diffs', () => {
    const html = renderToStaticMarkup(GlobalAuditLogTable({
      entries: [
        {
          id: 'entry-2',
          hasRequestSnapshot: false,
          requestId: 'request-2',
          requestNo: 'PSF-0002',
          requestLabel: null,
          actionType: 'REQUEST_STATUS_CHANGED',
          actorDisplayName: 'Setup Owner GNTC Demo',
          actorRole: 'setup_owner',
          createdAt: '2026-06-19T23:59:59.000Z',
          metadata: {
            fromStatus: 'Submitted',
            toStatus: 'Setup In Progress',
          },
        },
        {
          id: 'entry-1',
          hasRequestSnapshot: false,
          requestId: 'request-1',
          requestNo: 'PSF-0001',
          requestLabel: null,
          actionType: 'DRAFT_CREATED',
          actorDisplayName: 'Requester Demo',
          actorRole: 'requester',
          createdAt: '2026-06-18T00:00:00.000Z',
          metadata: {},
        },
      ],
      error: null,
      loading: false,
    }))

    expect(html).toContain('aria-label="Global audit history"')
    expect(html).toContain('<th scope="col">Time</th>')
    expect(html).toContain('<th scope="col">Product Description</th><th scope="col">Request No.</th>')
    expect(html).toContain('<th scope="col">User</th>')
    expect(html).toContain('<th scope="col">Action</th>')
    expect(html).toContain('<th scope="col">Detail</th>')
    expect(html).toContain('<td>—</td><td class="font-mono-code"><a href="/requests/request-2">PSF-0002</a></td>')
    expect(html).toContain('Setup Owner GNTC Demo')
    expect(html).toContain('<th scope="row">Work Status</th><td><pre class="history-changes__value">Submitted</pre></td><td><pre class="history-changes__value">Setup In Progress</pre></td>')
    expect(html).not.toContain('Status: Submitted')
    expect(html).toContain('<td>—</td>')
    expect(html.indexOf('PSF-0002')).toBeLessThan(html.indexOf('PSF-0001'))
  })
})

describe('DraftDeletionsTable', () => {
  it('renders deletion details including draft number, deleted by, role, and formatted time', () => {
    const html = renderToStaticMarkup(
      <DraftDeletionsTable
        deletions={{
          items: [{ draftNo: 'PSF-DRAFT-1', actorDisplayName: 'Admin User', actorRole: 'admin', deletedAt: '2026-10-06T08:00:00Z' }],
          total: 1,
          limit: 25,
          offset: 0,
        }}
        loading={false}
        error={null}
        offset={0}
        onOffsetChange={vi.fn()}
        onRetry={vi.fn()}
      />
    )
    expect(html).toContain('PSF-DRAFT-1')
    expect(html).toContain('Admin User')
    expect(html).toContain('admin')
    expect(html).toContain('06 Oct 2026')
    expect(html).toContain('1 deletion records')
  })

  it('renders loading, error, and empty states appropriately', () => {
    expect(renderToStaticMarkup(
      <DraftDeletionsTable deletions={null} loading={true} error={null} offset={0} onOffsetChange={vi.fn()} onRetry={vi.fn()} />
    )).toContain('Loading draft deletion records…')

    expect(renderToStaticMarkup(
      <DraftDeletionsTable deletions={{ items: [], total: 0, limit: 25, offset: 0 }} loading={false} error={null} offset={0} onOffsetChange={vi.fn()} onRetry={vi.fn()} />
    )).toContain('No draft deletions recorded.')

    const errorHtml = renderToStaticMarkup(
      <DraftDeletionsTable deletions={null} loading={false} error="Failed to fetch" offset={0} onOffsetChange={vi.fn()} onRetry={vi.fn()} />
    )
    expect(errorHtml).toContain('Unable to load draft deletions: Failed to fetch')
  })
})

describe('GlobalHistoryPage tabs and role access', () => {
  beforeEach(() => {
    hooks.current = createHookHarness()
    service.fetchCurrentUser.mockResolvedValue({ user: { role: 'admin' } })
    service.fetchGlobalAuditLogs.mockResolvedValue({ items: [], total: 0, limit: 25, offset: 0 })
    service.fetchDraftDeletions.mockResolvedValue({ items: [], total: 0, limit: 25, offset: 0 })
  })

  it('searches after typing pauses, applies Action immediately, resets pagination and clears without Apply', async () => {
    vi.useFakeTimers()
    const render = () => { hooks.current!.beginRender(); const page = GlobalHistoryPage(); hooks.current!.runEffects(); return page }
    const change = (page: ReactNode, name: string, value: string) => {
      const control = requireRenderedElement(page, el => el.type === GlobalAuditLogFilters)
      ;(control.props.onChange as (field: string, value: string) => void)(name, value)
    }
    try {
      render(); await vi.advanceTimersByTimeAsync(0)
      let page = render()
      const initialRequests = service.fetchGlobalAuditLogs.mock.calls.length
      change(page, 'keyword', 'Silicon')
      render(); await vi.advanceTimersByTimeAsync(299)
      expect(service.fetchGlobalAuditLogs).toHaveBeenCalledTimes(initialRequests)
      expect(service.fetchGlobalAuditLogs).not.toHaveBeenCalledWith(expect.objectContaining({ keyword: 'Silicon' }))
      await vi.advanceTimersByTimeAsync(1)
      render(); await vi.advanceTimersByTimeAsync(0)
      expect(service.fetchGlobalAuditLogs).toHaveBeenLastCalledWith({ keyword: 'Silicon', limit: 25, offset: 0 })
      page = render()
      const table = requireRenderedElement(page, el => el.type === GlobalAuditLogTable)
      ;(table.props.onOffsetChange as (value: number) => void)(25)
      render(); await vi.advanceTimersByTimeAsync(0)
      page = render()
      change(page, 'actionType', 'REQUEST_STATUS_CHANGED')
      render(); await vi.advanceTimersByTimeAsync(0)
      expect(service.fetchGlobalAuditLogs).toHaveBeenLastCalledWith({ keyword: 'Silicon', actionType: 'REQUEST_STATUS_CHANGED', limit: 25, offset: 0 })
      page = render()
      const filters = requireRenderedElement(page, el => el.type === GlobalAuditLogFilters)
      ;(filters.props.onClear as () => void)()
      render(); await vi.advanceTimersByTimeAsync(0)
      expect(service.fetchGlobalAuditLogs).toHaveBeenLastCalledWith({ limit: 25, offset: 0 })
    } finally {
      hooks.current!.unmount()
      vi.useRealTimers()
    }
  })

  it('shows System Audit Trail and Draft Deletions tabs for admin users', async () => {
    function renderPage() { hooks.current!.beginRender(); return GlobalHistoryPage() }
    renderPage(); hooks.current!.runEffects(); await new Promise(r => setTimeout(r, 0)); const page = renderPage()
    const markup = renderToStaticMarkup(page)
    expect(markup).toContain('System Audit Trail')
    expect(markup).toContain('Draft Deletions')
  })

  it('ignores a late earlier search response and does not submit an invalid date range', async () => {
    vi.useFakeTimers()
    let resolveEarlier: (value: unknown) => void = () => {}
    service.fetchGlobalAuditLogs.mockImplementationOnce(() => new Promise(resolve => { resolveEarlier = resolve }))
    const latest = { id: 'latest-entry', actorDisplayName: 'Latest result' }
    const render = () => { hooks.current!.beginRender(); const page = GlobalHistoryPage(); hooks.current!.runEffects(); return page }
    try {
      let page = render()
      let controls = requireRenderedElement(page, el => el.type === GlobalAuditLogFilters)
      ;(controls.props.onChange as (field: string, value: string) => void)('keyword', 'Latest')
      render(); await vi.advanceTimersByTimeAsync(300)
      service.fetchGlobalAuditLogs.mockResolvedValueOnce({ items: [latest], total: 1, limit: 25, offset: 0 })
      render(); await vi.advanceTimersByTimeAsync(0)
      resolveEarlier({ items: [{ id: 'old-entry' }], total: 1, limit: 25, offset: 0 })
      await vi.advanceTimersByTimeAsync(0)
      page = render()
      expect(requireRenderedElement(page, el => el.type === GlobalAuditLogTable).props.entries).toEqual([latest])
      controls = requireRenderedElement(page, el => el.type === GlobalAuditLogFilters)
      const change = controls.props.onChange as (field: string, value: string) => void
      const requests = service.fetchGlobalAuditLogs.mock.calls.length
      change('from', '2026-10-23'); change('to', '2026-10-22')
      page = render(); await vi.advanceTimersByTimeAsync(300)
      expect(service.fetchGlobalAuditLogs).toHaveBeenCalledTimes(requests)
      controls = requireRenderedElement(page, el => el.type === GlobalAuditLogFilters)
      expect(renderToStaticMarkup(createElement(GlobalAuditLogFilters, controls.props as unknown as Parameters<typeof GlobalAuditLogFilters>[0]))).toContain('Choose an end date on or after the start date.')
    } finally {
      hooks.current!.unmount()
      vi.useRealTimers()
    }
  })

  it('hides tabs for non-admin users', async () => {
    service.fetchCurrentUser.mockResolvedValue({ user: { role: 'requester' } })
    function renderPage() { hooks.current!.beginRender(); return GlobalHistoryPage() }
    renderPage(); hooks.current!.runEffects(); await new Promise(r => setTimeout(r, 0)); const page = renderPage()
    const markup = renderToStaticMarkup(page)
    expect(markup).not.toContain('Draft Deletions')
  })

  it('loads draft deletions when switching to Draft Deletions tab', async () => {
    function renderPage() { hooks.current!.beginRender(); return GlobalHistoryPage() }
    renderPage(); hooks.current!.runEffects(); await new Promise(r => setTimeout(r, 0)); const page = renderPage()
    const tab = requireRenderedElement(page, el => el.type === 'button' && el.props.children === 'Draft Deletions')
    ;(tab.props.onClick as () => void)()
    renderPage()
    hooks.current!.runEffects()
    await new Promise(r => setTimeout(r, 0))
    expect(service.fetchDraftDeletions).toHaveBeenCalledWith(expect.objectContaining({ limit: 25, offset: 0 }))
  })
})

it('removes request assignment from the audit action filter', () => {
  const filters = renderToStaticMarkup(<GlobalAuditLogFilters filters={EMPTY_GLOBAL_AUDIT_LOG_FILTERS} onChange={vi.fn()} onClear={vi.fn()} />)
  expect(filters).not.toContain('REQUEST_ASSIGNEE_CHANGED')
})
