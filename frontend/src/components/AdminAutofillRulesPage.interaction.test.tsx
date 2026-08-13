import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError, type AdminAutofillRule } from '../services/api'
import {
  AdminAutofillRuleEditor,
  AdminAutofillRulesFeedback,
  AdminAutofillRulesPage,
  AdminAutofillRulesTable,
  type AdminAutofillRuleEditorProps,
  type AdminAutofillRulesTableProps,
} from './AdminAutofillRulesPage'

const adminAutofillApi = vi.hoisted(() => ({
  createAdminAutofillRule: vi.fn(),
  fetchActiveFormSchema: vi.fn(),
  fetchAdminAutofillRules: vi.fn(),
  updateAdminAutofillRule: vi.fn(),
}))

const adminAutofillHookHarness = vi.hoisted(() => {
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
    api: adminAutofillApi,
  }
})

vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react')>()

  return {
    ...actual,
    useEffect: adminAutofillHookHarness.useEffect,
    useRef: adminAutofillHookHarness.useRef,
    useState: adminAutofillHookHarness.useState,
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

function renderAdminAutofillRulesPage() {
  adminAutofillHookHarness.beginRender()
  return AdminAutofillRulesPage()
}

function renderEditor(page: unknown) {
  const editor = requireRenderedElement(
    page,
    (element) => element.type === AdminAutofillRuleEditor,
  )

  return AdminAutofillRuleEditor(
    editor.props as unknown as AdminAutofillRuleEditorProps,
  )
}

function getRulesTableElement(page: unknown): RenderedElement {
  return requireRenderedElement(
    page,
    (element) => element.type === AdminAutofillRulesTable,
  )
}

function renderRulesTable(page: unknown) {
  const table = getRulesTableElement(page)

  return AdminAutofillRulesTable(
    table.props as unknown as AdminAutofillRulesTableProps,
  )
}

function getPageButton(page: unknown, label: string): RenderedElement {
  return requireRenderedElement(
    page,
    (element) => element.type === 'button' && element.props.children === label,
  )
}

function getEditorSelect(editor: unknown): RenderedElement {
  return requireRenderedElement(
    editor,
    (element) => element.type === 'select' && element.props.id === 'admin-autofill-trigger',
  )
}

function getTargetCheckbox(editor: unknown, canonicalKey: string): RenderedElement {
  return requireRenderedElement(
    editor,
    (element) =>
      element.type === 'input' &&
      element.props.id === `admin-autofill-target-${canonicalKey}`,
  )
}

function getEditorButton(editor: unknown, label: string): RenderedElement {
  return requireRenderedElement(
    editor,
    (element) => element.type === 'button' && element.props.children === label,
  )
}

function getEditButton(table: unknown, ruleId: string): RenderedElement {
  return requireRenderedElement(
    table,
    (element) =>
      element.type === 'button' && element.props.id === `admin-autofill-edit-${ruleId}`,
  )
}

function getFeedback(page: unknown): RenderedElement {
  return requireRenderedElement(
    page,
    (element) => element.type === AdminAutofillRulesFeedback,
  )
}

function click(element: RenderedElement): void {
  const onClick = element.props.onClick
  if (typeof onClick !== 'function') {
    throw new Error('Expected button callback')
  }

  onClick()
}

function changeTrigger(editor: unknown, canonicalKey: string): void {
  const onChange = getEditorSelect(editor).props.onChange
  if (typeof onChange !== 'function') {
    throw new Error('Expected trigger selector callback')
  }

  onChange({ target: { value: canonicalKey } })
}

function toggleTarget(editor: unknown, canonicalKey: string, checked: boolean): void {
  const onChange = getTargetCheckbox(editor, canonicalKey).props.onChange
  if (typeof onChange !== 'function') {
    throw new Error('Expected target selector callback')
  }

  onChange({ target: { checked } })
}

async function flushAsyncWork(): Promise<void> {
  await new Promise<void>((resolve) => setTimeout(resolve, 0))
}

async function loadAdminAutofillRulesPage() {
  renderAdminAutofillRulesPage()
  adminAutofillHookHarness.runEffects()
  await flushAsyncWork()
  return renderAdminAutofillRulesPage()
}

const activeSchema = {
  formKey: 'psf-request',
  version: 1,
  title: 'PSF Request Form',
  description: null,
  status: 'active',
  publishedAt: '2026-08-11T00:00:00.000Z',
  schema: {
    formKey: 'psf-request',
    version: 1,
    title: 'PSF Request Form',
    sections: [
      {
        sectionKey: 'requester_information',
        title: 'Requester Information',
        visibleTo: ['requester', 'setup_owner', 'admin'],
        fields: [
          {
            fieldKey: 'reference_psf_name',
            canonicalKey: 'reference_psf_name',
            label: 'Reference PSF Name',
            type: 'text' as const,
            required: false,
            autofillTrigger: true,
          },
          {
            fieldKey: 'reference_product',
            canonicalKey: 'reference_product',
            label: 'Reference Product',
            type: 'text' as const,
            required: false,
            autofillTrigger: true,
          },
          {
            fieldKey: 'product',
            canonicalKey: 'product',
            label: 'Product',
            type: 'text' as const,
            required: true,
          },
          {
            fieldKey: 'wafer_fab',
            canonicalKey: 'wafer_fab',
            label: 'Wafer FAB',
            type: 'text' as const,
            required: true,
          },
        ],
      },
    ],
  },
}

const existingRule: AdminAutofillRule = {
  id: 'd3aa1724-d6b4-4ee5-ae85-7f72e79a4a74',
  formKey: 'psf-request',
  triggerCanonicalKey: 'reference_psf_name',
  targetCanonicalKeys: ['product', 'wafer_fab'],
  lookupSource: 'previous_completed_submission',
  status: 'active',
  createdAt: '2026-08-11T10:00:00.000Z',
  updatedAt: '2026-08-11T10:00:00.000Z',
}

describe('AdminAutofillRulesPage interactions', () => {
  beforeEach(() => {
    adminAutofillHookHarness.reset()
    adminAutofillApi.createAdminAutofillRule.mockReset()
    adminAutofillApi.fetchActiveFormSchema.mockReset()
    adminAutofillApi.fetchAdminAutofillRules.mockReset()
    adminAutofillApi.updateAdminAutofillRule.mockReset()
    adminAutofillApi.fetchActiveFormSchema.mockResolvedValue(activeSchema)
  })

  it('loads schema-derived controls, creates one canonical rule once, and refreshes saved rules', async () => {
    const createdRule: AdminAutofillRule = {
      ...existingRule,
      id: 'f7bd952b-1dc7-4d77-91ec-65cc50894071',
      triggerCanonicalKey: 'reference_product',
      targetCanonicalKeys: ['product'],
    }
    adminAutofillApi.fetchAdminAutofillRules
      .mockResolvedValueOnce([existingRule])
      .mockResolvedValueOnce([existingRule, createdRule])
    adminAutofillApi.createAdminAutofillRule.mockResolvedValue(createdRule)

    let page = await loadAdminAutofillRulesPage()
    expect(adminAutofillApi.fetchActiveFormSchema).toHaveBeenCalledWith('psf-request')
    expect(adminAutofillApi.fetchAdminAutofillRules).toHaveBeenCalledTimes(1)

    click(getPageButton(page, 'Create rule'))
    page = renderAdminAutofillRulesPage()
    let editor = renderEditor(page)
    changeTrigger(editor, 'reference_product')
    page = renderAdminAutofillRulesPage()
    editor = renderEditor(page)
    toggleTarget(editor, 'product', true)
    page = renderAdminAutofillRulesPage()
    editor = renderEditor(page)

    const saveButton = getEditorButton(editor, 'Create autofill rule')
    expect(saveButton.props.disabled).toBe(false)
    click(saveButton)
    click(saveButton)

    expect(adminAutofillApi.createAdminAutofillRule).toHaveBeenCalledTimes(1)
    expect(adminAutofillApi.createAdminAutofillRule).toHaveBeenCalledWith({
      formKey: 'psf-request',
      triggerCanonicalKey: 'reference_product',
      targetCanonicalKeys: ['product'],
    })

    await flushAsyncWork()
    page = renderAdminAutofillRulesPage()

    expect(adminAutofillApi.fetchAdminAutofillRules).toHaveBeenCalledTimes(2)
    expect(getRulesTableElement(page).props.rules).toEqual([
      existingRule,
      createdRule,
    ])
    expect(getFeedback(page).props.feedback).toEqual({
      kind: 'success',
      message: 'Autofill rule was created.',
    })
  })

  it('keeps a successfully created rule in local state and closes the editor when its post-save refresh fails', async () => {
    const createdRule: AdminAutofillRule = {
      ...existingRule,
      id: 'f7bd952b-1dc7-4d77-91ec-65cc50894071',
      triggerCanonicalKey: 'reference_product',
      targetCanonicalKeys: ['product'],
    }
    adminAutofillApi.fetchAdminAutofillRules
      .mockResolvedValueOnce([existingRule])
      .mockRejectedValueOnce(
        new ApiError('Rules refresh is unavailable.', 503, 'Service Unavailable', null),
      )
    adminAutofillApi.createAdminAutofillRule.mockResolvedValue(createdRule)

    let page = await loadAdminAutofillRulesPage()
    click(getPageButton(page, 'Create rule'))
    page = renderAdminAutofillRulesPage()
    let editor = renderEditor(page)
    changeTrigger(editor, 'reference_product')
    page = renderAdminAutofillRulesPage()
    editor = renderEditor(page)
    toggleTarget(editor, 'product', true)
    page = renderAdminAutofillRulesPage()
    editor = renderEditor(page)

    click(getEditorButton(editor, 'Create autofill rule'))
    await flushAsyncWork()
    page = renderAdminAutofillRulesPage()

    expect(adminAutofillApi.createAdminAutofillRule).toHaveBeenCalledTimes(1)
    expect(adminAutofillApi.fetchAdminAutofillRules).toHaveBeenCalledTimes(2)
    expect(getRulesTableElement(page).props.rules).toEqual([
      existingRule,
      createdRule,
    ])
    expect(
      findRenderedElement(
        page,
        (element) => element.type === AdminAutofillRuleEditor,
      ),
    ).toBeNull()
    expect(getFeedback(page).props.feedback).toEqual({
      kind: 'error',
      message:
        'Autofill rule was created, but the refreshed list could not be loaded: Rules refresh is unavailable.',
    })
  })

  it('keeps a successfully edited rule in local state and closes the editor when its post-save refresh fails', async () => {
    const updatedRule: AdminAutofillRule = {
      ...existingRule,
      targetCanonicalKeys: ['product'],
      updatedAt: '2026-08-11T11:00:00.000Z',
    }
    adminAutofillApi.fetchAdminAutofillRules
      .mockResolvedValueOnce([existingRule])
      .mockRejectedValueOnce(
        new ApiError('Rules refresh is unavailable.', 503, 'Service Unavailable', null),
      )
    adminAutofillApi.updateAdminAutofillRule.mockResolvedValue(updatedRule)

    let page = await loadAdminAutofillRulesPage()
    click(getEditButton(renderRulesTable(page), existingRule.id))
    page = renderAdminAutofillRulesPage()
    let editor = renderEditor(page)
    toggleTarget(editor, 'wafer_fab', false)
    page = renderAdminAutofillRulesPage()
    editor = renderEditor(page)

    click(getEditorButton(editor, 'Save autofill rule'))
    await flushAsyncWork()
    page = renderAdminAutofillRulesPage()

    expect(adminAutofillApi.updateAdminAutofillRule).toHaveBeenCalledTimes(1)
    expect(adminAutofillApi.fetchAdminAutofillRules).toHaveBeenCalledTimes(2)
    expect(getRulesTableElement(page).props.rules).toEqual([updatedRule])
    expect(
      findRenderedElement(
        page,
        (element) => element.type === AdminAutofillRuleEditor,
      ),
    ).toBeNull()
    expect(getFeedback(page).props.feedback).toEqual({
      kind: 'error',
      message:
        'Autofill rule was saved, but the refreshed list could not be loaded: Rules refresh is unavailable.',
    })
  })

  it('retains an edit after a rejected save and keeps the retry control available', async () => {
    adminAutofillApi.fetchAdminAutofillRules.mockResolvedValue([existingRule])
    adminAutofillApi.updateAdminAutofillRule.mockRejectedValueOnce(
      new ApiError('The trigger already has a rule.', 409, 'Conflict', null),
    )

    let page = await loadAdminAutofillRulesPage()
    click(getEditButton(renderRulesTable(page), existingRule.id))
    page = renderAdminAutofillRulesPage()
    let editor = renderEditor(page)
    toggleTarget(editor, 'wafer_fab', false)
    page = renderAdminAutofillRulesPage()
    editor = renderEditor(page)

    const saveButton = getEditorButton(editor, 'Save autofill rule')
    expect(saveButton.props.disabled).toBe(false)
    click(saveButton)
    await flushAsyncWork()
    page = renderAdminAutofillRulesPage()
    editor = renderEditor(page)

    expect(adminAutofillApi.updateAdminAutofillRule).toHaveBeenCalledWith(
      existingRule.id,
      {
        formKey: 'psf-request',
        triggerCanonicalKey: 'reference_psf_name',
        targetCanonicalKeys: ['product'],
      },
    )
    expect(getTargetCheckbox(editor, 'wafer_fab').props.checked).toBe(false)
    expect(getEditorButton(editor, 'Save autofill rule').props.disabled).toBe(false)
    expect(getFeedback(page).props.feedback).toEqual({
      kind: 'error',
      message: 'The trigger already has a rule.',
    })
  })

})
