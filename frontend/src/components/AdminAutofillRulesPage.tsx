import { useEffect, useRef, useState } from 'react'
import type { FormSchemaField } from '../types/forms'
import { api, type AdminAutofillRule } from '../services/api'
import {
  canSaveAdminAutofillRuleDraft,
  createAdminAutofillRuleDraft,
  getAdminAutofillRuleErrorMessage,
  setAdminAutofillRuleDraftTrigger,
  toAdminAutofillRuleDraft,
  toggleAdminAutofillRuleDraftTarget,
  type AdminAutofillRuleDraft,
} from './adminAutofillRulesState'

type AdminAutofillRulesFeedbackValue = {
  kind: 'success' | 'error'
  message: string
}

function getFieldDescription(
  canonicalKey: string,
  fields: FormSchemaField[],
): string {
  const field = fields.find((candidate) => candidate.canonicalKey === canonicalKey)

  return field ? `${field.label} (${field.canonicalKey})` : canonicalKey
}

function getDraftValidationMessage(draft: AdminAutofillRuleDraft): string | null {
  if (draft.triggerCanonicalKey.trim().length === 0) {
    return 'Choose an autofill trigger field.'
  }

  if (draft.targetCanonicalKeys.length === 0) {
    return 'Choose at least one fill target field.'
  }

  if (!canSaveAdminAutofillRuleDraft(draft)) {
    return 'Choose unique fill target fields that do not include the trigger.'
  }

  return null
}

