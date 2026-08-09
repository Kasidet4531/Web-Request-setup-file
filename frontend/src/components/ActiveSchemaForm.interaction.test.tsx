import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError, type PsfRequestResponse } from '../services/api'
import type { ActiveFormSchemaResponse, FormSchema } from '../types/forms'
import { ActiveSchemaForm, DraftSchemaUpgradeDecision } from './ActiveSchemaForm'
import { DynamicFormRenderer } from './DynamicFormRenderer'

const requestApi = vi.hoisted(() => ({
  createDraftRequest: vi.fn(),
  fetchActiveFormSchema: vi.fn(),
  fetchPsfRequest: vi.fn(),
  submitPsfRequest: vi.fn(),
  updateDraftRequesterData: vi.fn(),
  upgradeDraftSchema: vi.fn(),
}))

const hookHarness = vi.hoisted(() => {
  let effectDependencies: Array<readonly unknown[] | undefined> = []
  let effectIndex = 0
  let effects: Array<() => void | (() => void)> = []
  let refIndex = 0
  let refs: Array<{ current: unknown }> = []
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
    useMemo<T>(factory: () => T) {
      return factory()
    },
    useRef<T>(initialValue: T) {
      const index = refIndex
      refIndex += 1

      if (index === refs.length) {
        refs.push({ current: initialValue })
      }

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
    api: requestApi,
  }
})

vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react')>()

  return {
    ...actual,
    useEffect: hookHarness.useEffect,
    useMemo: hookHarness.useMemo,
    useRef: hookHarness.useRef,
    useState: hookHarness.useState,
  }
})

interface RenderedElement {
  props: Record<string, unknown>
  type: unknown
}

const snapshotSchema: FormSchema = {
  formKey: 'psf-request',
  version: 1,
  title: 'PSF Request Form v1',
  sections: [
    {
      sectionKey: 'requester_information',
      title: 'Requester Information',
      visibleTo: ['requester'],
      fields: [
        {
          fieldKey: 'product_type',
          canonicalKey: 'product_type',
          label: 'Product Type',
          type: 'radio',
          required: true,
          options: ['New Product'],
        },
        {
          fieldKey: 'legacy_note',
          canonicalKey: 'legacy_note',
          label: 'Legacy Note',
          type: 'textarea',
          required: false,
        },
      ],
    },
  ],
}

const activeRequestSchema: ActiveFormSchemaResponse = {
  formKey: 'psf-request',
  version: 2,
  title: 'PSF Request Form v2',
  description: null,
  status: 'active',
  publishedAt: '2026-08-08T00:00:00.000Z',
  schema: {
    formKey: 'psf-request',
    version: 2,
    title: 'PSF Request Form v2',
    sections: [
      {
        sectionKey: 'requester_information',
        title: 'Requester Information',
        visibleTo: ['requester'],
        fields: [
          {
            fieldKey: 'product_type',
            canonicalKey: 'product_type',
            label: 'Product Type',
            type: 'radio',
            required: true,
            options: ['New Product'],
          },
          {
            fieldKey: 'title',
            canonicalKey: 'title',
            label: 'Title',
            type: 'text',
            required: true,
          },
        ],
      },
    ],
  },
}

const currentActiveRequestSchema: ActiveFormSchemaResponse = {
  formKey: 'psf-request',
  version: 1,
  title: 'PSF Request Form v1',
  description: null,
  status: 'active',
  publishedAt: '2026-08-07T00:00:00.000Z',
  schema: snapshotSchema,
}

