import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  RequestDetailShell,
  RequestHeaderSummary,
  WorkflowStatusActions,
} from './RequestsWorkspace'
import { requesterFieldsAreReadOnly } from './activeSchemaFormState'
import type { PsfRequestResponse } from '../services/api'

const requestDetailApi = vi.hoisted(() => ({
  fetchPsfRequest: vi.fn(),
  fetchPsfRequestStatusOptions: vi.fn(),
  updatePsfRequestStatus: vi.fn(),
}))

const requestDetailHookHarness = vi.hoisted(() => {
  let effectDependencies: Array<readonly unknown[] | undefined> = []
  let effectIndex = 0
  let effects: Array<() => void | (() => void)> = []
  let state: unknown[] = []
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
      stateIndex = 0
    },
    reset() {
      effectDependencies = []
      effectIndex = 0
      effects = []
      state = []
      stateIndex = 0
    },
    runEffects() {
      const pendingEffects = effects
      effects = []
      pendingEffects.forEach((effect) => effect())
    },
    useEffect(effect: () => void | (() => void), dependencies?: readonly unknown[]) {
      if (dependenciesChanged(effectDependencies[effectIndex], dependencies)) {
        effects.push(effect)
        effectDependencies[effectIndex] = dependencies ? [...dependencies] : undefined
      }
      effectIndex += 1
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
      }

      return [state[index], (nextState: unknown) => {
        state[index] =
          typeof nextState === 'function'
            ? (nextState as (currentState: unknown) => unknown)(state[index])
            : nextState
      }]
    },
  }
})

vi.mock('../services/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../services/api')>()

  return {
    ...actual,
    api: requestDetailApi,
  }
})

vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react')>()

  return {
    ...actual,
    useEffect: requestDetailHookHarness.useEffect,
    useState: requestDetailHookHarness.useState,
  }
})

interface RenderedElement {
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
    props: node.props as Record<string, unknown>,
    type: node.type,
  }
  if (matches(element)) {
    return element
  }

  return findRenderedElement(element.props.children, matches)
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
    setupOwner: 'Lin',
    setupOwnerRole: 'GNTC',
    productType: null,
    requesterData: {
      request_title_v4: 'Production probe card setup',
      requester_v4: 'Fook',
      product_kind_v4: 'Existing Product',
      delivery_by_v4: '2026-08-05',
      urgency_v4: 'Urgent',
    },
    psfCreatedData: {},
    schemaSnapshot: {
      formKey: 'psf-request',
      version: 4,
      title: 'PSF Request Form',
      sections: [
        {
          sectionKey: 'requester_information',
          title: 'Requester Information',
          visibleTo: ['requester', 'setup_owner', 'admin'],
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
  }
}

describe('RequestHeaderSummary', () => {
  it('uses the submitted schema snapshot for header metadata while requester data stays read-only', () => {
    const request = buildSubmittedRequest()
    const html = renderToStaticMarkup(<RequestHeaderSummary request={request} />)

    expect(html).toContain('Request No.')
    expect(html).toContain('PSF-0001')
    expect(html).toContain('Production probe card setup')
    expect(html).toContain('Existing Product')
    expect(html).toContain('status-badge--submitted')
    expect(html).toContain('Urgent')
    expect(html).toContain('05/08/2026')
    expect(html).toContain('Fook')
    expect(html).toContain('Lin / GNTC')
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
    expect(html).toContain('<select')
    expect(html).toContain('Setup In Progress')
    expect(html).toContain('Need More Information')
    expect(html).toContain('Rejected')
    expect(html).not.toContain('Cancelled')
    expect(html).toContain('Apply status')
  })

  it('renders the current workflow status read-only when the server allows no transitions', () => {
    const html = renderToStaticMarkup(
      <WorkflowStatusActions
        allowedNextStatuses={[]}
        currentStatus="Completed"
        onApply={() => undefined}
        onStatusChange={() => undefined}
        saving={false}
        selectedStatus=""
      />,
    )

    expect(html).toContain('Workflow status')
    expect(html).toContain('Completed')
    expect(html).toContain('read-only')
    expect(html).not.toContain('<select')
    expect(html).not.toContain('Apply status')
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
    expect(html).toContain('Applying status…')
  })
})

describe('RequestDetailShell workflow actions', () => {
  beforeEach(() => {
    requestDetailApi.fetchPsfRequest.mockReset()
    requestDetailApi.fetchPsfRequestStatusOptions.mockReset()
    requestDetailApi.updatePsfRequestStatus.mockReset()
    requestDetailHookHarness.reset()
  })

  it('applies a status, refreshes local request detail and next options, and announces success', async () => {
    const submittedRequest = buildSubmittedRequest()
    const updatedRequest = {
      ...submittedRequest,
      status: 'Setup In Progress',
      setupOwner: 'Setup Owner GNTC Demo',
      setupOwnerRole: 'GNTC',
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
    expect(actions.props.selectedStatus).toBe('Setup In Progress')

    const apply = actions.props.onApply
    if (typeof apply !== 'function') {
      throw new Error('Expected workflow apply callback')
    }
    apply()
    await flushRequestDetailAsyncWork()
    shell = renderRequestDetailShell()

    actions = requireRenderedElement(shell, (element) => element.type === WorkflowStatusActions)
    const summary = requireRenderedElement(shell, (element) => element.type === RequestHeaderSummary)
    const success = requireRenderedElement(shell, (element) => element.props.role === 'status')

    expect(requestDetailApi.updatePsfRequestStatus).toHaveBeenCalledWith('request-1', {
      status: 'Setup In Progress',
    })
    expect(requestDetailApi.fetchPsfRequestStatusOptions).toHaveBeenCalledTimes(2)
    expect(summary.props.request).toMatchObject({ status: 'Setup In Progress' })
    expect(actions.props.allowedNextStatuses).toEqual(['PSF Created', 'Need More Information', 'Rejected'])
    expect(actions.props.selectedStatus).toBe('PSF Created')
    expect(success.props.children).toBe('Request PSF-0001 moved to Setup In Progress.')
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

    const actions = requireRenderedElement(shell, (element) => element.type === WorkflowStatusActions)
    const apply = actions.props.onApply
    if (typeof apply !== 'function') {
      throw new Error('Expected workflow apply callback')
    }
    apply()
    await flushRequestDetailAsyncWork()
    shell = renderRequestDetailShell()

    const alert = requireRenderedElement(shell, (element) => element.props.role === 'alert')
    const summary = requireRenderedElement(shell, (element) => element.type === RequestHeaderSummary)

    expect(requestDetailApi.updatePsfRequestStatus).toHaveBeenCalledWith('request-1', {
      status: 'Setup In Progress',
    })
    expect(requestDetailApi.fetchPsfRequestStatusOptions).toHaveBeenCalledTimes(1)
    expect(summary.props.request).toMatchObject({ status: 'Submitted' })
    expect(alert.props.children).toBe('Transition denied')
  })
})
