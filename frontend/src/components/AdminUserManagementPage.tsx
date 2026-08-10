import { useEffect, useRef, useState } from 'react'
import {
  api,
  refreshCurrentUser,
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
  drafts: Record<string, UpdateAdminUserPayload>
  onChangeDepartment: (
    userId: string,
    department: SetupOwnerDepartment,
  ) => void
  onChangeRole: (userId: string, role: UserRole) => void
  onSave: (userId: string) => void
  savingUserId: string | null
  users: AuthenticatedUserProfile[]
}

export function AdminUserManagementUsersTable({
  drafts,
  onChangeDepartment,
  onChangeRole,
  onSave,
  savingUserId,
  users,
}: AdminUserManagementUsersTableProps) {
  return (
    <div className="data-table admin-user-management__table">
      <table>
        <thead>
          <tr>
            <th scope="col">User</th>
            <th scope="col">Role</th>
            <th scope="col">Setup File Owner department</th>
            <th scope="col">Action</th>
          </tr>
        </thead>
        <tbody>
          {users.map((user) => {
            const draft = drafts[user.id] ?? toUpdatePayload(user)
            const saving = savingUserId === user.id
            const disabled = savingUserId !== null
            const roleInputId = `admin-user-role-${user.id}`
            const departmentInputId = `admin-user-department-${user.id}`

            return (
              <tr key={user.id}>
                <td>
                  <strong>{user.displayName}</strong>
                  <span>{user.username}</span>
                </td>
                <td>
                  <label className="admin-user-management__field" htmlFor={roleInputId}>
                    <span className="sr-only">Role for {user.displayName}</span>
                    <select
                      disabled={disabled}
                      id={roleInputId}
                      onChange={(event) =>
                        onChangeRole(user.id, event.target.value as UserRole)
                      }
                      value={draft.role}
                    >
                      {Object.entries(USER_ROLE_LABELS).map(([role, label]) => (
                        <option key={role} value={role}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </label>
                </td>
                <td>
                  <label
                    className="admin-user-management__field"
                    htmlFor={departmentInputId}
                  >
                    <span className="sr-only">
                      Setup File Owner department for {user.displayName}
                    </span>
                    <select
                      disabled={disabled || draft.role !== 'setup_owner'}
                      id={departmentInputId}
                      onChange={(event) => {
                        const value = event.target.value
                        onChangeDepartment(
                          user.id,
                          value === 'GNTC' || value === 'MFG' ? value : null,
                        )
                      }}
                      value={draft.setupOwnerDepartment ?? ''}
                    >
                      <option value="">
                        {draft.role === 'setup_owner'
                          ? 'Choose a department'
                          : 'No department'}
                      </option>
                      <option value="GNTC">GNTC</option>
                      <option value="MFG">MFG</option>
                    </select>
                  </label>
                </td>
                <td>
                  <button
                    className="primary-button"
                    disabled={disabled || !canSaveAdminUserUpdate(draft)}
                    onClick={() => onSave(user.id)}
                    type="button"
                  >
                    {saving ? 'Saving user…' : 'Save user'}
                  </button>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

export function AdminUserManagementPage() {
  const [drafts, setDrafts] = useState<Record<string, UpdateAdminUserPayload>>({})
  const [feedback, setFeedback] =
    useState<AdminUserManagementFeedbackValue | null>(null)
  const [loading, setLoading] = useState(true)
  const [savingUserId, setSavingUserId] = useState<string | null>(null)
  const [users, setUsers] = useState<AuthenticatedUserProfile[]>([])
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
    if (
      !draft ||
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
          user.id === userId ? nextUpdatedUser : user,
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
          <p className="page-card__eyebrow">Admin tools</p>
          <h1>User management</h1>
          <p className="page-card__description">
            Manage user roles and Setup File Owner department assignments. Each
            saved change is enforced by the server on later requests.
          </p>
        </div>
      </div>

      <div className="page-card__body admin-user-management__body">
        <AdminUserManagementFeedback feedback={feedback} loading={loading} />
        {!loading && users.length === 0 && !feedback ? (
          <p className="page-card__description">No users are available.</p>
        ) : null}
        {!loading && users.length > 0 ? (
          <AdminUserManagementUsersTable
            drafts={drafts}
            onChangeDepartment={changeDepartment}
            onChangeRole={changeRole}
            onSave={(userId) => void saveUser(userId)}
            savingUserId={savingUserId}
            users={users}
          />
        ) : null}
      </div>
    </article>
  )
}
