import { renderToStaticMarkup } from 'react-dom/server'
import type { ReactElement } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  RequestDetailShell,
  RequestHeaderSummary,
  WorkflowStatusActions,
} from './RequestsWorkspace'
import * as RequestsWorkspace from './RequestsWorkspace'
import { requesterFieldsAreReadOnly } from './activeSchemaFormState'
import { ApiError, type PsfRequestResponse } from '../services/api'
import { DynamicFormRenderer } from './DynamicFormRenderer'
import { ActiveSchemaForm } from './ActiveSchemaForm'
import { ConfirmDialog } from './ui/ConfirmDialog'
import { AsyncNotice } from './ui/AsyncNotice'

const navigation = vi.hoisted(() => ({ blocker: null as { shouldBlockFn: (location: { current: { pathname: string }; next: { pathname: string } }) => boolean; enableBeforeUnload: boolean; withResolver?: boolean } | null, navigate: vi.fn(), resolver: { status: 'idle' as 'idle' | 'blocked', proceed: vi.fn(), reset: vi.fn() } }))
vi.mock('@tanstack/react-router', async (load) => ({
  ...await load<typeof import('@tanstack/react-router')>(),
  useNavigate: () => navigation.navigate,
  useBlocker: (options: typeof navigation.blocker) => { navigation.blocker = options; return navigation.resolver },
}))

const requestDetailApi = vi.hoisted(() => ({
  fetchCurrentUser: vi.fn(),
  queryPsfRequests: vi.fn(),
  fetchPsfRequest: vi.fn(),
  fetchPsfRequestHistory: vi.fn(),
  fetchPsfRequestStatusOptions: vi.fn(),
  fetchWorkflowStatuses: vi.fn(),
  submitPsfRequest: vi.fn(),
  updatePsfCreatedData: vi.fn(),
  updatePsfRequestStatus: vi.fn(),
}))

const requestDetailHookHarness = vi.hoisted(() => {
  let effectDependencies: Array<readonly unknown[] | undefined> = []
  let effectIndex = 0
  let effects: Array<() => void | (() => void)> = []
  let refIndex = 0
  let refs: Array<{ current: unknown }> = []
  let state: unknown[] = []
  let setters: Array<(nextState: unknown) => void> = []
  let stateIndex = 0

  function dependenciesChanged(
    previous: readonly unknown[] | undefined,
    next: readonly unknown[] | undefined,
  ): boolean {
    if (!previous || !next || previous.length !== next.length) {
      return true
    }

    return previous.some((value, index) => !Object.is(value, next[index]))
  }

  return {
    beginRender() {
      effectIndex = 0
      refIndex = 0
      stateIndex = 0
    },
    reset() {
      effectDependencies = []
      effectIndex = 0
      effects = []
      refIndex = 0
      refs = []
      state = []
      setters = []
      stateIndex = 0
    },
    runEffects() {
      const pendingEffects = effects
      effects = []
      return pendingEffects.map((effect) => effect())
    },
    useEffect(effect: () => void | (() => void), dependencies?: readonly unknown[]) {
      if (dependenciesChanged(effectDependencies[effectIndex], dependencies)) {
        effects.push(effect)
        effectDependencies[effectIndex] = dependencies ? [...dependencies] : undefined
      }
      effectIndex += 1
    },
    useMemo<T>(factory: () => T) {
      return factory()
    },
    useRef<T>(initialValue: T) {
      const index = refIndex
      refIndex += 1
      if (index === refs.length) refs.push({ current: initialValue })
      return refs[index] as { current: T }
    },
    useState(initialState: unknown) {
      const index = stateIndex
      stateIndex += 1

      if (index === state.length) {
        state.push(
          typeof initialState === 'function'
            ? (initialState as () => unknown)()
            : initialState,
        )
        setters[index] = (nextState: unknown) => {
          state[index] =
            typeof nextState === 'function'
              ? (nextState as (currentState: unknown) => unknown)(state[index])
              : nextState
        }
      }

      return [state[index], setters[index]]
    },
  }
})

vi.mock('../services/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../services/api')>()

  return {
    ...actual,
    api: requestDetailApi,
    fetchCurrentUser: requestDetailApi.fetchCurrentUser,
  }
})

vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react')>()

  return {
    ...actual,
    useCallback: <T,>(callback: T) => callback,
    useEffect: requestDetailHookHarness.useEffect,
    useMemo: requestDetailHookHarness.useMemo,
    useRef: requestDetailHookHarness.useRef,
    useState: requestDetailHookHarness.useState,
  }
})

interface RenderedElement {
  key: string | null
  props: Record<string, unknown>
  type: unknown
}

function findRenderedElement(
  node: unknown,
  matches: (element: RenderedElement) => boolean,
): RenderedElement | null {
  if (Array.isArray(node)) {
    for (const child of node) {
      const match = findRenderedElement(child, matches)
      if (match) {
        return match
      }
    }

    return null
  }

  if (
    !node ||
    typeof node !== 'object' ||
    !('props' in node) ||
    !('type' in node) ||
    typeof node.props !== 'object' ||
    node.props === null
  ) {
    return null
  }

  const element: RenderedElement = {
    key: 'key' in node ? (node.key as string | null) : null,
    props: node.props as Record<string, unknown>,
    type: node.type,
  }
  if (matches(element)) {
    return element
  }

  const childMatch = findRenderedElement(element.props.children, matches)
  if (childMatch) {
    return childMatch
  }

  for (const [key, value] of Object.entries(element.props)) {
    if (key !== 'children' && value && typeof value === 'object') {
      const propMatch = findRenderedElement(value, matches)
      if (propMatch) {
        return propMatch
      }
    }
  }

  return null
}

function requireRenderedElement(
  node: unknown,
  matches: (element: RenderedElement) => boolean,
): RenderedElement {
  const element = findRenderedElement(node, matches)

  if (!element) {
    throw new Error('Expected rendered element was not found')
  }

  return element
}

function renderRequestDetailShell(requestId = 'request-1') {
  requestDetailHookHarness.beginRender()
  return RequestDetailShell({ requestId })
}

function renderRequestDetailWithRequesterChild(requestId = 'request-1') {
  requestDetailHookHarness.beginRender()
  const shell = RequestDetailShell({ requestId })
  const requesterElement = requireRenderedElement(shell, (element) => element.type === ActiveSchemaForm)
  const requesterForm = ActiveSchemaForm(requesterElement.props as unknown as Parameters<typeof ActiveSchemaForm>[0])
  return { requesterElement, requesterForm, shell }
}

async function flushRequestDetailAsyncWork(): Promise<void> {
  await new Promise<void>((resolve) => setTimeout(resolve, 0))
}

function buildSubmittedRequest(): PsfRequestResponse {
  return {
    id: 'request-1',
    requestNo: 'PSF-0001',
    formKey: 'psf-request',
    formVersion: 4,
    status: 'Submitted',
    requester: null,



    productType: null,
    requesterData: {
      request_title_v4: 'Production probe card setup',
      requester_v4: 'Fook',
      product_kind_v4: 'Existing Product',
      delivery_by_v4: '2026-08-05',
      urgency_v4: 'Urgent',
    },
    psfCreatedData: {},
    psfCreatedDataVisible: false,
    canEditPsfCreatedData: false,
    canEditRequesterData: false,
    canSubmitDraft: false,
    requesterUserId: 'user-1',
    psfReleasedAt: null,
    psfCreatedInformationSchema: {
      formKey: 'psf-created-information',
      version: 1,
      title: 'PSF Created Information',
      sections: [
        {
          sectionKey: 'psf_created_information',
          title: 'PSF Created Information',
          fields: [
            {
              fieldKey: 'psf_setup_file_name',
              canonicalKey: 'psf_setup_file_name',
              label: 'PSF Setup File Name',
              type: 'text',
              required: false,
            },
          ],
        },
      ],
    },
    schemaSnapshot: {
      formKey: 'psf-request',
      version: 4,
      title: 'PSF Request Form',
      sections: [
        {
          sectionKey: 'requester_information',
          title: 'Requester Information',
          fields: [
            {
              fieldKey: 'request_title_v4',
              canonicalKey: 'title',
              label: 'Title',
              type: 'text',
              required: true,
            },
            {
              fieldKey: 'requester_v4',
              canonicalKey: 'requester',
              label: 'Requester',
              type: 'text',
              required: true,
            },
            {
              fieldKey: 'product_kind_v4',
              canonicalKey: 'product_type',
              label: 'Product Type',
              type: 'select',
              required: true,
            },
            {
              fieldKey: 'delivery_by_v4',
              canonicalKey: 'due_date',
              label: 'Due Date',
              type: 'date',
              required: true,
            },
            {
              fieldKey: 'urgency_v4',
              canonicalKey: 'priority',
              label: 'Priority',
              type: 'select',
              required: true,
            },
          ],
        },
      ],
    },
    createdAt: '2026-08-01T00:00:00.000Z',
    updatedAt: '2026-08-01T00:00:00.000Z',
    submittedAt: '2026-08-01T00:00:00.000Z',
    psfCreatedAt: null,
    completedAt: null,
  } as PsfRequestResponse
}

function buildDraftRequest(overrides: Partial<PsfRequestResponse> = {}): PsfRequestResponse {
  const request = buildSubmittedRequest()
  return {
    ...request,
    requestNo: 'DRAFT-0001',
    status: 'Draft',
    canEditRequesterData: true,
    canSubmitDraft: true,
    requesterData: { ...request.requesterData },
    updatedAt: 'opaque-revision-1',
    submittedAt: null,
    ...overrides,
  }
}

type PsfCreatedInformationPanel = (props: {
  onChange: (fieldKey: string, value: string) => void
  onSave: (values: Record<string, string>) => void
  request: PsfRequestResponse
  saving: boolean
  values: Record<string, string>
}) => ReactElement

function getPsfCreatedInformationPanel(): PsfCreatedInformationPanel | undefined {
  const panel = Reflect.get(
    RequestsWorkspace,
    'PsfCreatedInformationPanel',
  ) as PsfCreatedInformationPanel | undefined

  expect(panel).toBeTypeOf('function')
  return panel
}

type RequestHistoryPanel = (props: {
  entries: Array<{
    actionType: string
    actorDisplayName: string
    actorRole: string
    createdAt: string
    metadata: Record<string, unknown>
  }>
  error: string | null
  loading: boolean
}) => ReactElement

function getRequestHistoryPanel(): RequestHistoryPanel | undefined {
  const panel = Reflect.get(
    RequestsWorkspace,
    'RequestHistoryPanel',
  ) as RequestHistoryPanel | undefined

  expect(panel).toBeTypeOf('function')
  return panel
}

describe('RequestHeaderSummary', () => {
  it('uses the submitted schema snapshot for header metadata while requester data stays read-only', () => {
    const request = buildSubmittedRequest()
    const html = renderToStaticMarkup(<RequestHeaderSummary request={request} />)

    expect(html.match(/PSF-0001/g)).toHaveLength(1)
    expect(html).toContain('PSF-0001')
    expect(html).toContain('Production probe card setup')
    expect(html).not.toContain('<span>Product Type</span>')
    expect(html).not.toContain('status-badge--submitted')
    expect(html).toContain('Urgent')
    expect(html).toContain('05/08/2026')
    expect(html).toContain('Fook')
    expect(html).not.toContain('Owner / Dept')
    expect(requesterFieldsAreReadOnly('request', request)).toBe(true)
  })

  it('ignores non-string saved field values instead of crashing the detail header', () => {
    const request = buildSubmittedRequest()
    const malformedRequesterData = request.requesterData as unknown as Record<string, unknown>
    malformedRequesterData.delivery_by_v4 = 42

    const html = renderToStaticMarkup(<RequestHeaderSummary request={request} />)

    expect(html).toContain('<span>Due Date</span><strong>—</strong>')
  })
})

describe('WorkflowStatusActions', () => {
  it('renders only server-authorized next statuses in the native status control', () => {
    const html = renderToStaticMarkup(
      <WorkflowStatusActions
        allowedNextStatuses={['Setup In Progress', 'Need More Information', 'Rejected']}
        currentStatus="Submitted"
        onApply={() => undefined}
        onStatusChange={() => undefined}
        saving={false}
        selectedStatus="Setup In Progress"
      />,
    )

    expect(html).toContain('Status')
    expect(html).toContain('workflow-actions__control')
    expect(html).toContain('<option value="Submitted">Submitted</option>')
    expect(html).toContain('<select')
    expect(html).toContain('Setup In Progress')
    expect(html).toContain('Need More Information')
    expect(html).toContain('Rejected')
    expect(html).not.toContain('Cancelled')
    expect(html).toContain('Save Status')
  })

  it('keeps the only current status selected and disables Save Status when no transition is available', () => {
    const html = renderToStaticMarkup(
      <WorkflowStatusActions
        allowedNextStatuses={[]}
        currentStatus="Completed"
        onApply={() => undefined}
        onStatusChange={() => undefined}
        saving={false}
        selectedStatus="Completed"
      />,
    )

    expect(html).toContain('Status')
    expect(html).toContain('Completed')
    expect(html).toContain('<select')
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>/)
    expect(html).toContain('Save Status')
  })

  it('disables Save Status until an authorized next status is selected', () => {
    const html = renderToStaticMarkup(
      <WorkflowStatusActions
        allowedNextStatuses={['Setup In Progress']}
        currentStatus="Submitted"
        onApply={() => undefined}
        onStatusChange={() => undefined}
        saving={false}
        selectedStatus="Submitted"
      />,
    )

    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>/)
  })

  it('disables workflow controls while a status update is pending', () => {
    const html = renderToStaticMarkup(
      <WorkflowStatusActions
        allowedNextStatuses={['Setup In Progress']}
        currentStatus="Submitted"
        onApply={() => undefined}
        onStatusChange={() => undefined}
        saving
        selectedStatus="Setup In Progress"
      />,
    )

    expect(html).toMatch(/<select[^>]*disabled=""[^>]*>/)
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>/)
    expect(html).toContain('Saving Status…')
  })
})

