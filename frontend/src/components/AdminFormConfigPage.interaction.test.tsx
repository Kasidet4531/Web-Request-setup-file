import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '../services/api'
import type {
  FormSchemaDraft,
  FormSchemaVersionListResponse,
  FormSchemaVersionResponse,
} from '../types/forms'
import {
  AdminFormConfigFeedback,
  AdminFormConfigPage,
  AdminFormConfigPreview,
  AdminFormConfigVersionSelector,
} from './AdminFormConfigPage'

const formConfigApi = vi.hoisted(() => ({
  fetchAdminFormConfig: vi.fn(),
  publishAdminFormConfigDraft: vi.fn(),
  saveAdminFormConfigDraft: vi.fn(),
}))

const formConfigHookHarness = vi.hoisted(() => {
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
    api: formConfigApi,
  }
})

vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react')>()

  return {
    ...actual,
    useEffect: formConfigHookHarness.useEffect,
    useMemo: formConfigHookHarness.useMemo,
    useRef: formConfigHookHarness.useRef,
    useState: formConfigHookHarness.useState,
  }
})

interface RenderedElement {
  props: Record<string, unknown>
  type: unknown
}

const editableSchema: FormSchemaDraft = {
  formKey: 'psf-request',
  title: 'PSF Request Form',
  sections: [
    {
      sectionKey: 'requester_information',
      title: 'Requester Information',
      visibleTo: ['requester', 'setup_owner', 'admin'],
      fields: [
        {
          fieldKey: 'product_type',
          canonicalKey: 'product_type',
          label: 'Product Type',
          type: 'radio',
          required: true,
          options: ['New Product', 'Transfer Product'],
        },
        {
          fieldKey: 'request_note',
          canonicalKey: 'request_note',
          label: 'Request note',
          type: 'textarea',
          required: false,
        },
      ],
    },
  ],
}

function buildVersion(overrides: Partial<FormSchemaVersionResponse> = {}): FormSchemaVersionResponse {
  return {
    createdAt: '2026-08-05T00:00:00.000Z',
    createdBy: 'admin.demo',
    description: 'Keep this description',
    formKey: 'psf-request',
    publishedAt: null,
    schema: { ...editableSchema, version: 2 },
    status: 'draft',
    title: editableSchema.title,
    version: 2,
    ...overrides,
  }
}

function buildList(versions: FormSchemaVersionResponse[]): FormSchemaVersionListResponse {
  return { formKey: 'psf-request', versions }
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

function renderAdminFormConfigPage() {
  formConfigHookHarness.beginRender()
  return AdminFormConfigPage()
}

async function flushAsyncWork(): Promise<void> {
  await new Promise<void>((resolve) => setTimeout(resolve, 0))
}

async function loadAdminFormConfigPage() {
  renderAdminFormConfigPage()
  formConfigHookHarness.runEffects()
  await flushAsyncWork()
  return renderAdminFormConfigPage()
}

function getButton(page: unknown, label: string): RenderedElement {
  return requireRenderedElement(
    page,
    (element) => element.type === 'button' && element.props.children === label,
  )
}

function getEditor(page: unknown): RenderedElement {
  return requireRenderedElement(page, (element) => element.type === 'textarea' && element.props.id === 'form-config-json')
}

function getFeedback(page: unknown): RenderedElement {
  return requireRenderedElement(page, (element) => element.type === AdminFormConfigFeedback)
}

function getPreview(page: unknown): RenderedElement {
  return requireRenderedElement(page, (element) => element.type === AdminFormConfigPreview)
}

function getVersionSelector(page: unknown): RenderedElement {
  return requireRenderedElement(page, (element) => element.type === AdminFormConfigVersionSelector)
}

const originalWindowDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'window')

afterEach(() => {
  if (originalWindowDescriptor) {
    Object.defineProperty(globalThis, 'window', originalWindowDescriptor)
  } else {
    Reflect.deleteProperty(globalThis, 'window')
  }
})

