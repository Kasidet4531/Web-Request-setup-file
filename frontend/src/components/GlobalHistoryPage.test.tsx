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

vi.mock('@tanstack/react-router', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tanstack/react-router')>()

  return {
    ...actual,
    Link: ({ children, params }: { children: ReactNode; params: { requestId: string } }) =>
      createElement('a', { href: `/requests/${params.requestId}` }, children),
  }
})

describe('History route', () => {
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
    expect(html).toContain('Apply')
    expect(html).toContain('Clear')

    const form = controls as unknown as {
      props: {
        children: unknown[]
        onSubmit: (event: { preventDefault: () => void }) => void
      }
    }
    form.props.onSubmit({ preventDefault: vi.fn() })
    expect(onApply).toHaveBeenCalledTimes(1)

    const actions = form.props.children as unknown[]
    const buttonRow = actions[5] as {
      props: { children: Array<{ props: { children: string; onClick?: () => void } }> }
    }
    const clearButton = buttonRow.props.children[1]
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