describe('PsfCreatedInformationPanel', () => {
  it('shows only the friendly placeholder when the backend masks PSF Created Information', () => {
    const panel = getPsfCreatedInformationPanel()
    if (!panel) {
      return
    }
    const request = {
      ...buildSubmittedRequest(),
      status: 'Setup In Progress',
      psfCreatedData: { psf_setup_file_name: 'restricted-setup.psf' },
      psfCreatedDataVisible: false,
      canEditPsfCreatedData: false,
      canEditRequesterData: false,
      canSubmitDraft: false,
      requesterUserId: 'user-1',
      psfReleasedAt: null,
    }

    const html = renderToStaticMarkup(panel({
      request,
      values: { psf_setup_file_name: 'restricted-setup.psf' },
      saving: false,
      onChange: () => undefined,
      onSave: () => undefined,
    }))

    expect(html).toContain(
      'PSF Created Information is not visible for this request. Requester access is released by the configured visibility trigger and remains available afterward; without a configured trigger, status changes do not release access.',
    )
    expect(html).not.toContain('after PSF Created or Completed')
    expect(html).not.toContain('restricted-setup.psf')
    expect(html).not.toContain('<form')
  })

  it('renders visible PSF Created Information read-only when the backend allows requester visibility', () => {
    const panel = getPsfCreatedInformationPanel()
    if (!panel) {
      return
    }
    const request = {
      ...buildSubmittedRequest(),
      status: 'PSF Created',
      psfCreatedData: { psf_setup_file_name: 'visible-setup.psf' },
      psfCreatedDataVisible: true,
      canEditPsfCreatedData: false,
      canEditRequesterData: false,
      canSubmitDraft: false,
      requesterUserId: 'user-1',
      psfReleasedAt: null,
    }

    const html = renderToStaticMarkup(panel({
      request,
      values: { psf_setup_file_name: 'visible-setup.psf' },
      saving: false,
      onChange: () => undefined,
      onSave: () => undefined,
    }))

    expect(html).toContain('PSF Setup File Name')
    expect(html).toContain('visible-setup.psf')
    expect(html).toContain('psf-created-panel--read-only')
    expect(html).not.toContain('Editable')
    expect(html).not.toContain('available read-only')
    expect(html).toContain('<output')
    expect(html).not.toContain('<input')
    expect(html).not.toContain('Save PSF Created Information')
  })

  it('renders custom returned PSF fields and permits partial editable saves without client validation', () => {
    const panel = getPsfCreatedInformationPanel()
    if (!panel) return
    const request: PsfRequestResponse = {
      ...buildSubmittedRequest(),
      status: 'Setup In Progress',
      psfCreatedDataVisible: true,
      canEditPsfCreatedData: true,
      canEditRequesterData: false,
      canSubmitDraft: false,
      requesterUserId: 'user-1',
      psfReleasedAt: null,
      psfCreatedInformationSchema: {
        formKey: 'psf-created-information',
        version: 7,
        title: 'Created details',
        sections: [{
          sectionKey: 'created_details',
          title: 'Created details',
          fields: [
            { fieldKey: 'custom_lot_ref', canonicalKey: 'custom_lot_ref', label: 'Custom lot reference', type: 'text' as const, required: true },
            { fieldKey: 'review_lane', canonicalKey: 'review_lane', label: 'Review lane', type: 'radio' as const, required: false, options: ['A', 'B'] },
          ],
        }],
      },
    }
    const onSave = vi.fn()
    const element = panel({ request, values: {}, saving: false, onChange: vi.fn(), onSave })
    const renderer = requireRenderedElement(element, (candidate) => candidate.type === DynamicFormRenderer)
    const html = renderToStaticMarkup(element)

    expect(html).toContain('Custom lot reference')
    expect(html).toContain('dynamic-form__radio-group')
    expect(html).not.toContain('dynamic-form__product-type')
    expect(html).toContain('noValidate=""')
    expect(renderer.props.readOnly).toBe(false)
    ;(renderer.props.onSubmit as (values: Record<string, string>) => void)({})
    expect(onSave).toHaveBeenCalledWith({})
  })
})

describe('RequestHistoryPanel', () => {
  it('announces request history loading accessibly', () => {
    const panel = getRequestHistoryPanel()
    if (!panel) {
      return
    }

    const html = renderToStaticMarkup(panel({
      entries: [],
      error: null,
      loading: true,
    }))

    expect(html).toContain('Loading request history…')
    expect(html).toContain('role="status"')
  })

  it('explains when the request has no recorded history', () => {
    const panel = getRequestHistoryPanel()
    if (!panel) {
      return
    }

    const html = renderToStaticMarkup(panel({
      entries: [],
      error: null,
      loading: false,
    }))

    expect(html).toContain('No request history has been recorded yet.')
    expect(html).toContain('role="status"')
  })

  it('surfaces a history loading failure accessibly instead of treating it as empty', () => {
    const panel = getRequestHistoryPanel()
    if (!panel) {
      return
    }

    const html = renderToStaticMarkup(panel({
      entries: [],
      error: 'Timeline service unavailable',
      loading: false,
    }))

    expect(html).toContain('Unable to load request history: Timeline service unavailable')
    expect(html).toContain('role="alert"')
    expect(html).not.toContain('No request history has been recorded yet.')
  })

  it('renders chronological history rows in an accessible table with a status transition summary', () => {
    const panel = getRequestHistoryPanel()
    if (!panel) {
      return
    }

    const html = renderToStaticMarkup(panel({
      entries: [
        {
          actionType: 'DRAFT_CREATED',
          actorDisplayName: 'Requester Demo',
          actorRole: 'requester',
          createdAt: '2026-06-18T01:02:03.000Z',
          metadata: {},
        },
        {
          actionType: 'REQUEST_STATUS_CHANGED',
          actorDisplayName: 'Setup Owner GNTC Demo',
          actorRole: 'setup_owner',
          createdAt: '2026-06-18T01:06:03.000Z',
          metadata: {
            fromStatus: 'Submitted',
            toStatus: 'Setup In Progress',
          },
        },
      ],
      error: null,
      loading: false,
    }))

    expect(html).toContain('request-history__timeline')
    expect(html).toContain('<ol')
    expect(html).toContain('<time')
    expect(html).toContain('Draft created')
    expect(html).toContain('Submitted → Setup In Progress')
    expect(html).toContain('Requester Demo')
    expect(html).toContain('Setup Owner GNTC Demo')
    expect(html).toContain('dateTime="2026-06-18T01:02:03.000Z"')
    expect(html.indexOf('Draft created')).toBeLessThan(
      html.indexOf('Submitted → Setup In Progress'),
    )
  })
})

describe('Dashboard and request list loading and recovery', () => {
  const render = (dashboard: boolean) => { requestDetailHookHarness.beginRender(); return dashboard ? RequestsWorkspace.DashboardPage() : RequestsWorkspace.RequestsListPage({}) }
  const hasTable = (page: unknown) => findRenderedElement(page, (element) => element.type === RequestsWorkspace.RequestsTable)
  const textNode = (page: unknown, text: string) => findRenderedElement(page, (element) => typeof element.props.children === 'string' && element.props.children.includes(text))
  const retry = (page: unknown, label: string) => requireRenderedElement(page, (element) => element.type === 'button' && element.props.children === label)
  beforeEach(() => {
    requestDetailHookHarness.reset()
    requestDetailApi.fetchCurrentUser.mockReset().mockResolvedValue({ user: { role: 'setup_owner' } })
    requestDetailApi.fetchWorkflowStatuses.mockReset().mockResolvedValue({ statuses: ['Custom work'] })
    requestDetailApi.queryPsfRequests.mockReset().mockResolvedValue({ items: [], total: 0, limit: 25, offset: 0, summary: { open: 0, overdue: 0, completed: 0 } })
  })

  it.each([true, false])('shows loading instead of false empty requests while fetching (dashboard=%s)', async (dashboard) => {
    let page = render(dashboard)
    expect(hasTable(page)).toBeNull()
    expect(textNode(page, 'Loading status catalog')).not.toBeNull()
    expect(textNode(page, dashboard ? 'Loading dashboard queue' : 'Loading PSF requests')).not.toBeNull()
    requestDetailHookHarness.runEffects(); await flushRequestDetailAsyncWork()
    page = render(dashboard)
    expect(hasTable(page)).not.toBeNull()
    expect(textNode(page, 'Loading status catalog')).toBeNull()
  })

  it.each([true, false])('keeps successful rows usable under a catalog error and retries only catalog (dashboard=%s)', async (dashboard) => {
    requestDetailApi.fetchWorkflowStatuses.mockRejectedValue(new Error('Catalog unavailable'))
    render(dashboard); requestDetailHookHarness.runEffects(); await flushRequestDetailAsyncWork()
    let page = render(dashboard)
    expect(textNode(page, 'Unable to load status catalog: Catalog unavailable')).not.toBeNull()
    expect(hasTable(page)).not.toBeNull()
    if (dashboard) expect(findRenderedElement(page, (element) => element.props.label === 'Open work')).not.toBeNull()
    const queryCalls = requestDetailApi.queryPsfRequests.mock.calls.length
    requestDetailApi.fetchWorkflowStatuses.mockResolvedValue({ statuses: ['Custom work'] })
    ;(retry(page, 'Retry status catalog').props.onClick as () => void)()
    render(dashboard); requestDetailHookHarness.runEffects(); await flushRequestDetailAsyncWork()
    page = render(dashboard)
    expect(textNode(page, 'Unable to load status catalog')).toBeNull()
    expect(findRenderedElement(page, (element) => element.type === 'option' && element.props.children === 'Custom work')).not.toBeNull()
    expect(requestDetailApi.queryPsfRequests).toHaveBeenCalledTimes(queryCalls)
    expect(requestDetailApi.fetchWorkflowStatuses).toHaveBeenCalledTimes(2)
  })

  it.each([true, false])('uses numeric401 for session expiry without matching message text (dashboard=%s)', async (dashboard) => {
    requestDetailApi.queryPsfRequests.mockRejectedValue(new ApiError('Session expired', 401, 'Unauthorized', null))
    render(dashboard); requestDetailHookHarness.runEffects(); await flushRequestDetailAsyncWork()
    const page = render(dashboard)
    expect(findRenderedElement(page, (element) => element.props.to === '/login' && element.props.children === 'Sign in again')).not.toBeNull()
    expect(hasTable(page)).toBeNull()
    expect(findRenderedElement(page, (element) => element.props.label === 'Open work')).toBeNull()
  })

  it.each([true, false])('does not swallow current-user401 or query data after failed authentication (dashboard=%s)', async (dashboard) => {
    requestDetailApi.fetchCurrentUser.mockRejectedValue(new ApiError('Session expired', 401, 'Unauthorized', null))
    render(dashboard); requestDetailHookHarness.runEffects(); await flushRequestDetailAsyncWork()
    const page = render(dashboard)
    expect(requestDetailApi.queryPsfRequests).not.toHaveBeenCalled()
    expect(findRenderedElement(page, (element) => element.props.to === '/login' && element.props.children === 'Sign in again')).not.toBeNull()
  })

  it('distinguishes unavailable summary from successful rows and retries Dashboard without false zero totals', async () => {
    requestDetailApi.queryPsfRequests.mockResolvedValue({ items: [], total: 3, limit: 25, offset: 0 })
    render(true); requestDetailHookHarness.runEffects(); await flushRequestDetailAsyncWork()
    let page = render(true)
    expect(hasTable(page)).not.toBeNull()
    expect(textNode(page, 'Dashboard totals are unavailable')).not.toBeNull()
    expect(findRenderedElement(page, (element) => element.props.label === 'Open work')).toBeNull()
    requestDetailApi.queryPsfRequests.mockResolvedValue({ items: [], total: 3, limit: 25, offset: 0, summary: { open: 500, overdue: 9, completed: 70 } })
    ;(retry(page, 'Retry dashboard requests').props.onClick as () => void)()
    render(true); requestDetailHookHarness.runEffects(); await flushRequestDetailAsyncWork()
    page = render(true)
    expect(findRenderedElement(page, (element) => element.props.label === 'Open work')?.props.value).toBe(500)
    expect(requestDetailApi.queryPsfRequests).toHaveBeenLastCalledWith(expect.objectContaining({ scope: 'related', team: 'all', workState: 'open', limit: 25 }))
  })

  it.each([true, false])('exposes list failure retry without confusing text401 with auth expiry (dashboard=%s)', async (dashboard) => {
    requestDetailApi.queryPsfRequests.mockRejectedValue(new ApiError('Service 401 shard unavailable', 503, 'Service unavailable', null))
    render(dashboard); requestDetailHookHarness.runEffects(); await flushRequestDetailAsyncWork()
    let page = render(dashboard)
    expect(findRenderedElement(page, (element) => element.props.to === '/login')).toBeNull()
    expect(hasTable(page)).toBeNull()
    requestDetailApi.queryPsfRequests.mockResolvedValue({ items: [], total: 0, limit: 25, offset: 0, summary: { open: 0, overdue: 0, completed: 0 } })
    ;(retry(page, dashboard ? 'Retry dashboard requests' : 'Retry requests').props.onClick as () => void)()
    render(dashboard); requestDetailHookHarness.runEffects(); await flushRequestDetailAsyncWork()
    page = render(dashboard)
    expect(hasTable(page)).not.toBeNull()
    expect(requestDetailApi.queryPsfRequests).toHaveBeenCalledTimes(2)
  })

  it.each([true, false])('offers catalog401 sign-in recovery and ignores canceled catalog/list responses (dashboard=%s)', async (dashboard) => {
    requestDetailApi.fetchWorkflowStatuses.mockRejectedValue(new ApiError('Catalog session expired', 401, 'Unauthorized', null))
    render(dashboard); requestDetailHookHarness.runEffects(); await flushRequestDetailAsyncWork()
    let page = render(dashboard)
    expect(findRenderedElement(page, (element) => element.props.to === '/login' && element.props.children === 'Sign in again')).not.toBeNull()
    requestDetailHookHarness.reset()
    let resolveCatalog: ((response: unknown) => void) | undefined
    let resolveRows: ((response: unknown) => void) | undefined
    requestDetailApi.fetchWorkflowStatuses.mockImplementationOnce(() => new Promise((resolve) => { resolveCatalog = resolve }))
    requestDetailApi.queryPsfRequests.mockImplementationOnce(() => new Promise((resolve) => { resolveRows = resolve }))
    render(dashboard)
    const cleanups = requestDetailHookHarness.runEffects()
    await flushRequestDetailAsyncWork()
    cleanups.forEach((cleanup) => cleanup?.())
    resolveCatalog!({ statuses: ['Canceled status'] })
    resolveRows!({ items: [], total: 99, limit: 25, summary: { open: 99, overdue: 0, completed: 0 } })
    await flushRequestDetailAsyncWork()
    page = render(dashboard)
    expect(hasTable(page)).toBeNull()
    expect(findRenderedElement(page, (element) => element.type === 'option' && element.props.children === 'Canceled status')).toBeNull()
  })
})

