import { useEffect, useRef, useState } from 'react'
import {
  api,
  refreshCurrentUser,
  type AdminUserProfile,
  type AuthenticatedUserProfile,
  type UpdateAdminUserPayload,
  type UserRole,
} from '../services/api'
import {
  canSaveAdminUserUpdate,
  getAdminUserManagementErrorMessage,
  updateAdminUserRoleDraft,
} from './adminUserManagementState'

type AdminUserManagementFeedbackValue = {
  kind: 'success' | 'error'
  message: string
}

type SetupOwnerDepartment = UpdateAdminUserPayload['setupOwnerDepartment']

const USER_ROLE_LABELS: Record<UserRole, string> = {
  requester: 'Requester',
  setup_owner: 'Setup File Owner',
  admin: 'Administrator',
}

function toUpdatePayload(user: AuthenticatedUserProfile): UpdateAdminUserPayload {
  return {
    role: user.role,
    setupOwnerDepartment: user.setupOwnerDepartment,
  }
}

function toUserDrafts(
  users: AuthenticatedUserProfile[],
): Record<string, UpdateAdminUserPayload> {
  return Object.fromEntries(
    users.map((user) => [user.id, toUpdatePayload(user)]),
  )
}

export function AdminUserManagementFeedback({
  feedback,
  loading,
}: {
  feedback: AdminUserManagementFeedbackValue | null
  loading: boolean
}) {
  if (loading) {
    return (
      <p className="page-card__description" role="status">
        Loading users…
      </p>
    )
  }

  if (!feedback) {
    return null
  }

  return (
    <p
      className={`status-pill status-pill--${feedback.kind}`}
      role={feedback.kind === 'error' ? 'alert' : 'status'}
    >
      {feedback.message}
    </p>
  )
}

export interface AdminUserManagementUsersTableProps {
  onEdit: (user: AdminUserProfile, button: HTMLButtonElement) => void
  savingUserId: string | null
  users: AdminUserProfile[]
}

