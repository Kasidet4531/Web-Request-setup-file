import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  ApiError,
  type AuthenticatedUserProfile,
} from '../services/api'
import {
  AdminUserManagementFeedback,
  AdminUserManagementPage,
  AdminUserManagementUsersTable,
  type AdminUserManagementUsersTableProps,
} from './AdminUserManagementPage'

const adminUserApi = vi.hoisted(() => ({
  fetchAdminUsers: vi.fn(),
  refreshCurrentUser: vi.fn(),
  updateAdminUser: vi.fn(),
}))

const adminUserHookHarness = vi.hoisted(() => {
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
    api: adminUserApi,
    refreshCurrentUser: adminUserApi.refreshCurrentUser,
  }
})

vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react')>()

  return {
    ...actual,
    useEffect: adminUserHookHarness.useEffect,
    useRef: adminUserHookHarness.useRef,
    useState: adminUserHookHarness.useState,
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

function renderAdminUserManagementPage() {
  adminUserHookHarness.beginRender()
  return AdminUserManagementPage()
}

function renderUsersTable(page: unknown) {
  const table = requireRenderedElement(
    page,
    (element) => element.type === AdminUserManagementUsersTable,
  )

  return AdminUserManagementUsersTable(
    table.props as unknown as AdminUserManagementUsersTableProps,
  )
}

async function flushAsyncWork(): Promise<void> {
  await new Promise<void>((resolve) => setTimeout(resolve, 0))
}

async function loadAdminUserManagementPage() {
  renderAdminUserManagementPage()
  adminUserHookHarness.runEffects()
  await flushAsyncWork()
  return renderAdminUserManagementPage()
}

function getFeedback(page: unknown): RenderedElement {
  return requireRenderedElement(
    page,
    (element) => element.type === AdminUserManagementFeedback,
  )
}

function getRoleSelect(table: unknown, userId: string): RenderedElement {
  return requireRenderedElement(
    table,
    (element) =>
      element.type === 'select' && element.props.id === `admin-user-role-${userId}`,
  )
}

function getSaveButton(table: unknown, label: string): RenderedElement {
  return requireRenderedElement(
    table,
    (element) => element.type === 'button' && element.props.children === label,
  )
}

function changeRole(table: unknown, userId: string, role: string): void {
  const onChange = getRoleSelect(table, userId).props.onChange

  if (typeof onChange !== 'function') {
    throw new Error('Expected role change callback')
  }

  onChange({ target: { value: role } })
}

function saveFirstUser(table: unknown): void {
  const onClick = getSaveButton(table, 'Save user').props.onClick

  if (typeof onClick !== 'function') {
    throw new Error('Expected save callback')
  }

  onClick()
}

const currentAdmin: AuthenticatedUserProfile = {
  id: '38b2a2de-51a4-47cf-b5b1-497788f386bd',
  username: 'admin.demo',
  displayName: 'Admin Demo',
  role: 'admin',
  setupOwnerDepartment: null,
}

const otherAdmin: AuthenticatedUserProfile = {
  id: '5d7f29cb-5b79-47ae-b8c2-465daf701436',
  username: 'admin.second',
  displayName: 'Second Admin',
  role: 'admin',
  setupOwnerDepartment: null,
}

describe('AdminUserManagementPage interactions', () => {
  beforeEach(() => {
    adminUserApi.fetchAdminUsers.mockReset()
    adminUserApi.refreshCurrentUser.mockReset()
    adminUserApi.updateAdminUser.mockReset()
    adminUserHookHarness.reset()
  })

  it('loads users, saves a self-role change once, and refreshes the current profile', async () => {
    const updatedCurrentAdmin: AuthenticatedUserProfile = {
      ...currentAdmin,
      role: 'requester',
      setupOwnerDepartment: null,
    }
    adminUserApi.fetchAdminUsers.mockResolvedValue([currentAdmin, otherAdmin])
    adminUserApi.updateAdminUser.mockResolvedValue(updatedCurrentAdmin)
    adminUserApi.refreshCurrentUser.mockResolvedValue({ user: updatedCurrentAdmin })

    let page = await loadAdminUserManagementPage()
    changeRole(renderUsersTable(page), currentAdmin.id, 'requester')
    page = renderAdminUserManagementPage()

    saveFirstUser(renderUsersTable(page))
    saveFirstUser(renderUsersTable(page))

    expect(adminUserApi.updateAdminUser).toHaveBeenCalledTimes(1)
    expect(adminUserApi.updateAdminUser).toHaveBeenCalledWith(currentAdmin.id, {
      role: 'requester',
      setupOwnerDepartment: null,
    })
    expect(getSaveButton(renderUsersTable(renderAdminUserManagementPage()), 'Saving user…').props.disabled).toBe(true)

    await flushAsyncWork()
    page = renderAdminUserManagementPage()

    expect(getRoleSelect(renderUsersTable(page), currentAdmin.id).props.value).toBe('requester')
    expect(adminUserApi.refreshCurrentUser).toHaveBeenCalledTimes(1)
    expect(getFeedback(page).props.feedback).toEqual({
      kind: 'success',
      message: 'Admin Demo was updated.',
    })
  })

  it('retains a failed edit for retry and reports the server error', async () => {
    const setupOwner: AuthenticatedUserProfile = {
      id: 'a798b75a-1e52-4989-bc49-6c29b1bff1d8',
      username: 'setup.gntc.demo',
      displayName: 'Setup Owner GNTC Demo',
      role: 'setup_owner',
      setupOwnerDepartment: 'GNTC',
    }
    const updatedRequester: AuthenticatedUserProfile = {
      ...setupOwner,
      role: 'requester',
      setupOwnerDepartment: null,
    }
    adminUserApi.fetchAdminUsers.mockResolvedValue([setupOwner])
    adminUserApi.updateAdminUser
      .mockRejectedValueOnce(
        new ApiError('User update was rejected.', 400, 'Bad Request', null),
      )
      .mockResolvedValueOnce(updatedRequester)
    adminUserApi.refreshCurrentUser.mockResolvedValue({ user: updatedRequester })

    let page = await loadAdminUserManagementPage()
    changeRole(renderUsersTable(page), setupOwner.id, 'requester')
    page = renderAdminUserManagementPage()

    saveFirstUser(renderUsersTable(page))
    await flushAsyncWork()
    page = renderAdminUserManagementPage()

    expect(adminUserApi.updateAdminUser).toHaveBeenCalledTimes(1)
    expect(getRoleSelect(renderUsersTable(page), setupOwner.id).props.value).toBe('requester')
    expect(getSaveButton(renderUsersTable(page), 'Save user').props.disabled).toBe(false)
    expect(getFeedback(page).props.feedback).toEqual({
      kind: 'error',
      message: 'User update was rejected.',
    })

    saveFirstUser(renderUsersTable(page))
    await flushAsyncWork()
    page = renderAdminUserManagementPage()

    expect(adminUserApi.updateAdminUser).toHaveBeenCalledTimes(2)
    expect(adminUserApi.updateAdminUser).toHaveBeenLastCalledWith(setupOwner.id, {
      role: 'requester',
      setupOwnerDepartment: null,
    })
    expect(getFeedback(page).props.feedback).toEqual({
      kind: 'success',
      message: 'Setup Owner GNTC Demo was updated.',
    })
  })

  it('keeps the updated row and surfaces a refresh failure after a successful self update', async () => {
    const updatedCurrentAdmin: AuthenticatedUserProfile = {
      ...currentAdmin,
      role: 'requester',
      setupOwnerDepartment: null,
    }
    adminUserApi.fetchAdminUsers.mockResolvedValue([currentAdmin, otherAdmin])
    adminUserApi.updateAdminUser.mockResolvedValue(updatedCurrentAdmin)
    adminUserApi.refreshCurrentUser.mockRejectedValue(new Error('network failed'))

    let page = await loadAdminUserManagementPage()
    changeRole(renderUsersTable(page), currentAdmin.id, 'requester')
    page = renderAdminUserManagementPage()

    saveFirstUser(renderUsersTable(page))
    await flushAsyncWork()
    page = renderAdminUserManagementPage()

    expect(getRoleSelect(renderUsersTable(page), currentAdmin.id).props.value).toBe('requester')
    expect(adminUserApi.refreshCurrentUser).toHaveBeenCalledTimes(1)
    expect(getFeedback(page).props.feedback).toEqual({
      kind: 'error',
      message:
        'Admin Demo was updated, but the current session could not refresh. Unable to update user.',
    })
  })

  it('shows the server-authoritative authorization error when loading users is rejected', async () => {
    adminUserApi.fetchAdminUsers.mockRejectedValue(
      new ApiError('Only admins can manage users.', 403, 'Forbidden', null),
    )

    const page = await loadAdminUserManagementPage()

    expect(getFeedback(page).props.feedback).toEqual({
      kind: 'error',
      message:
        'You do not have permission to manage users. The server enforces administrator authorization. Only admins can manage users.',
    })
  })
})