describe('Request list pagination', () => {
  const render = () => { requestDetailHookHarness.beginRender(); return RequestsWorkspace.RequestsListPage({}) }
  const button = (page: unknown, text: string) => requireRenderedElement(page, (element) => element.type === 'button' && (element.props.children === text || Array.isArray(element.props.children) && element.props.children.some((child) => typeof child === 'string' && child.trim() === text)))
  const field = (page: unknown, name: string) => {
    const label = requireRenderedElement(page, (element) => element.type === 'label' && Array.isArray(element.props.children) && element.props.children[0].toString().trim() === name)
    return requireRenderedElement(label, (element) => element.type === 'input' || element.type === 'select')
  }
  async function settle() { requestDetailHookHarness.runEffects(); await new Promise((resolve) => setTimeout(resolve, 310)); render(); requestDetailHookHarness.runEffects(); await flushRequestDetailAsyncWork(); return render() }
  beforeEach(() => {
    requestDetailHookHarness.reset()
    requestDetailApi.fetchCurrentUser.mockReset().mockResolvedValue({ user: { role: 'requester' } })
    requestDetailApi.fetchWorkflowStatuses.mockReset().mockResolvedValue({ statuses: ['Open work'] })
    requestDetailApi.queryPsfRequests.mockReset().mockResolvedValue({ items: [], total: 201, limit: 100, offset: 0 })
  })

  it.each(['Keyword', 'Status'])('resets offset100 to zero when %s narrows the result to one row', async (name) => {
    render(); let page = await settle()
    ;(button(page, 'Next').props.onClick as () => void)()
    render(); page = await settle()
    expect(requestDetailApi.queryPsfRequests).toHaveBeenLastCalledWith(expect.objectContaining({ offset: 100 }))
    requestDetailApi.queryPsfRequests.mockResolvedValue({ items: [], total: 1, limit: 100, offset: 0 })
    ;(field(page, name).props.onChange as (event: unknown) => void)({ target: { value: 'Open work' } })
    render(); page = await settle()
    expect(requestDetailApi.queryPsfRequests).toHaveBeenLastCalledWith(expect.objectContaining({ offset: 0 }))
    expect(renderToStaticMarkup(<>{requireRenderedElement(page, (element) => element.props.className === 'table-footer').props.children}</>)).toContain('0 requests')
  })

  it('keeps My draft owner scope and keyword pagination without product filter or business-only status choices', async () => {
    const renderDrafts = () => { requestDetailHookHarness.beginRender(); return RequestsWorkspace.RequestsListPage({ scope: 'my-drafts' }) }
    renderDrafts(); requestDetailHookHarness.runEffects(); await flushRequestDetailAsyncWork()
    let page = renderDrafts()
    expect(findRenderedElement(page, (element) => element.type === 'select')).toBeNull()
    expect(findRenderedElement(page, (element) => element.type === 'input' && element.props.placeholder === 'Search product type…')).toBeNull()
    ;(field(page, 'Keyword').props.onChange as (event: unknown) => void)({ target: { value: 'my probe' } })
    renderDrafts(); requestDetailHookHarness.runEffects(); await flushRequestDetailAsyncWork()
    await new Promise((resolve) => setTimeout(resolve, 310))
    renderDrafts(); requestDetailHookHarness.runEffects(); await flushRequestDetailAsyncWork()
    page = renderDrafts()
    ;(button(page, 'Next').props.onClick as () => void)()
    renderDrafts(); requestDetailHookHarness.runEffects(); await flushRequestDetailAsyncWork()
    expect(requestDetailApi.queryPsfRequests).toHaveBeenLastCalledWith(expect.objectContaining({ scope: 'my-drafts', keyword: 'my probe', status: undefined, offset: 100 }))
    expect(requestDetailApi.fetchWorkflowStatuses).not.toHaveBeenCalled()
  })

  it('clears filters from page2 at offset100 and keeps Previous available on a narrowed server page', async () => {
    render(); let page = await settle()
    ;(field(page, 'Keyword').props.onChange as (event: unknown) => void)({ target: { value: 'probe' } })
    render(); page = await settle()
    ;(button(page, 'Next').props.onClick as () => void)()
    requestDetailApi.queryPsfRequests.mockResolvedValue({ items: [], total: 1, limit: 100, offset: 100 })
    render(); page = await settle()
    expect(button(page, 'Previous').props.disabled).toBe(false)
    expect(button(page, 'Next').props.disabled).toBe(true)
    expect(requestDetailApi.queryPsfRequests).toHaveBeenLastCalledWith(expect.objectContaining({ offset: 100, limit: 100 }))
    ;(button(page, 'Clear filters').props.onClick as () => void)()
    render(); await settle()
    expect(requestDetailApi.queryPsfRequests).toHaveBeenLastCalledWith(expect.objectContaining({ offset: 0, keyword: undefined }))
  })
})

describe('Queue filtering and retained results', () => {
  const render = (dashboard = false, scope: 'all' | 'my-drafts' = 'all') => {
    requestDetailHookHarness.beginRender()
    return dashboard ? RequestsWorkspace.DashboardPage() : RequestsWorkspace.RequestsListPage({ scope })
  }
  const table = (page: unknown) => findRenderedElement(page, (element) => element.type === RequestsWorkspace.RequestsTable)
  const field = (page: unknown, name: string) => {
    const label = requireRenderedElement(page, (element) => element.type === 'label' && Array.isArray(element.props.children) && String(element.props.children[0]).trim() === name)
    return requireRenderedElement(label, (element) => element.type === 'input' || element.type === 'select')
  }
  const change = (page: unknown, name: string, value: string) => (field(page, name).props.onChange as (event: unknown) => void)({ target: { value } })
  async function settle(dashboard = false, scope: 'all' | 'my-drafts' = 'all') {
    requestDetailHookHarness.runEffects()
    await vi.advanceTimersByTimeAsync(0)
    return render(dashboard, scope)
  }
  const response = (requestNo = 'PSF-001', total = 101) => ({ items: [{ requestId: requestNo, requestNo, title: 'Probe request', status: 'Open work' }], total, offset: 0, limit: 100, summary: { open: total, overdue: 0, completed: 0 } })
  beforeEach(() => {
    vi.useFakeTimers()
    requestDetailHookHarness.reset()
    requestDetailApi.fetchCurrentUser.mockReset().mockResolvedValue({ user: { id: 'actor-1', role: 'requester' } })
    requestDetailApi.fetchWorkflowStatuses.mockReset().mockResolvedValue({ statuses: ['Open work', 'Completed'] })
    requestDetailApi.queryPsfRequests.mockReset().mockResolvedValue(response())
  })
  afterEach(() => { vi.clearAllTimers(); vi.useRealTimers() })

  it.each([true, false])('keeps inputs responsive and debounces text queries for300ms (dashboard=%s)', async (dashboard) => {
    render(dashboard); let page = await settle(dashboard)
    change(page, 'Keyword', 'pro'); page = render(dashboard); await settle(dashboard)
    expect(field(page, 'Keyword').props.value).toBe('pro')
    expect(requestDetailApi.queryPsfRequests).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(200)
    change(page, 'Keyword', 'probe'); render(dashboard); await settle(dashboard)
    await vi.advanceTimersByTimeAsync(299)
    expect(requestDetailApi.queryPsfRequests).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(1); render(dashboard); await settle(dashboard)
    expect(requestDetailApi.queryPsfRequests).toHaveBeenCalledTimes(2)
    expect(requestDetailApi.queryPsfRequests).toHaveBeenLastCalledWith(expect.objectContaining({ keyword: 'probe', offset: 0 }))
    page = render(dashboard); change(page, 'Status', 'Completed'); render(dashboard); await settle(dashboard)
    expect(requestDetailApi.queryPsfRequests).toHaveBeenCalledTimes(3)
    expect(requestDetailApi.queryPsfRequests).toHaveBeenLastCalledWith(expect.objectContaining({ status: 'Completed' }))
  })

  it('settles keyword filter on page two before querying offset zero', async () => {
    render(); let page = await settle()
    const next = requireRenderedElement(page, (element) => element.type === 'button' && element.props.children === 'Next')
    ;(next.props.onClick as () => void)(); render(); page = await settle()
    expect(requestDetailApi.queryPsfRequests).toHaveBeenLastCalledWith(expect.objectContaining({ offset: 100 }))
    change(page, 'Keyword', 'probe'); render(); await settle()
    expect(requestDetailApi.queryPsfRequests).toHaveBeenCalledTimes(2)
    await vi.advanceTimersByTimeAsync(300); render(); await settle()
    expect(requestDetailApi.queryPsfRequests).toHaveBeenCalledTimes(3)
    expect(requestDetailApi.queryPsfRequests).toHaveBeenLastCalledWith(expect.objectContaining({ keyword: 'probe', offset: 0 }))
  })

  it.each([true, false])('retains rows and disabled pagination while updating, and clears rows on failure (dashboard=%s)', async (dashboard) => {
    render(dashboard); let page = await settle(dashboard)
    let reject: ((reason: unknown) => void) | undefined
    requestDetailApi.queryPsfRequests.mockImplementationOnce(() => new Promise((_resolve, rejectRequest) => { reject = rejectRequest }))
    change(page, 'Status', 'Completed'); render(dashboard); page = await settle(dashboard)
    expect(table(page)?.props.items).toEqual(response().items)
    expect(findRenderedElement(page, (element) => element.props.inert === true && element.props['aria-busy'] === true)).not.toBeNull()
    expect(findRenderedElement(page, (element) => element.props.role === 'status' && typeof element.props.children === 'string' && element.props.children.startsWith('Updating'))).not.toBeNull()
    const footer = requireRenderedElement(page, (element) => element.props.className === 'table-footer')
    expect(footer.props['aria-busy']).toBe(true)
    expect(findRenderedElement(footer, (element) => element.type === 'button' && element.props.children === 'Next')?.props.disabled).toBe(true)
    reject!(new Error('Queue unavailable')); await vi.advanceTimersByTimeAsync(0); page = render(dashboard)
    expect(table(page)).toBeNull()
  })

  it.each([true, false])('keeps the displayed page range until the next page arrives (dashboard=%s)', async (dashboard) => {
    render(dashboard); let page = await settle(dashboard)
    let resolve: ((value: unknown) => void) | undefined
    requestDetailApi.queryPsfRequests.mockImplementationOnce(() => new Promise((done) => { resolve = done }))
    const next = requireRenderedElement(page, (element) => element.type === 'button' && element.props.children === 'Next')
    ;(next.props.onClick as () => void)()
    page = render(dashboard)
    let footer = requireRenderedElement(page, (element) => element.props.className === 'table-footer')
    expect(findRenderedElement(footer, (element) => element.type === 'span')?.props.children).toBe('1–1 of 101 requests')
    expect(findRenderedElement(footer, (element) => element.type === 'button' && element.props.children === 'Next')?.props.disabled).toBe(true)
    await settle(dashboard)
    resolve!({ ...response('PSF-101'), offset: 100 })
    await vi.advanceTimersByTimeAsync(0)
    page = render(dashboard)
    footer = requireRenderedElement(page, (element) => element.props.className === 'table-footer')
    expect(findRenderedElement(footer, (element) => element.type === 'span')?.props.children).toBe('101–101 of 101 requests')
  })

  it('hides private draft rows immediately when the scope changes', async () => {
    render(false, 'my-drafts'); let page = await settle(false, 'my-drafts')
    expect(table(page)).not.toBeNull()
    page = render(false, 'all')
    expect(table(page)).toBeNull()
    requestDetailApi.queryPsfRequests.mockImplementationOnce(() => new Promise(() => {}))
    page = await settle(false, 'all')
    expect(table(page)).toBeNull()
  })

  it('ignores an older response after text input changes and preserves the newer result', async () => {
    render(); let page = await settle()
    let resolveOld: ((value: unknown) => void) | undefined
    requestDetailApi.queryPsfRequests.mockImplementationOnce(() => new Promise((resolve) => { resolveOld = resolve }))
    change(page, 'Status', 'Completed'); render(); page = await settle()
    change(page, 'Keyword', 'new'); render(); await settle()
    await vi.advanceTimersByTimeAsync(300)
    requestDetailApi.queryPsfRequests.mockResolvedValueOnce(response('PSF-NEW', 1))
    render(); await settle()
    resolveOld!(response('PSF-OLD')); await vi.advanceTimersByTimeAsync(0); page = render()
    expect(table(page)?.props.items).toEqual(response('PSF-NEW', 1).items)
  })

  it('finishes the current query when a pending text edit is undone before debounce', async () => {
    render(); let page = await settle()
    let resolve: ((value: unknown) => void) | undefined
    requestDetailApi.queryPsfRequests.mockImplementationOnce(() => new Promise((resolveRequest) => { resolve = resolveRequest }))
    change(page, 'Status', 'Completed'); render(); page = await settle()
    change(page, 'Keyword', 'temporary'); render(); page = await settle()
    change(page, 'Keyword', ''); render(); await settle()
    resolve!(response('PSF-FINISHED', 1)); await vi.advanceTimersByTimeAsync(0); page = render()
    expect(table(page)?.props.items).toEqual(response('PSF-FINISHED', 1).items)
    expect(findRenderedElement(page, (element) => element.props.inert === true)).toBeNull()
  })

  it.each([true, false])('clears previous actor rows as soon as refreshed identity changes (dashboard=%s)', async (dashboard) => {
    render(dashboard); let page = await settle(dashboard)
    requestDetailApi.fetchCurrentUser.mockResolvedValue({ user: { id: 'actor-2', role: 'requester' } })
    requestDetailApi.queryPsfRequests.mockImplementationOnce(() => new Promise(() => {}))
    change(page, 'Status', 'Completed'); render(dashboard); page = await settle(dashboard)
    expect(table(page)).toBeNull()
    expect(findRenderedElement(page, (element) => element.props.to === '/admin/export-profile')).toBeNull()
  })

  it.each([true, false])('shows the result range once beside pagination (dashboard=%s)', async (dashboard) => {
    render(dashboard); const page = await settle(dashboard)
    expect(JSON.stringify(page).match(/1–1/g)).toHaveLength(1)
    const footer = requireRenderedElement(page, (element) => element.props.className === 'table-footer')
    expect(findRenderedElement(footer, (element) => element.type === 'button' && element.props.children === 'Next')).not.toBeNull()
  })

  it('provides one scoped empty state and a real clear-filter action', async () => {
    requestDetailApi.queryPsfRequests.mockResolvedValue({ ...response(), items: [], total: 0 })
    render(); let page = await settle()
    change(page, 'Status', 'Completed'); render(); page = await settle()
    const emptyTable = table(page)!
    const empty = RequestsWorkspace.RequestsTable(emptyTable.props as unknown as Parameters<typeof RequestsWorkspace.RequestsTable>[0])
    expect(renderToStaticMarkup(empty)).toContain('No requests match')
    const clear = requireRenderedElement(empty, (element) => element.type === 'button' && element.props.children === 'Clear filters')
    ;(clear.props.onClick as () => void)(); render(); page = await settle()
    expect(field(page, 'Status').props.value).toBe('')
    expect(requestDetailApi.queryPsfRequests).toHaveBeenLastCalledWith(expect.objectContaining({ status: undefined }))
  })
})