export function AdminAutofillRulesFeedback({
  feedback,
  loading,
}: {
  feedback: AdminAutofillRulesFeedbackValue | null
  loading: boolean
}) {
  if (loading) {
    return (
      <p className="page-card__description" role="status">
        Loading autofill rules…
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

export interface AdminAutofillRulesTableProps {
  disabled: boolean
  fields: FormSchemaField[]
  onEdit: (rule: AdminAutofillRule) => void
  rules: AdminAutofillRule[]
}

export function AdminAutofillRulesTable({
  disabled,
  fields,
  onEdit,
  rules,
}: AdminAutofillRulesTableProps) {
  return (
    <div className="data-table admin-autofill-rules__table">
      <table>
        <thead>
          <tr>
            <th scope="col">Trigger field</th>
            <th scope="col">Fill target fields</th>
            <th scope="col">Action</th>
          </tr>
        </thead>
        <tbody>
          {rules.map((rule) => (
            <tr key={rule.id}>
              <td>
                <strong>{getFieldDescription(rule.triggerCanonicalKey, fields)}</strong>
                <span>{rule.triggerCanonicalKey}</span>
              </td>
              <td>
                <ul className="admin-autofill-rules__targets">
                  {rule.targetCanonicalKeys.map((targetCanonicalKey) => (
                    <li key={targetCanonicalKey}>
                      {getFieldDescription(targetCanonicalKey, fields)}
                    </li>
                  ))}
                </ul>
              </td>
              <td>
                <button
                  className="secondary-button"
                  disabled={disabled}
                  id={`admin-autofill-edit-${rule.id}`}
                  onClick={() => onEdit(rule)}
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
  )
}

export interface AdminAutofillRuleEditorProps {
  disabled: boolean
  draft: AdminAutofillRuleDraft
  fields: FormSchemaField[]
  isEditing: boolean
  onCancel: () => void
  onChangeTarget: (canonicalKey: string, checked: boolean) => void
  onChangeTrigger: (canonicalKey: string) => void
  onSave: () => void
}

export function AdminAutofillRuleEditor({
  disabled,
  draft,
  fields,
  isEditing,
  onCancel,
  onChangeTarget,
  onChangeTrigger,
  onSave,
}: AdminAutofillRuleEditorProps) {
  const triggerFields = fields.filter((field) => field.autofillTrigger === true)
  const targetFields = fields.filter(
    (field) => field.canonicalKey !== draft.triggerCanonicalKey,
  )
  const validationMessage = getDraftValidationMessage(draft)
  const saveLabel = isEditing ? 'Save autofill rule' : 'Create autofill rule'

  return (
    <section className="page-card__section admin-autofill-rules__editor">
      <div className="admin-autofill-rules__editor-header">
        <div>
          <h2>{isEditing ? 'Edit autofill rule' : 'Create autofill rule'}</h2>
          <p>
            Choose a schema field that may trigger autofill, then choose the
            canonical fields it should fill from a previous completed submission.
          </p>
        </div>
      </div>

      <label className="admin-autofill-rules__field" htmlFor="admin-autofill-trigger">
        <span>Autofill trigger field</span>
        <select
          disabled={disabled}
          id="admin-autofill-trigger"
          onChange={(event) => onChangeTrigger(event.target.value)}
          value={draft.triggerCanonicalKey}
        >
          <option value="">Choose a trigger field</option>
          {triggerFields.map((field) => (
            <option key={field.canonicalKey} value={field.canonicalKey}>
              {field.label} ({field.canonicalKey})
            </option>
          ))}
        </select>
      </label>

      <fieldset className="admin-autofill-rules__targets-fieldset">
        <legend>Fill target fields</legend>
        <p className="page-card__description">
          Select one or more fields to fill. Canonical keys are saved; labels are
          shown only for administration.
        </p>
        <div className="admin-autofill-rules__target-options">
          {targetFields.map((field) => {
            const inputId = `admin-autofill-target-${field.canonicalKey}`

            return (
              <label htmlFor={inputId} key={field.canonicalKey}>
                <input
                  checked={draft.targetCanonicalKeys.includes(field.canonicalKey)}
                  disabled={disabled}
                  id={inputId}
                  onChange={(event) =>
                    onChangeTarget(field.canonicalKey, event.target.checked)
                  }
                  type="checkbox"
                />
                <span>
                  {field.label} ({field.canonicalKey})
                </span>
              </label>
            )
          })}
        </div>
      </fieldset>

      {validationMessage ? (
        <p className="form-error" role="alert">
          {validationMessage}
        </p>
      ) : null}

      <div className="admin-autofill-rules__actions">
        <button
          className="secondary-button"
          disabled={disabled}
          onClick={onCancel}
          type="button"
        >
          Cancel
        </button>
        <button
          className="primary-button"
          disabled={disabled || !canSaveAdminAutofillRuleDraft(draft)}
          onClick={onSave}
          type="button"
        >
          {saveLabel}
        </button>
      </div>
    </section>
  )
}

export function AdminAutofillRulesPage() {
  const [draft, setDraft] = useState<AdminAutofillRuleDraft>(
    createAdminAutofillRuleDraft,
  )
  const [editingRuleId, setEditingRuleId] = useState<string | null>(null)
  const [feedback, setFeedback] = useState<AdminAutofillRulesFeedbackValue | null>(
    null,
  )
  const [fields, setFields] = useState<FormSchemaField[]>([])
  const [loading, setLoading] = useState(true)
  const [rules, setRules] = useState<AdminAutofillRule[]>([])
  const [saving, setSaving] = useState(false)
  const [showEditor, setShowEditor] = useState(false)
  const requestInFlight = useRef(false)

  useEffect(() => {
    let mounted = true
    requestInFlight.current = true

    async function loadConfiguration() {
      try {
        const [activeSchema, savedRules] = await Promise.all([
          api.fetchActiveFormSchema('psf-request'),
          api.fetchAdminAutofillRules(),
        ])
        if (!mounted) {
          return
        }

        setFields(activeSchema.schema.sections.flatMap((section) => section.fields))
        setRules(savedRules)
        setFeedback(null)
      } catch (error) {
        if (mounted) {
          setFeedback({
            kind: 'error',
            message: getAdminAutofillRuleErrorMessage(
              error,
              'Unable to load autofill rules.',
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

  function startCreateRule() {
    if (loading || saving || requestInFlight.current) {
      return
    }

    setDraft(createAdminAutofillRuleDraft())
    setEditingRuleId(null)
    setFeedback(null)
    setShowEditor(true)
  }

  function startEditRule(rule: AdminAutofillRule) {
    if (saving || requestInFlight.current) {
      return
    }

    setDraft(toAdminAutofillRuleDraft(rule))
    setEditingRuleId(rule.id)
    setFeedback(null)
    setShowEditor(true)
  }

  function cancelEditing() {
    if (saving || requestInFlight.current) {
      return
    }

    setDraft(createAdminAutofillRuleDraft())
    setEditingRuleId(null)
    setFeedback(null)
    setShowEditor(false)
  }

  function changeTrigger(canonicalKey: string) {
    if (saving || requestInFlight.current) {
      return
    }

    setDraft((current) => setAdminAutofillRuleDraftTrigger(current, canonicalKey))
    setFeedback(null)
  }

  function changeTarget(canonicalKey: string, checked: boolean) {
    if (saving || requestInFlight.current) {
      return
    }

    setDraft((current) =>
      toggleAdminAutofillRuleDraftTarget(current, canonicalKey, checked),
    )
    setFeedback(null)
  }

  async function saveRule() {
    if (
      loading ||
      saving ||
      requestInFlight.current ||
      !showEditor ||
      !canSaveAdminAutofillRuleDraft(draft)
    ) {
      return
    }

    const payload: AdminAutofillRuleDraft = {
      formKey: draft.formKey,
      triggerCanonicalKey: draft.triggerCanonicalKey,
      targetCanonicalKeys: [...draft.targetCanonicalKeys],
    }
    const wasEditing = editingRuleId !== null
    requestInFlight.current = true
    setSaving(true)
    setFeedback(null)

    try {
      const savedRule = editingRuleId
        ? await api.updateAdminAutofillRule(editingRuleId, payload)
        : await api.createAdminAutofillRule(payload)

      setRules((currentRules) =>
        wasEditing
          ? currentRules.map((rule) => (rule.id === savedRule.id ? savedRule : rule))
          : [...currentRules, savedRule],
      )
      setDraft(createAdminAutofillRuleDraft())
      setEditingRuleId(null)
      setShowEditor(false)
      setFeedback({
        kind: 'success',
        message: wasEditing
          ? 'Autofill rule was saved.'
          : 'Autofill rule was created.',
      })

      try {
        const refreshedRules = await api.fetchAdminAutofillRules()

        setRules(refreshedRules)
      } catch (error) {
        const refreshMessage = getAdminAutofillRuleErrorMessage(
          error,
          'Unable to refresh the saved rule list.',
        )

        setFeedback({
          kind: 'error',
          message: wasEditing
            ? `Autofill rule was saved, but the refreshed list could not be loaded: ${refreshMessage}`
            : `Autofill rule was created, but the refreshed list could not be loaded: ${refreshMessage}`,
        })
      }
    } catch (error) {
      setFeedback({
        kind: 'error',
        message: getAdminAutofillRuleErrorMessage(
          error,
          'Unable to save autofill rule.',
        ),
      })
    } finally {
      requestInFlight.current = false
      setSaving(false)
    }
  }

  return (
    <article className="page-card admin-autofill-rules">
      <div className="page-card__header">
        <div>
          <p className="page-card__eyebrow">Admin tools</p>
          <h1>Autofill rule management</h1>
          <p className="page-card__description">
            Configure a canonical trigger field and the fields it may fill from a
            previous completed PSF request. The server validates and persists every
            rule.
          </p>
        </div>
        <button
          className="primary-button"
          disabled={loading || saving}
          onClick={startCreateRule}
          type="button"
        >
          Create rule
        </button>
      </div>

      <div className="page-card__body admin-autofill-rules__body">
        <AdminAutofillRulesFeedback feedback={feedback} loading={loading} />
        {!loading && rules.length === 0 && !showEditor && !feedback ? (
          <p className="page-card__description">No autofill rules are configured.</p>
        ) : null}
        {!loading && rules.length > 0 ? (
          <AdminAutofillRulesTable
            disabled={saving}
            fields={fields}
            onEdit={startEditRule}
            rules={rules}
          />
        ) : null}
        {!loading && showEditor ? (
          <AdminAutofillRuleEditor
            disabled={saving}
            draft={draft}
            fields={fields}
            isEditing={editingRuleId !== null}
            onCancel={cancelEditing}
            onChangeTarget={changeTarget}
            onChangeTrigger={changeTrigger}
            onSave={() => void saveRule()}
          />
        ) : null}
      </div>
    </article>
  )
}
