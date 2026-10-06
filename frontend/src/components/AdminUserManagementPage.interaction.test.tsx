import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  ApiError,
  type AdminUserProfile,
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

function getRoleSelect(page: unknown): RenderedElement {
  return requireRenderedElement(
    page,
    (element) => element.type === 'select' && element.props.id === 'admin-user-edit-role',
  )
}

function getSaveButton(page: unknown, label = 'Save changes'): RenderedElement {
  return requireRenderedElement(
    page,
    (element) => element.type === 'button' && element.props.children === label,
  )
}

function changeRole(page: unknown, role: string): void {
  const onChange = getRoleSelect(page).props.onChange
  if (typeof onChange !== 'function') throw new Error('Expected role change callback')
  onChange({ target: { value: role } })
}

function saveUser(page: unknown): void {
  const form = requireRenderedElement(page, (element) => element.type === 'form')
  const onSubmit = form.props.onSubmit
  if (typeof onSubmit !== 'function') throw new Error('Expected save callback')
  onSubmit({ preventDefault: vi.fn() })
}

function openEditor(page: unknown, userId: string) {
  const table = renderUsersTable(page)
  const users = requireRenderedElement(
    page,
    (element) => element.type === AdminUserManagementUsersTable,
  ).props.users as AdminUserProfile[]
  const user = users.find((entry) => entry.id === userId)
  if (!user) throw new Error('Expected user')
  const button = requireRenderedElement(
    table,
    (element) => element.type === 'button' && element.props['aria-label'] === `Edit access for ${user.displayName}`,
  )
  const focus = vi.fn()
  const onClick = button.props.onClick
  if (typeof onClick !== 'function') throw new Error('Expected Edit callback')
  onClick({ currentTarget: { focus } })
  const editedPage = renderAdminUserManagementPage()
  const dialog = requireRenderedElement(editedPage, (element) => element.type === 'dialog')
  const dialogRef = dialog.props.ref as { current: unknown }
  const cancelFocus = vi.fn()
  const fakeDialog = {
    open: false,
    showModal: vi.fn(() => { fakeDialog.open = true }),
    querySelector: vi.fn(() => ({ focus: cancelFocus })),
    close: vi.fn(() => {
      fakeDialog.open = false
      const onClose = dialog.props.onClose
      if (typeof onClose === 'function') onClose()
    }),
  }
  dialogRef.current = fakeDialog
  adminUserHookHarness.runEffects()
  expect(fakeDialog.showModal).toHaveBeenCalledOnce()
  expect(fakeDialog.querySelector).toHaveBeenCalledWith('[data-dialog-cancel]')
  expect(cancelFocus).toHaveBeenCalledOnce()
  return { dialog: fakeDialog, focus, page: editedPage }
}

function getModalFeedback(page: unknown): RenderedElement {
  const dialog = requireRenderedElement(page, (element) => element.type === 'dialog')
  return requireRenderedElement(dialog.props.children, (element) => element.type === AdminUserManagementFeedback)
}

const currentAdmin: AdminUserProfile = {
  id: '38b2a2de-51a4-47cf-b5b1-497788f386bd',
  username: 'admin.demo',
  displayName: 'Admin Demo',
  role: 'admin',
  setupOwnerDepartment: null,
  email: 'admin@example.test',
}

const otherAdmin: AdminUserProfile = {
  id: '5d7f29cb-5b79-47ae-b8c2-465daf701436',
  username: 'admin.second',
  displayName: 'Second Admin',
  role: 'admin',
  setupOwnerDepartment: null,
  email: null,
}