describe('Request dirty navigation protection (blocker wiring, not mounted Router proof)', () => {
  beforeEach(() => {
    requestDetailHookHarness.reset()
    navigation.blocker = null
    navigation.navigate.mockReset()
    navigation.resolver.status = 'idle'
    navigation.resolver.proceed.mockReset()
    navigation.resolver.reset.mockReset()
    requestDetailApi.fetchPsfRequest.mockResolvedValue(buildDraftRequest({ psfCreatedDataVisible: true, canEditPsfCreatedData: true }))
    requestDetailApi.fetchPsfRequestHistory.mockResolvedValue([])
    requestDetailApi.fetchPsfRequestStatusOptions.mockResolvedValue({ allowedNextStatuses: [] })
    vi.stubGlobal('window', { confirm: vi.fn(() => false) })
  })

  it('protects create edits, preserves cancellation, and navigates once after the saved baseline is clean', () => {
    const render = () => { requestDetailHookHarness.beginRender(); return RequestsWorkspace.RequestCreatePage() }
    let page = render()
    const form = requireRenderedElement(page, (element) => element.type === ActiveSchemaForm)
    expect(form.props.onDirtyChange).toBeTypeOf('function')
    ;(form.props.onDirtyChange as (dirty: boolean) => void)(true)
    render()
    expect(navigation.blocker?.enableBeforeUnload).toBe(true)
    const location = { current: { pathname: '/requests/new' }, next: { pathname: '/dashboard' } }
    expect(navigation.blocker?.shouldBlockFn(location)).toBe(true)
    expect(navigation.blocker?.withResolver).toBe(true)
    navigation.resolver.status = 'blocked'
    page = render()
    const confirmation = requireRenderedElement(page, (element) => element.type === ConfirmDialog)
    expect(confirmation.props.open).toBe(true)
    ;(confirmation.props.onCancel as () => void)()
    expect(navigation.resolver.reset).toHaveBeenCalledOnce()
    expect(navigation.blocker?.shouldBlockFn(location)).toBe(true)
    ;(confirmation.props.onConfirm as () => void)()
    expect(navigation.resolver.proceed).toHaveBeenCalledOnce()
    const savedForm = requireRenderedElement(page, (element) => element.type === ActiveSchemaForm)
    ;(savedForm.props.onRequestSaved as (request: PsfRequestResponse) => void)(buildDraftRequest())
    ;(savedForm.props.onDirtyChange as (dirty: boolean) => void)(false)
    render()
    requestDetailHookHarness.runEffects()
    expect(navigation.navigate).toHaveBeenCalledExactlyOnceWith({ to: '/requests/$requestId', params: { requestId: 'request-1' } })
    expect(navigation.blocker?.enableBeforeUnload).toBe(false)
    expect(navigation.blocker?.shouldBlockFn(location)).toBe(false)
    expect(window.confirm).not.toHaveBeenCalled()
  })

  it('guards requester OR PSF edits, leaves values intact on cancel, and stops guarding after separate saves', async () => {
    renderRequestDetailShell()
    requestDetailHookHarness.runEffects()
    await flushRequestDetailAsyncWork()
    let page = renderRequestDetailShell()
    expect(navigation.blocker?.enableBeforeUnload).toBe(false)
    const form = requireRenderedElement(page, (element) => element.type === ActiveSchemaForm)
    ;(form.props.onDirtyChange as (dirty: boolean) => void)(true)
    page = renderRequestDetailShell()
    expect(navigation.blocker?.enableBeforeUnload).toBe(true)
    const location = { current: { pathname: '/requests/request-1' }, next: { pathname: '/requests' } }
    expect(navigation.blocker?.shouldBlockFn(location)).toBe(true)
    ;(form.props.onDirtyChange as (dirty: boolean) => void)(false)
    const panel = getPsfCreatedInformationPanel()!
    let psf = requireRenderedElement(page, (element) => element.type === panel)
    ;(psf.props.onChange as (key: string, value: string) => void)('psf_setup_file_name', 'LOCAL.psf')
    page = renderRequestDetailShell()
    expect(navigation.blocker?.enableBeforeUnload).toBe(true)
    expect(navigation.blocker?.shouldBlockFn(location)).toBe(true)
    psf = requireRenderedElement(page, (element) => element.type === panel)
    expect(psf.props.values).toEqual({ psf_setup_file_name: 'LOCAL.psf' })
    requestDetailApi.updatePsfCreatedData.mockResolvedValue({ ...buildDraftRequest(), psfCreatedData: { psf_setup_file_name: 'LOCAL.psf' } })
    ;(psf.props.onSave as (values: Record<string, string>) => void)({ psf_setup_file_name: 'LOCAL.psf' })
    await flushRequestDetailAsyncWork()
    renderRequestDetailShell()
    expect(navigation.blocker?.enableBeforeUnload).toBe(false)
    expect(navigation.blocker?.shouldBlockFn(location)).toBe(false)
  })
})

