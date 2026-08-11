import { useEffect, useRef, useState } from 'react'
import {
  api,
  ApiError,
  type AdminWorkflowTransitionConfiguration,
  type SetupOwnerDepartment,
  type UserRole,
  type WorkflowTransitionRule,
} from '../services/api'

type AdminWorkflowTransitionFeedbackValue = {
  kind: 'success' | 'error'
  message: string
}

const USER_ROLE_LABELS: Record<UserRole, string> = {
  requester: 'Requester',
  setup_owner: 'Setup File Owner',
  admin: 'Administrator',
}

const SETUP_OWNER_DEPARTMENTS: SetupOwnerDepartment[] = ['GNTC', 'MFG']

function transitionSlug(fromStatus: string, toStatus: string): string {
  const normalize = (status: string) =>
    status
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '')

  return `${normalize(fromStatus)}--${normalize(toStatus)}`
}

function cloneTransition(rule: WorkflowTransitionRule): WorkflowTransitionRule {
  return {
    ...rule,
    allowedRoles: [...rule.allowedRoles],
    allowedSetupOwnerDepartments: [...rule.allowedSetupOwnerDepartments],
  }
}

function cloneTransitions(
  transitions: WorkflowTransitionRule[],
): WorkflowTransitionRule[] {
  return transitions.map(cloneTransition)
}

function toggleListValue<T extends string>(
  values: T[],
  value: T,
  checked: boolean,
): T[] {
  if (checked) {
    return values.includes(value) ? values : [...values, value]
  }

  return values.filter((current) => current !== value)
}

function getAdminWorkflowTransitionErrorMessage(
  error: unknown,
  fallback: string,
): string {
  if (error instanceof ApiError || error instanceof Error) {
    return error.message || fallback
  }

  return fallback
}

