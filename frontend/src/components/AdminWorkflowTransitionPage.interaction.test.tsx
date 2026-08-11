import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  AdminWorkflowTransitionFeedback,
  AdminWorkflowTransitionMatrix,
  AdminWorkflowTransitionPage,
  type AdminWorkflowTransitionMatrixProps,
} from './AdminWorkflowTransitionPage'

const adminWorkflowApi = vi.hoisted(() => ({
  fetchAdminWorkflowTransitionConfiguration: vi.fn(),
  replaceAdminWorkflowTransitionConfiguration: vi.fn(),
}))

const adminWorkflowHookHarness = vi.hoisted(() => {
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
    api: adminWorkflowApi,
  }
})

vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react')>()

  return {
    ...actual,
    useEffect: adminWorkflowHookHarness.useEffect,
    useRef: adminWorkflowHookHarness.useRef,
    useState: adminWorkflowHookHarness.useState,
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

function renderAdminWorkflowTransitionPage() {
  adminWorkflowHookHarness.beginRender()
  return AdminWorkflowTransitionPage()
}

function renderMatrix(page: unknown) {
  const matrix = requireRenderedElement(
    page,
    (element) => element.type === AdminWorkflowTransitionMatrix,
  )

  return AdminWorkflowTransitionMatrix(
    matrix.props as unknown as AdminWorkflowTransitionMatrixProps,
  )
}

function getCheckbox(matrix: unknown, id: string): RenderedElement {
  return requireRenderedElement(
    matrix,
    (element) => element.type === 'input' && element.props.id === id,
  )
}

function getSaveButton(page: unknown): RenderedElement {
  return requireRenderedElement(
    page,
    (element) =>
      element.type === 'button' &&
      (element.props.children === 'Save workflow changes' ||
        element.props.children === 'Saving workflow changes…'),
  )
}

function getFeedback(page: unknown): RenderedElement {
  return requireRenderedElement(
    page,
    (element) => element.type === AdminWorkflowTransitionFeedback,
  )
}

function toggleCheckbox(matrix: unknown, id: string, checked: boolean): void {
  const onChange = getCheckbox(matrix, id).props.onChange
  if (typeof onChange !== 'function') {
    throw new Error(`Expected checkbox callback for ${id}`)
  }

  onChange({ target: { checked } })
}

function clickSave(page: unknown): void {
  const onClick = getSaveButton(page).props.onClick
  if (typeof onClick !== 'function') {
    throw new Error('Expected save callback')
  }

  onClick()
}

async function flushAsyncWork(): Promise<void> {
  await new Promise<void>((resolve) => setTimeout(resolve, 0))
}

async function loadAdminWorkflowTransitionPage() {
  renderAdminWorkflowTransitionPage()
  adminWorkflowHookHarness.runEffects()
  await flushAsyncWork()
  return renderAdminWorkflowTransitionPage()
}

const transitionId = 'submitted--setup-in-progress'
const enabledInputId = `admin-workflow-enabled-${transitionId}`
const adminRoleInputId = `admin-workflow-role-${transitionId}-admin`
const gntcDepartmentInputId = `admin-workflow-department-${transitionId}-gntc`

const loadedConfiguration = {
  statuses: ['Submitted', 'Setup In Progress'],
  transitions: [
    {
      fromStatus: 'Submitted',
      toStatus: 'Setup In Progress',
      enabled: true,
      allowedRoles: ['setup_owner'],
      allowedSetupOwnerDepartments: [],
    },
    {
      fromStatus: 'Setup In Progress',
      toStatus: 'Submitted',
      enabled: false,
      allowedRoles: [],
      allowedSetupOwnerDepartments: [],
    },
  ],
}

describe('AdminWorkflowTransitionPage interactions', () => {
  beforeEach(() => {
    adminWorkflowHookHarness.reset()
    adminWorkflowApi.fetchAdminWorkflowTransitionConfiguration.mockReset()
    adminWorkflowApi.replaceAdminWorkflowTransitionConfiguration.mockReset()
    adminWorkflowApi.fetchAdminWorkflowTransitionConfiguration.mockResolvedValue(
      loadedConfiguration,
    )
    adminWorkflowApi.replaceAdminWorkflowTransitionConfiguration.mockImplementation(
      async (payload) => ({
        statuses: loadedConfiguration.statuses,
        transitions: payload.transitions,
      }),
    )
  })

  it('loads the transition matrix, edits enabled principals, and saves one complete replacement once', async () => {
    let page = await loadAdminWorkflowTransitionPage()
    expect(adminWorkflowApi.fetchAdminWorkflowTransitionConfiguration).toHaveBeenCalledTimes(1)
    expect(getSaveButton(page).props.disabled).toBe(true)

    let matrix = renderMatrix(page)
    toggleCheckbox(matrix, enabledInputId, false)
    page = renderAdminWorkflowTransitionPage()
    matrix = renderMatrix(page)
    toggleCheckbox(matrix, adminRoleInputId, true)
    page = renderAdminWorkflowTransitionPage()
    matrix = renderMatrix(page)
    toggleCheckbox(matrix, gntcDepartmentInputId, true)
    page = renderAdminWorkflowTransitionPage()

    expect(getSaveButton(page).props.disabled).toBe(false)
    clickSave(page)
    clickSave(page)
    await flushAsyncWork()

    expect(
      adminWorkflowApi.replaceAdminWorkflowTransitionConfiguration,
    ).toHaveBeenCalledTimes(1)
    const savedPayload = adminWorkflowApi.replaceAdminWorkflowTransitionConfiguration.mock.calls[0][0]
    expect(savedPayload.transitions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          fromStatus: 'Submitted',
          toStatus: 'Setup In Progress',
          enabled: false,
          allowedRoles: ['setup_owner', 'admin'],
          allowedSetupOwnerDepartments: ['GNTC'],
        }),
      ]),
    )
  })

  it('keeps an unsaved matrix edit visible and reports a server rejection', async () => {
    adminWorkflowApi.replaceAdminWorkflowTransitionConfiguration.mockRejectedValueOnce(
      new Error('Every directed transition must be present exactly once.'),
    )

    let page = await loadAdminWorkflowTransitionPage()
    toggleCheckbox(renderMatrix(page), enabledInputId, false)
    page = renderAdminWorkflowTransitionPage()
    clickSave(page)
    await flushAsyncWork()
    page = renderAdminWorkflowTransitionPage()

    expect(getFeedback(page).props.feedback).toEqual({
      kind: 'error',
      message: 'Every directed transition must be present exactly once.',
    })
    expect(getCheckbox(renderMatrix(page), enabledInputId).props.checked).toBe(false)
    expect(getSaveButton(page).props.disabled).toBe(false)
  })
})