describe('RequestDetailShell workflow actions', () => {
  beforeEach(() => {
    requestDetailApi.fetchPsfRequest.mockReset()
    requestDetailApi.fetchPsfRequestHistory.mockReset()
    requestDetailApi.fetchPsfRequestStatusOptions.mockReset()
    requestDetailApi.fetchWorkflowStatuses.mockReset()
    requestDetailApi.submitPsfRequest.mockReset()
    requestDetailApi.updatePsfCreatedData.mockReset()
    requestDetailApi.updatePsfRequestStatus.mockReset()
    requestDetailHookHarness.reset()
  })

  it('submits a selected Draft target only from the Action center using its opaque revision', async () => {
    const draft = buildDraftRequest()
    const submitted = buildDraftRequest({
      status: 'Setup In Progress',
      canEditRequesterData: false,
      canSubmitDraft: false,
      updatedAt: 'opaque-revision-2',
      submittedAt: '2026-08-01T00:01:00.000Z',
    })
    requestDetailApi.fetchPsfRequest.mockResolvedValue(draft)
    requestDetailApi.fetchPsfRequestHistory.mockResolvedValue([])
    requestDetailApi.fetchPsfRequestStatusOptions
      .mockResolvedValueOnce({ allowedNextStatuses: ['Submitted', 'Setup In Progress'] })
      .mockResolvedValueOnce({ allowedNextStatuses: [] })
    requestDetailApi.submitPsfRequest.mockResolvedValue(submitted)

    renderRequestDetailShell()
    requestDetailHookHarness.runEffects()
    await flushRequestDetailAsyncWork()
    let shell = renderRequestDetailShell()
    const form = requireRenderedElement(shell, (element) => element.type === ActiveSchemaForm)
    const onSchemaSubmitAllowedChange = form.props.onDraftSchemaSubmitAllowedChange
    if (typeof onSchemaSubmitAllowedChange !== 'function') throw new Error('Expected Draft schema eligibility callback')
    onSchemaSubmitAllowedChange(true)
    shell = renderRequestDetailShell()
    let actions = requireRenderedElement(shell, (element) => element.type === WorkflowStatusActions)
    expect(actions.props.isDraft).toBe(true)
    expect(actions.props.disabledReason).toBeNull()

    const selectTarget = actions.props.onStatusChange
    if (typeof selectTarget !== 'function') throw new Error('Expected Draft target selector')
    selectTarget('Setup In Progress')
    expect(requestDetailApi.submitPsfRequest).not.toHaveBeenCalled()

    shell = renderRequestDetailShell()
    actions = requireRenderedElement(shell, (element) => element.type === WorkflowStatusActions)
    const apply = actions.props.onApply
    if (typeof apply !== 'function') throw new Error('Expected Action center submit callback')
    apply()
    await flushRequestDetailAsyncWork()
    shell = renderRequestDetailShell()
    actions = requireRenderedElement(shell, (element) => element.type === WorkflowStatusActions)
    const success = requireRenderedElement(shell, (element) => element.type === AsyncNotice && element.props.kind === 'success')

    expect(requestDetailApi.submitPsfRequest).toHaveBeenCalledWith('request-1', {
      formVersion: 4,
      status: 'Setup In Progress',
      expectedUpdatedAt: 'opaque-revision-1',
    })
    expect(requestDetailApi.updatePsfRequestStatus).not.toHaveBeenCalled()
    expect(actions.props.currentStatus).toBe('Setup In Progress')
    expect(actions.props.selectedStatus).toBe('Setup In Progress')
    expect(success.props.title).toBe('Request DRAFT-0001 submitted to Setup In Progress.')
  })

  it('blocks Action center submission while requester edits are unsaved', async () => {
    requestDetailApi.fetchPsfRequest.mockResolvedValue(buildDraftRequest())
    requestDetailApi.fetchPsfRequestHistory.mockResolvedValue([])
    requestDetailApi.fetchPsfRequestStatusOptions.mockResolvedValue({ allowedNextStatuses: ['Submitted'] })

    renderRequestDetailShell()
    requestDetailHookHarness.runEffects()
    await flushRequestDetailAsyncWork()
    let shell = renderRequestDetailShell()
    const form = requireRenderedElement(shell, (element) => element.type === ActiveSchemaForm)
    const onSchemaSubmitAllowedChange = form.props.onDraftSchemaSubmitAllowedChange
    const onDirtyChange = form.props.onDirtyChange
    if (typeof onSchemaSubmitAllowedChange !== 'function' || typeof onDirtyChange !== 'function') {
      throw new Error('Expected requester schema and dirty-state callbacks')
    }
    onSchemaSubmitAllowedChange(true)
    onDirtyChange(true)

    shell = renderRequestDetailShell()
    let actions = requireRenderedElement(shell, (element) => element.type === WorkflowStatusActions)
    expect(actions.props.disabledReason).toBe('Save requester information before changing status or submitting.')
    const selectTarget = actions.props.onStatusChange
    if (typeof selectTarget !== 'function') throw new Error('Expected Draft target selector')
    selectTarget('Submitted')
    shell = renderRequestDetailShell()
    actions = requireRenderedElement(shell, (element) => element.type === WorkflowStatusActions)
    const apply = actions.props.onApply
    if (typeof apply !== 'function') throw new Error('Expected guarded submit callback')
    apply()

    expect(requestDetailApi.submitPsfRequest).not.toHaveBeenCalled()
    expect(requestDetailApi.updatePsfRequestStatus).not.toHaveBeenCalled()
  })

  it('blocks Action center Draft submission while the requester child reports an active mutation', async () => {
    requestDetailApi.fetchPsfRequest.mockResolvedValue(buildDraftRequest())
    requestDetailApi.fetchPsfRequestHistory.mockResolvedValue([])
    requestDetailApi.fetchPsfRequestStatusOptions.mockResolvedValue({ allowedNextStatuses: ['Submitted'] })

    renderRequestDetailShell()
    requestDetailHookHarness.runEffects()
    await flushRequestDetailAsyncWork()
    let shell = renderRequestDetailShell()
    const form = requireRenderedElement(shell, (element) => element.type === ActiveSchemaForm)
    const onSchemaSubmitAllowedChange = form.props.onDraftSchemaSubmitAllowedChange
    const onSavingChange = form.props.onSavingChange
    if (typeof onSchemaSubmitAllowedChange !== 'function' || typeof onSavingChange !== 'function') {
      throw new Error('Expected requester schema and mutation-lifetime callbacks')
    }
    onSchemaSubmitAllowedChange(true)
    onSavingChange(true)

    shell = renderRequestDetailShell()
    const actions = requireRenderedElement(shell, (element) => element.type === WorkflowStatusActions)
    expect(actions.props.saving).toBe(true)
    const selectTarget = actions.props.onStatusChange
    if (typeof selectTarget !== 'function') throw new Error('Expected Draft target selector')
    selectTarget('Submitted')
    shell = renderRequestDetailShell()
    const apply = requireRenderedElement(shell, (element) => element.type === WorkflowStatusActions).props.onApply
    if (typeof apply !== 'function') throw new Error('Expected guarded Draft submit callback')
    apply()

    expect(requestDetailApi.submitPsfRequest).not.toHaveBeenCalled()
    onSavingChange(false)
  })

  it('locks PSF editing and Action center while a requester save is in flight', async () => {
    const request = {
      ...buildSubmittedRequest(),
      canEditRequesterData: true,
      psfCreatedDataVisible: true,
      canEditPsfCreatedData: true,
    }
    requestDetailApi.fetchPsfRequest.mockResolvedValue(request)
    requestDetailApi.fetchPsfRequestHistory.mockResolvedValue([])
    requestDetailApi.fetchPsfRequestStatusOptions.mockResolvedValue({ allowedNextStatuses: ['Setup In Progress'] })

    renderRequestDetailShell()
    requestDetailHookHarness.runEffects()
    await flushRequestDetailAsyncWork()
    let shell = renderRequestDetailShell()
    let form = requireRenderedElement(shell, (element) => element.type === ActiveSchemaForm)
    const onSavingChange = form.props.onSavingChange
    if (typeof onSavingChange !== 'function') throw new Error('Expected requester-save lifetime callback')
    onSavingChange(true)

    shell = renderRequestDetailShell()
    form = requireRenderedElement(shell, (element) => element.type === ActiveSchemaForm)
    const panel = getPsfCreatedInformationPanel()
    if (!panel) throw new Error('Expected PSF Created Information panel')
    const panelElement = requireRenderedElement(shell, (element) => element.type === panel)
    const actions = requireRenderedElement(shell, (element) => element.type === WorkflowStatusActions)
    const selectTarget = actions.props.onStatusChange
    if (typeof selectTarget !== 'function') throw new Error('Expected Action center status selector')
    selectTarget('Setup In Progress')
    const latestActions = requireRenderedElement(renderRequestDetailShell(), (element) => element.type === WorkflowStatusActions)
    const apply = latestActions.props.onApply
    if (typeof apply !== 'function') throw new Error('Expected Action center Apply callback')
    apply()

    expect(form.props.disabled).toBe(true)
    expect(panelElement.props.disabled).toBe(true)
    expect(actions.props.saving).toBe(true)
    expect(requestDetailApi.updatePsfRequestStatus).not.toHaveBeenCalled()
    onSavingChange(false)
  })

  it('blocks status changes while PSF Created Information is dirty', async () => {
    const request = {
      ...buildSubmittedRequest(),
      status: 'Setup In Progress',
      psfCreatedDataVisible: true,
      canEditPsfCreatedData: true,
    }
    requestDetailApi.fetchPsfRequest.mockResolvedValue(request)
    requestDetailApi.fetchPsfRequestHistory.mockResolvedValue([])
    requestDetailApi.fetchPsfRequestStatusOptions.mockResolvedValue({ allowedNextStatuses: ['PSF Created'] })

    renderRequestDetailShell()
    requestDetailHookHarness.runEffects()
    await flushRequestDetailAsyncWork()
    let shell = renderRequestDetailShell()
    const panel = getPsfCreatedInformationPanel()
    if (!panel) return
    const panelElement = requireRenderedElement(shell, (element) => element.type === panel)
    const onChange = panelElement.props.onChange
    if (typeof onChange !== 'function') throw new Error('Expected PSF Created Information change callback')
    onChange('psf_setup_file_name', 'unsaved-setup.psf')

    shell = renderRequestDetailShell()
    let actions = requireRenderedElement(shell, (element) => element.type === WorkflowStatusActions)
    expect(actions.props.disabledReason).toBe('Save PSF Created Information before changing status or submitting.')
    const selectTarget = actions.props.onStatusChange
    if (typeof selectTarget !== 'function') throw new Error('Expected workflow target selector')
    selectTarget('PSF Created')
    shell = renderRequestDetailShell()
    actions = requireRenderedElement(shell, (element) => element.type === WorkflowStatusActions)
    const apply = actions.props.onApply
    if (typeof apply !== 'function') throw new Error('Expected guarded status callback')
    apply()

    expect(requestDetailApi.updatePsfRequestStatus).not.toHaveBeenCalled()
    expect(requestDetailApi.submitPsfRequest).not.toHaveBeenCalled()
  })

  it('refreshes the form schema decision after an Action center submission conflict', async () => {
    requestDetailApi.fetchPsfRequest.mockResolvedValue(buildDraftRequest())
    requestDetailApi.fetchPsfRequestHistory.mockResolvedValue([])
    requestDetailApi.fetchPsfRequestStatusOptions.mockResolvedValue({ allowedNextStatuses: ['Submitted'] })
    requestDetailApi.submitPsfRequest.mockRejectedValue(
      new ApiError('The Draft changed while submitting.', 409, 'Conflict', null),
    )

    renderRequestDetailShell()
    requestDetailHookHarness.runEffects()
    await flushRequestDetailAsyncWork()
    let shell = renderRequestDetailShell()
    const form = requireRenderedElement(shell, (element) => element.type === ActiveSchemaForm)
    const onSchemaSubmitAllowedChange = form.props.onDraftSchemaSubmitAllowedChange
    if (typeof onSchemaSubmitAllowedChange !== 'function') throw new Error('Expected Draft schema eligibility callback')
    onSchemaSubmitAllowedChange(true)
    shell = renderRequestDetailShell()
    let actions = requireRenderedElement(shell, (element) => element.type === WorkflowStatusActions)
    const selectTarget = actions.props.onStatusChange
    if (typeof selectTarget !== 'function') throw new Error('Expected Draft target selector')
    selectTarget('Submitted')
    shell = renderRequestDetailShell()
    actions = requireRenderedElement(shell, (element) => element.type === WorkflowStatusActions)
    const apply = actions.props.onApply
    if (typeof apply !== 'function') throw new Error('Expected Action center submit callback')
    apply()
    await flushRequestDetailAsyncWork()
    shell = renderRequestDetailShell()

    const conflictForm = requireRenderedElement(shell, (element) => element.type === ActiveSchemaForm)
    const alert = requireRenderedElement(shell, (element) => element.type === AsyncNotice && element.props.kind === 'error')
    expect(conflictForm.props.submissionConflict).toBe(1)
    expect(alert.props.title).toBe('The Draft changed while submitting.')
  })

  it('blocks Action center submission when the form detects an older Draft schema', async () => {
    requestDetailApi.fetchPsfRequest.mockResolvedValue(buildDraftRequest({ canSubmitDraft: true }))
    requestDetailApi.fetchPsfRequestHistory.mockResolvedValue([])
    requestDetailApi.fetchPsfRequestStatusOptions.mockResolvedValue({ allowedNextStatuses: ['Submitted'] })

    renderRequestDetailShell()
    requestDetailHookHarness.runEffects()
    await flushRequestDetailAsyncWork()
    let shell = renderRequestDetailShell()
    const form = requireRenderedElement(shell, (element) => element.type === ActiveSchemaForm)
    const onSchemaSubmitAllowedChange = form.props.onDraftSchemaSubmitAllowedChange
    if (typeof onSchemaSubmitAllowedChange !== 'function') throw new Error('Expected Draft schema eligibility callback')
    onSchemaSubmitAllowedChange(false)

    shell = renderRequestDetailShell()
    let actions = requireRenderedElement(shell, (element) => element.type === WorkflowStatusActions)
    expect(actions.props.disabledReason).toBe('Resolve the Draft schema or required fields before submitting.')
    const selectTarget = actions.props.onStatusChange
    if (typeof selectTarget !== 'function') throw new Error('Expected Draft target selector')
    selectTarget('Submitted')
    shell = renderRequestDetailShell()
    actions = requireRenderedElement(shell, (element) => element.type === WorkflowStatusActions)
    const apply = actions.props.onApply
    if (typeof apply !== 'function') throw new Error('Expected schema-guarded submit callback')
    apply()

    expect(requestDetailApi.submitPsfRequest).not.toHaveBeenCalled()
  })

  it('does not submit Drafts the server marks as blocked by schema or required fields', async () => {
    requestDetailApi.fetchPsfRequest.mockResolvedValue(buildDraftRequest({ canSubmitDraft: false }))
    requestDetailApi.fetchPsfRequestHistory.mockResolvedValue([])
    requestDetailApi.fetchPsfRequestStatusOptions.mockResolvedValue({ allowedNextStatuses: ['Submitted'] })

    renderRequestDetailShell()
    requestDetailHookHarness.runEffects()
    await flushRequestDetailAsyncWork()
    let shell = renderRequestDetailShell()
    const form = requireRenderedElement(shell, (element) => element.type === ActiveSchemaForm)
    const onSchemaSubmitAllowedChange = form.props.onDraftSchemaSubmitAllowedChange
    if (typeof onSchemaSubmitAllowedChange !== 'function') throw new Error('Expected Draft schema eligibility callback')
    onSchemaSubmitAllowedChange(true)
    shell = renderRequestDetailShell()
    let actions = requireRenderedElement(shell, (element) => element.type === WorkflowStatusActions)
    expect(actions.props.disabledReason).toBe('Resolve the Draft schema or required fields before submitting.')
    const selectTarget = actions.props.onStatusChange
    if (typeof selectTarget !== 'function') throw new Error('Expected Draft target selector')
    selectTarget('Submitted')
    shell = renderRequestDetailShell()
    actions = requireRenderedElement(shell, (element) => element.type === WorkflowStatusActions)
    const apply = actions.props.onApply
    if (typeof apply !== 'function') throw new Error('Expected blocked submit callback')
    apply()

    expect(requestDetailApi.submitPsfRequest).not.toHaveBeenCalled()
  })

  it('shows the persisted exact status with a neutral fallback when its catalog kind is unavailable', async () => {
    const request = { ...buildSubmittedRequest(), status: 'Custom review' }
    requestDetailApi.fetchPsfRequest.mockResolvedValue(request)
    requestDetailApi.fetchPsfRequestHistory.mockResolvedValue([])
    requestDetailApi.fetchPsfRequestStatusOptions.mockResolvedValue({ allowedNextStatuses: [] })

    renderRequestDetailShell()
    requestDetailHookHarness.runEffects()
    await flushRequestDetailAsyncWork()
    const summary = requireRenderedElement(renderRequestDetailShell(), (element) => element.type === RequestHeaderSummary)
    const header = renderToStaticMarkup(<RequestHeaderSummary request={summary.props.request as PsfRequestResponse} includeMetadata={false} />)
    expect(header).toContain('PSF-0001')
    expect(header).toContain('Custom review')
    expect(header).toContain('ui-status--neutral')
    expect(requestDetailApi.fetchWorkflowStatuses).toHaveBeenCalledOnce()
  })

  it('loads request history inside the existing detail shell through the request-scoped API', async () => {
    const request = buildSubmittedRequest()
    const history = [
      {
        actionType: 'REQUEST_STATUS_CHANGED',
        actorDisplayName: 'Setup Owner GNTC Demo',
        actorRole: 'setup_owner',
        createdAt: '2026-08-01T00:01:00.000Z',
        metadata: {
          fromStatus: 'Submitted',
          toStatus: 'Setup In Progress',
        },
      },
    ]
    requestDetailApi.fetchPsfRequest.mockResolvedValue(request)
    requestDetailApi.fetchPsfRequestHistory.mockResolvedValue(history)
    requestDetailApi.fetchPsfRequestStatusOptions.mockResolvedValue({
      allowedNextStatuses: ['Setup In Progress', 'Need More Information', 'Rejected'],
    })

    renderRequestDetailShell()
    requestDetailHookHarness.runEffects()
    await flushRequestDetailAsyncWork()
    const shell = renderRequestDetailShell()
    const panel = getRequestHistoryPanel()
    if (!panel) {
      return
    }
    const historyPanel = requireRenderedElement(
      shell,
      (element) => element.type === panel,
    )

    expect(requestDetailApi.fetchPsfRequestHistory).toHaveBeenCalledWith('request-1')
    expect(historyPanel.props).toMatchObject({
      entries: history,
      error: null,
      loading: false,
    })
  })

  it('keeps the normal request detail usable when request history loading fails', async () => {
    const request = buildSubmittedRequest()
    requestDetailApi.fetchPsfRequest.mockResolvedValue(request)
    requestDetailApi.fetchPsfRequestHistory.mockRejectedValue(
      new Error('Timeline service unavailable'),
    )
    requestDetailApi.fetchPsfRequestStatusOptions.mockResolvedValue({
      allowedNextStatuses: ['Setup In Progress', 'Need More Information', 'Rejected'],
    })

    renderRequestDetailShell()
    requestDetailHookHarness.runEffects()
    await flushRequestDetailAsyncWork()
    const shell = renderRequestDetailShell()
    const panel = getRequestHistoryPanel()
    if (!panel) {
      return
    }
    const summary = requireRenderedElement(
      shell,
      (element) => element.type === RequestHeaderSummary,
    )
    const historyPanel = requireRenderedElement(
      shell,
      (element) => element.type === panel,
    )

    expect(summary.props.request).toMatchObject({ id: 'request-1' })
    expect(historyPanel.props).toMatchObject({
      entries: [],
      error: 'Timeline service unavailable',
      loading: false,
    })
  })

  it('locks requester and PSF editors for the full clean Apply lifetime', async () => {
    const draft = buildDraftRequest({
      psfCreatedDataVisible: true,
      canEditPsfCreatedData: true,
    })
    const submitted = buildDraftRequest({
      status: 'Submitted',
      canEditRequesterData: false,
      canEditPsfCreatedData: false,
      updatedAt: 'opaque-revision-after-submit',
    })
    let resolveSubmit: ((request: PsfRequestResponse) => void) | undefined
    requestDetailApi.fetchPsfRequest.mockResolvedValue(draft)
    requestDetailApi.fetchPsfRequestHistory.mockResolvedValue([])
    requestDetailApi.fetchPsfRequestStatusOptions.mockResolvedValueOnce({ allowedNextStatuses: ['Submitted'] })
    requestDetailApi.submitPsfRequest.mockImplementationOnce(
      () => new Promise<PsfRequestResponse>((resolve) => { resolveSubmit = resolve }),
    )

    renderRequestDetailShell()
    requestDetailHookHarness.runEffects()
    await flushRequestDetailAsyncWork()
    let shell = renderRequestDetailShell()
    let form = requireRenderedElement(shell, (element) => element.type === ActiveSchemaForm)
    const allowSubmit = form.props.onDraftSchemaSubmitAllowedChange
    if (typeof allowSubmit !== 'function') throw new Error('Expected schema eligibility callback')
    allowSubmit(true)
    shell = renderRequestDetailShell()
    let actions = requireRenderedElement(shell, (element) => element.type === WorkflowStatusActions)
    const selectTarget = actions.props.onStatusChange
    if (typeof selectTarget !== 'function') throw new Error('Expected Action center status selector')
    selectTarget('Submitted')
    shell = renderRequestDetailShell()
    actions = requireRenderedElement(shell, (element) => element.type === WorkflowStatusActions)
    const apply = actions.props.onApply
    if (typeof apply !== 'function') throw new Error('Expected Action center Apply callback')
    apply()

    shell = renderRequestDetailShell()
    form = requireRenderedElement(shell, (element) => element.type === ActiveSchemaForm)
    const panel = getPsfCreatedInformationPanel()
    if (!panel) throw new Error('Expected PSF Created Information panel')
    const panelElement = requireRenderedElement(shell, (element) => element.type === panel)
    const renderedPanel = panel(panelElement.props as Parameters<typeof panel>[0])
    const renderer = requireRenderedElement(renderedPanel, (element) => element.type === DynamicFormRenderer)
    actions = requireRenderedElement(shell, (element) => element.type === WorkflowStatusActions)

    expect(requestDetailApi.submitPsfRequest).toHaveBeenCalledTimes(1)
    expect(actions.props.saving).toBe(true)
    expect(form.props.disabled).toBe(true)
    expect(panelElement.props.disabled).toBe(true)
    expect(renderer.props.readOnly).toBe(true)
    expect(renderer.props.onChange).toBeUndefined()
    expect(renderer.props.onSubmit).toBeUndefined()

    if (!resolveSubmit) throw new Error('Expected Submit to remain pending')
    resolveSubmit(submitted)
    await flushRequestDetailAsyncWork()
  })

  it('applies a status, refreshes local request detail and next options, and announces success', async () => {
    const submittedRequest = buildSubmittedRequest()
    const updatedRequest = {
      ...submittedRequest,
      status: 'Setup In Progress',



    }
    requestDetailApi.fetchPsfRequest.mockResolvedValue(submittedRequest)
    requestDetailApi.fetchPsfRequestStatusOptions
      .mockResolvedValueOnce({ allowedNextStatuses: ['Setup In Progress', 'Need More Information', 'Rejected'] })
      .mockResolvedValueOnce({ allowedNextStatuses: ['PSF Created', 'Need More Information', 'Rejected'] })
    requestDetailApi.updatePsfRequestStatus.mockResolvedValue(updatedRequest)

    renderRequestDetailShell()
    requestDetailHookHarness.runEffects()
    await flushRequestDetailAsyncWork()
    let shell = renderRequestDetailShell()

    let actions = requireRenderedElement(shell, (element) => element.type === WorkflowStatusActions)
    expect(actions.props.currentStatus).toBe('Submitted')
    expect(actions.props.selectedStatus).toBe('Submitted')

    const onStatusChange = actions.props.onStatusChange
    if (typeof onStatusChange !== 'function') {
      throw new Error('Expected workflow status callback')
    }
    onStatusChange('Setup In Progress')
    shell = renderRequestDetailShell()
    actions = requireRenderedElement(shell, (element) => element.type === WorkflowStatusActions)

    const apply = actions.props.onApply
    if (typeof apply !== 'function') {
      throw new Error('Expected workflow apply callback')
    }
    apply()
    await flushRequestDetailAsyncWork()
    shell = renderRequestDetailShell()

    actions = requireRenderedElement(shell, (element) => element.type === WorkflowStatusActions)
    const summary = requireRenderedElement(shell, (element) => element.type === RequestHeaderSummary)
    const success = requireRenderedElement(shell, (element) => element.type === AsyncNotice && element.props.kind === 'success')

    expect(requestDetailApi.updatePsfRequestStatus).toHaveBeenCalledWith('request-1', {
      status: 'Setup In Progress',
      expectedUpdatedAt: '2026-08-01T00:00:00.000Z',
    })
    expect(requestDetailApi.fetchPsfRequestStatusOptions).toHaveBeenCalledTimes(2)
    expect(summary.props.request).toMatchObject({ status: 'Setup In Progress' })
    expect(renderToStaticMarkup(<RequestHeaderSummary request={summary.props.request as PsfRequestResponse} includeMetadata={false} />)).toContain('Setup In Progress')
    expect(actions.props.allowedNextStatuses).toEqual(['PSF Created', 'Need More Information', 'Rejected'])
    expect(actions.props.selectedStatus).toBe('Setup In Progress')
    expect(success.props.title).toBe('Request PSF-0001 moved to Setup In Progress.')
  })

  it('locks requester edits and Action center while the separate PSF save is pending', async () => {
    const setupOwnerRequest = {
      ...buildSubmittedRequest(),
      status: 'Setup In Progress',
      requesterData: { ...buildSubmittedRequest().requesterData },
      psfCreatedData: { psf_setup_file_name: 'initial-setup.psf' },
      psfCreatedDataVisible: true,
      canEditPsfCreatedData: true,
      canEditRequesterData: true,
    }
    const savedRequest = {
      ...setupOwnerRequest,
      psfCreatedData: { psf_setup_file_name: 'edited-setup.psf' },
      updatedAt: 'opaque-psf-save-revision',
    }
    let resolveSave: ((request: PsfRequestResponse) => void) | undefined
    requestDetailApi.fetchPsfRequest.mockResolvedValue(setupOwnerRequest)
    requestDetailApi.fetchPsfRequestHistory.mockResolvedValue([])
    requestDetailApi.fetchPsfRequestStatusOptions.mockResolvedValue({ allowedNextStatuses: ['PSF Created'] })
    requestDetailApi.updatePsfCreatedData.mockImplementationOnce(
      () => new Promise<PsfRequestResponse>((resolve) => { resolveSave = resolve }),
    )

    renderRequestDetailShell()
    requestDetailHookHarness.runEffects()
    await flushRequestDetailAsyncWork()
    let shell = renderRequestDetailShell()
    const panel = getPsfCreatedInformationPanel()
    if (!panel) throw new Error('Expected PSF Created Information panel')
    let panelElement = requireRenderedElement(shell, (element) => element.type === panel)
    const onChange = panelElement.props.onChange
    if (typeof onChange !== 'function') throw new Error('Expected PSF field callback')
    onChange('psf_setup_file_name', 'edited-setup.psf')
    shell = renderRequestDetailShell()
    panelElement = requireRenderedElement(shell, (element) => element.type === panel)
    const onSave = panelElement.props.onSave
    if (typeof onSave !== 'function') throw new Error('Expected separate PSF save callback')
    onSave(panelElement.props.values)

    shell = renderRequestDetailShell()
    const form = requireRenderedElement(shell, (element) => element.type === ActiveSchemaForm)
    const actions = requireRenderedElement(shell, (element) => element.type === WorkflowStatusActions)
    panelElement = requireRenderedElement(shell, (element) => element.type === panel)
    const renderedPanel = panel(panelElement.props as Parameters<typeof panel>[0])
    const renderer = requireRenderedElement(renderedPanel, (element) => element.type === DynamicFormRenderer)
    const apply = actions.props.onApply
    if (typeof apply !== 'function') throw new Error('Expected Action center Apply callback')
    apply()

    expect(requestDetailApi.updatePsfCreatedData).toHaveBeenCalledWith('request-1', {
      expectedUpdatedAt: '2026-08-01T00:00:00.000Z',
      psfCreatedData: { psf_setup_file_name: 'edited-setup.psf' },
    })
    expect(panelElement.props.saving).toBe(true)
    expect(form.props.disabled).toBe(true)
    expect(actions.props.saving).toBe(true)
    expect(renderer.props.readOnly).toBe(true)
    expect(renderer.props.onChange).toBeUndefined()
    expect(renderer.props.onSubmit).toBeUndefined()
    expect(requestDetailApi.updatePsfRequestStatus).not.toHaveBeenCalled()

    if (!resolveSave) throw new Error('Expected PSF save to remain pending')
    resolveSave(savedRequest)
    await flushRequestDetailAsyncWork()
  })

  it('saves editable PSF Created Information and refreshes the local detail state', async () => {
    const setupOwnerRequest = {
      ...buildSubmittedRequest(),
      status: 'Setup In Progress',
      psfCreatedData: { psf_setup_file_name: 'initial-setup.psf' },
      psfCreatedDataVisible: true,
      canEditPsfCreatedData: true,
      canEditRequesterData: false,
      canSubmitDraft: false,
      requesterUserId: 'user-1',
      psfReleasedAt: null,
    }
    const savedRequest = {
      ...setupOwnerRequest,
      psfCreatedData: { psf_setup_file_name: 'saved-setup.psf' },
      updatedAt: '2026-08-01T00:00:01.000Z',
    }
    requestDetailApi.fetchPsfRequest.mockResolvedValue(setupOwnerRequest)
    requestDetailApi.fetchPsfRequestStatusOptions.mockResolvedValue({
      allowedNextStatuses: ['PSF Created', 'Need More Information', 'Rejected'],
    })
    requestDetailApi.updatePsfCreatedData.mockResolvedValue(savedRequest)

    renderRequestDetailShell()
    requestDetailHookHarness.runEffects()
    await flushRequestDetailAsyncWork()
    let shell = renderRequestDetailShell()
    const panel = getPsfCreatedInformationPanel()
    if (!panel) {
      return
    }
    let panelElement = requireRenderedElement(shell, (element) => element.type === panel)
    const onSave = panelElement.props.onSave
    if (typeof onSave !== 'function') {
      throw new Error('Expected PSF Created Information save callback')
    }

    onSave({ psf_setup_file_name: 'saved-setup.psf' })
    await flushRequestDetailAsyncWork()
    shell = renderRequestDetailShell()
    panelElement = requireRenderedElement(shell, (element) => element.type === panel)
    const success = requireRenderedElement(shell, (element) => element.type === AsyncNotice && element.props.kind === 'success')

    expect(requestDetailApi.updatePsfCreatedData).toHaveBeenCalledWith('request-1', {
      expectedUpdatedAt: '2026-08-01T00:00:00.000Z',
      psfCreatedData: { psf_setup_file_name: 'saved-setup.psf' },
    })
    expect(panelElement.props.request).toMatchObject({
      psfCreatedData: { psf_setup_file_name: 'saved-setup.psf' },
      updatedAt: '2026-08-01T00:00:01.000Z',
    })
    expect(panelElement.props.values).toEqual({ psf_setup_file_name: 'saved-setup.psf' })
    expect(success.props.title).toBe('PSF Created Information for PSF-0001 saved.')
  })

  it('keeps editable PSF Created Information values and exposes save failures through an alert', async () => {
    const setupOwnerRequest = {
      ...buildSubmittedRequest(),
      status: 'Setup In Progress',
      psfCreatedData: { psf_setup_file_name: 'initial-setup.psf' },
      psfCreatedDataVisible: true,
      canEditPsfCreatedData: true,
      canEditRequesterData: false,
      canSubmitDraft: false,
      requesterUserId: 'user-1',
      psfReleasedAt: null,
    }
    requestDetailApi.fetchPsfRequest.mockResolvedValue(setupOwnerRequest)
    requestDetailApi.fetchPsfRequestStatusOptions.mockResolvedValue({
      allowedNextStatuses: ['PSF Created', 'Need More Information', 'Rejected'],
    })
    requestDetailApi.updatePsfCreatedData.mockRejectedValue(new Error('PSF data validation failed'))

    renderRequestDetailShell()
    requestDetailHookHarness.runEffects()
    await flushRequestDetailAsyncWork()
    let shell = renderRequestDetailShell()
    const panel = getPsfCreatedInformationPanel()
    if (!panel) {
      return
    }
    let panelElement = requireRenderedElement(shell, (element) => element.type === panel)
    const onChange = panelElement.props.onChange
    if (typeof onChange !== 'function') {
      throw new Error('Expected PSF Created Information change callback')
    }
    onChange('psf_setup_file_name', 'retry-setup.psf')
    shell = renderRequestDetailShell()
    panelElement = requireRenderedElement(shell, (element) => element.type === panel)
    const onSave = panelElement.props.onSave
    if (typeof onSave !== 'function') {
      throw new Error('Expected PSF Created Information save callback')
    }

    onSave(panelElement.props.values)
    await flushRequestDetailAsyncWork()
    shell = renderRequestDetailShell()

    panelElement = requireRenderedElement(shell, (element) => element.type === panel)
    const alert = requireRenderedElement(shell, (element) => element.type === AsyncNotice && element.props.kind === 'error')

    expect(requestDetailApi.updatePsfCreatedData).toHaveBeenCalledWith('request-1', {
      expectedUpdatedAt: '2026-08-01T00:00:00.000Z',
      psfCreatedData: { psf_setup_file_name: 'retry-setup.psf' },
    })
    expect(panelElement.props.values).toEqual({ psf_setup_file_name: 'retry-setup.psf' })
    expect(alert.props.title).toBe('PSF data validation failed')
  })

  it('keeps real requester and PSF edits when a PSF conflict refresh changes status', async () => {
    const setupOwnerRequest = {
      ...buildSubmittedRequest(),
      status: 'Setup In Progress',
      psfCreatedData: { psf_setup_file_name: 'initial-setup.psf' },
      psfCreatedDataVisible: true,
      canEditPsfCreatedData: true,
      canEditRequesterData: true,
      canSubmitDraft: false,
      requesterUserId: 'user-1',
      psfReleasedAt: null,
    }
    const refreshedRequest = {
      ...setupOwnerRequest,
      status: 'Completed',
      canEditRequesterData: false,
      canEditPsfCreatedData: false,
      psfCreatedData: { psf_setup_file_name: 'other-owner-setup.psf' },
      requesterData: { ...setupOwnerRequest.requesterData, request_title_v4: 'Server title' },
      updatedAt: 'opaque-revision-after-status-change',
    }
    requestDetailApi.fetchPsfRequest
      .mockResolvedValueOnce(setupOwnerRequest)
      .mockResolvedValueOnce(setupOwnerRequest)
      .mockResolvedValueOnce(refreshedRequest)
    requestDetailApi.fetchPsfRequestStatusOptions.mockResolvedValue({
      allowedNextStatuses: ['PSF Created', 'Need More Information', 'Rejected'],
    })
    requestDetailApi.updatePsfCreatedData.mockRejectedValue(
      new ApiError('The request was updated by another owner.', 409, 'Conflict', null),
    )

    renderRequestDetailShell()
    requestDetailHookHarness.runEffects()
    await flushRequestDetailAsyncWork()
    renderRequestDetailWithRequesterChild()
    requestDetailHookHarness.runEffects()
    await flushRequestDetailAsyncWork()
    let rendered = renderRequestDetailWithRequesterChild()
    const editButton = requireRenderedElement(rendered.requesterForm, (element) => element.type === 'button' && element.props.children === 'Edit information')
    ;(editButton.props.onClick as () => void)()
    rendered = renderRequestDetailWithRequesterChild()
    let requesterRenderer = requireRenderedElement(rendered.requesterForm, (element) => element.type === DynamicFormRenderer)
    const editRequester = requesterRenderer.props.onChange
    if (typeof editRequester !== 'function') throw new Error('Expected actual requester field callback')
    editRequester('request_title_v4', 'LOCAL requester title')
    rendered = renderRequestDetailWithRequesterChild()

    const panel = getPsfCreatedInformationPanel()
    if (!panel) throw new Error('Expected PSF Created Information panel')
    let panelElement = requireRenderedElement(rendered.shell, (element) => element.type === panel)
    const editPsf = panelElement.props.onChange
    if (typeof editPsf !== 'function') throw new Error('Expected PSF Created Information change callback')
    editPsf('psf_setup_file_name', 'LOCAL PSF edit')
    rendered = renderRequestDetailWithRequesterChild()
    panelElement = requireRenderedElement(rendered.shell, (element) => element.type === panel)
    const savePsf = panelElement.props.onSave
    if (typeof savePsf !== 'function') throw new Error('Expected separate PSF save callback')
    savePsf(panelElement.props.values)
    await flushRequestDetailAsyncWork()

    rendered = renderRequestDetailWithRequesterChild()
    requesterRenderer = requireRenderedElement(rendered.requesterForm, (element) => element.type === DynamicFormRenderer)
    const form = requireRenderedElement(rendered.shell, (element) => element.type === ActiveSchemaForm)
    const alert = requireRenderedElement(rendered.shell, (element) => element.type === AsyncNotice && element.props.kind === 'error')
    expect(requesterRenderer.props.readOnly).toBe(true)
    expect(requesterRenderer.props.onSubmit).toBeUndefined()

    requestDetailHookHarness.runEffects()
    rendered = renderRequestDetailWithRequesterChild()
    requesterRenderer = requireRenderedElement(rendered.requesterForm, (element) => element.type === DynamicFormRenderer)
    panelElement = requireRenderedElement(rendered.shell, (element) => element.type === panel)

    expect(requestDetailApi.updatePsfCreatedData).toHaveBeenCalledWith('request-1', {
      expectedUpdatedAt: '2026-08-01T00:00:00.000Z',
      psfCreatedData: { psf_setup_file_name: 'LOCAL PSF edit' },
    })
    expect(requestDetailApi.fetchPsfRequest).toHaveBeenCalledTimes(3)
    expect(panelElement.props.request).toMatchObject({
      status: 'Completed',
      canEditRequesterData: false,
      canEditPsfCreatedData: false,
      psfCreatedData: { psf_setup_file_name: 'other-owner-setup.psf' },
      updatedAt: 'opaque-revision-after-status-change',
    })
    expect(panelElement.props.values).toEqual({ psf_setup_file_name: 'LOCAL PSF edit' })
    expect(form.key).toBeNull()
    expect(form.props.requestSnapshot).toEqual(refreshedRequest)
    expect((requesterRenderer.props.values as Record<string, string>).request_title_v4).toBe('LOCAL requester title')
    expect(requesterRenderer.props.readOnly).toBe(true)
    expect(requesterRenderer.props.onSubmit).toBeUndefined()
    expect(alert.props.title).toBe(
      'PSF Created Information changed while you were editing. Your unsaved values are preserved; review them against the latest revision before saving again.',
    )
  })

  it('keeps workflow detail stable and exposes a status update failure through an alert', async () => {
    const submittedRequest = buildSubmittedRequest()
    requestDetailApi.fetchPsfRequest.mockResolvedValue(submittedRequest)
    requestDetailApi.fetchPsfRequestStatusOptions.mockResolvedValue({
      allowedNextStatuses: ['Setup In Progress', 'Need More Information', 'Rejected'],
    })
    requestDetailApi.updatePsfRequestStatus.mockRejectedValue(new Error('Transition denied'))

    renderRequestDetailShell()
    requestDetailHookHarness.runEffects()
    await flushRequestDetailAsyncWork()
    let shell = renderRequestDetailShell()

    let actions = requireRenderedElement(shell, (element) => element.type === WorkflowStatusActions)
    const onStatusChange = actions.props.onStatusChange
    if (typeof onStatusChange !== 'function') {
      throw new Error('Expected workflow status callback')
    }
    onStatusChange('Setup In Progress')
    shell = renderRequestDetailShell()
    actions = requireRenderedElement(shell, (element) => element.type === WorkflowStatusActions)
    const apply = actions.props.onApply
    if (typeof apply !== 'function') {
      throw new Error('Expected workflow apply callback')
    }
    apply()
    await flushRequestDetailAsyncWork()
    shell = renderRequestDetailShell()

    const alert = requireRenderedElement(shell, (element) => element.type === AsyncNotice && element.props.kind === 'error')
    const summary = requireRenderedElement(shell, (element) => element.type === RequestHeaderSummary)

    expect(requestDetailApi.updatePsfRequestStatus).toHaveBeenCalledWith('request-1', {
      status: 'Setup In Progress',
      expectedUpdatedAt: '2026-08-01T00:00:00.000Z',
    })
    expect(requestDetailApi.fetchPsfRequestStatusOptions).toHaveBeenCalledTimes(1)
    expect(summary.props.request).toMatchObject({ status: 'Submitted' })
    expect(alert.props.title).toBe('Transition denied')
  })
})


