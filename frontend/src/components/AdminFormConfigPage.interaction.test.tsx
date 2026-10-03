import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '../services/api'
import { AdminFormConfigEditor, AdminFormConfigFieldEditor } from './AdminFormConfigEditor'
import { ConfirmDialog } from './ui/ConfirmDialog'
import type {
  FormKey,
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
  duplicateAdminFormConfigVersion: vi.fn(),
  discardAdminFormConfigDraft: vi.fn(),
  fetchAdminFormConfig: vi.fn(),
  publishAdminFormConfigDraft: vi.fn(),
  saveAdminFormConfigDraft: vi.fn(),
}))
const navigate = vi.hoisted(() => vi.fn())
const setBreadcrumb = vi.hoisted(() => vi.fn())
const blockerHarness = vi.hoisted(() => ({ options: null as unknown }))

vi.mock('@tanstack/react-router', async (importOriginal) => ({
  ...await importOriginal<typeof import('@tanstack/react-router')>(),
  useNavigate: () => navigate,
  useBlocker: (options: unknown) => {
    blockerHarness.options = options
  },
}))

const formConfigHookHarness = vi.hoisted(() => {
  let effectDependencies: Array<readonly unknown[] | undefined> = []
  let effects: Array<{ index: number; effect: () => void | (() => void) }> = []
  let effectCleanups: Array<(() => void) | undefined> = []
  let effectIndex = 0
  let refIndex = 0
  let refs: Array<{ current: unknown }> = []
  let state: unknown[] = []
  let stateIndex = 0

  function cleanupEffects() {
    effectCleanups.forEach((cleanup) => cleanup?.())
    effectCleanups = []
    effects = []
  }

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
      cleanupEffects()
      effectDependencies = []
      effectIndex = 0
      refIndex = 0
      refs = []
      state = []
      stateIndex = 0
    },
    unmount() {
      cleanupEffects()
    },
    runEffects() {
      const pendingEffects = effects
      effects = []
      pendingEffects.forEach(({ index, effect }) => {
        effectCleanups[index]?.()
        const cleanup = effect()
        effectCleanups[index] = typeof cleanup === 'function' ? cleanup : undefined
      })
    },
    useEffect(effect: () => void | (() => void), dependencies?: readonly unknown[]) {
      const index = effectIndex
      if (dependenciesChanged(effectDependencies[index], dependencies)) {
        effects.push({ index, effect })
        effectDependencies[index] = dependencies ? [...dependencies] : undefined
      }
      effectIndex += 1
    },
    useMemo<T>(factory: () => T) {
      return factory()
    },
    useCallback<T extends (...args: never[]) => unknown>(callback: T) {
      return callback
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

      const stateForRender = state
      return [stateForRender[index], (nextState: unknown) => {
        stateForRender[index] =
          typeof nextState === 'function'
            ? (nextState as (currentState: unknown) => unknown)(stateForRender[index])
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
    useContext: () => setBreadcrumb,
    useCallback: formConfigHookHarness.useCallback,
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

function buildPsfCreatedVersion(overrides: Partial<FormSchemaVersionResponse> = {}): FormSchemaVersionResponse {
  const formKey = 'psf-created-information'
  const schema: FormSchemaDraft = {
    formKey,
    title: 'Created details',
    sections: [{
      sectionKey: 'created_details',
      title: 'Created details',
      fields: [{ fieldKey: 'custom_lot_ref', canonicalKey: 'custom_lot_ref', label: 'Custom lot reference', type: 'text', required: true }],
    }],
  }
  const version = overrides.version ?? 7
  return buildVersion({
    ...overrides,
    formKey,
    schema: { ...schema, ...overrides.schema, formKey, version },
    status: overrides.status ?? 'draft',
    title: overrides.title ?? schema.title,
    version,
  })
}

function buildList(versions: FormSchemaVersionResponse[], formKey: FormKey = 'psf-request'): FormSchemaVersionListResponse {
  return { formKey, versions }
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

function renderAdminFormConfigPage(version: string | null = '2', formKey: FormKey = 'psf-request') {
  formConfigHookHarness.beginRender()
  return AdminFormConfigPage({ formKey, version: version ?? undefined })
}

async function flushAsyncWork(): Promise<void> {
  await new Promise<void>((resolve) => setTimeout(resolve, 0))
}

async function loadAdminFormConfigPage(version: string | null = '2', formKey: FormKey = 'psf-request') {
  renderAdminFormConfigPage(version, formKey)
  formConfigHookHarness.runEffects()
  await flushAsyncWork()
  return renderAdminFormConfigPage(version, formKey)
}

function getConfirmation(page: unknown): RenderedElement {
  return requireRenderedElement(page, (element) => element.type === ConfirmDialog)
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

function getVisualEditor(page: unknown): RenderedElement {
  return requireRenderedElement(page, (element) => element.type === AdminFormConfigEditor)
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

function getFormKeySelector(page: unknown): RenderedElement {
  return requireRenderedElement(page, (element) => element.type === 'select' && element.props['aria-label'] === 'Form to manage')
}

type BlockerArgs = {
  action: 'PUSH' | 'REPLACE' | 'BACK' | 'FORWARD' | 'GO'
  current: { pathname: string }
  next: { pathname: string }
}

type BlockerOptions = {
  enableBeforeUnload?: boolean | (() => boolean)
  shouldBlockFn: (args: BlockerArgs) => boolean | Promise<boolean>
}

function getBlockerOptions(): BlockerOptions {
  if (!blockerHarness.options || typeof blockerHarness.options !== 'object') {
    throw new Error('Expected the editor router blocker to be registered')
  }

  return blockerHarness.options as BlockerOptions
}

async function attemptEditorNavigation(
  nextPathname: string,
  action: BlockerArgs['action'] = 'PUSH',
  currentPathname = '/admin/form-config/2',
): Promise<string> {
  const blocked = await getBlockerOptions().shouldBlockFn({
    action,
    current: { pathname: currentPathname },
    next: { pathname: nextPathname },
  })
  return blocked ? currentPathname : nextPathname
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
    formConfigApi.duplicateAdminFormConfigVersion.mockReset()
    formConfigApi.discardAdminFormConfigDraft.mockReset()
    formConfigApi.fetchAdminFormConfig.mockReset()
    formConfigApi.publishAdminFormConfigDraft.mockReset()
    formConfigApi.saveAdminFormConfigDraft.mockReset()
    navigate.mockReset()
    blockerHarness.options = null
    formConfigHookHarness.reset()
    Object.defineProperty(globalThis, 'window', { configurable: true, value: { confirm: vi.fn(() => true) } })
  })

  it('offers shareable family links on the list with the selected family identified', async () => {
    formConfigApi.fetchAdminFormConfig.mockResolvedValueOnce(buildList([buildVersion()]))
    const page = await loadAdminFormConfigPage(null)
    const familyNav = requireRenderedElement(page, (element) => element.type === 'nav' && element.props['aria-label'] === 'Form families')
    const requester = requireRenderedElement(familyNav, (element) => (element.props.search as { formKey?: string } | undefined)?.formKey === 'psf-request')
    const psf = requireRenderedElement(familyNav, (element) => (element.props.search as { formKey?: string } | undefined)?.formKey === 'psf-created-information')
    expect(requester.props.to).toBe('/admin/form-config')
    expect(requester.props['aria-current']).toBe('page')
    expect(psf.props.to).toBe('/admin/form-config')
    expect(psf.props['aria-current']).toBeUndefined()
  })

  it('keeps saved versions unchanged when the native publish or discard dialog is cancelled', async () => {
    const draft = buildVersion()
    formConfigApi.fetchAdminFormConfig.mockResolvedValueOnce(buildList([draft]))
    let page = await loadAdminFormConfigPage(null)
    ;(getVersionSelector(page).props.onPublish as (version: number) => void)(2)
    page = renderAdminFormConfigPage(null)
    expect(getConfirmation(page).props.open).toBe(true)
    expect(getConfirmation(page).props.description).toContain('Already submitted requests keep their saved form snapshot')
    expect(formConfigApi.publishAdminFormConfigDraft).not.toHaveBeenCalled()
    ;(getConfirmation(page).props.onCancel as () => void)()
    page = renderAdminFormConfigPage(null)
    expect(getConfirmation(page).props.open).toBe(false)
    ;(getVersionSelector(page).props.onDiscard as (version: number) => void)(2)
    page = renderAdminFormConfigPage(null)
    expect(getConfirmation(page).props.tone).toBe('danger')
    ;(getConfirmation(page).props.onCancel as () => void)()
    expect(getVersionSelector(renderAdminFormConfigPage(null)).props.versions).toEqual([draft])
    expect(formConfigApi.discardAdminFormConfigDraft).not.toHaveBeenCalled()
    expect(window.confirm).not.toHaveBeenCalled()
  })

  it('routes editor exits through the central blocker instead of an overlapping Back-link guard', async () => {
    formConfigApi.fetchAdminFormConfig.mockResolvedValueOnce(buildList([buildVersion()]))
    const page = await loadAdminFormConfigPage()
    const findBack = (tree: unknown) => requireRenderedElement(tree, (element) => element.props.to === '/admin/form-config' && element.props.className === 'secondary-button')
    const confirm = window.confirm as ReturnType<typeof vi.fn>
    expect(findBack(page).props.onClick).toBeUndefined()

    const editedText = JSON.stringify({ ...editableSchema, title: 'Unsaved' })
    ;(getEditor(page).props.onChange as (event: { target: { value: string } }) => void)({ target: { value: editedText } })
    renderAdminFormConfigPage()
    confirm.mockReturnValue(false)
    expect(await attemptEditorNavigation('/admin/form-config')).toBe('/admin/form-config/2')
    expect(confirm).toHaveBeenCalledWith('Discard unsaved form changes and leave this page?')
    expect(confirm).toHaveBeenCalledOnce()

    confirm.mockReturnValue(true)
    expect(await attemptEditorNavigation('/admin/form-config')).toBe('/admin/form-config')
    expect(confirm).toHaveBeenCalledTimes(2)
    expect(getEditor(renderAdminFormConfigPage()).props.value).toBe(editedText)
  })

  it('guards sidebar, New Request, and browser Back exits once while preserving cancelled edits', async () => {
    formConfigApi.fetchAdminFormConfig.mockResolvedValueOnce(buildList([buildVersion()]))
    const page = await loadAdminFormConfigPage()
    expect(getBlockerOptions().enableBeforeUnload).toBe(false)
    const editedText = JSON.stringify({ ...editableSchema, title: 'Keep these edits' })
    ;(getEditor(page).props.onChange as (event: { target: { value: string } }) => void)({ target: { value: editedText } })
    renderAdminFormConfigPage()
    expect(getBlockerOptions().enableBeforeUnload).toBe(true)

    const confirm = window.confirm as ReturnType<typeof vi.fn>
    confirm.mockReturnValue(false)
    expect(await attemptEditorNavigation('/dashboard')).toBe('/admin/form-config/2')
    expect(confirm).toHaveBeenCalledOnce()
    expect(getEditor(renderAdminFormConfigPage()).props.value).toBe(editedText)

    confirm.mockReturnValue(true)
    expect(await attemptEditorNavigation('/requests/new')).toBe('/requests/new')
    expect(confirm).toHaveBeenCalledTimes(2)

    confirm.mockReturnValue(false)
    expect(await attemptEditorNavigation('/admin/form-config', 'BACK')).toBe('/admin/form-config/2')
    expect(confirm).toHaveBeenCalledTimes(3)
    expect(getBlockerOptions().enableBeforeUnload).toBe(true)
  })

  it('shows the selected active version read-only and duplicates it into a fresh draft', async () => {
    const active = buildVersion({ status: 'active', version: 2 })
    const copied = buildVersion({ status: 'draft', version: 3, schema: { ...editableSchema, version: 3 } })
    formConfigApi.fetchAdminFormConfig.mockResolvedValueOnce(buildList([active])).mockResolvedValueOnce(buildList([copied, active]))
    formConfigApi.duplicateAdminFormConfigVersion.mockResolvedValue(copied)
    let page = await loadAdminFormConfigPage()
    expect(getVisualEditor(page).props.readOnly).toBe(true)
    expect(findRenderedElement(page, (element) => element.type === 'textarea' && element.props.id === 'form-config-json')).toBeNull()
    ;(getVisualEditor(page).props.onChange as (draft: FormSchemaDraft) => void)({ ...editableSchema, title: 'Should not change' })
    page = renderAdminFormConfigPage()
    expect((getVisualEditor(page).props.schema as FormSchemaDraft).title).toBe(editableSchema.title)
    expect(findRenderedElement(page, (element) => element.type === 'button' && element.props.children === 'Save draft')).toBeNull()
    ;(getButton(page, 'Duplicate as draft').props.onClick as () => void)()
    await flushAsyncWork()
    expect(formConfigApi.duplicateAdminFormConfigVersion).toHaveBeenCalledWith({ version: 2 })
    expect(navigate).toHaveBeenCalledWith({ to: '/admin/form-config/$version', params: { version: '3' } })
  })

  it('keeps the selected version and shows the server conflict when a draft appears concurrently', async () => {
    const active = buildVersion({ status: 'active', version: 2 })
    formConfigApi.fetchAdminFormConfig.mockResolvedValueOnce(buildList([active]))
    formConfigApi.duplicateAdminFormConfigVersion.mockRejectedValue(new ApiError('Open or discard the existing draft before duplicating a version.', 409, 'Conflict', null))
    let page = await loadAdminFormConfigPage()
    ;(getButton(page, 'Duplicate as draft').props.onClick as () => void)()
    await flushAsyncWork()
    page = renderAdminFormConfigPage()
    expect(getVisualEditor(page).props.readOnly).toBe(true)
    expect(navigate).not.toHaveBeenCalled()
    expect(getFeedback(page).props.feedback).toMatchObject({ kind: 'error', message: 'Open or discard the existing draft before duplicating a version.' })
  })

  it('confirms discarding a draft and returns to the preserved active version', async () => {
    const draft = buildVersion({ version: 3, schema: { ...editableSchema, version: 3 } })
    const active = buildVersion({ status: 'active', version: 2 })
    formConfigApi.fetchAdminFormConfig.mockResolvedValueOnce(buildList([draft, active])).mockResolvedValueOnce(buildList([active]))
    formConfigApi.discardAdminFormConfigDraft.mockResolvedValue(undefined)
    Object.defineProperty(globalThis, 'window', { configurable: true, value: { confirm: vi.fn(() => true) } })
    let page = await loadAdminFormConfigPage(null)
    ;(getVersionSelector(page).props.onDiscard as (version: number) => void)(3)
    page = renderAdminFormConfigPage(null)
    expect(getConfirmation(page).props.description).toBe('Discard draft v3? This unpublished draft will be permanently deleted.')
    ;(getConfirmation(page).props.onConfirm as () => void)()
    await flushAsyncWork()
    page = renderAdminFormConfigPage(null)
    expect(formConfigApi.discardAdminFormConfigDraft).toHaveBeenCalledWith(3)
    expect(window.confirm).not.toHaveBeenCalled()
    expect(getVersionSelector(page).props.versions).toEqual([active])
  })

  it('publishes a saved Draft from the list only after the version and Draft-request impact are confirmed', async () => {
    const draft = buildVersion()
    const active = buildVersion({ status: 'active', version: 1 })
    const published = buildVersion({ status: 'active', publishedAt: '2026-08-06T00:00:00.000Z' })
    formConfigApi.fetchAdminFormConfig.mockResolvedValueOnce(buildList([draft, active])).mockResolvedValueOnce(buildList([published, { ...active, status: 'published' }]))
    formConfigApi.publishAdminFormConfigDraft.mockResolvedValue(published)
    let page = await loadAdminFormConfigPage(null)
    ;(getVersionSelector(page).props.onPublish as (version: number) => void)(2)
    page = renderAdminFormConfigPage(null)
    const impact = getConfirmation(page).props.description as string
    ;(getConfirmation(page).props.onConfirm as () => void)()
    await flushAsyncWork()
    page = renderAdminFormConfigPage(null)
    expect(impact).toContain('New requests will use v2')
    expect(impact).toContain('Existing Draft requests keep their current version and must be explicitly upgraded before they can be submitted.')
    expect(impact).toContain('Already submitted requests keep their saved form snapshot')
    expect(formConfigApi.publishAdminFormConfigDraft).toHaveBeenCalledWith({ version: 2 })
    expect(getVersionSelector(page).props.versions).toEqual([published, { ...active, status: 'published' }])
  })

  it('duplicates from the list once and opens the new Draft editor', async () => {
    const active = buildVersion({ status: 'active', version: 2 })
    const draft = buildVersion({ version: 3 })
    formConfigApi.fetchAdminFormConfig.mockResolvedValueOnce(buildList([active])).mockResolvedValueOnce(buildList([draft, active]))
    formConfigApi.duplicateAdminFormConfigVersion.mockResolvedValue(draft)
    const page = await loadAdminFormConfigPage(null)
    ;(getVersionSelector(page).props.onDuplicate as (version: number) => void)(2)
    ;(getVersionSelector(page).props.onDuplicate as (version: number) => void)(2)
    await flushAsyncWork()
    expect(formConfigApi.duplicateAdminFormConfigVersion).toHaveBeenCalledTimes(1)
    expect(navigate).toHaveBeenCalledWith({ to: '/admin/form-config/$version', params: { version: '3' } })
  })

  it('does not duplicate the version breadcrumb inside the editor body', async () => {
    formConfigApi.fetchAdminFormConfig.mockResolvedValueOnce(buildList([buildVersion()]))
    const page = await loadAdminFormConfigPage()
    expect(findRenderedElement(page, (element) => element.type === 'nav' && element.props['aria-label'] === 'Form version breadcrumbs')).toBeNull()
    formConfigHookHarness.runEffects()
    expect(setBreadcrumb).toHaveBeenCalledWith({ formKey: 'psf-request', version: 2, status: 'draft', dirty: false })
  })

  it('uses the visual editor as the primary draft editor and keeps advanced JSON optional', async () => {
    formConfigApi.fetchAdminFormConfig.mockResolvedValueOnce(buildList([buildVersion()]))
    let page = await loadAdminFormConfigPage()
    expect(getVisualEditor(page).props.schema).toEqual(editableSchema)
    expect(requireRenderedElement(page, (element) => element.type === 'details' && element.props.className === 'admin-form-config__advanced').props.open).not.toBe(true)

    const change = getVisualEditor(page).props.onChange as (draft: FormSchemaDraft) => void
    change({ ...editableSchema, title: '' })
    page = renderAdminFormConfigPage()
    expect((getVisualEditor(page).props.schema as FormSchemaDraft).title).toBe('')
    expect(getButton(page, 'Save draft').props.disabled).toBe(true)
    expect(JSON.parse(getEditor(page).props.value as string).title).toBe('')

    change({ ...editableSchema, title: 'Renamed form' })
    page = renderAdminFormConfigPage()
    expect((getVisualEditor(page).props.schema as FormSchemaDraft).title).toBe('Renamed form')
    expect(getButton(page, 'Save draft').props.disabled).toBe(false)
  })

  it('opens preview from the toolbar and uses the unsaved draft', async () => {
    formConfigApi.fetchAdminFormConfig.mockResolvedValueOnce(buildList([buildVersion()]))

    let page = await loadAdminFormConfigPage()
    const preview = requireRenderedElement(
      page,
      (element) => element.type === 'dialog' && element.props.className === 'admin-form-config__preview-dialog',
    )
    expect(preview.props['aria-labelledby']).toBe('form-config-preview-title')
    expect(getPreview(preview.props.children).props.schema).toMatchObject({ version: 2 })
    expect(getButton(page, 'Preview form').props.disabled).toBe(false)
    ;(getVisualEditor(page).props.onChange as (draft: FormSchemaDraft) => void)({ ...editableSchema, title: 'Unsaved form' })
    page = renderAdminFormConfigPage()
    expect(getPreview(page).props.schema).toMatchObject({ title: 'Unsaved form' })
    expect(getEditor(page).props.id).toBe('form-config-json')
    expect(getButton(page, 'Save draft').props.disabled).toBe(false)
    expect(findRenderedElement(page, (element) => element.type === 'button' && element.props.children === 'Reload versions')).toBeNull()
  })

  it('applies a field edit to the page draft only after confirmation and discards cancelled edits', async () => {
    formConfigApi.fetchAdminFormConfig.mockResolvedValueOnce(buildList([buildVersion()]))
    let page = await loadAdminFormConfigPage()
    let open = getVisualEditor(page).props.onEditField as (section: number, index: number | null, field: FormSchemaDraft['sections'][number]['fields'][number], trigger: HTMLButtonElement) => void
    open(0, 0, editableSchema.sections[0].fields[0], { focus: vi.fn() } as unknown as HTMLButtonElement)
    page = renderAdminFormConfigPage()
    const fieldEditor = requireRenderedElement(page, (element) => element.type === AdminFormConfigFieldEditor)
    ;(fieldEditor.props.onChange as (field: FormSchemaDraft['sections'][number]['fields'][number]) => void)({ ...editableSchema.sections[0].fields[0], label: 'Edited label' })
    page = renderAdminFormConfigPage()
    expect((getVisualEditor(page).props.schema as FormSchemaDraft).sections[0].fields[0].label).toBe('Product Type')
    ;(requireRenderedElement(page, (element) => element.type === AdminFormConfigFieldEditor).props.onApply as () => void)()
    page = renderAdminFormConfigPage()
    expect((getVisualEditor(page).props.schema as FormSchemaDraft).sections[0].fields[0].label).toBe('Edited label')
    expect(formConfigApi.saveAdminFormConfigDraft).not.toHaveBeenCalled()

    open = getVisualEditor(page).props.onEditField as typeof open
    open(0, 1, editableSchema.sections[0].fields[1], { focus: vi.fn() } as unknown as HTMLButtonElement)
    page = renderAdminFormConfigPage()
    ;(requireRenderedElement(page, (element) => element.type === AdminFormConfigFieldEditor).props.onChange as (field: FormSchemaDraft['sections'][number]['fields'][number]) => void)({ ...editableSchema.sections[0].fields[1], label: 'Discarded' })
    page = renderAdminFormConfigPage()
    ;(requireRenderedElement(page, (element) => element.type === 'dialog' && element.props.className === 'admin-form-config__field-dialog').props.onClose as () => void)()
    page = renderAdminFormConfigPage()
    expect((getVisualEditor(page).props.schema as FormSchemaDraft).sections[0].fields[1].label).toBe('Request note')
  })

  it('keeps new fields out of the draft until Apply and confirms removal in the modal', async () => {
    formConfigApi.fetchAdminFormConfig.mockResolvedValueOnce(buildList([buildVersion()]))
    Object.defineProperty(globalThis, 'window', { configurable: true, value: { confirm: vi.fn(() => false) } })
    let page = await loadAdminFormConfigPage()
    const open = getVisualEditor(page).props.onEditField as (section: number, index: number | null, field: FormSchemaDraft['sections'][number]['fields'][number], trigger: HTMLButtonElement) => void
    const newField = { fieldKey: 'field_1', canonicalKey: 'field_1', label: 'New field', type: 'text' as const, required: false }
    open(0, null, newField, { focus: vi.fn() } as unknown as HTMLButtonElement)
    page = renderAdminFormConfigPage()
    expect((getVisualEditor(page).props.schema as FormSchemaDraft).sections[0].fields).toHaveLength(2)
    ;(requireRenderedElement(page, (element) => element.type === AdminFormConfigFieldEditor).props.onApply as () => void)()
    page = renderAdminFormConfigPage()
    expect((getVisualEditor(page).props.schema as FormSchemaDraft).sections[0].fields[2]).toEqual(newField)
    expect(formConfigApi.saveAdminFormConfigDraft).not.toHaveBeenCalled()

    open(0, 2, newField, { focus: vi.fn() } as unknown as HTMLButtonElement)
    page = renderAdminFormConfigPage()
    const remove = requireRenderedElement(page, (element) => element.type === AdminFormConfigFieldEditor).props.onRemove as () => void
    remove()
    expect((getVisualEditor(renderAdminFormConfigPage()).props.schema as FormSchemaDraft).sections[0].fields).toHaveLength(3)
    ;(window.confirm as ReturnType<typeof vi.fn>).mockReturnValue(true)
    remove()
    page = renderAdminFormConfigPage()
    expect((getVisualEditor(page).props.schema as FormSchemaDraft).sections[0].fields).toHaveLength(2)
  })

  it('loads the draft, saves valid edited JSON once, refetches, and selects the returned draft', async () => {
    const active = buildVersion({ schema: { ...editableSchema, version: 1 }, status: 'active', version: 1 })
    const draft = buildVersion()
    const savedDraft = buildVersion({
      schema: { ...editableSchema, title: 'Updated PSF Request Form', version: 2 },
      title: 'Updated PSF Request Form',
      version: 2,
    })
    formConfigApi.fetchAdminFormConfig
      .mockResolvedValueOnce(buildList([draft, active]))
      .mockResolvedValueOnce(buildList([savedDraft, active]))
    formConfigApi.saveAdminFormConfigDraft.mockResolvedValue(savedDraft)

    let page = await loadAdminFormConfigPage()
    expect(getVisualEditor(page).props.schema).toEqual(editableSchema)
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
      draftVersion: 2,
      description: 'Keep this description',
      schema: { ...editableSchema, title: 'Updated PSF Request Form' },
    })
    expect(formConfigApi.fetchAdminFormConfig).toHaveBeenCalledTimes(2)
    expect(getVisualEditor(page).props.schema).toMatchObject({ title: savedDraft.title })
    expect(JSON.parse(getEditor(page).props.value as string)).toEqual({
      ...editableSchema,
      title: 'Updated PSF Request Form',
    })
    expect(getFeedback(page).props.feedback).toEqual({ kind: 'success', message: 'Draft version 2 saved.' })
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
    expect(getButton(page, 'Publish').props.disabled).toBe(false)

    const publish = getButton(page, 'Publish').props.onClick
    if (typeof publish !== 'function') {
      throw new Error('Expected publish callback')
    }
    publish()
    page = renderAdminFormConfigPage()
    const confirmPublish = getConfirmation(page).props.onConfirm as () => void
    confirmPublish()
    confirmPublish()
    expect(getConfirmation(renderAdminFormConfigPage()).props.pending).toBe(true)
    expect(formConfigApi.publishAdminFormConfigDraft).toHaveBeenCalledTimes(1)
    expect(getButton(renderAdminFormConfigPage(), 'Publishing…').props.disabled).toBe(true)

    await flushAsyncWork()
    page = renderAdminFormConfigPage()

    expect(formConfigApi.publishAdminFormConfigDraft).toHaveBeenCalledWith({ version: 2 })
    expect(formConfigApi.fetchAdminFormConfig).toHaveBeenCalledTimes(2)
    expect(getVisualEditor(page).props.readOnly).toBe(true)
    expect(findRenderedElement(page, (element) => element.type === 'textarea' && element.props.id === 'form-config-json')).toBeNull()
    expect(getPreview(page).props.schema).toMatchObject({ version: 2 })
    expect(getFeedback(page).props.feedback).toEqual({
      kind: 'success',
      message: 'Version 2 published and is now active.',
    })
  })

  it('blocks dirty or invalid publish, confirms navigation and publish, and surfaces server failures', async () => {
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

    expect(getButton(page, 'Publish').props.disabled).toBe(true)
    formConfigHookHarness.runEffects()
    expect(setBreadcrumb).toHaveBeenCalledWith({ formKey: 'psf-request', version: 2, status: 'draft', dirty: true })
    expect(getEditor(page).props.value).toBe(editedText)
    expect(formConfigApi.fetchAdminFormConfig).toHaveBeenCalledTimes(1)

    onChange({ target: { value: '{' } })
    page = renderAdminFormConfigPage()
    expect(getButton(page, 'Save draft').props.disabled).toBe(true)
    expect(getButton(page, 'Publish').props.disabled).toBe(true)

    onChange({ target: { value: JSON.stringify(editableSchema, null, 2) } })
    page = renderAdminFormConfigPage()
    const publish = getButton(page, 'Publish').props.onClick
    if (typeof publish !== 'function') {
      throw new Error('Expected publish callback')
    }
    formConfigApi.publishAdminFormConfigDraft.mockRejectedValue(
      new ApiError('Draft is no longer publishable.', 409, 'Conflict', null),
    )
    publish()
    expect(formConfigApi.publishAdminFormConfigDraft).not.toHaveBeenCalled()
    ;(getConfirmation(renderAdminFormConfigPage()).props.onCancel as () => void)()
    publish()
    const impact = getConfirmation(renderAdminFormConfigPage()).props.description as string
    ;(getConfirmation(renderAdminFormConfigPage()).props.onConfirm as () => void)()
    await flushAsyncWork()
    page = renderAdminFormConfigPage()

    expect(formConfigApi.publishAdminFormConfigDraft).toHaveBeenCalledWith({ version: 2 })
    expect(impact).toContain('Existing Draft requests keep their current version and must be explicitly upgraded')
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

  it('loads and previews only the selected PSF Created Information family', async () => {
    const formKey = 'psf-created-information'
    const draft = buildPsfCreatedVersion()
    formConfigApi.fetchAdminFormConfig.mockResolvedValueOnce(buildList([draft], formKey))

    const page = await loadAdminFormConfigPage('7', formKey)

    expect(formConfigApi.fetchAdminFormConfig).toHaveBeenCalledWith(formKey)
    expect(getVisualEditor(page).props.schema).toMatchObject({ formKey, title: 'Created details' })
    expect(getPreview(page).props.schema).toMatchObject({ formKey, version: 7 })
  })

  it('fails closed when an older backend returns requester configuration for the PSF selection', async () => {
    formConfigApi.fetchAdminFormConfig.mockResolvedValueOnce(buildList([buildVersion()]))

    const page = await loadAdminFormConfigPage('2', 'psf-created-information')

    expect(findRenderedElement(page, (element) => element.type === AdminFormConfigEditor)).toBeNull()
    expect(getFeedback(page).props.feedback).toMatchObject({ kind: 'error' })
    expect(findRenderedElement(page, (element) => element.type === 'h1' && element.props.children === 'v2 · PSF Request Form')).toBeNull()
  })

  it('routes a dirty form-family switch through the central blocker exactly once', async () => {
    const formKey = 'psf-created-information'
    formConfigApi.fetchAdminFormConfig.mockResolvedValueOnce(buildList([buildPsfCreatedVersion()], formKey))
    let page = await loadAdminFormConfigPage('7', formKey)
    const editor = getEditor(page)
    ;(editor.props.onChange as (event: { target: { value: string } }) => void)({ target: { value: JSON.stringify({ ...buildPsfCreatedVersion().schema, title: 'Unsaved PSF schema' }) } })
    page = renderAdminFormConfigPage('7', formKey)
    const confirm = window.confirm as ReturnType<typeof vi.fn>
    confirm.mockReturnValue(false)
    ;(getFormKeySelector(page).props.onChange as (event: { target: { value: FormKey } }) => void)({ target: { value: 'psf-request' } })
    expect(navigate).toHaveBeenCalledWith({ to: '/admin/form-config', search: { formKey: 'psf-request' } })
    expect(confirm).not.toHaveBeenCalled()
    expect(await attemptEditorNavigation('/admin/form-config', 'PUSH', '/admin/form-config/psf-created-information/7'))
      .toBe('/admin/form-config/psf-created-information/7')
    expect(confirm).toHaveBeenCalledWith('Discard unsaved form changes and leave this page?')
    expect(confirm).toHaveBeenCalledOnce()

    confirm.mockReturnValue(true)
    ;(getFormKeySelector(page).props.onChange as (event: { target: { value: FormKey } }) => void)({ target: { value: 'psf-request' } })
    expect(navigate).toHaveBeenCalledTimes(2)
    expect(await attemptEditorNavigation('/admin/form-config', 'PUSH', '/admin/form-config/psf-created-information/7'))
      .toBe('/admin/form-config')
    expect(confirm).toHaveBeenCalledTimes(2)
  })

  it('duplicates a PSF version and opens its explicit form-key editor URL', async () => {
    const formKey = 'psf-created-information'
    const active = buildPsfCreatedVersion({ status: 'active' })
    const draft = buildPsfCreatedVersion({ version: 8 })
    formConfigApi.fetchAdminFormConfig.mockResolvedValueOnce(buildList([active], formKey))
    formConfigApi.duplicateAdminFormConfigVersion.mockResolvedValue(draft)
    const page = await loadAdminFormConfigPage(null, formKey)

    ;(getVersionSelector(page).props.onDuplicate as (version: number) => void)(7)
    await flushAsyncWork()

    expect(formConfigApi.duplicateAdminFormConfigVersion).toHaveBeenCalledWith({ version: 7 }, formKey)
    expect(navigate).toHaveBeenCalledWith({ to: '/admin/form-config/$formKey/$version', params: { formKey, version: '8' } })
  })

  it('does not let a deferred duplicate from an unmounted same-version editor navigate or set new-page feedback', async () => {
    const formKey = 'psf-created-information'
    const active = buildPsfCreatedVersion({ status: 'active' })
    const draft = buildPsfCreatedVersion({ version: 8 })
    let resolveDuplicate!: (value: FormSchemaVersionResponse) => void
    const duplicateResponse = new Promise<FormSchemaVersionResponse>((resolve) => {
      resolveDuplicate = resolve
    })
    formConfigApi.fetchAdminFormConfig
      .mockResolvedValueOnce(buildList([active], formKey))
      .mockResolvedValueOnce(buildList([active], formKey))
    formConfigApi.duplicateAdminFormConfigVersion.mockReturnValueOnce(duplicateResponse)

    const oldPage = await loadAdminFormConfigPage('7', formKey)
    ;(getButton(oldPage, 'Duplicate as draft').props.onClick as () => void)()
    expect(getFeedback(renderAdminFormConfigPage('7', formKey)).props.loading).toBe(true)

    formConfigHookHarness.unmount()
    formConfigHookHarness.reset()
    const currentPage = await loadAdminFormConfigPage('7', formKey)
    expect(getFeedback(currentPage).props.feedback).toBeNull()

    resolveDuplicate(draft)
    await flushAsyncWork()

    expect(navigate).not.toHaveBeenCalled()
    expect(getFeedback(renderAdminFormConfigPage('7', formKey)).props.feedback).toBeNull()
  })

  it('keeps active PSF versions read-only while previewing the selected family', async () => {
    const formKey = 'psf-created-information'
    formConfigApi.fetchAdminFormConfig.mockResolvedValueOnce(buildList([buildPsfCreatedVersion({ status: 'active' })], formKey))

    const page = await loadAdminFormConfigPage('7', formKey)

    expect(getVisualEditor(page).props.readOnly).toBe(true)
    expect(findRenderedElement(page, (element) => element.type === 'textarea' && element.props.id === 'form-config-json')).toBeNull()
    expect(getPreview(page).props.schema).toMatchObject({ formKey, version: 7 })
    expect(findRenderedElement(page, (element) => element.props.className === 'page-card__eyebrow' && element.props.children === 'PSF Created Information')).not.toBeNull()
    expect(findRenderedElement(page, (element) => element.type === 'h1' && element.props.id === 'form-config-editor-heading')?.props.children).toBe(buildPsfCreatedVersion().title)
    expect(findRenderedElement(page, (element) => element.props.className === 'admin-form-config__version-stamp')?.props.children).toEqual(['v', 7])
  })

  it('saves and publishes a PSF draft with family-scoped lifecycle calls and matching preview metadata', async () => {
    const formKey = 'psf-created-information'
    const draft = buildPsfCreatedVersion()
    const savedSchema: FormSchemaDraft = {
      formKey: draft.schema.formKey,
      title: 'Updated created details',
      sections: draft.schema.sections,
    }
    const saved = buildPsfCreatedVersion({ title: savedSchema.title, schema: { ...savedSchema, version: 7 } })
    const active = buildPsfCreatedVersion({ ...saved, status: 'active' })
    formConfigApi.fetchAdminFormConfig
      .mockResolvedValueOnce(buildList([draft], formKey))
      .mockResolvedValueOnce(buildList([saved], formKey))
      .mockResolvedValueOnce(buildList([active], formKey))
    formConfigApi.saveAdminFormConfigDraft.mockResolvedValue(saved)
    formConfigApi.publishAdminFormConfigDraft.mockResolvedValue(active)
    let page = await loadAdminFormConfigPage('7', formKey)
    expect(getPreview(page).props.schema).toMatchObject({ formKey, version: 7 })
    ;(getVisualEditor(page).props.onChange as (schema: FormSchemaDraft) => void)({ ...draft.schema, title: 'Updated created details' })
    page = renderAdminFormConfigPage('7', formKey)
    ;(getButton(page, 'Save draft').props.onClick as () => void)()
    await flushAsyncWork()
    page = renderAdminFormConfigPage('7', formKey)

    expect(formConfigApi.saveAdminFormConfigDraft).toHaveBeenCalledWith({ draftVersion: 7, description: 'Keep this description', schema: savedSchema }, formKey)
    expect(getPreview(page).props.schema).toMatchObject({ formKey, title: 'Updated created details' })
    ;(getButton(page, 'Publish').props.onClick as () => void)()
    page = renderAdminFormConfigPage('7', formKey)
    expect(getConfirmation(page).props.description).toBe('Publish PSF Created Information v7? New requests will use this PSF version. Existing requests keep their current PSF form and data and are not upgraded.')
    ;(getConfirmation(page).props.onConfirm as () => void)()
    await flushAsyncWork()
    page = renderAdminFormConfigPage('7', formKey)

    expect(window.confirm).not.toHaveBeenCalled()
    expect(formConfigApi.publishAdminFormConfigDraft).toHaveBeenCalledWith({ version: 7 }, formKey)
    expect(formConfigApi.fetchAdminFormConfig).toHaveBeenCalledTimes(3)
    expect(getVisualEditor(page).props.readOnly).toBe(true)
  })

  it('discards only the selected PSF draft and refreshes the selected family', async () => {
    const formKey = 'psf-created-information'
    const draft = buildPsfCreatedVersion()
    const active = buildPsfCreatedVersion({ version: 6, status: 'active' })
    formConfigApi.fetchAdminFormConfig
      .mockResolvedValueOnce(buildList([draft, active], formKey))
      .mockResolvedValueOnce(buildList([active], formKey))
    formConfigApi.discardAdminFormConfigDraft.mockResolvedValue(null)
    const page = await loadAdminFormConfigPage(null, formKey)

    ;(getVersionSelector(page).props.onDiscard as (version: number) => void)(7)
    ;(getConfirmation(renderAdminFormConfigPage(null, formKey)).props.onConfirm as () => void)()
    await flushAsyncWork()

    expect(formConfigApi.discardAdminFormConfigDraft).toHaveBeenCalledWith(7, formKey)
    expect(formConfigApi.fetchAdminFormConfig).toHaveBeenCalledTimes(2)
    expect(getVersionSelector(renderAdminFormConfigPage(null, formKey)).props.versions).toEqual([active])
  })
})