export function AdminWorkflowTransitionFeedback({
  feedback,
  loading,
}: {
  feedback: AdminWorkflowTransitionFeedbackValue | null
  loading: boolean
}) {
  if (loading) {
    return (
      <p className="page-card__description" role="status">
        Loading workflow transitions…
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

export interface AdminWorkflowTransitionMatrixProps {
  disabled: boolean
  onToggleDepartment: (
    fromStatus: string,
    toStatus: string,
    department: SetupOwnerDepartment,
    checked: boolean,
  ) => void
  onToggleEnabled: (
    fromStatus: string,
    toStatus: string,
    checked: boolean,
  ) => void
  onToggleRole: (
    fromStatus: string,
    toStatus: string,
    role: UserRole,
    checked: boolean,
  ) => void
  statuses: string[]
  transitions: WorkflowTransitionRule[]
}

export function AdminWorkflowTransitionMatrix({
  disabled,
  onToggleDepartment,
  onToggleEnabled,
  onToggleRole,
  statuses,
  transitions,
}: AdminWorkflowTransitionMatrixProps) {
  return (
    <div className="admin-workflow-transition__matrix">
      {statuses.map((fromStatus) => {
        const outgoingTransitions = transitions.filter(
          (transition) => transition.fromStatus === fromStatus,
        )

        return (
          <section
            className="admin-workflow-transition__source"
            key={fromStatus}
            aria-labelledby={`admin-workflow-source-${transitionSlug(fromStatus, fromStatus)}`}
          >
            <h2 id={`admin-workflow-source-${transitionSlug(fromStatus, fromStatus)}`}>
              From {fromStatus}
            </h2>
            <div className="data-table admin-workflow-transition__table">
              <table>
                <thead>
                  <tr>
                    <th scope="col">To status</th>
                    <th scope="col">Enabled</th>
                    <th scope="col">Allowed roles</th>
                    <th scope="col">Setup File Owner departments</th>
                  </tr>
                </thead>
                <tbody>
                  {outgoingTransitions.map((transition) => {
                    const slug = transitionSlug(
                      transition.fromStatus,
                      transition.toStatus,
                    )
                    const enabledInputId = `admin-workflow-enabled-${slug}`

                    return (
                      <tr key={`${transition.fromStatus}->${transition.toStatus}`}>
                        <td>
                          <strong>{transition.toStatus}</strong>
                        </td>
                        <td>
                          <label
                            className="admin-workflow-transition__checkbox"
                            htmlFor={enabledInputId}
                          >
                            <input
                              checked={transition.enabled}
                              disabled={disabled}
                              id={enabledInputId}
                              onChange={(event) =>
                                onToggleEnabled(
                                  transition.fromStatus,
                                  transition.toStatus,
                                  event.target.checked,
                                )
                              }
                              type="checkbox"
                            />
                            <span>Enabled</span>
                          </label>
                        </td>
                        <td>
                          <fieldset className="admin-workflow-transition__principals">
                            <legend className="sr-only">
                              Allowed roles for {transition.toStatus} from {transition.fromStatus}
                            </legend>
                            {(Object.keys(USER_ROLE_LABELS) as UserRole[]).map((role) => {
                              const inputId = `admin-workflow-role-${slug}-${role}`

                              return (
                                <label
                                  className="admin-workflow-transition__checkbox"
                                  htmlFor={inputId}
                                  key={role}
                                >
                                  <input
                                    checked={transition.allowedRoles.includes(role)}
                                    disabled={disabled}
                                    id={inputId}
                                    onChange={(event) =>
                                      onToggleRole(
                                        transition.fromStatus,
                                        transition.toStatus,
                                        role,
                                        event.target.checked,
                                      )
                                    }
                                    type="checkbox"
                                  />
                                  <span>{USER_ROLE_LABELS[role]}</span>
                                </label>
                              )
                            })}
                          </fieldset>
                        </td>
                        <td>
                          <fieldset className="admin-workflow-transition__principals">
                            <legend className="sr-only">
                              Allowed Setup File Owner departments for {transition.toStatus} from {transition.fromStatus}
                            </legend>
                            {SETUP_OWNER_DEPARTMENTS.map((department) => {
                              const inputId = `admin-workflow-department-${slug}-${department.toLowerCase()}`

                              return (
                                <label
                                  className="admin-workflow-transition__checkbox"
                                  htmlFor={inputId}
                                  key={department}
                                >
                                  <input
                                    checked={transition.allowedSetupOwnerDepartments.includes(
                                      department,
                                    )}
                                    disabled={disabled}
                                    id={inputId}
                                    onChange={(event) =>
                                      onToggleDepartment(
                                        transition.fromStatus,
                                        transition.toStatus,
                                        department,
                                        event.target.checked,
                                      )
                                    }
                                    type="checkbox"
                                  />
                                  <span>{department}</span>
                                </label>
                              )
                            })}
                          </fieldset>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </section>
        )
      })}
    </div>
  )
}

export function AdminWorkflowTransitionPage() {
  const [feedback, setFeedback] =
    useState<AdminWorkflowTransitionFeedbackValue | null>(null)
  const [loading, setLoading] = useState(true)
  const [savedTransitions, setSavedTransitions] = useState<WorkflowTransitionRule[]>([])
  const [saving, setSaving] = useState(false)
  const [statuses, setStatuses] = useState<string[]>([])
  const [transitions, setTransitions] = useState<WorkflowTransitionRule[]>([])
  const requestInFlight = useRef(false)

  useEffect(() => {
    let mounted = true
    requestInFlight.current = true

    async function loadConfiguration() {
      try {
        const configuration = await api.fetchAdminWorkflowTransitionConfiguration()
        if (!mounted) {
          return
        }

        const nextTransitions = cloneTransitions(configuration.transitions)
        setStatuses([...configuration.statuses])
        setTransitions(nextTransitions)
        setSavedTransitions(cloneTransitions(nextTransitions))
        setFeedback(null)
      } catch (error) {
        if (mounted) {
          setFeedback({
            kind: 'error',
            message: getAdminWorkflowTransitionErrorMessage(
              error,
              'Unable to load workflow transitions.',
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

    void loadConfiguration()

    return () => {
      mounted = false
    }
  }, [])

  function updateTransition(
    fromStatus: string,
    toStatus: string,
    update: (transition: WorkflowTransitionRule) => WorkflowTransitionRule,
  ) {
    if (saving || requestInFlight.current) {
      return
    }

    setTransitions((current) =>
      current.map((transition) =>
        transition.fromStatus === fromStatus && transition.toStatus === toStatus
          ? update(transition)
          : transition,
      ),
    )
    setFeedback(null)
  }

  function toggleEnabled(fromStatus: string, toStatus: string, checked: boolean) {
    updateTransition(fromStatus, toStatus, (transition) => ({
      ...transition,
      enabled: checked,
    }))
  }

  function toggleRole(
    fromStatus: string,
    toStatus: string,
    role: UserRole,
    checked: boolean,
  ) {
    updateTransition(fromStatus, toStatus, (transition) => ({
      ...transition,
      allowedRoles: toggleListValue(transition.allowedRoles, role, checked),
    }))
  }

  function toggleDepartment(
    fromStatus: string,
    toStatus: string,
    department: SetupOwnerDepartment,
    checked: boolean,
  ) {
    updateTransition(fromStatus, toStatus, (transition) => ({
      ...transition,
      allowedSetupOwnerDepartments: toggleListValue(
        transition.allowedSetupOwnerDepartments,
        department,
        checked,
      ),
    }))
  }

  const dirty = JSON.stringify(transitions) !== JSON.stringify(savedTransitions)

  async function saveConfiguration() {
    if (loading || saving || requestInFlight.current || !dirty) {
      return
    }

    requestInFlight.current = true
    setSaving(true)
    setFeedback(null)

    try {
      const savedConfiguration: AdminWorkflowTransitionConfiguration =
        await api.replaceAdminWorkflowTransitionConfiguration({
          transitions: cloneTransitions(transitions),
        })
      const nextTransitions = cloneTransitions(savedConfiguration.transitions)
      setStatuses([...savedConfiguration.statuses])
      setTransitions(nextTransitions)
      setSavedTransitions(cloneTransitions(nextTransitions))
      setFeedback({
        kind: 'success',
        message: 'Workflow transitions were saved.',
      })
    } catch (error) {
      setFeedback({
        kind: 'error',
        message: getAdminWorkflowTransitionErrorMessage(
          error,
          'Unable to save workflow transitions.',
        ),
      })
    } finally {
      requestInFlight.current = false
      setSaving(false)
    }
  }

  return (
    <article className="page-card admin-workflow-transition">
      <div className="page-card__header">
        <div>
          <p className="page-card__eyebrow">Admin tools</p>
          <h1>Workflow transition editor</h1>
          <p className="page-card__description">
            Enable or disable each directed manual status transition, then choose
            the roles and Setup File Owner departments that may perform it.
          </p>
        </div>
        <button
          className="primary-button"
          disabled={loading || saving || !dirty}
          onClick={() => void saveConfiguration()}
          type="button"
        >
          {saving ? 'Saving workflow changes…' : 'Save workflow changes'}
        </button>
      </div>

      <div className="page-card__body admin-workflow-transition__body">
        <AdminWorkflowTransitionFeedback feedback={feedback} loading={loading} />
        {!loading && transitions.length === 0 && !feedback ? (
          <p className="page-card__description">No workflow transitions are configured.</p>
        ) : null}
        {!loading && transitions.length > 0 ? (
          <AdminWorkflowTransitionMatrix
            disabled={saving}
            onToggleDepartment={toggleDepartment}
            onToggleEnabled={toggleEnabled}
            onToggleRole={toggleRole}
            statuses={statuses}
            transitions={transitions}
          />
        ) : null}
      </div>
    </article>
  )
}