describe('Request identity and dashboard orientation', () => {
  beforeEach(() => {
    requestDetailHookHarness.reset()
    requestDetailApi.fetchPsfRequest.mockReset().mockResolvedValue(buildSubmittedRequest())
    requestDetailApi.fetchPsfRequestHistory.mockReset().mockResolvedValue([])
    requestDetailApi.fetchPsfRequestStatusOptions.mockReset().mockResolvedValue({ allowedNextStatuses: ['Complete'] })
    requestDetailApi.fetchCurrentUser.mockReset().mockResolvedValue({ user: { id: 'user-1', role: 'requester' } })
    requestDetailApi.fetchWorkflowStatuses.mockReset().mockResolvedValue({ statuses: ['Submitted', 'Complete'] })
    requestDetailApi.queryPsfRequests.mockReset().mockResolvedValue({ items: [], total: 0, limit: 25, summary: { open: 5, overdue: 2, completed: 3 } })
  })

  it('hides the previous request and its actions before effects run for a new identity', async () => {
    renderRequestDetailShell()
    requestDetailHookHarness.runEffects()
    await flushRequestDetailAsyncWork()
    expect(findRenderedElement(renderRequestDetailShell(), element => element.type === RequestHeaderSummary)).not.toBeNull()

    const next = renderRequestDetailShell('request-2')
    expect(findRenderedElement(next, element => element.type === RequestHeaderSummary)).toBeNull()
    expect(findRenderedElement(next, element => element.type === ActiveSchemaForm)).toBeNull()
    expect(findRenderedElement(next, element => element.type === WorkflowStatusActions)).toBeNull()
  })

  it('keeps prior request data hidden after access to the next request is denied', async () => {
    renderRequestDetailShell()
    requestDetailHookHarness.runEffects()
    await flushRequestDetailAsyncWork()
    renderRequestDetailShell()
    requestDetailApi.fetchPsfRequest.mockRejectedValueOnce(new ApiError('Draft requests are private to their creator.', 403, 'Forbidden', null))
    renderRequestDetailShell('request-2')
    requestDetailHookHarness.runEffects()
    await flushRequestDetailAsyncWork()
    const denied = renderRequestDetailShell('request-2')
    expect(findRenderedElement(denied, element => element.type === RequestHeaderSummary)).toBeNull()
    expect(findRenderedElement(denied, element => element.type === ActiveSchemaForm)).toBeNull()
    expect(findRenderedElement(denied, element => element.type === AsyncNotice && element.props.kind === 'error')).not.toBeNull()
  })

  it('keeps previous dashboard totals visible and marked busy while results refresh', async () => {
    const render = () => { requestDetailHookHarness.beginRender(); return RequestsWorkspace.DashboardPage() }
    render()
    requestDetailHookHarness.runEffects()
    await flushRequestDetailAsyncWork()
    const loaded = render()
    const status = requireRenderedElement(loaded, element => element.type === 'select')
    ;(status.props.onChange as (event: { target: { value: string } }) => void)({ target: { value: 'Complete' } })
    const pending = render()
    const counts = requireRenderedElement(pending, element => element.props.className === 'summary-grid dashboard-summary-grid')
    expect(counts.props['aria-busy']).toBe(true)
    expect((counts.props.children as RenderedElement[]).map(element => element.props.value)).toEqual([5, 2, 3])
  })
})