export function AdminUserManagementUsersTable({
  onEdit,
  savingUserId,
  users,
}: AdminUserManagementUsersTableProps) {
  return (
    <>
      <div className="data-table admin-user-management__table">
        <table>
          <thead>
            <tr>
              <th scope="col">User</th>
              <th scope="col">Email</th>
              <th scope="col">Role</th>
              <th scope="col">Setup File Owner department</th>
              <th scope="col">Action</th>
            </tr>
          </thead>
          <tbody>
            {users.map((user) => (
              <tr key={user.id}>
                <td>
                  <strong>{user.displayName}</strong>
                  <span>{user.username}</span>
                </td>
                <td className="admin-user-management__email">{user.email || '—'}</td>
                <td>{USER_ROLE_LABELS[user.role]}</td>
                <td>{user.setupOwnerDepartment ?? '—'}</td>
                <td>
                  <button
                    aria-label={`Edit access for ${user.displayName}`}
                    className="btn-secondary"
                    disabled={savingUserId !== null}
                    onClick={(event) => onEdit(user, event.currentTarget)}
                    type="button"
                  >
                    Edit
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="admin-user-management__cards">
        {users.map((user) => (
          <article className="admin-user-management__card" key={user.id}>
            <strong>{user.displayName}</strong>
            <span className="admin-user-management__username">{user.username}</span>
            <dl>
              <dt>Email</dt><dd className="admin-user-management__email">{user.email || '—'}</dd>
              <dt>Role</dt><dd>{USER_ROLE_LABELS[user.role]}</dd>
              {user.role === 'setup_owner' ? (
                <><dt>Department</dt><dd>{user.setupOwnerDepartment ?? '—'}</dd></>
              ) : null}
            </dl>
            <button
              aria-label={`Edit access for ${user.displayName}`}
              className="btn-secondary"
              disabled={savingUserId !== null}
              onClick={(event) => onEdit(user, event.currentTarget)}
              type="button"
            >
              Edit
            </button>
          </article>
        ))}
      </div>
    </>
  )
}

export function AdminUserManagementPage() {
  const [drafts, setDrafts] = useState<Record<string, UpdateAdminUserPayload>>({})
  const [editingUserId, setEditingUserId] = useState<string | null>(null)
  const [feedback, setFeedback] =
    useState<AdminUserManagementFeedbackValue | null>(null)
  const [loading, setLoading] = useState(true)
  const [savingUserId, setSavingUserId] = useState<string | null>(null)
  const [users, setUsers] = useState<AdminUserProfile[]>([])
  const dialogRef = useRef<HTMLDialogElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const requestInFlight = useRef(false)

  useEffect(() => {
    let mounted = true
    requestInFlight.current = true

    async function loadUsers() {
      try {
        const loadedUsers = await api.fetchAdminUsers()
        if (!mounted) {
          return
        }

        setUsers(loadedUsers)
        setDrafts(toUserDrafts(loadedUsers))
      } catch (error) {
        if (mounted) {
          setFeedback({
            kind: 'error',
            message: getAdminUserManagementErrorMessage(
              error,
              'Unable to load users.',
            ),
          })
        }
      } finally {
        requestInFlight.current = false
        if (mounted) {
          setLoading(false)
        }
      }
    }

    void loadUsers()

    return () => {
      mounted = false
    }
  }, [])

  useEffect(() => {
    if (editingUserId && !dialogRef.current?.open) {
      dialogRef.current?.showModal()
    }
  }, [editingUserId])

  const editingUser = users.find((user) => user.id === editingUserId)
  const editingDraft = editingUser ? drafts[editingUser.id] : null
  const changed = !!editingUser && !!editingDraft && (
    editingDraft.role !== editingUser.role ||
    editingDraft.setupOwnerDepartment !== editingUser.setupOwnerDepartment
  )

  function openEditor(user: AdminUserProfile, button: HTMLButtonElement) {
    if (savingUserId || requestInFlight.current) {
      return
    }

    triggerRef.current = button
    setDrafts((current) => ({ ...current, [user.id]: toUpdatePayload(user) }))
    setFeedback(null)
    setEditingUserId(user.id)
  }

  function changeRole(userId: string, role: UserRole) {
    if (savingUserId || requestInFlight.current) {
      return
    }

    setDrafts((current) => {
      const currentDraft = current[userId]
      if (!currentDraft) {
        return current
      }

      return {
        ...current,
        [userId]: updateAdminUserRoleDraft(currentDraft, role),
      }
    })
    setFeedback(null)
  }

  function changeDepartment(userId: string, department: SetupOwnerDepartment) {
    if (savingUserId || requestInFlight.current) {
      return
    }

    setDrafts((current) => {
      const currentDraft = current[userId]
      if (!currentDraft || currentDraft.role !== 'setup_owner') {
        return current
      }

      return {
        ...current,
        [userId]: { ...currentDraft, setupOwnerDepartment: department },
      }
    })
    setFeedback(null)
  }

  async function saveUser(userId: string) {
    const draft = drafts[userId]
    const original = users.find((user) => user.id === userId)
    if (
      !draft ||
      !original ||
      (draft.role === original.role && draft.setupOwnerDepartment === original.setupOwnerDepartment) ||
      !canSaveAdminUserUpdate(draft) ||
      savingUserId ||
      requestInFlight.current
    ) {
      return
    }

    requestInFlight.current = true
    setSavingUserId(userId)
    setFeedback(null)
    let updatedUser: AuthenticatedUserProfile | null = null

    try {
      const nextUpdatedUser = await api.updateAdminUser(userId, draft)
      updatedUser = nextUpdatedUser
      setUsers((current) =>
        current.map((user) =>
          user.id === userId ? { ...user, ...nextUpdatedUser } : user,
        ),
      )
      setDrafts((current) => ({
        ...current,
        [userId]: toUpdatePayload(nextUpdatedUser),
      }))
      await refreshCurrentUser()
      setFeedback({
        kind: 'success',
        message: `${nextUpdatedUser.displayName} was updated.`,
      })
      dialogRef.current?.close()
    } catch (error) {
      const refreshPrefix = updatedUser
        ? `${updatedUser.displayName} was updated, but the current session could not refresh. `
        : ''
      setFeedback({
        kind: 'error',
        message: `${refreshPrefix}${getAdminUserManagementErrorMessage(
          error,
          'Unable to update user.',
        )}`,
      })
    } finally {
      requestInFlight.current = false
      setSavingUserId(null)
    }
  }

  return (
    <article className="page-card admin-user-management">
      <div className="page-card__header">
        <div>
          <h1>Users &amp; Roles</h1>
          <p className="page-card__description">Review identities and manage access.</p>
        </div>
      </div>

      <div className="page-card__body admin-user-management__body">
        <AdminUserManagementFeedback feedback={editingUserId ? null : feedback} loading={loading} />
        {!loading && users.length === 0 && !feedback ? (
          <p className="page-card__description">No users are available.</p>
        ) : null}
        {!loading && users.length > 0 ? (
          <AdminUserManagementUsersTable
            onEdit={openEditor}
            savingUserId={savingUserId}
            users={users}
          />
        ) : null}
      </div>

      <dialog
        aria-labelledby="admin-user-edit-title"
        className="admin-user-management__dialog"
        onCancel={(event) => {
          if (savingUserId) event.preventDefault()
        }}
        onClose={() => {
          setEditingUserId(null)
          triggerRef.current?.focus()
        }}
        ref={dialogRef}
      >
        {editingUser && editingDraft ? (
          <form
            className="admin-user-management__editor"
            onSubmit={(event) => {
              event.preventDefault()
              void saveUser(editingUser.id)
            }}
          >
            <h2 id="admin-user-edit-title">Edit access</h2>
            <div className="admin-user-management__identity">
              <strong>{editingUser.displayName}</strong>
              <span>{editingUser.username}</span>
              <span>Email: {editingUser.email || '—'}</span>
            </div>
            <label className="admin-user-management__field" htmlFor="admin-user-edit-role">
              Role
              <select
                disabled={savingUserId !== null}
                id="admin-user-edit-role"
                onChange={(event) => changeRole(editingUser.id, event.target.value as UserRole)}
                value={editingDraft.role}
              >
                {Object.entries(USER_ROLE_LABELS).map(([role, label]) => (
                  <option key={role} value={role}>{label}</option>
                ))}
              </select>
            </label>
            {editingDraft.role === 'setup_owner' ? (
              <label className="admin-user-management__field" htmlFor="admin-user-edit-department">
                Setup File Owner department
                <select
                  disabled={savingUserId !== null}
                  id="admin-user-edit-department"
                  onChange={(event) => {
                    const value = event.target.value
                    changeDepartment(editingUser.id, value === 'GNTC' || value === 'MFG' ? value : null)
                  }}
                  required
                  value={editingDraft.setupOwnerDepartment ?? ''}
                >
                  <option value="">Choose a department</option>
                  <option value="GNTC">GNTC</option>
                  <option value="MFG">MFG</option>
                </select>
              </label>
            ) : null}
            <AdminUserManagementFeedback feedback={feedback?.kind === 'error' ? feedback : null} loading={false} />
            <div className="admin-user-management__actions">
              <button
                className="btn-secondary"
                disabled={savingUserId !== null}
                onClick={() => dialogRef.current?.close()}
                type="button"
              >
                Cancel
              </button>
              <button
                className="primary-button"
                disabled={!changed || !canSaveAdminUserUpdate(editingDraft) || savingUserId !== null}
                type="submit"
              >
                {savingUserId ? 'Saving…' : 'Save changes'}
              </button>
            </div>
          </form>
        ) : null}
      </dialog>
    </article>
  )
}
