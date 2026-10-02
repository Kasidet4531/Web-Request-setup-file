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
    canEditRequesterData: true,
    canSubmitDraft: false,
    requesterUserId: 'user-1',
    psfReleasedAt: null,
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

function renderDraftForm(
  submissionConflict = 0,
  onDraftSchemaSubmitAllowedChange?: (allowed: boolean) => void,
  onSavingChange?: (saving: boolean) => void,
  onDirtyChange?: (dirty: boolean) => void,
  disabled = false,
  onRequestSaved?: (request: PsfRequestResponse) => void,
) {
  hookHarness.beginRender()
  return ActiveSchemaForm({
    disabled,
    mode: 'request',
    onRequestSaved,
    requestId: 'request-1',
    onDraftSchemaSubmitAllowedChange,
    onSavingChange,
    onDirtyChange,
    submissionConflict,
  })
}

function renderNewDraftForm() {
  hookHarness.beginRender()
  return ActiveSchemaForm({ mode: 'request' })
}

function renderDraftFormWithRequestSnapshot(
  requestSnapshot: PsfRequestResponse,
  onDirtyChange?: (dirty: boolean) => void,
) {
  hookHarness.beginRender()
  return ActiveSchemaForm({
    mode: 'request',
    requestId: 'request-1',
    requestSnapshot,
    onDirtyChange,
  })
}

async function loadNewDraftForm() {
  renderNewDraftForm()
  hookHarness.runEffects()
  await flushAsyncWork()
  return renderNewDraftForm()
}

async function flushAsyncWork(): Promise<void> {
  await new Promise<void>((resolve) => setTimeout(resolve, 0))
}

async function loadOlderDraft(
  onDraftSchemaSubmitAllowedChange?: (allowed: boolean) => void,
  onSavingChange?: (saving: boolean) => void,
) {
  renderDraftForm(0, onDraftSchemaSubmitAllowedChange, onSavingChange)
  hookHarness.runEffects()
  await flushAsyncWork()
  return renderDraftForm(0, onDraftSchemaSubmitAllowedChange, onSavingChange)
}

function getDecision(page: unknown): RenderedElement {
  return requireRenderedElement(page, (element) => element.type === DraftSchemaUpgradeDecision)
}

function getFormRenderer(page: unknown): RenderedElement {
  return requireRenderedElement(page, (element) => element.type === DynamicFormRenderer)
}