describe('Request history route', () => {
  const render = (requestId = 'request-1') => { requestDetailHookHarness.beginRender(); return RequestsWorkspace.RequestHistoryPage({ requestId }) }
  beforeEach(() => {
    requestDetailHookHarness.reset()
    requestDetailApi.fetchPsfRequest.mockReset().mockResolvedValue(buildSubmittedRequest())
    requestDetailApi.fetchPsfRequestHistory.mockReset()
  })
  it('loads request identity and authorized history, preserving returned event data', async () => {
    const entries = [{ actionType: 'REQUEST_STATUS_CHANGED', actorDisplayName: 'Engineer', actorRole: 'setup_owner', createdAt: '2026-10-03T00:00:00Z', metadata: { fromStatus: 'Submitted', toStatus: 'Review' } }]
    requestDetailApi.fetchPsfRequestHistory.mockResolvedValue(entries)
    render(); requestDetailHookHarness.runEffects(); await flushRequestDetailAsyncWork()
    const page = render()
    const panel = requireRenderedElement(page, (element) => element.type === RequestsWorkspace.RequestHistoryPanel)
    expect(requestDetailApi.fetchPsfRequestHistory).toHaveBeenCalledExactlyOnceWith('request-1')
    expect(panel.props.entries).toEqual(entries)
    expect(panel.props.loading).toBe(false)
    const header = requireRenderedElement(page, (element) => element.props.title === 'Request History')
    expect(header.props.description).toContain('PSF-0001')
    expect(header.props.actions).toBeUndefined()
  })
  it('never displays the previous request identity or history while another request loads or denies access', async () => {
    const entries = [{ actionType: 'DRAFT_CREATED', actorDisplayName: 'Previous owner', actorRole: 'requester', createdAt: '2026-10-03T00:00:00Z', metadata: {} }]
    requestDetailApi.fetchPsfRequestHistory.mockResolvedValueOnce(entries)
    render(); const cleanups = requestDetailHookHarness.runEffects(); await flushRequestDetailAsyncWork()
    render()
    cleanups.forEach((cleanup) => cleanup?.())
    requestDetailApi.fetchPsfRequest.mockRejectedValueOnce(new Error('Private draft'))
    requestDetailApi.fetchPsfRequestHistory.mockRejectedValueOnce(new Error('Private draft'))
    const pending = render('request-2')
    const header = requireRenderedElement(pending, (element) => element.props.title === 'Request History')
    expect(header.props.description).toBe('Activity visible to you for this request.')
    const pendingPanel = requireRenderedElement(pending, (element) => element.type === RequestsWorkspace.RequestHistoryPanel)
    expect(pendingPanel.props.entries).toEqual([])
    expect(pendingPanel.props.loading).toBe(true)
    requestDetailHookHarness.runEffects(); await flushRequestDetailAsyncWork()
    const denied = render('request-2')
    expect(requireRenderedElement(denied, (element) => element.props.title === 'Request History').props.description).toBe('Activity visible to you for this request.')
    const deniedPanel = requireRenderedElement(denied, (element) => element.type === RequestsWorkspace.RequestHistoryPanel)
    expect(deniedPanel.props.entries).toEqual([])
    expect(deniedPanel.props.error).toBe('Private draft')
  })
  it('retries a failed history read without inventing or exposing events', async () => {
    requestDetailApi.fetchPsfRequestHistory.mockRejectedValueOnce(new Error('History unavailable')).mockResolvedValueOnce([])
    render(); requestDetailHookHarness.runEffects(); await flushRequestDetailAsyncWork()
    const panel = requireRenderedElement(render(), (element) => element.type === RequestsWorkspace.RequestHistoryPanel)
    expect(panel.props.error).toBe('History unavailable')
    expect(panel.props.entries).toEqual([])
    ;(panel.props.onRetry as () => void)()
    render(); requestDetailHookHarness.runEffects(); await flushRequestDetailAsyncWork()
    const retried = requireRenderedElement(render(), (element) => element.type === RequestsWorkspace.RequestHistoryPanel)
    expect(retried.props.error).toBeNull()
    expect(requestDetailApi.fetchPsfRequestHistory).toHaveBeenCalledTimes(2)
  })
})


describe('Request detail history retry lifecycle', () => {
  it('ignores an old request retry completion after navigating to another request', async () => {
    requestDetailHookHarness.reset()
    requestDetailApi.fetchPsfRequest.mockReset().mockResolvedValue(buildSubmittedRequest())
    requestDetailApi.fetchPsfRequestStatusOptions.mockReset().mockResolvedValue({ allowedNextStatuses: [] })
    requestDetailApi.fetchPsfRequestHistory.mockReset().mockRejectedValueOnce(new Error('Try again'))
    renderRequestDetailShell(); const initialCleanups = requestDetailHookHarness.runEffects(); await flushRequestDetailAsyncWork()
    let resolveOld: ((entries: unknown[]) => void) | undefined
    requestDetailApi.fetchPsfRequestHistory.mockImplementationOnce(() => new Promise((resolve) => { resolveOld = resolve }))
    const panel = requireRenderedElement(renderRequestDetailShell(), (element) => element.type === RequestsWorkspace.RequestHistoryPanel)
    ;(panel.props.onRetry as () => void)()
    renderRequestDetailShell(); const retryCleanups = requestDetailHookHarness.runEffects()
    initialCleanups.forEach((cleanup) => cleanup?.()); retryCleanups.forEach((cleanup) => cleanup?.())
    const newEntries = [{ actionType: 'REQUEST_SUBMITTED', actorDisplayName: 'B owner', actorRole: 'requester', createdAt: '2026-10-03T00:00:00Z', metadata: {} }]
    requestDetailApi.fetchPsfRequest.mockResolvedValueOnce({ ...buildSubmittedRequest(), id: 'request-2', requestNo: 'PSF-0002' })
    requestDetailApi.fetchPsfRequestHistory.mockResolvedValueOnce(newEntries)
    requestDetailHookHarness.beginRender(); RequestsWorkspace.RequestDetailShell({ requestId: 'request-2' })
    requestDetailHookHarness.runEffects(); await flushRequestDetailAsyncWork()
    resolveOld!([{ actionType: 'DRAFT_CREATED', actorDisplayName: 'A owner', actorRole: 'requester', createdAt: '2026-10-02T00:00:00Z', metadata: {} }]); await flushRequestDetailAsyncWork()
    requestDetailHookHarness.beginRender(); const newPage = RequestsWorkspace.RequestDetailShell({ requestId: 'request-2' })
    expect(requireRenderedElement(newPage, (element) => element.type === RequestsWorkspace.RequestHistoryPanel).props.entries).toEqual(newEntries)
  })
})


describe('Queue filter disclosure', () => {
  beforeEach(() => requestDetailHookHarness.reset())
  afterEach(() => vi.unstubAllGlobals())

  it('starts collapsed on mobile, lets native disclosure toggle, and marks active filters', () => {
    vi.stubGlobal('window', { matchMedia: () => ({ matches: true }) })
    requestDetailHookHarness.beginRender()
    const panel = RequestsWorkspace.QueueFilterPanel({ active: true, children: <input aria-label="Product Type" defaultValue="Transfer" /> })
    expect(panel.props.open).toBeUndefined()
    const summary = requireRenderedElement(panel, (element) => element.type === 'summary')
    const preventDefault = vi.fn()
    ;(summary.props.onClick as (event: { preventDefault: () => void }) => void)({ preventDefault })
    expect(preventDefault).not.toHaveBeenCalled()
    expect(renderToStaticMarkup(panel)).toContain('Active')
    expect(renderToStaticMarkup(panel)).toContain('value="Transfer"')
  })

  it('keeps desktop filters expanded and adapts the native panel when the viewport changes', () => {
    const query = { matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }
    vi.stubGlobal('window', { matchMedia: () => query })
    requestDetailHookHarness.beginRender()
    const panel = RequestsWorkspace.QueueFilterPanel({ active: false, children: null })
    expect(panel.props.open).toBe(true)
    const summary = requireRenderedElement(panel, (element) => element.type === 'summary')
    const preventDefault = vi.fn()
    ;(summary.props.onClick as (event: { preventDefault: () => void }) => void)({ preventDefault })
    expect(preventDefault).toHaveBeenCalledOnce()
    const ref = panel.props.ref as { current: { open: boolean } | null }
    ref.current = { open: false }
    const cleanups = requestDetailHookHarness.runEffects()
    expect(ref.current.open).toBe(true)
    query.matches = true
    const onChange = query.addEventListener.mock.calls[0][1] as () => void
    onChange()
    expect(ref.current.open).toBe(false)
    query.matches = false
    onChange()
    expect(ref.current.open).toBe(true)
    for (const cleanup of cleanups) if (typeof cleanup === 'function') cleanup()
    expect(query.removeEventListener).toHaveBeenCalledWith('change', onChange)
  })
})


