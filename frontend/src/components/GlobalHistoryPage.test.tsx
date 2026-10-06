import { renderToStaticMarkup } from 'react-dom/server'
import { createElement, type ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'
import {
  GlobalAuditLogFilters,
  GlobalAuditLogTable,
  GlobalHistoryPage,
} from './GlobalHistoryPage'
import {
  EMPTY_GLOBAL_AUDIT_LOG_FILTERS,
  buildGlobalAuditLogQuery,
} from './global-history'
import { Route as HistoryRoute } from '../routes/history'
import { formatHistoryDateTime } from './ui/historyDateTime'
import { HistoryChanges } from './ui/HistoryChanges'

vi.mock('@tanstack/react-router', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tanstack/react-router')>()

  return {
    ...actual,
    Link: ({ children, params }: { children: ReactNode; params: { requestId: string } }) =>
      createElement('a', { href: `/requests/${params.requestId}` }, children),
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
  it('renders native filter controls and invokes Apply and Clear actions', () => {
    const onApply = vi.fn()
    const onClear = vi.fn()
    const controls = GlobalAuditLogFilters({
      filters: {
        requestId: 'request-1',
        user: 'setup.gntc',
        actionType: 'REQUEST_STATUS_CHANGED',
        from: '2026-06-18',
        to: '2026-06-19',
      },
      onApply,
      onChange: vi.fn(),
      onClear,
    })
    const html = renderToStaticMarkup(controls)

    expect(html).toContain('name="requestId"')
    expect(html).toContain('name="user"')
    expect(html).toContain('name="actionType"')
    expect(html).toContain('name="from"')
    expect(html).toContain('name="to"')
    expect(html).toContain('type="date"')
    expect(html).toContain('global-history-filters__dates')
    expect(html).toContain('global-history-filters__actions')
    expect(html).toContain('btn-ghost')

    const form = controls as unknown as {
      props: {
        children: unknown[]
        onSubmit: (event: { preventDefault: () => void }) => void
      }
    }
    form.props.onSubmit({ preventDefault: vi.fn() })
    expect(onApply).toHaveBeenCalledTimes(1)

    const actions = form.props.children as unknown[]
    const buttonRow = actions[4] as {
      props: { children: Array<{ props: { children: string; onClick?: () => void } }> }
    }
    const clearButton = buttonRow.props.children[0]
    clearButton.props.onClick?.()
    expect(onClear).toHaveBeenCalledTimes(1)
  })

  it('serializes only applied non-empty filters for the server-authorized audit query and clears to the empty form', () => {
    expect(buildGlobalAuditLogQuery({
      requestId: ' request-1 ',
      user: ' setup.gntc ',
      actionType: 'REQUEST_STATUS_CHANGED',
      from: '2026-06-18',
      to: '2026-06-19',
    })).toEqual({
      requestId: 'request-1',
      user: 'setup.gntc',
      actionType: 'REQUEST_STATUS_CHANGED',
      from: '2026-06-18',
      to: '2026-06-19',
    })
    expect(EMPTY_GLOBAL_AUDIT_LOG_FILTERS).toEqual({
      requestId: '',
      user: '',
      actionType: '',
      from: '',
      to: '',
    })
  })
})

describe('GlobalAuditLogTable', () => {
  it('keeps loaded audit rows visible and inert while refreshing instead of replacing the table', () => {
    const html = renderToStaticMarkup(GlobalAuditLogTable({
      entries: [{
        requestId: 'request-1', requestNo: 'PSF-0001', actionType: 'REQUEST_SUBMITTED',
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
        requestId: 'request-1', requestNo: 'PSF-0001',
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
      requestId: null, requestNo: null, actionType: 'WORKFLOW_CATALOG_UPDATED',
      actorDisplayName: 'Admin', actorRole: 'admin', createdAt: 'invalid-date',
      metadata: { operation: { action: 'rename', name: '<script>new status</script>' } },
    }], error: null, loading: false }))
    expect(html).toContain('rename')
    expect(html).toContain('&lt;script&gt;new status&lt;/script&gt;')
    expect(html).not.toContain('<script>')
    expect(html).toContain('invalid-date')
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
          requestId: 'request-2',
          requestNo: 'PSF-0002',
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
          requestId: 'request-1',
          requestNo: 'PSF-0001',
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
    expect(html).toContain('<th scope="col">Request</th>')
    expect(html).toContain('<th scope="col">User</th>')
    expect(html).toContain('<th scope="col">Action</th>')
    expect(html).toContain('<th scope="col">Detail</th>')
    expect(html).toContain('href="/requests/request-2"')
    expect(html).toContain('Setup Owner GNTC Demo')
    expect(html).toContain('Status: Submitted → Setup In Progress')
    expect(html).toContain('<td>—</td>')
    expect(html.indexOf('PSF-0002')).toBeLessThan(html.indexOf('PSF-0001'))
  })
})


it('shows assignment history in the global table and exposes it as an action filter', () => {
  const table = renderToStaticMarkup(<GlobalAuditLogTable loading={false} error={null} entries={[{ requestId: 'request-1', requestNo: 'PSF-0001', actionType: 'REQUEST_ASSIGNEE_CHANGED', actorDisplayName: 'Requester', actorRole: 'requester', createdAt: '2026-10-06T00:00:00Z', metadata: { before: { setupOwnerUserId: null, setupOwner: 'Legacy owner', setupOwnerRole: 'MFG' }, after: { setupOwnerUserId: 'owner-2', setupOwner: 'Current owner', setupOwnerRole: 'GNTC' } } }]} />)
  expect(table).toContain('Request assignee changed')
  expect(table).toContain('Legacy owner / MFG')
  expect(table).toContain('Current owner / GNTC')
  const filters = renderToStaticMarkup(<GlobalAuditLogFilters filters={EMPTY_GLOBAL_AUDIT_LOG_FILTERS} onApply={vi.fn()} onChange={vi.fn()} onClear={vi.fn()} />)
  expect(filters).toContain('value="REQUEST_ASSIGNEE_CHANGED"')
})
