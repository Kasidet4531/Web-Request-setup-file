import { useEffect, useMemo, useRef, useState } from 'react'
import { DynamicFormRenderer } from './DynamicFormRenderer'
import { AdminFormConfigEditor, AdminFormConfigFieldEditor } from './AdminFormConfigEditor'
import {
  buildAdminFormConfigSavePayload,
  buildPreviewSchema,
  canPublishFormConfig,
  formatFormSchemaDraft,
  getAdminFormConfigErrorMessage,
  parseFormSchemaDraft,
  readFormSchemaEditorDraft,
  requiresUnsavedVersionConfirmation,
  selectInitialFormConfigVersion,
  selectRefreshedFormConfigVersion,
} from './adminFormConfigState'
import { api } from '../services/api'
import type { FormSchema, FormSchemaField, FormSchemaVersionResponse } from '../types/forms'

type AdminFormConfigFeedbackValue = {
  kind: 'success' | 'error'
  message: string
}

export interface AdminFormConfigVersionSelectorProps {
  disabled: boolean
  onSelect: (version: number) => void
  selectedVersion: FormSchemaVersionResponse | null
  versions: FormSchemaVersionResponse[]
}

export function AdminFormConfigVersionSelector({
  disabled,
  onSelect,
  selectedVersion,
  versions,
}: AdminFormConfigVersionSelectorProps) {
  return (
    <label className="admin-form-config__field admin-form-config__version" htmlFor="form-config-version">
      <span>Version</span>
      <select
        disabled={disabled || versions.length === 0}
        id="form-config-version"
        onChange={(event) => onSelect(Number(event.target.value))}
        value={selectedVersion?.version ?? ''}
      >
        <option disabled value="">
          Select a form schema version
        </option>
        {versions.map((version) => (
          <option key={`${version.version}-${version.status}`} value={version.version}>
            Version {version.version} · {version.status} · {version.title}
          </option>
        ))}
      </select>
    </label>
  )
}

export function AdminFormConfigPreview({ schema }: { schema: FormSchema | null }) {
  return schema ? <DynamicFormRenderer readOnly schema={schema} /> : null
}

export function AdminFormConfigFeedback({
  feedback,
  loading,
}: {
  feedback: AdminFormConfigFeedbackValue | null
  loading: boolean
}) {
  if (loading) {
    return (
      <p className="page-card__description" role="status">
        Loading form schema versions…
      </p>
    )
  }

  if (!feedback) {
    return null
  }

  return (
    <p className={`status-pill status-pill--${feedback.kind}`} role={feedback.kind === 'error' ? 'alert' : 'status'}>
      {feedback.message}
    </p>
  )
}