describe('AdminUserManagementPage interactions', () => {
  beforeEach(() => {
    adminUserApi.fetchAdminUsers.mockReset()
    adminUserApi.refreshCurrentUser.mockReset()
    adminUserApi.updateAdminUser.mockReset()
    adminUserHookHarness.reset()
  })

  it('opens a modal, saves a changed role once, and preserves LDAP email after refresh', async () => {
    const updatedCurrentAdmin: AuthenticatedUserProfile = {
      ...currentAdmin,
      role: 'requester',
      setupOwnerDepartment: null,
    }
    adminUserApi.fetchAdminUsers.mockResolvedValue([currentAdmin, otherAdmin])
    adminUserApi.updateAdminUser.mockResolvedValue(updatedCurrentAdmin)
    adminUserApi.refreshCurrentUser.mockResolvedValue({ user: updatedCurrentAdmin })

    let page = await loadAdminUserManagementPage()
    const { dialog, focus } = openEditor(page, currentAdmin.id)
    page = renderAdminUserManagementPage()
    expect(getSaveButton(page).props.disabled).toBe(true)
    saveUser(page)
    expect(adminUserApi.updateAdminUser).not.toHaveBeenCalled()

    changeRole(page, 'requester')
    page = renderAdminUserManagementPage()
    expect(getSaveButton(page).props.disabled).toBe(false)
    saveUser(page)
    saveUser(page)

    expect(adminUserApi.updateAdminUser).toHaveBeenCalledTimes(1)
    expect(adminUserApi.updateAdminUser).toHaveBeenCalledWith(currentAdmin.id, {
      role: 'requester',
      setupOwnerDepartment: null,
    })
    expect(getSaveButton(renderAdminUserManagementPage(), 'Saving…').props.disabled).toBe(true)

    await flushAsyncWork()
    page = renderAdminUserManagementPage()

    expect(dialog.close).toHaveBeenCalledOnce()
    expect(focus).toHaveBeenCalledOnce()
    expect((requireRenderedElement(page, (element) => element.type === AdminUserManagementUsersTable).props.users as AdminUserProfile[])[0]).toMatchObject({
      role: 'requester',
      email: 'admin@example.test',
    })
    expect(adminUserApi.refreshCurrentUser).toHaveBeenCalledTimes(1)
    expect(getFeedback(page).props.feedback).toEqual({
      kind: 'success',
      message: 'Admin Demo was updated.',
    })
  })

  it('keeps the modal open on save error and allows retry', async () => {
    const setupOwner: AdminUserProfile = {
      id: 'a798b75a-1e52-4989-bc49-6c29b1bff1d8',
      username: 'setup.gntc.demo',
      displayName: 'Setup Owner GNTC Demo',
      role: 'setup_owner',
      setupOwnerDepartment: 'GNTC',
      email: null,
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
    const { dialog } = openEditor(page, setupOwner.id)
    page = renderAdminUserManagementPage()
    changeRole(page, 'requester')
    page = renderAdminUserManagementPage()

    saveUser(page)
    await flushAsyncWork()
    page = renderAdminUserManagementPage()

    expect(adminUserApi.updateAdminUser).toHaveBeenCalledTimes(1)
    expect(dialog.close).not.toHaveBeenCalled()
    expect(getRoleSelect(page).props.value).toBe('requester')
    expect(getSaveButton(page).props.disabled).toBe(false)
    expect(getModalFeedback(page).props.feedback).toEqual({
      kind: 'error',
      message: 'User update was rejected.',
    })

    saveUser(page)
    await flushAsyncWork()
    page = renderAdminUserManagementPage()

    expect(dialog.close).toHaveBeenCalledOnce()
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

  it('keeps the updated row and shows refresh failure in the modal', async () => {
    const updatedCurrentAdmin: AuthenticatedUserProfile = {
      ...currentAdmin,
      role: 'requester',
      setupOwnerDepartment: null,
    }
    adminUserApi.fetchAdminUsers.mockResolvedValue([currentAdmin, otherAdmin])
    adminUserApi.updateAdminUser.mockResolvedValue(updatedCurrentAdmin)
    adminUserApi.refreshCurrentUser.mockRejectedValue(new Error('network failed'))

    let page = await loadAdminUserManagementPage()
    const { dialog } = openEditor(page, currentAdmin.id)
    page = renderAdminUserManagementPage()
    changeRole(page, 'requester')
    page = renderAdminUserManagementPage()

    saveUser(page)
    await flushAsyncWork()
    page = renderAdminUserManagementPage()

    expect(dialog.close).not.toHaveBeenCalled()
    expect(getRoleSelect(page).props.value).toBe('requester')
    expect(getSaveButton(page).props.disabled).toBe(true)
    expect((requireRenderedElement(page, (element) => element.type === AdminUserManagementUsersTable).props.users as AdminUserProfile[])[0].email).toBe('admin@example.test')
    expect(adminUserApi.refreshCurrentUser).toHaveBeenCalledTimes(1)
    expect(getModalFeedback(page).props.feedback).toEqual({
      kind: 'error',
      message:
        'Admin Demo was updated, but the current session could not refresh. Unable to update user.',
    })
  })

  it('discards a cancelled edit and restores focus to Edit', async () => {
    adminUserApi.fetchAdminUsers.mockResolvedValue([currentAdmin, otherAdmin])
    let page = await loadAdminUserManagementPage()
    const { dialog, focus } = openEditor(page, currentAdmin.id)
    page = renderAdminUserManagementPage()
    changeRole(page, 'requester')
    dialog.close()
    expect(focus).toHaveBeenCalledOnce()

    page = renderAdminUserManagementPage()
    adminUserHookHarness.runEffects()
    const reopened = openEditor(page, currentAdmin.id)
    page = renderAdminUserManagementPage()
    expect(reopened.dialog.showModal).toHaveBeenCalledOnce()
    expect(getRoleSelect(page).props.value).toBe('admin')
    expect(getSaveButton(page).props.disabled).toBe(true)
    expect(adminUserApi.updateAdminUser).not.toHaveBeenCalled()
  })

  it('requires a department before saving a new Setup File Owner', async () => {
    adminUserApi.fetchAdminUsers.mockResolvedValue([currentAdmin, otherAdmin])
    let page = await loadAdminUserManagementPage()
    openEditor(page, currentAdmin.id)
    page = renderAdminUserManagementPage()
    changeRole(page, 'setup_owner')
    page = renderAdminUserManagementPage()

    const department = requireRenderedElement(
      page,
      (element) => element.type === 'select' && element.props.id === 'admin-user-edit-department',
    )
    expect(department.props.required).toBe(true)
    expect(getSaveButton(page).props.disabled).toBe(true)
    saveUser(page)
    expect(adminUserApi.updateAdminUser).not.toHaveBeenCalled()

    const onChange = department.props.onChange
    if (typeof onChange !== 'function') throw new Error('Expected department change callback')
    onChange({ target: { value: 'GNTC' } })
    page = renderAdminUserManagementPage()
    expect(getSaveButton(page).props.disabled).toBe(false)
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