describe('Tabbed Detail and PSF edit lifecycle', () => {
  beforeEach(() => {
    requestDetailHookHarness.reset()
    requestDetailApi.fetchPsfRequest.mockReset().mockResolvedValue({ ...buildSubmittedRequest(), psfCreatedDataVisible: true, canEditPsfCreatedData: true, psfCreatedData: { psf_setup_file_name: 'SERVER.psf' } })
    requestDetailApi.fetchPsfRequestHistory.mockReset().mockResolvedValue([])
    requestDetailApi.fetchPsfRequestStatusOptions.mockReset().mockResolvedValue({ allowedNextStatuses: ['100% -- Completed'] })
    requestDetailApi.updatePsfCreatedData.mockReset()
  })
  const tab = (page: unknown, label: string) => requireRenderedElement(page, e => e.props.role === 'tab' && e.props.children === label)
  const psf = (page: unknown) => requireRenderedElement(page, e => e.type === RequestsWorkspace.PsfCreatedInformationPanel)
  const load = async () => { renderRequestDetailShell(); requestDetailHookHarness.runEffects(); await flushRequestDetailAsyncWork(); return renderRequestDetailShell() }

  it('rebases clean PSF values from a requester snapshot and saves the current values with its new revision', async () => {
    let page = await load()
    const initial = psf(page).props.request as PsfRequestResponse
    const refreshed = { ...initial, updatedAt: 'requester-save-r2', psfCreatedData: { psf_setup_file_name: 'OTHER-OWNER.psf' } }
    const form = requireRenderedElement(page, e => e.type === ActiveSchemaForm)
    ;(form.props.onRequestSaved as (snapshot: PsfRequestResponse) => void)(refreshed)
    page = renderRequestDetailShell()
    expect(psf(page).props.values).toEqual({ psf_setup_file_name: 'OTHER-OWNER.psf' })
    expect(psf(page).props.dirty).toBe(false)
    expect(psf(page).props.editing).toBe(false)
    requestDetailApi.updatePsfCreatedData.mockResolvedValueOnce({ ...refreshed, updatedAt: 'psf-save-r3' })
    ;(psf(page).props.onEdit as () => void)()
    page = renderRequestDetailShell()
    ;(psf(page).props.onSave as (values: Record<string, string>) => void)(psf(page).props.values as Record<string, string>)
    await flushRequestDetailAsyncWork()
    expect(requestDetailApi.updatePsfCreatedData).toHaveBeenCalledWith('request-1', {
      expectedUpdatedAt: 'requester-save-r2', psfCreatedData: { psf_setup_file_name: 'OTHER-OWNER.psf' },
    })
  })

  it('preserves current dirty PSF edits even when a requester callback was captured before the edit', async () => {
    let page = await load()
    const initial = psf(page).props.request as PsfRequestResponse
    const form = requireRenderedElement(page, e => e.type === ActiveSchemaForm)
    const acceptSnapshot = form.props.onRequestSaved as (snapshot: PsfRequestResponse) => void
    ;(psf(page).props.onEdit as () => void)()
    ;(psf(page).props.onChange as (key: string, value: string) => void)('psf_setup_file_name', 'INTENDED-LOCAL.psf')
    const refreshed = { ...initial, updatedAt: 'requester-conflict-r2', psfCreatedData: { psf_setup_file_name: 'OTHER-OWNER.psf' } }
    acceptSnapshot(refreshed)
    page = renderRequestDetailShell()
    expect(psf(page).props.values).toEqual({ psf_setup_file_name: 'INTENDED-LOCAL.psf' })
    expect(psf(page).props.dirty).toBe(true)
    expect(psf(page).props.editing).toBe(true)
    expect(psf(page).props.request).toBe(refreshed)
    requestDetailApi.updatePsfCreatedData.mockResolvedValueOnce({ ...refreshed, updatedAt: 'psf-save-r3', psfCreatedData: { psf_setup_file_name: 'INTENDED-LOCAL.psf' } })
    ;(psf(page).props.onSave as (values: Record<string, string>) => void)(psf(page).props.values as Record<string, string>)
    await flushRequestDetailAsyncWork()
    expect(requestDetailApi.updatePsfCreatedData).toHaveBeenCalledWith('request-1', {
      expectedUpdatedAt: 'requester-conflict-r2', psfCreatedData: { psf_setup_file_name: 'INTENDED-LOCAL.psf' },
    })
  })

  it('recognizes PSF edits already saved in the newest requester snapshot as clean', async () => {
    let page = await load()
    const initial = psf(page).props.request as PsfRequestResponse
    ;(psf(page).props.onChange as (key: string, value: string) => void)('psf_setup_file_name', 'LATEST-SAVED.psf')
    page = renderRequestDetailShell()
    const form = requireRenderedElement(page, e => e.type === ActiveSchemaForm)
    ;(form.props.onRequestSaved as (snapshot: PsfRequestResponse) => void)({
      ...initial, updatedAt: 'refreshed-r2', psfCreatedData: { psf_setup_file_name: 'LATEST-SAVED.psf' },
    })
    page = renderRequestDetailShell()
    expect(psf(page).props.values).toEqual({ psf_setup_file_name: 'LATEST-SAVED.psf' })
    expect(psf(page).props.dirty).toBe(false)
    expect(navigation.blocker?.enableBeforeUnload).toBe(false)
  })

  it('ignores requester snapshots from a previous route identity or a different request', async () => {
    let page = await load()
    const initial = psf(page).props.request as PsfRequestResponse
    const acceptOldSnapshot = requireRenderedElement(page, e => e.type === ActiveSchemaForm).props.onRequestSaved as (snapshot: PsfRequestResponse) => void
    acceptOldSnapshot({ ...initial, id: 'wrong-request' })
    expect(psf(renderRequestDetailShell()).props.request).toBe(initial)
    const nextRequest = { ...initial, id: 'request-2', requestNo: 'PSF-0002', psfCreatedData: { psf_setup_file_name: 'NEXT.psf' } }
    requestDetailApi.fetchPsfRequest.mockResolvedValueOnce(nextRequest)
    renderRequestDetailShell('request-2')
    requestDetailHookHarness.runEffects()
    await flushRequestDetailAsyncWork()
    page = renderRequestDetailShell('request-2')
    expect(psf(page).props.request).toBe(nextRequest)
    acceptOldSnapshot({ ...initial, updatedAt: 'late-request-1-r2' })
    page = renderRequestDetailShell('request-2')
    expect(psf(page).props.request).toBe(nextRequest)
    expect(psf(page).props.values).toEqual({ psf_setup_file_name: 'NEXT.psf' })
  })

  it('opens a different request in its default tab and view mode after a clean edit session', async () => {
    let page = await load()
    ;(psf(page).props.onEdit as () => void)()
    ;(tab(page, 'History').props.onClick as () => void)()
    page = renderRequestDetailShell()
    expect(psf(page).props.editing).toBe(true)
    const nextRequest = { ...psf(page).props.request as PsfRequestResponse, id: 'request-2', requestNo: 'PSF-0002' }
    requestDetailApi.fetchPsfRequest.mockResolvedValueOnce(nextRequest)
    renderRequestDetailShell('request-2')
    requestDetailHookHarness.runEffects()
    await flushRequestDetailAsyncWork()
    page = renderRequestDetailShell('request-2')
    expect(psf(page).props.editing).toBe(false)
    expect(tab(page, 'PSF Created Information').props['aria-selected']).toBe(true)
  })

  it('defaults an authorized PSF editor to the PSF tab with fields initially in view mode', async () => {
    const page = await load()
    expect(tab(page, 'PSF Created Information').props['aria-selected']).toBe(true)
    expect(psf(page).props.editing).toBe(false)
    const form = requireRenderedElement(page, e => e.type === ActiveSchemaForm)
    expect(form.props.explicitEdit).toBe(true)
  })

  it('keeps the mounted requester form and dirty PSF edits when switching tabs', async () => {
    let page = await load()
    ;(psf(page).props.onEdit as () => void)()
    ;(psf(page).props.onChange as (key: string, value: string) => void)('psf_setup_file_name', 'LOCAL.psf')
    page = renderRequestDetailShell()
    ;(tab(page, 'History').props.onClick as () => void)()
    page = renderRequestDetailShell()
    expect(tab(page, 'History').props['aria-selected']).toBe(true)
    expect(psf(page).props.values).toEqual({ psf_setup_file_name: 'LOCAL.psf' })
    expect(psf(page).props.editing).toBe(true)
    expect(findRenderedElement(page, e => e.type === ActiveSchemaForm)).not.toBeNull()
    expect(navigation.blocker?.enableBeforeUnload).toBe(true)
    expect(requestDetailApi.updatePsfCreatedData).not.toHaveBeenCalled()
  })

  it('cancels PSF edits back to the saved server baseline without a write', async () => {
    let page = await load()
    ;(psf(page).props.onEdit as () => void)()
    ;(psf(page).props.onChange as (key: string, value: string) => void)('psf_setup_file_name', 'LOCAL.psf')
    page = renderRequestDetailShell()
    ;(psf(page).props.onCancel as () => void)()
    page = renderRequestDetailShell()
    expect(psf(page).props.values).toEqual({ psf_setup_file_name: 'SERVER.psf' })
    expect(psf(page).props.editing).toBe(false)
    expect(navigation.blocker?.enableBeforeUnload).toBe(false)
    expect(requestDetailApi.updatePsfCreatedData).not.toHaveBeenCalled()
  })

  it('Cancel after a PSF revision conflict restores the refreshed baseline', async () => {
    let page = await load()
    ;(psf(page).props.onEdit as () => void)()
    ;(psf(page).props.onChange as (key: string, value: string) => void)('psf_setup_file_name', 'LOCAL.psf')
    requestDetailApi.updatePsfCreatedData.mockRejectedValueOnce(new ApiError('Conflict', 409, 'Conflict', undefined))
    requestDetailApi.fetchPsfRequest.mockResolvedValueOnce({ ...buildSubmittedRequest(), psfCreatedDataVisible: true, canEditPsfCreatedData: true, psfCreatedData: { psf_setup_file_name: 'NEW-SERVER.psf' }, updatedAt: 'new-opaque-revision' })
    ;(psf(page).props.onSave as (values: Record<string,string>) => void)({ psf_setup_file_name: 'LOCAL.psf' })
    await flushRequestDetailAsyncWork()
    page = renderRequestDetailShell()
    expect(psf(page).props.editing).toBe(true)
    expect(psf(page).props.values).toEqual({ psf_setup_file_name: 'LOCAL.psf' })
    ;(psf(page).props.onCancel as () => void)()
    page = renderRequestDetailShell()
    expect(psf(page).props.values).toEqual({ psf_setup_file_name: 'NEW-SERVER.psf' })
  })
})


describe('Private draft table presentation', () => {
  it('shows the persisted update timestamp, opens a draft from its row, and offers Delete as a button', () => {
    requestDetailHookHarness.beginRender()
    const row = { requestId: 'draft-uuid', requestNo: 'PSF-DRAFT-9', title: 'Probe revision',
      referencePsfName: null, psfSetupFileName: null, probecardName: null, status: 'Draft',
      priority: 'Normal', requester: 'Engineer',
      productType: 'New Product', requestDate: null, dueDate: null, updatedAt: '2026-10-05T04:00:00Z' }
    const onOpenItem = vi.fn()
    const onDeleteItem = vi.fn()
    const rendered = RequestsWorkspace.RequestsTable({ items: [row], drafts: true, onOpenItem, onDeleteItem })
    expect(findRenderedElement(rendered, element => element.type === 'th' && element.props.children === 'Visibility')).toBeNull()
    expect(findRenderedElement(rendered, element => element.type === 'td' && element.props['data-label'] === 'Visibility')).toBeNull()
    expect(requireRenderedElement(rendered, element => element.type === 'th' && element.props.children === 'Updated')).toBeTruthy()
    const updated = requireRenderedElement(rendered, element => element.type === 'td' && element.props['data-label'] === 'Updated')
    expect(updated.props.children).toContain('11:00')
    expect(findRenderedElement(rendered, element => element.props.children === 'Continue')).toBeNull()
    const draftRow = requireRenderedElement(rendered, element => element.type === 'tr' && element.props['aria-label'] === 'Open PSF-DRAFT-9 details')
    vi.stubGlobal('Element', class { closest() { return null } })
    try { ;(draftRow.props.onClick as (event: unknown) => void)({ target: new (globalThis as { Element: new () => object }).Element() }) } finally { vi.unstubAllGlobals() }
    expect(onOpenItem).toHaveBeenCalledWith('draft-uuid')
    const del = requireRenderedElement(rendered, element => element.type === 'button' && element.props['aria-label'] === 'Delete PSF-DRAFT-9')
    expect(del.props.className).toContain('btn-secondary')
    ;(del.props.onClick as () => void)()
    expect(onDeleteItem).toHaveBeenCalledWith(expect.objectContaining({ requestId: 'draft-uuid' }))
    expect(findRenderedElement(rendered, element => element.type === 'th' && element.props.children === 'Responsibility')).toBeNull()
  })
})



describe('Draft detail deletion access', () => {
 beforeEach(() => {
  requestDetailHookHarness.reset()
  requestDetailApi.fetchPsfRequestHistory.mockResolvedValue([])
  requestDetailApi.fetchPsfRequestStatusOptions.mockResolvedValue({ allowedNextStatuses: [] })
 })
 it.each([true, false])('offers Delete only when own editable Draft (own=%s)', async own => {
  requestDetailApi.fetchPsfRequest.mockResolvedValue(buildDraftRequest({ canEditRequesterData: own, canSubmitDraft: own }))
  renderRequestDetailShell(); requestDetailHookHarness.runEffects(); await flushRequestDetailAsyncWork()
  const page = renderRequestDetailShell()
  expect(Boolean(findRenderedElement(page, element => element.type === 'button' && element.props.children === 'Delete Draft'))).toBe(own)
 })
 it('never offers Delete on a submitted request', async () => {
  requestDetailApi.fetchPsfRequest.mockResolvedValue(buildSubmittedRequest())
  renderRequestDetailShell(); requestDetailHookHarness.runEffects(); await flushRequestDetailAsyncWork()
  expect(findRenderedElement(renderRequestDetailShell(), element => element.type === 'button' && element.props.children === 'Delete Draft')).toBeNull()
 })
 it('does not render obsolete separately-saved helper text in draft detail', async () => {
  requestDetailApi.fetchPsfRequest.mockResolvedValue(buildDraftRequest({ canEditRequesterData: true, canSubmitDraft: true }))
  renderRequestDetailShell(); requestDetailHookHarness.runEffects(); await flushRequestDetailAsyncWork()
  const page = renderRequestDetailShell()
  expect(JSON.stringify(page)).not.toContain('Requester information is saved separately from PSF information.')
 })
})

describe('Product Type team Dashboard', () => {
 beforeEach(() => { requestDetailHookHarness.reset(); requestDetailApi.fetchWorkflowStatuses.mockResolvedValue({ statuses: ['Submitted'] }); requestDetailApi.queryPsfRequests.mockResolvedValue({ items: [], total: 0, limit: 25, offset: 0, summary: { open: 0, overdue: 0, completed: 0 } }) })
 it.each(['GNTC', 'MFG'] as const)('defaults to %s account team and permits all shared work', async setupOwnerDepartment => {
  requestDetailApi.fetchCurrentUser.mockResolvedValue({ user: { id: 'owner', role: 'setup_owner', setupOwnerDepartment } })
  requestDetailHookHarness.beginRender(); RequestsWorkspace.DashboardPage(); requestDetailHookHarness.runEffects(); await flushRequestDetailAsyncWork()
  requestDetailHookHarness.beginRender(); let page = RequestsWorkspace.DashboardPage()
  const select = requireRenderedElement(page, element => element.type === 'select' && element.props['aria-label'] === 'Team')
  expect(select.props.value).toBe(setupOwnerDepartment)
  expect(JSON.stringify(page)).not.toContain('Assigned to me')
  ;(select.props.onChange as (event: unknown) => void)({ target: { value: 'all' } })
  requestDetailHookHarness.beginRender(); page = RequestsWorkspace.DashboardPage(); requestDetailHookHarness.runEffects(); await flushRequestDetailAsyncWork()
  expect(requestDetailApi.queryPsfRequests.mock.lastCall?.[0]).toMatchObject({ team: 'all', offset: 0 })
  expect(JSON.stringify(page)).toContain('รอระบุ Product Type')
 })
})