export function AdminFormConfigPage() {
  const [editorText, setEditorText] = useState('')
  const [feedback, setFeedback] = useState<AdminFormConfigFeedbackValue | null>(null)
  const [loading, setLoading] = useState(true)
  const [publishing, setPublishing] = useState(false)
  const [savedEditorText, setSavedEditorText] = useState('')
  const [saving, setSaving] = useState(false)
  const [selectedVersion, setSelectedVersion] = useState<FormSchemaVersionResponse | null>(null)
  const [versions, setVersions] = useState<FormSchemaVersionResponse[]>([])
  const [fieldEdit, setFieldEdit] = useState<{ sectionIndex: number; fieldIndex: number | null; field: FormSchemaField } | null>(null)
  const requestInFlight = useRef(false)
  const fieldDialogRef = useRef<HTMLDialogElement>(null)
  const previewDialogRef = useRef<HTMLDialogElement>(null)
  const fieldTriggerRef = useRef<HTMLButtonElement>(null)
  const fieldFallbackRef = useRef<HTMLButtonElement>(null)
  const previewTriggerRef = useRef<HTMLButtonElement>(null)

  const parsed = useMemo(() => parseFormSchemaDraft(editorText), [editorText])
  const visualSchema = useMemo(() => readFormSchemaEditorDraft(editorText), [editorText])
  const dirty = editorText !== savedEditorText
  const busy = loading || saving || publishing
  const previewSchema = useMemo(
    () => (parsed.schema && selectedVersion ? buildPreviewSchema(parsed.schema, selectedVersion) : null),
    [parsed.schema, selectedVersion],
  )
  const publishAllowed = canPublishFormConfig({
    busy,
    dirty,
    parsedSchema: parsed.schema,
    selectedVersion,
  })

  function applySelectedVersion(version: FormSchemaVersionResponse) {
    const nextEditorText = formatFormSchemaDraft(version.schema)
    setSelectedVersion(version)
    setEditorText(nextEditorText)
    setSavedEditorText(nextEditorText)
  }

  useEffect(() => {
    let mounted = true
    requestInFlight.current = true

    async function loadInitialVersions() {
      try {
        const response = await api.fetchAdminFormConfig()
        if (!mounted) {
          return
        }

        const nextVersion = selectInitialFormConfigVersion(response.versions)
        setVersions(response.versions)
        if (!nextVersion) {
          setFeedback({ kind: 'error', message: 'No saved form schema versions are available.' })
          return
        }

        applySelectedVersion(nextVersion)
      } catch (error) {
        if (mounted) {
          setFeedback({
            kind: 'error',
            message: getAdminFormConfigErrorMessage(error, 'Unable to load form configuration.'),
          })
        }
      } finally {
        requestInFlight.current = false
        if (mounted) {
          setLoading(false)
        }
      }
    }

    void loadInitialVersions()

    return () => {
      mounted = false
    }
  }, [])

  useEffect(() => {
    if (fieldEdit && !fieldDialogRef.current?.open) {
      fieldDialogRef.current?.showModal()
      fieldDialogRef.current?.querySelector<HTMLInputElement>('#form-config-field-label')?.focus()
    }
  }, [fieldEdit])

  function closeFieldEditor() {
    if (fieldDialogRef.current?.open) fieldDialogRef.current.close()
    setFieldEdit(null)
    restoreFieldFocus()
  }

  function restoreFieldFocus() {
    if (fieldTriggerRef.current?.isConnected === false) fieldFallbackRef.current?.focus()
    else fieldTriggerRef.current?.focus()
  }

  function applyFieldEdit() {
    if (!visualSchema || !fieldEdit || busy || !fieldEdit.field.label.trim()) return
    if ((fieldEdit.field.type === 'select' || fieldEdit.field.type === 'radio') &&
      (!fieldEdit.field.options?.length || fieldEdit.field.options.some((choice) => !choice.trim()))) return
    const next = structuredClone(visualSchema)
    const fields = next.sections[fieldEdit.sectionIndex]?.fields
    if (!fields) return
    if (fieldEdit.fieldIndex === null) fields.push(fieldEdit.field)
    else if (fields[fieldEdit.fieldIndex]?.fieldKey === fieldEdit.field.fieldKey) fields[fieldEdit.fieldIndex] = fieldEdit.field
    else return
    updateEditorText(formatFormSchemaDraft(next))
    closeFieldEditor()
  }

  function removeField() {
    if (!visualSchema || !fieldEdit || fieldEdit.fieldIndex === null || busy) return
    if (visualSchema.sections.reduce((count, section) => count + section.fields.length, 0) <= 1) return
    if (!window.confirm(`Remove ${fieldEdit.field.label}?`)) return
    const next = structuredClone(visualSchema)
    if (next.sections[fieldEdit.sectionIndex]?.fields[fieldEdit.fieldIndex]?.fieldKey !== fieldEdit.field.fieldKey) return
    next.sections[fieldEdit.sectionIndex].fields.splice(fieldEdit.fieldIndex, 1)
    updateEditorText(formatFormSchemaDraft(next))
    closeFieldEditor()
  }

  async function reloadVersions() {
    if (busy || requestInFlight.current) {
      return
    }

    if (dirty && !window.confirm('Discard unsaved schema changes and reload stored versions?')) {
      return
    }

    requestInFlight.current = true
    setLoading(true)
    setFeedback(null)

    try {
      const response = await api.fetchAdminFormConfig()
      const nextVersion = selectedVersion
        ? response.versions.find((version) => version.version === selectedVersion.version)
          ?? selectInitialFormConfigVersion(response.versions)
        : selectInitialFormConfigVersion(response.versions)

      setVersions(response.versions)
      if (!nextVersion) {
        setFeedback({ kind: 'error', message: 'No saved form schema versions are available.' })
        return
      }

      applySelectedVersion(nextVersion)
    } catch (error) {
      setFeedback({
        kind: 'error',
        message: getAdminFormConfigErrorMessage(error, 'Unable to reload form configuration.'),
      })
    } finally {
      requestInFlight.current = false
      setLoading(false)
    }
  }

  function selectVersion(nextVersionNumber: number) {
    if (busy || requestInFlight.current || nextVersionNumber === selectedVersion?.version) {
      return
    }

    if (requiresUnsavedVersionConfirmation(dirty, selectedVersion?.version ?? null, nextVersionNumber)) {
      const shouldDiscard = window.confirm('Discard unsaved schema changes and switch versions?')
      if (!shouldDiscard) {
        return
      }
    }

    const nextVersion = versions.find((version) => version.version === nextVersionNumber)
    if (!nextVersion) {
      return
    }

    setFeedback(null)
    applySelectedVersion(nextVersion)
  }

  function updateEditorText(nextEditorText: string) {
    if (busy) {
      return
    }

    setEditorText(nextEditorText)
    setFeedback(null)
  }

  async function saveDraft() {
    if (!selectedVersion || !parsed.schema || busy || requestInFlight.current) {
      return
    }

    requestInFlight.current = true
    setSaving(true)
    setFeedback(null)

    try {
      const savedDraft = await api.saveAdminFormConfigDraft(
        buildAdminFormConfigSavePayload(selectedVersion, parsed.schema),
      )
      const refreshed = await api.fetchAdminFormConfig()
      const nextVersion = selectRefreshedFormConfigVersion(refreshed.versions, savedDraft)

      setVersions(refreshed.versions)
      applySelectedVersion(nextVersion)
      setFeedback({ kind: 'success', message: `Draft version ${nextVersion.version} saved.` })
    } catch (error) {
      setFeedback({
        kind: 'error',
        message: getAdminFormConfigErrorMessage(error, 'Unable to save form configuration draft.'),
      })
    } finally {
      requestInFlight.current = false
      setSaving(false)
    }
  }

  async function publishDraft() {
    if (!publishAllowed || !selectedVersion || requestInFlight.current) {
      return
    }

    requestInFlight.current = true
    setPublishing(true)
    setFeedback(null)

    try {
      const publishedVersion = await api.publishAdminFormConfigDraft({ version: selectedVersion.version })
      const refreshed = await api.fetchAdminFormConfig()
      const nextVersion = selectRefreshedFormConfigVersion(refreshed.versions, publishedVersion)

      setVersions(refreshed.versions)
      applySelectedVersion(nextVersion)
      setFeedback({ kind: 'success', message: `Version ${nextVersion.version} published and is now active.` })
    } catch (error) {
      setFeedback({
        kind: 'error',
        message: getAdminFormConfigErrorMessage(error, 'Unable to publish form configuration draft.'),
      })
    } finally {
      requestInFlight.current = false
      setPublishing(false)
    }
  }

  return (
    <article className="page-card admin-form-config">
      <div className="page-card__header">
        <div>
          <h1>Form configuration</h1>
        </div>
      </div>

      <div className="page-card__body admin-form-config__body">
        <AdminFormConfigFeedback feedback={feedback} loading={loading} />

        {!loading && selectedVersion ? (
          <>
            <section className="page-card__section admin-form-config__editor" aria-labelledby="form-config-editor-heading">
              <div className="admin-form-config__section-header">
                <div>
                  <h2 id="form-config-editor-heading">Edit form</h2>
                </div>
                <button className="secondary-button" disabled={busy} onClick={() => void reloadVersions()} type="button">
                  Reload versions
                </button>
              </div>

              <AdminFormConfigVersionSelector
                disabled={busy}
                onSelect={selectVersion}
                selectedVersion={selectedVersion}
                versions={versions}
              />

              <div className="admin-form-config__toolbar">
                <button className="secondary-button" disabled={busy} onClick={(event) => {
                  previewTriggerRef.current = event.currentTarget
                  previewDialogRef.current?.showModal()
                }} type="button">Preview form</button>
                <div className="admin-form-config__actions">
                  <button className="primary-button" disabled={busy || !parsed.schema} onClick={() => void saveDraft()} type="button">
                    {saving ? 'Saving draft…' : 'Save draft'}
                  </button>
                  <button className="secondary-button" disabled={!publishAllowed} onClick={() => void publishDraft()} type="button">
                    {publishing ? 'Publishing…' : 'Publish selected draft'}
                  </button>
                </div>
              </div>

              {visualSchema ? (
                <AdminFormConfigEditor
                  disabled={busy}
                  onChange={(draft) => updateEditorText(formatFormSchemaDraft(draft))}
                  onEditField={(sectionIndex, fieldIndex, field, trigger) => {
                    if (busy) return
                    fieldTriggerRef.current = trigger
                    fieldFallbackRef.current = trigger.closest?.('.admin-form-config__section')?.querySelector('.admin-form-config__add-field') ?? null
                    setFieldEdit({ sectionIndex, fieldIndex, field: structuredClone(field) })
                  }}
                  schema={visualSchema}
                />
              ) : (
                <p className="page-card__description">Fix the JSON below to return to the form editor.</p>
              )}
              <details className="admin-form-config__advanced">
                <summary>Advanced · Edit schema JSON</summary>
                <label className="admin-form-config__field" htmlFor="form-config-json">
                  <span>Schema JSON</span>
                  <textarea
                    aria-describedby={parsed.error ? 'form-config-json-error' : undefined}
                    aria-invalid={parsed.error ? true : undefined}
                    disabled={busy}
                    id="form-config-json"
                    onChange={(event) => updateEditorText(event.target.value)}
                    rows={20}
                    spellCheck={false}
                    value={editorText}
                  />
                </label>
              </details>
              {parsed.error ? (
                <p className="dynamic-form__error" id="form-config-json-error" role="alert">
                  {parsed.error}
                </p>
              ) : null}

            </section>

            <dialog aria-labelledby="form-config-field-dialog-title" className="admin-form-config__field-dialog" onClose={() => {
              setFieldEdit(null)
              restoreFieldFocus()
            }} ref={fieldDialogRef}>
              {fieldEdit ? <AdminFormConfigFieldEditor
                canRemove={!!visualSchema && visualSchema.sections.reduce((count, section) => count + section.fields.length, 0) > 1}
                field={fieldEdit.field}
                isNew={fieldEdit.fieldIndex === null}
                onApply={applyFieldEdit}
                onCancel={closeFieldEditor}
                onChange={(field) => setFieldEdit((current) => current ? { ...current, field } : null)}
                onRemove={removeField}
              /> : null}
            </dialog>

            <dialog aria-labelledby="form-config-preview-title" className="admin-form-config__preview-dialog" onClose={() => previewTriggerRef.current?.focus()} ref={previewDialogRef}>
              <div className="admin-form-config__modal-head">
                <div><h2 id="form-config-preview-title">Form preview</h2><p>{dirty ? 'Unsaved page draft' : 'Selected version'} · preview only</p></div>
                <button aria-label="Close preview" className="secondary-button" onClick={() => previewDialogRef.current?.close()} type="button">×</button>
              </div>
              {previewSchema ? (
                <AdminFormConfigPreview schema={previewSchema} />
              ) : (
                <p className="page-card__description">Fix the form errors above to see the preview.</p>
              )}
            </dialog>
          </>
        ) : null}
      </div>
    </article>
  )
}
