import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { PsfRequestResponse, RuntimeAutofillSuggestionsResponse } from '../services/api'
import type { ActiveFormSchemaResponse, FormSchema } from '../types/forms'
import { ActiveSchemaForm } from './ActiveSchemaForm'
import { DynamicFormRenderer } from './DynamicFormRenderer'

const requestApi = vi.hoisted(() => ({
  fetchActiveFormSchema: vi.fn(),
  fetchPsfRequest: vi.fn(),
  fetchRuntimeAutofillSuggestions: vi.fn(),
}))

const hookHarness = vi.hoisted(() => {
  let cleanups: Array<() => void> = []
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
      cleanups = []
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
      pendingEffects.forEach((effect) => {
        const cleanup = effect()
        if (typeof cleanup === 'function') {
          cleanups.push(cleanup)
        }
      })
    },
    unmount() {
      cleanups.forEach((cleanup) => cleanup())
      cleanups = []
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

const runtimeAutofillSchema: FormSchema = {
  formKey: 'psf-request',
  version: 1,
  title: 'Runtime Autofill Request Form',
  sections: [
    {
      sectionKey: 'requester_information',
      title: 'Requester Information',
      visibleTo: ['requester'],
      fields: [
        {
          fieldKey: 'reference_psf_input',
          canonicalKey: 'reference_psf_name',
          label: 'Reference PSF Name',
          type: 'text',
          required: false,
          autofillTrigger: true,
        },
        {
          fieldKey: 'product_input',
          canonicalKey: 'product',
          label: 'Product',
          type: 'text',
          required: false,
        },
      ],
    },
  ],
}

const runtimeAutofillActiveSchema: ActiveFormSchemaResponse = {
  formKey: 'psf-request',
  version: 1,
  title: runtimeAutofillSchema.title,
  description: null,
  status: 'active',
  publishedAt: '2026-08-11T00:00:00.000Z',
  schema: runtimeAutofillSchema,
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
    productType: null,
    requesterData: {
      product_input: '',
      reference_psf_input: '',
    },
    psfCreatedData: {},
    psfCreatedDataVisible: false,
    canEditPsfCreatedData: false,
    psfCreatedInformationSchema: {
      formKey: 'psf-created-information',
      version: 1,
      title: 'PSF Created Information',
      sections: [],
    },
    schemaSnapshot: runtimeAutofillSchema,
    createdAt: '2026-08-11T00:00:00.000Z',
    updatedAt: '2026-08-11T00:00:00.000Z',
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
  page: unknown,
  matches: (element: RenderedElement) => boolean,
): RenderedElement {
  const element = findRenderedElement(page, matches)
  if (!element) {
    throw new Error('Expected rendered element was not found')
  }

  return element
}

function getFormRenderer(page: unknown): RenderedElement {
  return requireRenderedElement(page, (element) => element.type === DynamicFormRenderer)
}

function renderDraft() {
  hookHarness.beginRender()
  return ActiveSchemaForm({ mode: 'request', requestId: 'request-1' })
}

function renderPreview() {
  hookHarness.beginRender()
  return ActiveSchemaForm({ mode: 'preview', requestId: 'request-1' })
}

async function flushAsyncWork(): Promise<void> {
  await new Promise<void>((resolve) => setTimeout(resolve, 0))
}

async function loadDraft() {
  renderDraft()
  hookHarness.runEffects()
  await flushAsyncWork()
  return renderDraft()
}

async function loadPreview() {
  renderPreview()
  hookHarness.runEffects()
  await flushAsyncWork()
  return renderPreview()
}

describe('ActiveSchemaForm runtime autofill interactions', () => {
  beforeEach(() => {
    hookHarness.reset()
    requestApi.fetchActiveFormSchema.mockReset()
    requestApi.fetchPsfRequest.mockReset()
    requestApi.fetchRuntimeAutofillSuggestions.mockReset()
    requestApi.fetchPsfRequest.mockResolvedValue(buildDraft())
    requestApi.fetchActiveFormSchema.mockResolvedValue(runtimeAutofillActiveSchema)
    requestApi.fetchRuntimeAutofillSuggestions.mockResolvedValue({
      matched: false,
      suggestedValues: {},
    })
  })

  it('applies configured canonical suggestions and marks a later manual target edit', async () => {
    requestApi.fetchRuntimeAutofillSuggestions.mockResolvedValueOnce({
      matched: true,
      suggestedValues: { product: 'New Product' },
    })

    let page = await loadDraft()
    const onChange = getFormRenderer(page).props.onChange
    if (typeof onChange !== 'function') {
      throw new Error('Expected editable requester field callback')
    }

    onChange('reference_psf_input', 'REF-PSF-1')
    await flushAsyncWork()
    page = renderDraft()

    expect(requestApi.fetchRuntimeAutofillSuggestions).toHaveBeenCalledWith({
      formKey: 'psf-request',
      field: 'reference_psf_name',
      value: 'REF-PSF-1',
    })
    expect(getFormRenderer(page).props.values).toEqual({
      product_input: 'New Product',
      reference_psf_input: 'REF-PSF-1',
    })
    expect(getFormRenderer(page).props.fieldStatuses).toEqual({
      product_input: 'auto-filled',
    })

    const onAutoFilledChange = getFormRenderer(page).props.onChange
    if (typeof onAutoFilledChange !== 'function') {
      throw new Error('Expected editable target callback')
    }

    onAutoFilledChange('product_input', 'Product chosen by requester')
    page = renderDraft()

    expect(getFormRenderer(page).props.values).toEqual({
      product_input: 'Product chosen by requester',
      reference_psf_input: 'REF-PSF-1',
    })
    expect(getFormRenderer(page).props.fieldStatuses).toEqual({
      product_input: 'edited-by-user',
    })
  })

  it('rejects an older trigger response and protects a target edited during a later lookup', async () => {
    let resolveOlderLookup: ((response: RuntimeAutofillSuggestionsResponse) => void) | undefined
    let resolveNewerLookup: ((response: RuntimeAutofillSuggestionsResponse) => void) | undefined
    requestApi.fetchRuntimeAutofillSuggestions
      .mockImplementationOnce(
        () =>
          new Promise<RuntimeAutofillSuggestionsResponse>((resolve) => {
            resolveOlderLookup = resolve
          }),
      )
      .mockImplementationOnce(
        () =>
          new Promise<RuntimeAutofillSuggestionsResponse>((resolve) => {
            resolveNewerLookup = resolve
          }),
      )

    let page = await loadDraft()
    let onChange = getFormRenderer(page).props.onChange
    if (typeof onChange !== 'function') {
      throw new Error('Expected editable requester field callback')
    }

    onChange('reference_psf_input', 'OLDER-REF')
    page = renderDraft()
    onChange = getFormRenderer(page).props.onChange
    if (typeof onChange !== 'function') {
      throw new Error('Expected newer trigger callback')
    }
    onChange('reference_psf_input', 'NEWER-REF')

    if (!resolveOlderLookup || !resolveNewerLookup) {
      throw new Error('Expected both runtime lookup requests to be pending')
    }
    resolveNewerLookup({ matched: false, suggestedValues: {} })
    await flushAsyncWork()
    resolveOlderLookup({ matched: true, suggestedValues: { product: 'Stale Product' } })
    await flushAsyncWork()
    page = renderDraft()

    expect(getFormRenderer(page).props.values).toEqual({
      product_input: '',
      reference_psf_input: 'NEWER-REF',
    })

    let resolveProtectedLookup: ((response: RuntimeAutofillSuggestionsResponse) => void) | undefined
    requestApi.fetchRuntimeAutofillSuggestions.mockImplementationOnce(
      () =>
        new Promise<RuntimeAutofillSuggestionsResponse>((resolve) => {
          resolveProtectedLookup = resolve
        }),
    )
    onChange = getFormRenderer(page).props.onChange
    if (typeof onChange !== 'function') {
      throw new Error('Expected protected lookup callback')
    }
    onChange('reference_psf_input', 'MANUAL-TARGET-REF')
    page = renderDraft()
    onChange = getFormRenderer(page).props.onChange
    if (typeof onChange !== 'function') {
      throw new Error('Expected target edit callback')
    }
    onChange('product_input', 'Manual target value')

    if (!resolveProtectedLookup) {
      throw new Error('Expected protected lookup request to be pending')
    }
    resolveProtectedLookup({
      matched: true,
      suggestedValues: { product: 'Should not overwrite' },
    })
    await flushAsyncWork()
    page = renderDraft()

    expect(getFormRenderer(page).props.values).toEqual({
      product_input: 'Manual target value',
      reference_psf_input: 'MANUAL-TARGET-REF',
    })
    expect(getFormRenderer(page).props.fieldStatuses).toEqual({})
  })

  it('keeps requester values intact when lookup has no match or fails', async () => {
    requestApi.fetchRuntimeAutofillSuggestions
      .mockResolvedValueOnce({ matched: false, suggestedValues: {} })
      .mockRejectedValueOnce(new Error('Lookup unavailable'))

    let page = await loadDraft()
    let onChange = getFormRenderer(page).props.onChange
    if (typeof onChange !== 'function') {
      throw new Error('Expected editable requester field callback')
    }

    onChange('reference_psf_input', 'NO-MATCH')
    await flushAsyncWork()
    page = renderDraft()
    expect(getFormRenderer(page).props.values).toEqual({
      product_input: '',
      reference_psf_input: 'NO-MATCH',
    })

    onChange = getFormRenderer(page).props.onChange
    if (typeof onChange !== 'function') {
      throw new Error('Expected failed lookup callback')
    }
    onChange('reference_psf_input', 'LOOKUP-ERROR')
    await flushAsyncWork()
    page = renderDraft()

    expect(getFormRenderer(page).props.values).toEqual({
      product_input: '',
      reference_psf_input: 'LOOKUP-ERROR',
    })
    expect(JSON.stringify(page)).toContain('Autofill suggestions could not be loaded: ')
    expect(JSON.stringify(page)).toContain('Lookup unavailable')
  })

  it('does not look up an empty trigger or erase an existing target value', async () => {
    requestApi.fetchPsfRequest.mockResolvedValueOnce(
      buildDraft({
        requesterData: {
          product_input: 'Existing Product',
          reference_psf_input: 'REF-PSF-1',
        },
      }),
    )

    let page = await loadDraft()
    const onChange = getFormRenderer(page).props.onChange
    if (typeof onChange !== 'function') {
      throw new Error('Expected editable requester field callback')
    }

    onChange('reference_psf_input', '')
    page = renderDraft()

    expect(requestApi.fetchRuntimeAutofillSuggestions).not.toHaveBeenCalled()
    expect(getFormRenderer(page).props.values).toEqual({
      product_input: 'Existing Product',
      reference_psf_input: '',
    })
  })

  it('ignores a late response after the request form unmounts', async () => {
    let resolveLookup: ((response: RuntimeAutofillSuggestionsResponse) => void) | undefined
    requestApi.fetchRuntimeAutofillSuggestions.mockImplementationOnce(
      () =>
        new Promise<RuntimeAutofillSuggestionsResponse>((resolve) => {
          resolveLookup = resolve
        }),
    )

    let page = await loadDraft()
    const onChange = getFormRenderer(page).props.onChange
    if (typeof onChange !== 'function') {
      throw new Error('Expected editable requester field callback')
    }

    onChange('reference_psf_input', 'LATE-REF')
    if (!resolveLookup) {
      throw new Error('Expected runtime lookup request to be pending')
    }

    hookHarness.unmount()
    resolveLookup({ matched: true, suggestedValues: { product: 'Must not apply after unmount' } })
    await flushAsyncWork()
    page = renderDraft()

    expect(getFormRenderer(page).props.values).toEqual({
      product_input: '',
      reference_psf_input: 'LATE-REF',
    })
    expect(getFormRenderer(page).props.fieldStatuses).toEqual({})
  })

  it('keeps preview and submitted requester forms read-only without starting a lookup', async () => {
    let page = await loadPreview()
    expect(getFormRenderer(page).props.onChange).toBeUndefined()

    hookHarness.reset()
    requestApi.fetchPsfRequest.mockResolvedValueOnce(buildDraft({ status: 'Submitted' }))
    page = await loadDraft()

    expect(getFormRenderer(page).props.onChange).toBeUndefined()
    expect(requestApi.fetchRuntimeAutofillSuggestions).not.toHaveBeenCalled()
  })
})