describe('AdminFormConfigPage interactions', () => {
  beforeEach(() => {
    formConfigApi.fetchAdminFormConfig.mockReset()
    formConfigApi.publishAdminFormConfigDraft.mockReset()
    formConfigApi.saveAdminFormConfigDraft.mockReset()
    formConfigHookHarness.reset()
  })

  it('loads the draft, saves valid edited JSON once, refetches, and selects the returned draft', async () => {
    const active = buildVersion({ schema: { ...editableSchema, version: 1 }, status: 'active', version: 1 })
    const draft = buildVersion()
    const savedDraft = buildVersion({
      schema: { ...editableSchema, title: 'Updated PSF Request Form', version: 4 },
      title: 'Updated PSF Request Form',
      version: 4,
    })
    formConfigApi.fetchAdminFormConfig
      .mockResolvedValueOnce(buildList([draft, active]))
      .mockResolvedValueOnce(buildList([savedDraft, active]))
    formConfigApi.saveAdminFormConfigDraft.mockResolvedValue(savedDraft)

    let page = await loadAdminFormConfigPage()
    expect(getVersionSelector(page).props.selectedVersion).toBe(draft)
    expect(getPreview(page).props.schema).toMatchObject({ version: 2 })

    const editor = getEditor(page)
    const onChange = editor.props.onChange
    if (typeof onChange !== 'function') {
      throw new Error('Expected JSON editor change callback')
    }
    onChange({ target: { value: JSON.stringify({ ...editableSchema, title: 'Updated PSF Request Form' }) } })
    page = renderAdminFormConfigPage()

    const save = getButton(page, 'Save draft').props.onClick
    if (typeof save !== 'function') {
      throw new Error('Expected save callback')
    }
    save()
    save()
    expect(formConfigApi.saveAdminFormConfigDraft).toHaveBeenCalledTimes(1)
    expect(getButton(renderAdminFormConfigPage(), 'Saving draft…').props.disabled).toBe(true)

    await flushAsyncWork()
    page = renderAdminFormConfigPage()

    expect(formConfigApi.saveAdminFormConfigDraft).toHaveBeenCalledWith({
      description: 'Keep this description',
      schema: { ...editableSchema, title: 'Updated PSF Request Form' },
    })
    expect(formConfigApi.fetchAdminFormConfig).toHaveBeenCalledTimes(2)
    expect(getVersionSelector(page).props.selectedVersion).toBe(savedDraft)
    expect(JSON.parse(getEditor(page).props.value as string)).toEqual({
      ...editableSchema,
      title: 'Updated PSF Request Form',
    })
    expect(getFeedback(page).props.feedback).toEqual({ kind: 'success', message: 'Draft version 4 saved.' })
  })

  it('keeps edited text and surfaces a save failure accessibly', async () => {
    const draft = buildVersion()
    const editedText = JSON.stringify({ ...editableSchema, title: 'Retry this schema' })
    formConfigApi.fetchAdminFormConfig.mockResolvedValueOnce(buildList([draft]))
    formConfigApi.saveAdminFormConfigDraft.mockRejectedValue(new ApiError('Schema validation failed.', 400, 'Bad Request', null))

    let page = await loadAdminFormConfigPage()
    const onChange = getEditor(page).props.onChange
    if (typeof onChange !== 'function') {
      throw new Error('Expected JSON editor change callback')
    }
    onChange({ target: { value: editedText } })
    page = renderAdminFormConfigPage()

    const save = getButton(page, 'Save draft').props.onClick
    if (typeof save !== 'function') {
      throw new Error('Expected save callback')
    }
    save()
    await flushAsyncWork()
    page = renderAdminFormConfigPage()

    expect(formConfigApi.saveAdminFormConfigDraft).toHaveBeenCalledTimes(1)
    expect(getEditor(page).props.value).toBe(editedText)
    expect(getFeedback(page).props.feedback).toEqual({ kind: 'error', message: 'Schema validation failed.' })
  })

  it('publishes only the clean selected draft once, refetches, and selects the returned active version', async () => {
    const draft = buildVersion()
    const previousActive = buildVersion({ schema: { ...editableSchema, version: 1 }, status: 'published', version: 1 })
    const published = buildVersion({
      publishedAt: '2026-08-05T01:00:00.000Z',
      schema: { ...editableSchema, version: 2 },
      status: 'active',
    })
    formConfigApi.fetchAdminFormConfig
      .mockResolvedValueOnce(buildList([draft, previousActive]))
      .mockResolvedValueOnce(buildList([published, previousActive]))
    formConfigApi.publishAdminFormConfigDraft.mockResolvedValue(published)

    let page = await loadAdminFormConfigPage()
    expect(getButton(page, 'Publish selected draft').props.disabled).toBe(false)

    const publish = getButton(page, 'Publish selected draft').props.onClick
    if (typeof publish !== 'function') {
      throw new Error('Expected publish callback')
    }
    publish()
    publish()
    expect(formConfigApi.publishAdminFormConfigDraft).toHaveBeenCalledTimes(1)
    expect(getButton(renderAdminFormConfigPage(), 'Publishing…').props.disabled).toBe(true)

    await flushAsyncWork()
    page = renderAdminFormConfigPage()

    expect(formConfigApi.publishAdminFormConfigDraft).toHaveBeenCalledWith({ version: 2 })
    expect(formConfigApi.fetchAdminFormConfig).toHaveBeenCalledTimes(2)
    expect(getVersionSelector(page).props.selectedVersion).toBe(published)
    expect(getPreview(page).props.schema).toMatchObject({ version: 2 })
    expect(getFeedback(page).props.feedback).toEqual({
      kind: 'success',
      message: 'Version 2 published and is now active.',
    })
  })

  it('disables publish for dirty or invalid JSON, preserves unsaved text when a version switch is declined, and surfaces publish failures', async () => {
    const draft = buildVersion()
    const active = buildVersion({ schema: { ...editableSchema, version: 1 }, status: 'active', version: 1 })
    const editedText = JSON.stringify({ ...editableSchema, title: 'Unsaved changes' })
    const confirm = vi.fn(() => false)
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: { confirm },
      writable: true,
    })
    formConfigApi.fetchAdminFormConfig.mockResolvedValueOnce(buildList([draft, active]))

    let page = await loadAdminFormConfigPage()
    const onChange = getEditor(page).props.onChange
    if (typeof onChange !== 'function') {
      throw new Error('Expected JSON editor change callback')
    }
    onChange({ target: { value: editedText } })
    page = renderAdminFormConfigPage()

    expect(getButton(page, 'Publish selected draft').props.disabled).toBe(true)
    const selectVersion = getVersionSelector(page).props.onSelect
    if (typeof selectVersion !== 'function') {
      throw new Error('Expected version selector callback')
    }
    selectVersion(1)
    page = renderAdminFormConfigPage()

    expect(confirm).toHaveBeenCalledWith('Discard unsaved schema changes and switch versions?')
    expect(getVersionSelector(page).props.selectedVersion).toBe(draft)
    expect(getEditor(page).props.value).toBe(editedText)

    const reload = getButton(page, 'Reload versions').props.onClick
    if (typeof reload !== 'function') {
      throw new Error('Expected reload callback')
    }
    reload()
    expect(confirm).toHaveBeenLastCalledWith('Discard unsaved schema changes and reload stored versions?')
    expect(formConfigApi.fetchAdminFormConfig).toHaveBeenCalledTimes(1)

    onChange({ target: { value: '{' } })
    page = renderAdminFormConfigPage()
    expect(getButton(page, 'Save draft').props.disabled).toBe(true)
    expect(getButton(page, 'Publish selected draft').props.disabled).toBe(true)

    onChange({ target: { value: JSON.stringify(editableSchema, null, 2) } })
    page = renderAdminFormConfigPage()
    const publish = getButton(page, 'Publish selected draft').props.onClick
    if (typeof publish !== 'function') {
      throw new Error('Expected publish callback')
    }
    formConfigApi.publishAdminFormConfigDraft.mockRejectedValue(
      new ApiError('Draft is no longer publishable.', 409, 'Conflict', null),
    )
    publish()
    await flushAsyncWork()
    page = renderAdminFormConfigPage()

    expect(formConfigApi.publishAdminFormConfigDraft).toHaveBeenCalledWith({ version: 2 })
    expect(getFeedback(page).props.feedback).toEqual({ kind: 'error', message: 'Draft is no longer publishable.' })
  })

  it('shows the server-authoritative admin authorization message after a management request is rejected', async () => {
    formConfigApi.fetchAdminFormConfig.mockRejectedValue(
      new ApiError('Only admins can manage form schema configurations.', 403, 'Forbidden', null),
    )

    const page = await loadAdminFormConfigPage()
    expect(getFeedback(page).props.feedback).toEqual({
      kind: 'error',
      message: 'You do not have permission to manage form configuration. The server enforces administrator authorization. Only admins can manage form schema configurations.',
    })
  })
})