function buildDraft(overrides: Partial<PsfRequestResponse> = {}): PsfRequestResponse {
  return {
    id: 'request-1',
    requestNo: 'DRAFT-0001',
    formKey: 'psf-request',
    formVersion: 1,
    status: 'Draft',
    requester: 'Requester Demo',
    setupOwner: null,
    setupOwnerRole: null,
    productType: 'New Product',
    requesterData: { product_type: 'New Product' },
    psfCreatedData: {},
    psfCreatedDataVisible: false,
    canEditPsfCreatedData: false,
    psfCreatedInformationSchema: {
      formKey: 'psf-created-information',
      version: 1,
      title: 'PSF Created Information',
      sections: [],
    },
    schemaSnapshot: snapshotSchema,
    createdAt: '2026-08-08T00:00:00.000Z',
    updatedAt: '2026-08-08T00:00:00.000Z',
    submittedAt: null,
    psfCreatedAt: null,
    completedAt: null,
    ...overrides,
  }
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

function renderDraftForm() {
  hookHarness.beginRender()
  return ActiveSchemaForm({ mode: 'request', requestId: 'request-1' })
}

async function flushAsyncWork(): Promise<void> {
  await new Promise<void>((resolve) => setTimeout(resolve, 0))
}

async function loadOlderDraft() {
  renderDraftForm()
  hookHarness.runEffects()
  await flushAsyncWork()
  return renderDraftForm()
}

function getDecision(page: unknown): RenderedElement {
  return requireRenderedElement(page, (element) => element.type === DraftSchemaUpgradeDecision)
}

function getFormRenderer(page: unknown): RenderedElement {
  return requireRenderedElement(page, (element) => element.type === DynamicFormRenderer)
}

function getSubmitButton(page: unknown): RenderedElement {
  return requireRenderedElement(
    page,
    (element) => element.type === 'button' && element.props.children === 'Submit request',
  )
}

describe('ActiveSchemaForm draft schema upgrade interactions', () => {
  beforeEach(() => {
    hookHarness.reset()
    requestApi.createDraftRequest.mockReset()
    requestApi.fetchActiveFormSchema.mockReset()
    requestApi.fetchPsfRequest.mockReset()
    requestApi.submitPsfRequest.mockReset()
    requestApi.updateDraftRequesterData.mockReset()
    requestApi.upgradeDraftSchema.mockReset()
    requestApi.fetchPsfRequest.mockResolvedValue(buildDraft())
    requestApi.fetchActiveFormSchema.mockResolvedValue(activeRequestSchema)
  })

  it('does not flash editable requester controls before draft-schema loading resolves', () => {
    const initialPage = renderDraftForm()

    expect(
      findRenderedElement(initialPage, (element) => element.type === DynamicFormRenderer),
    ).toBeNull()
  })

  it('upgrades only once for duplicate clicks, then renders the authoritative upgraded snapshot', async () => {
    let resolveUpgrade: ((request: PsfRequestResponse) => void) | undefined
    requestApi.upgradeDraftSchema.mockImplementationOnce(
      () =>
        new Promise<PsfRequestResponse>((resolve) => {
          resolveUpgrade = resolve
        }),
    )

    let page = await loadOlderDraft()
    const onUpgrade = getDecision(page).props.onUpgrade
    if (typeof onUpgrade !== 'function') {
      throw new Error('Expected explicit upgrade callback')
    }

    onUpgrade()
    onUpgrade()

    expect(requestApi.upgradeDraftSchema).toHaveBeenCalledTimes(1)
    expect(requestApi.upgradeDraftSchema).toHaveBeenCalledWith('request-1', { formVersion: 2 })
    expect(getDecision(renderDraftForm()).props.isUpgradePending).toBe(true)

    if (!resolveUpgrade) {
      throw new Error('Expected upgrade request to be pending')
    }
    resolveUpgrade(
      buildDraft({
        formVersion: 2,
        requesterData: { product_type: 'New Product', title: '' },
        schemaSnapshot: activeRequestSchema.schema,
      }),
    )
    await flushAsyncWork()
    page = renderDraftForm()

    const formRenderer = getFormRenderer(page)
    expect(formRenderer.props.schema).toEqual(activeRequestSchema.schema)
    expect(formRenderer.props.values).toEqual({ product_type: 'New Product', title: '' })
    expect(getSubmitButton(page).props.disabled).toBe(false)
  })

  it('preserves compatible unsaved requester edits when upgrading after Remain', async () => {
    requestApi.upgradeDraftSchema.mockResolvedValueOnce(
      buildDraft({
        formVersion: 2,
        requesterData: { product_type: 'New Product', title: '' },
        schemaSnapshot: activeRequestSchema.schema,
      }),
    )

    let page = await loadOlderDraft()
    const onRemain = getDecision(page).props.onRemain
    if (typeof onRemain !== 'function') {
      throw new Error('Expected explicit remain callback')
    }

    onRemain()
    page = renderDraftForm()
    const onChange = getFormRenderer(page).props.onChange
    if (typeof onChange !== 'function') {
      throw new Error('Expected requester edit callback after Remain')
    }

    onChange('product_type', 'Transfer Product')
    page = renderDraftForm()
    const onUpgrade = getDecision(page).props.onUpgrade
    if (typeof onUpgrade !== 'function') {
      throw new Error('Expected upgrade callback after Remain')
    }

    onUpgrade()
    await flushAsyncWork()
    page = renderDraftForm()

    expect(getFormRenderer(page).props.values).toEqual({
      product_type: 'Transfer Product',
      title: '',
    })
  })

  it('keeps the explicit choice recoverable after an upgrade error', async () => {
    requestApi.upgradeDraftSchema
      .mockRejectedValueOnce(new Error('The active schema changed. Reload and retry.'))
      .mockResolvedValueOnce(
        buildDraft({
          formVersion: 2,
          requesterData: { product_type: 'New Product', title: '' },
          schemaSnapshot: activeRequestSchema.schema,
        }),
      )

    let page = await loadOlderDraft()
    const onUpgrade = getDecision(page).props.onUpgrade
    if (typeof onUpgrade !== 'function') {
      throw new Error('Expected explicit upgrade callback')
    }

    onUpgrade()
    await flushAsyncWork()
    page = renderDraftForm()

    expect(getDecision(page).props.error).toBe('The active schema changed. Reload and retry.')
    expect(getDecision(page).props.isUpgradePending).toBe(false)

    const retryUpgrade = getDecision(page).props.onUpgrade
    if (typeof retryUpgrade !== 'function') {
      throw new Error('Expected recoverable upgrade callback')
    }

    retryUpgrade()
    await flushAsyncWork()
    page = renderDraftForm()

    expect(requestApi.upgradeDraftSchema).toHaveBeenCalledTimes(2)
    expect(getFormRenderer(page).props.schema).toEqual(activeRequestSchema.schema)
  })

  it('keeps the older snapshot editable after Remain and blocks submit until an explicit upgrade', async () => {
    let page = await loadOlderDraft()
    const onRemain = getDecision(page).props.onRemain
    if (typeof onRemain !== 'function') {
      throw new Error('Expected explicit remain callback')
    }

    onRemain()
    page = renderDraftForm()

    const formRenderer = getFormRenderer(page)
    expect(formRenderer.props.schema).toEqual(snapshotSchema)
    expect(formRenderer.props.onSubmit).toBeTypeOf('function')
    expect(getSubmitButton(page).props.disabled).toBe(true)
    expect(requestApi.upgradeDraftSchema).not.toHaveBeenCalled()
  })

  it('preserves unsaved requester edits and exposes Reload and Upgrade when submit detects a newer schema', async () => {
    requestApi.fetchActiveFormSchema
      .mockResolvedValueOnce(currentActiveRequestSchema)
      .mockResolvedValueOnce(activeRequestSchema)

    let page = await loadOlderDraft()
    const onChange = getFormRenderer(page).props.onChange
    if (typeof onChange !== 'function') {
      throw new Error('Expected requester edit callback')
    }

    onChange('product_type', 'Transfer Product')
    page = renderDraftForm()
    const onSubmit = getSubmitButton(page).props.onClick
    if (typeof onSubmit !== 'function') {
      throw new Error('Expected submit callback')
    }

    onSubmit()
    await flushAsyncWork()
    page = renderDraftForm()

    const decision = getDecision(page)
    expect(decision.props.onReload).toBeTypeOf('function')
    expect(decision.props.onUpgrade).toBeTypeOf('function')
    const onRemain = decision.props.onRemain
    if (typeof onRemain !== 'function') {
      throw new Error('Expected recoverable remain callback')
    }

    onRemain()
    page = renderDraftForm()
    expect(getFormRenderer(page).props.values).toEqual({
      product_type: 'Transfer Product',
      legacy_note: '',
    })
  })

  it('recovers the Reload and Upgrade decision after a schema publish races the submit mutation', async () => {
    requestApi.fetchActiveFormSchema
      .mockResolvedValueOnce(currentActiveRequestSchema)
      .mockResolvedValueOnce(currentActiveRequestSchema)
      .mockResolvedValueOnce(activeRequestSchema)
    requestApi.updateDraftRequesterData.mockResolvedValueOnce(
      buildDraft({ requesterData: { product_type: 'Transfer Product' } }),
    )
    requestApi.submitPsfRequest.mockRejectedValueOnce(
      new ApiError(
        'The active request schema changed before submit. Reload the draft and submit again.',
        409,
        'Conflict',
        null,
      ),
    )

    let page = await loadOlderDraft()
    const onChange = getFormRenderer(page).props.onChange
    if (typeof onChange !== 'function') {
      throw new Error('Expected requester edit callback')
    }

    onChange('product_type', 'Transfer Product')
    page = renderDraftForm()
    const onSubmit = getSubmitButton(page).props.onClick
    if (typeof onSubmit !== 'function') {
      throw new Error('Expected submit callback')
    }

    onSubmit()
    await flushAsyncWork()
    await flushAsyncWork()
    page = renderDraftForm()

    const decision = getDecision(page)
    expect(decision.props.onReload).toBeTypeOf('function')
    expect(decision.props.onUpgrade).toBeTypeOf('function')
    const onRemain = decision.props.onRemain
    if (typeof onRemain !== 'function') {
      throw new Error('Expected recoverable remain callback')
    }

    onRemain()
    page = renderDraftForm()
    expect(getFormRenderer(page).props.values).toEqual({
      product_type: 'Transfer Product',
      legacy_note: '',
    })
  })

  it('keeps an inconsistent Draft snapshot read-only and non-submittable', async () => {
    requestApi.fetchPsfRequest.mockResolvedValueOnce(
      buildDraft({
        schemaSnapshot: {
          ...snapshotSchema,
          version: 0,
        },
      }),
    )

    const page = await loadOlderDraft()
    const formRenderer = getFormRenderer(page)

    expect(formRenderer.props.readOnly).toBe(true)
    expect(formRenderer.props.onSubmit).toBeUndefined()
    expect(getSubmitButton(page).props.disabled).toBe(true)
  })

  it('saves an explicitly Remain-selected draft with the old version and legacy snapshot values intact', async () => {
    const remainingValues = {
      legacy_note: 'Keep this old-schema value',
      product_type: 'New Product',
    }
    requestApi.fetchPsfRequest.mockResolvedValueOnce(
      buildDraft({ requesterData: remainingValues }),
    )
    requestApi.updateDraftRequesterData.mockResolvedValueOnce(
      buildDraft({ requesterData: remainingValues }),
    )

    let page = await loadOlderDraft()
    const onRemain = getDecision(page).props.onRemain
    if (typeof onRemain !== 'function') {
      throw new Error('Expected explicit remain callback')
    }

    onRemain()
    page = renderDraftForm()
    const onSubmit = getFormRenderer(page).props.onSubmit
    if (typeof onSubmit !== 'function') {
      throw new Error('Expected Draft save callback after Remain')
    }

    onSubmit(remainingValues)
    await flushAsyncWork()
    page = renderDraftForm()

    expect(requestApi.updateDraftRequesterData).toHaveBeenCalledWith('request-1', {
      formVersion: 1,
      requesterData: remainingValues,
    })
    expect(getFormRenderer(page).props.schema).toEqual(snapshotSchema)
    expect(getFormRenderer(page).props.values).toEqual(remainingValues)
    expect(requestApi.upgradeDraftSchema).not.toHaveBeenCalled()
  })
})