describe('ActiveSchemaForm draft schema upgrade interactions', () => {
  it('retains a committed new draft and its runtime triggers without requiring another schema fetch', async () => {
    const current = structuredClone(currentActiveRequestSchema)
    current.schema.sections[0].fields[0].autofillTrigger = true
    requestApi.fetchActiveFormSchema.mockResolvedValueOnce(current).mockRejectedValue(new Error('Schema unavailable'))
    const saved = buildDraft({ requesterData: { product_type: '', legacy_note: '' } })
    requestApi.createDraftRequest.mockResolvedValue(saved)
    requestApi.updateDraftRequesterData.mockResolvedValue(saved)
    let page = await loadNewDraftForm()
    ;(getFormRenderer(page).props.onSubmit as (values: Record<string, string>) => void)({ product_type: '', legacy_note: '' })
    await flushAsyncWork()
    page = renderNewDraftForm()
    expect((getFormRenderer(page).props.schema as ActiveFormSchemaResponse['schema']).sections[0].fields[0].autofillTrigger).toBe(true)
    ;(getFormRenderer(page).props.onSubmit as (values: Record<string, string>) => void)({ product_type: '', legacy_note: '' })
    await flushAsyncWork()
    expect(requestApi.createDraftRequest).toHaveBeenCalledTimes(1)
    expect(requestApi.updateDraftRequesterData).toHaveBeenCalledTimes(1)
    expect(requestApi.fetchActiveFormSchema).toHaveBeenCalledTimes(1)
  })
  it('persists an incomplete new draft without surfacing required-field validation', async () => {
    requestApi.fetchActiveFormSchema.mockResolvedValue(currentActiveRequestSchema)
    requestApi.createDraftRequest.mockResolvedValue(
      buildDraft({ requesterData: { product_type: '', legacy_note: '' } }),
    )

    const page = await loadNewDraftForm()
    const onSave = getFormRenderer(page).props.onSubmit
    if (typeof onSave !== 'function') {
      throw new Error('Expected new-draft save callback')
    }

    onSave({ product_type: '', legacy_note: '' })
    await flushAsyncWork()

    expect(requestApi.createDraftRequest).toHaveBeenCalledWith({
      requesterData: { product_type: '', legacy_note: '' },
    })
    expect(getFormRenderer(renderNewDraftForm()).props.errors).toEqual({})
  })

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

  it('cancels destructive Reload without losing edits, confirms one reload, and leaves clean reload unprompted', async () => {
    const confirm = vi.fn(() => false)
    vi.stubGlobal('window', { confirm })
    let page = await loadOlderDraft()
    ;(getDecision(page).props.onRemain as () => void)()
    page = renderDraftForm()
    ;(getFormRenderer(page).props.onChange as (key: string, value: string) => void)('legacy_note', 'LOCAL note')
    requestApi.upgradeDraftSchema.mockRejectedValue(new Error('Upgrade failed'))
    ;(getDecision(renderDraftForm()).props.onUpgrade as () => void)()
    await flushAsyncWork()
    page = renderDraftForm()
    const calls = requestApi.fetchPsfRequest.mock.calls.length
    ;(getDecision(page).props.onReload as () => void)()
    page = renderDraftForm()
    hookHarness.runEffects()
    await flushAsyncWork()
    expect(confirm).toHaveBeenCalledTimes(1)
    expect(requestApi.fetchPsfRequest).toHaveBeenCalledTimes(calls)
    expect(getFormRenderer(page).props.values).toMatchObject({ legacy_note: 'LOCAL note' })
    confirm.mockReturnValue(true)
    ;(getDecision(page).props.onReload as () => void)()
    renderDraftForm()
    hookHarness.runEffects()
    await flushAsyncWork()
    expect(requestApi.fetchPsfRequest).toHaveBeenCalledTimes(calls + 1)
    page = renderDraftForm()
    ;(getDecision(page).props.onReload as () => void)()
    renderDraftForm()
    hookHarness.runEffects()
    await flushAsyncWork()
    expect(confirm).toHaveBeenCalledTimes(2)
    expect(requestApi.fetchPsfRequest).toHaveBeenCalledTimes(calls + 2)
    vi.unstubAllGlobals()
  })

  it('does not flash editable requester controls before draft-schema loading resolves', () => {
    const initialPage = renderDraftForm()

    expect(
      findRenderedElement(initialPage, (element) => element.type === DynamicFormRenderer),
    ).toBeNull()
  })

  it('reports the full requester-save lifetime to the detail shell', async () => {
    const current = buildDraft({
      formVersion: 2,
      schemaSnapshot: activeRequestSchema.schema,
      requesterData: { product_type: 'New Product', title: 'Saved title' },
      canSubmitDraft: true,
      updatedAt: 'opaque-requester-revision-1',
    })
    const saved = buildDraft({
      ...current,
      requesterData: { product_type: 'New Product', title: 'Edited title' },
      updatedAt: 'opaque-requester-revision-2',
    })
    let resolveSave: ((request: PsfRequestResponse) => void) | undefined
    const onSavingChange = vi.fn()
    requestApi.fetchPsfRequest.mockResolvedValue(current)
    requestApi.updateDraftRequesterData.mockImplementationOnce(
      () => new Promise<PsfRequestResponse>((resolve) => { resolveSave = resolve }),
    )

    renderDraftForm(0, undefined, onSavingChange)
    hookHarness.runEffects()
    await flushAsyncWork()
    let page = renderDraftForm(0, undefined, onSavingChange)
    const onSubmit = getFormRenderer(page).props.onSubmit
    if (typeof onSubmit !== 'function') throw new Error('Expected requester save callback')
    onSubmit({ product_type: 'New Product', title: 'Edited title' })
    page = renderDraftForm(0, undefined, onSavingChange)

    expect(onSavingChange).toHaveBeenLastCalledWith(true)
    expect(getFormRenderer(page).props.readOnly).toBe(true)
    expect(getFormRenderer(page).props.onSubmit).toBeUndefined()

    if (!resolveSave) throw new Error('Expected requester save to remain pending')
    resolveSave(saved)
    await flushAsyncWork()

    expect(onSavingChange).toHaveBeenLastCalledWith(false)
    expect(requestApi.updateDraftRequesterData).toHaveBeenCalledWith('request-1', {
      formVersion: 2,
      expectedUpdatedAt: 'opaque-requester-revision-1',
      requesterData: { product_type: 'New Product', title: 'Edited title' },
    })
  })

  it('upgrades only once and leaves Draft submission to the Action center', async () => {
    const onSavingChange = vi.fn()
    let resolveUpgrade: ((request: PsfRequestResponse) => void) | undefined
    requestApi.upgradeDraftSchema.mockImplementationOnce(
      () =>
        new Promise<PsfRequestResponse>((resolve) => {
          resolveUpgrade = resolve
        }),
    )

    let page = await loadOlderDraft(undefined, onSavingChange)
    const onUpgrade = getDecision(page).props.onUpgrade
    if (typeof onUpgrade !== 'function') {
      throw new Error('Expected explicit upgrade callback')
    }

    onUpgrade()
    onUpgrade()

    expect(requestApi.upgradeDraftSchema).toHaveBeenCalledTimes(1)
    expect(requestApi.upgradeDraftSchema).toHaveBeenCalledWith('request-1', { formVersion: 2 })
    expect(onSavingChange).toHaveBeenLastCalledWith(true)
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

    expect(onSavingChange).toHaveBeenLastCalledWith(false)
    const formRenderer = getFormRenderer(page)
    expect(formRenderer.props.schema).toEqual(activeRequestSchema.schema)
    expect(formRenderer.props.values).toEqual({ product_type: 'New Product', title: '' })
    expect(formRenderer.props.footerActions).toBeFalsy()
    expect(requestApi.submitPsfRequest).not.toHaveBeenCalled()
  })

  it('does not upgrade while a requester save is pending', async () => {
    let resolveSave: ((request: PsfRequestResponse) => void) | undefined
    const onSavingChange = vi.fn()
    requestApi.updateDraftRequesterData.mockImplementationOnce(
      () => new Promise<PsfRequestResponse>((resolve) => { resolveSave = resolve }),
    )

    let page = await loadOlderDraft(undefined, onSavingChange)
    const onRemain = getDecision(page).props.onRemain
    if (typeof onRemain !== 'function') throw new Error('Expected explicit Remain choice')
    onRemain()
    page = renderDraftForm(0, undefined, onSavingChange)
    const save = getFormRenderer(page).props.onSubmit
    if (typeof save !== 'function') throw new Error('Expected requester save callback')
    save({ product_type: 'New Product', legacy_note: 'local note' })
    page = renderDraftForm(0, undefined, onSavingChange)

    expect(onSavingChange).toHaveBeenLastCalledWith(true)
    const decision = getDecision(page)
    const renderedDecision = DraftSchemaUpgradeDecision(
      decision.props as unknown as Parameters<typeof DraftSchemaUpgradeDecision>[0],
    )
    const upgradeButton = requireRenderedElement(
      renderedDecision,
      (element) => element.type === 'button' && element.props.children === 'Upgrade to version 2',
    )
    expect(upgradeButton.props.disabled).toBe(true)

    const upgrade = decision.props.onUpgrade
    if (typeof upgrade !== 'function') throw new Error('Expected upgrade handler')
    upgrade()
    expect(requestApi.upgradeDraftSchema).not.toHaveBeenCalled()

    if (!resolveSave) throw new Error('Expected requester save to remain pending')
    resolveSave(buildDraft({ requesterData: { product_type: 'New Product', legacy_note: 'local note' } }))
    await flushAsyncWork()
    expect(onSavingChange).toHaveBeenLastCalledWith(false)
  })

  it('does not start a requester save through a stale callback while schema upgrade is pending', async () => {
    let resolveUpgrade: ((request: PsfRequestResponse) => void) | undefined
    const onRequestSaved = vi.fn()
    requestApi.upgradeDraftSchema.mockImplementationOnce(
      () => new Promise<PsfRequestResponse>((resolve) => { resolveUpgrade = resolve }),
    )

    let page = await loadOlderDraft()
    const remain = getDecision(page).props.onRemain
    if (typeof remain !== 'function') throw new Error('Expected explicit Remain choice')
    remain()
    page = renderDraftForm(0, undefined, undefined, undefined, false, onRequestSaved)
    const staleSave = getFormRenderer(page).props.onSubmit
    const upgrade = getDecision(page).props.onUpgrade
    if (typeof staleSave !== 'function' || typeof upgrade !== 'function') {
      throw new Error('Expected requester save and schema upgrade callbacks')
    }

    upgrade()
    staleSave({ product_type: 'New Product', legacy_note: 'must remain local' })
    expect(requestApi.updateDraftRequesterData).not.toHaveBeenCalled()

    page = renderDraftForm()
    expect(getFormRenderer(page).props.readOnly).toBe(true)
    expect(getFormRenderer(page).props.onSubmit).toBeUndefined()
    if (!resolveUpgrade) throw new Error('Expected schema upgrade to remain pending')
    resolveUpgrade(buildDraft({
      formVersion: 2,
      schemaSnapshot: activeRequestSchema.schema,
      requesterData: { product_type: 'New Product', title: '' },
      updatedAt: '2026-10-01T00:00:00.123458Z',
    }))
    await flushAsyncWork()
    page = renderDraftForm()

    expect(getFormRenderer(page).props.schema).toEqual(activeRequestSchema.schema)
    expect(getFormRenderer(page).props.values).toEqual({ product_type: 'New Product', title: '' })
    expect(onRequestSaved).toHaveBeenCalledWith(expect.objectContaining({
      formVersion: 2,
      updatedAt: '2026-10-01T00:00:00.123458Z',
    }))
    expect(requestApi.updateDraftRequesterData).not.toHaveBeenCalled()
  })

  it('does not start a schema upgrade while the detail shell disables requester mutations', async () => {
    await loadOlderDraft()
    const page = renderDraftForm(0, undefined, undefined, undefined, true)

    const decision = getDecision(page)
    const renderedDecision = DraftSchemaUpgradeDecision(
      decision.props as unknown as Parameters<typeof DraftSchemaUpgradeDecision>[0],
    )
    const upgradeButton = requireRenderedElement(
      renderedDecision,
      (element) => element.type === 'button' && element.props.children === 'Upgrade to version 2',
    )
    const remainButton = requireRenderedElement(
      renderedDecision,
      (element) =>
        element.type === 'button' &&
        Array.isArray(element.props.children) &&
        element.props.children.join('') === 'Remain on version 1',
    )
    expect(upgradeButton.props.disabled).toBe(true)
    expect(remainButton.props.disabled).toBe(true)

    const upgrade = decision.props.onUpgrade
    if (typeof upgrade !== 'function') throw new Error('Expected upgrade handler')
    upgrade()
    expect(requestApi.upgradeDraftSchema).not.toHaveBeenCalled()
  })

  it('allows Action center submission only after an explicit schema upgrade', async () => {
    const onDraftSchemaSubmitAllowedChange = vi.fn()
    requestApi.upgradeDraftSchema.mockResolvedValueOnce(
      buildDraft({
        formVersion: 2,
        requesterData: { product_type: 'New Product', title: '' },
        schemaSnapshot: activeRequestSchema.schema,
      }),
    )

    let page = await loadOlderDraft(onDraftSchemaSubmitAllowedChange)
    expect(onDraftSchemaSubmitAllowedChange).toHaveBeenLastCalledWith(false)
    const onUpgrade = getDecision(page).props.onUpgrade
    if (typeof onUpgrade !== 'function') throw new Error('Expected explicit upgrade callback')
    onUpgrade()
    await flushAsyncWork()
    page = renderDraftForm(0, onDraftSchemaSubmitAllowedChange)

    expect(getFormRenderer(page).props.schema).toEqual(activeRequestSchema.schema)
    expect(onDraftSchemaSubmitAllowedChange).toHaveBeenLastCalledWith(true)
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
    const onSavingChange = vi.fn()
    requestApi.upgradeDraftSchema
      .mockRejectedValueOnce(new Error('The active schema changed. Reload and retry.'))
      .mockResolvedValueOnce(
        buildDraft({
          formVersion: 2,
          requesterData: { product_type: 'New Product', title: '' },
          schemaSnapshot: activeRequestSchema.schema,
        }),
      )

    let page = await loadOlderDraft(undefined, onSavingChange)
    const onUpgrade = getDecision(page).props.onUpgrade
    if (typeof onUpgrade !== 'function') {
      throw new Error('Expected explicit upgrade callback')
    }

    onUpgrade()
    expect(onSavingChange).toHaveBeenLastCalledWith(true)
    await flushAsyncWork()
    page = renderDraftForm(0, undefined, onSavingChange)

    expect(getDecision(page).props.error).toBe('The active schema changed. Reload and retry.')
    expect(getDecision(page).props.isUpgradePending).toBe(false)
    expect(onSavingChange).toHaveBeenLastCalledWith(false)

    const retryUpgrade = getDecision(page).props.onUpgrade
    if (typeof retryUpgrade !== 'function') {
      throw new Error('Expected recoverable upgrade callback')
    }

    retryUpgrade()
    expect(onSavingChange).toHaveBeenLastCalledWith(true)
    await flushAsyncWork()
    page = renderDraftForm(0, undefined, onSavingChange)

    expect(onSavingChange).toHaveBeenLastCalledWith(false)
    expect(requestApi.upgradeDraftSchema).toHaveBeenCalledTimes(2)
    expect(getFormRenderer(page).props.schema).toEqual(activeRequestSchema.schema)
  })

  it('keeps the older snapshot editable after Remain without adding a duplicate submit control', async () => {
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
    expect(formRenderer.props.footerActions).toBeFalsy()
    expect(requestApi.submitPsfRequest).not.toHaveBeenCalled()
    expect(requestApi.upgradeDraftSchema).not.toHaveBeenCalled()
  })

  it('preserves unsaved requester edits and exposes Reload and Upgrade after an Action center conflict', async () => {
    requestApi.fetchActiveFormSchema
      .mockResolvedValueOnce(currentActiveRequestSchema)
      .mockResolvedValueOnce(activeRequestSchema)
    requestApi.fetchPsfRequest
      .mockResolvedValueOnce(buildDraft())
      .mockResolvedValueOnce(buildDraft({ updatedAt: 'latest-revision' }))
    const onDraftSchemaSubmitAllowedChange = vi.fn()

    let page = await loadOlderDraft(onDraftSchemaSubmitAllowedChange)
    const onChange = getFormRenderer(page).props.onChange
    if (typeof onChange !== 'function') {
      throw new Error('Expected requester edit callback')
    }

    onChange('product_type', 'Transfer Product')
    renderDraftForm(1, onDraftSchemaSubmitAllowedChange)
    hookHarness.runEffects()
    await flushAsyncWork()
    page = renderDraftForm(1, onDraftSchemaSubmitAllowedChange)

    expect(onDraftSchemaSubmitAllowedChange).toHaveBeenLastCalledWith(false)
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

  it('preserves requester edits and adopts refreshed status permissions and opaque revision metadata', async () => {
    const requesterSchema: FormSchema = {
      formKey: 'psf-request',
      version: 1,
      title: 'PSF Request v1',
      sections: [{
        sectionKey: 'requester_information',
        title: 'Requester Information',
        fields: [
          { fieldKey: 'title', canonicalKey: 'title', label: 'Title', type: 'text', required: true },
        ],
      }],
    }
    const initialRequest = buildDraft({
      formVersion: 1,
      schemaSnapshot: requesterSchema,
      requesterData: { title: 'Saved value' },
    })
    const onDirtyChange = vi.fn()
    requestApi.fetchPsfRequest.mockResolvedValue(initialRequest)

    let page = await loadOlderDraft(onDirtyChange)
    const remain = getDecision(page).props.onRemain
    if (typeof remain !== 'function') throw new Error('Expected explicit Remain choice')
    remain()
    page = renderDraftForm()
    const onChange = getFormRenderer(page).props.onChange
    if (typeof onChange !== 'function') throw new Error('Expected requester field callback')
    onChange('title', 'LOCAL requester edit')

    const refreshedRequest = buildDraft({
      status: 'Submitted',
      formVersion: 1,
      schemaSnapshot: requesterSchema,
      canEditRequesterData: false,
      canSubmitDraft: false,
      updatedAt: 'opaque-revision-after-status-change',
      requesterData: { title: 'Saved value' },
      submittedAt: '2026-08-08T00:01:00.000Z',
    })
    page = renderDraftFormWithRequestSnapshot(refreshedRequest, onDirtyChange)
    expect(getFormRenderer(page).props.readOnly).toBe(true)
    expect(getFormRenderer(page).props.onSubmit).toBeUndefined()
    hookHarness.runEffects()
    page = renderDraftFormWithRequestSnapshot(refreshedRequest, onDirtyChange)

    const renderer = getFormRenderer(page)
    expect(renderer.props.values).toEqual({ title: 'LOCAL requester edit' })
    expect(renderer.props.readOnly).toBe(true)
    expect(renderer.props.onSubmit).toBeUndefined()
    expect(onDirtyChange).toHaveBeenLastCalledWith(true)
  })

  it('reconciles a requester-save conflict with the explicitly upgraded snapshot before retry', async () => {
    const schemaV1: FormSchema = {
      formKey: 'psf-request',
      version: 1,
      title: 'PSF Request v1',
      sections: [{
        sectionKey: 'requester_information',
        title: 'Requester Information',
        fields: [
          { fieldKey: 'title', canonicalKey: 'title', label: 'Title', type: 'text', required: true },
        ],
      }],
    }
    const schemaV2: FormSchema = {
      formKey: 'psf-request',
      version: 2,
      title: 'PSF Request v2',
      sections: [{
        sectionKey: 'requester_information',
        title: 'Requester Information',
        fields: [
          { fieldKey: 'title', canonicalKey: 'title', label: 'Title', type: 'text', required: true },
          { fieldKey: 'reason', canonicalKey: 'reason', label: 'Reason', type: 'textarea', required: true },
        ],
      }],
    }
    const activeV1: ActiveFormSchemaResponse = {
      ...currentActiveRequestSchema,
      version: 1,
      title: schemaV1.title,
      schema: schemaV1,
    }
    const activeV2: ActiveFormSchemaResponse = {
      ...activeRequestSchema,
      title: schemaV2.title,
      version: 2,
      schema: schemaV2,
    }
    const initialDraft = buildDraft({
      formVersion: 1,
      schemaSnapshot: schemaV1,
      requesterData: { title: 'Saved title' },
      updatedAt: 'opaque-revision-v1',
    })
    const refreshedDraft = buildDraft({
      formVersion: 2,
      schemaSnapshot: schemaV2,
      requesterData: { title: 'Server title', reason: '' },
      updatedAt: 'opaque-revision-v2-exact',
    })
    const savedDraft = buildDraft({
      formVersion: 2,
      schemaSnapshot: schemaV2,
      requesterData: { title: 'LOCAL title edit', reason: 'Process requirement' },
      updatedAt: 'opaque-revision-v3',
    })
    const onDirtyChange = vi.fn()
    const onSchemaSubmitAllowedChange = vi.fn()
    requestApi.fetchPsfRequest
      .mockResolvedValueOnce(initialDraft)
      .mockResolvedValueOnce(refreshedDraft)
    requestApi.fetchActiveFormSchema
      .mockResolvedValueOnce(activeV1)
      .mockResolvedValueOnce(activeV2)
    requestApi.updateDraftRequesterData
      .mockRejectedValueOnce(new ApiError('Draft changed.', 409, 'Conflict', null))
      .mockResolvedValueOnce(savedDraft)

    renderDraftForm(0, onSchemaSubmitAllowedChange, undefined, onDirtyChange)
    hookHarness.runEffects()
    await flushAsyncWork()
    let page = renderDraftForm(0, onSchemaSubmitAllowedChange, undefined, onDirtyChange)
    let renderer = getFormRenderer(page)
    expect(renderer.props.schema).toEqual(schemaV1)
    const editV1 = renderer.props.onChange
    if (typeof editV1 !== 'function') throw new Error('Expected v1 requester edit callback')
    editV1('title', 'LOCAL title edit')
    page = renderDraftForm(0, onSchemaSubmitAllowedChange, undefined, onDirtyChange)
    const saveV1 = getFormRenderer(page).props.onSubmit
    if (typeof saveV1 !== 'function') throw new Error('Expected requester save callback')
    saveV1({ title: 'LOCAL title edit' })
    await flushAsyncWork()
    page = renderDraftForm(0, onSchemaSubmitAllowedChange, undefined, onDirtyChange)
    renderer = getFormRenderer(page)

    expect(renderer.props.schema).toEqual(schemaV2)
    expect(renderer.props.values).toEqual({ title: 'LOCAL title edit', reason: '' })
    expect(renderer.props.readOnly).toBe(false)
    expect(onSchemaSubmitAllowedChange).toHaveBeenLastCalledWith(true)
    expect(onDirtyChange).toHaveBeenLastCalledWith(true)

    const editV2 = renderer.props.onChange
    if (typeof editV2 !== 'function') throw new Error('Expected refreshed v2 field callback')
    editV2('reason', 'Process requirement')
    page = renderDraftForm(0, onSchemaSubmitAllowedChange, undefined, onDirtyChange)
    const retry = getFormRenderer(page).props.onSubmit
    if (typeof retry !== 'function') throw new Error('Expected requester retry callback')
    retry({ title: 'LOCAL title edit', reason: 'Process requirement' })
    await flushAsyncWork()

    expect(requestApi.updateDraftRequesterData).toHaveBeenNthCalledWith(1, 'request-1', {
      formVersion: 1,
      expectedUpdatedAt: 'opaque-revision-v1',
      requesterData: { title: 'LOCAL title edit' },
    })
    expect(requestApi.updateDraftRequesterData).toHaveBeenNthCalledWith(2, 'request-1', {
      formVersion: 2,
      expectedUpdatedAt: 'opaque-revision-v2-exact',
      requesterData: { title: 'LOCAL title edit', reason: 'Process requirement' },
    })
    expect(requestApi.upgradeDraftSchema).not.toHaveBeenCalled()
  })

  it('requires an explicit schema choice when a save conflict reveals a newer active schema', async () => {
    const schemaV1: FormSchema = {
      formKey: 'psf-request',
      version: 1,
      title: 'PSF Request v1',
      sections: [{
        sectionKey: 'requester_information',
        title: 'Requester Information',
        fields: [
          { fieldKey: 'title', canonicalKey: 'title', label: 'Title', type: 'text', required: true },
        ],
      }],
    }
    const schemaV2: FormSchema = {
      ...schemaV1,
      version: 2,
      title: 'PSF Request v2',
      sections: [{
        ...schemaV1.sections[0],
        fields: [
          ...schemaV1.sections[0].fields,
          { fieldKey: 'reason', canonicalKey: 'reason', label: 'Reason', type: 'textarea', required: true },
        ],
      }],
    }
    const activeV1: ActiveFormSchemaResponse = {
      ...currentActiveRequestSchema,
      version: 1,
      title: schemaV1.title,
      schema: schemaV1,
    }
    const activeV2: ActiveFormSchemaResponse = {
      ...activeRequestSchema,
      title: schemaV2.title,
      version: 2,
      schema: schemaV2,
    }
    const initialDraft = buildDraft({
      formVersion: 1,
      schemaSnapshot: schemaV1,
      requesterData: { title: 'Saved title' },
      updatedAt: 'opaque-revision-v1',
    })
    const refreshedDraft = buildDraft({
      formVersion: 1,
      schemaSnapshot: schemaV1,
      requesterData: { title: 'Saved title' },
      updatedAt: 'opaque-revision-v1-after-conflict',
    })
    requestApi.fetchPsfRequest
      .mockResolvedValueOnce(initialDraft)
      .mockResolvedValueOnce(refreshedDraft)
    requestApi.fetchActiveFormSchema
      .mockResolvedValueOnce(activeV1)
      .mockResolvedValueOnce(activeV2)
    requestApi.updateDraftRequesterData.mockRejectedValueOnce(
      new ApiError('Draft changed.', 409, 'Conflict', null),
    )

    renderDraftForm()
    hookHarness.runEffects()
    await flushAsyncWork()
    let page = renderDraftForm()
    const onChange = getFormRenderer(page).props.onChange
    if (typeof onChange !== 'function') throw new Error('Expected requester edit callback')
    onChange('title', 'LOCAL title edit')
    page = renderDraftForm()
    const onSubmit = getFormRenderer(page).props.onSubmit
    if (typeof onSubmit !== 'function') throw new Error('Expected requester save callback')
    onSubmit({ title: 'LOCAL title edit' })
    await flushAsyncWork()
    page = renderDraftForm()

    const decision = getDecision(page)
    expect(decision.props.currentVersion).toBe(1)
    expect(decision.props.activeVersion).toBe(2)
    expect(decision.props.onUpgrade).toBeTypeOf('function')
    expect(decision.props.onRemain).toBeTypeOf('function')
    expect(findRenderedElement(page, (element) => element.type === DynamicFormRenderer)).toBeNull()
    expect(requestApi.upgradeDraftSchema).not.toHaveBeenCalled()

    const remain = decision.props.onRemain
    if (typeof remain !== 'function') throw new Error('Expected explicit Remain choice')
    remain()
    page = renderDraftForm()
    expect(getFormRenderer(page).props.schema).toEqual(schemaV1)
    expect(getFormRenderer(page).props.values).toEqual({ title: 'LOCAL title edit' })
    expect(requestApi.upgradeDraftSchema).not.toHaveBeenCalled()
  })

  it('keeps an inconsistent Draft snapshot read-only without rendering a second submit control', async () => {
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
    expect(formRenderer.props.footerActions).toBeFalsy()
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
      expectedUpdatedAt: '2026-08-08T00:00:00.000Z',
      requesterData: remainingValues,
    })
    expect(getFormRenderer(page).props.schema).toEqual(snapshotSchema)
    expect(getFormRenderer(page).props.values).toEqual(remainingValues)
    expect(requestApi.upgradeDraftSchema).not.toHaveBeenCalled()
  })
})
