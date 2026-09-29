import { useContext, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from '@tanstack/react-router'
import { DynamicFormRenderer } from './DynamicFormRenderer'
import { AdminFormConfigEditor, AdminFormConfigFieldEditor } from './AdminFormConfigEditor'
import { FormVersionBreadcrumbContext } from './formVersionBreadcrumb'
import {
  buildAdminFormConfigSavePayload,
  buildPreviewSchema,
  canPublishFormConfig,
  formatFormSchemaDraft,
  getAdminFormConfigErrorMessage,
  parseFormSchemaDraft,
  readFormSchemaEditorDraft,
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
  onDuplicate: (version: number) => void
  onDiscard: (version: number) => void
  onPublish: (version: number) => void
  versions: FormSchemaVersionResponse[]
}

export function AdminFormConfigVersionSelector({
  disabled,
  onDuplicate,
  onDiscard,
  onPublish,
  versions,
}: AdminFormConfigVersionSelectorProps) {
  const hasDraft = versions.some((version) => version.status === 'draft')
  return (
    <section className="admin-form-config__versions">
      <div className="admin-form-config__table-scroll">
        <table className="admin-form-config__version-table">
          <caption className="sr-only">Form versions</caption>
          <thead><tr><th scope="col">Version</th><th scope="col">Title</th><th scope="col">Status</th><th scope="col">Created</th><th scope="col">Published</th><th scope="col">Actions</th></tr></thead>
          <tbody>{versions.map((version) => (
            <tr className={version.status === 'active' ? 'admin-form-config__version-row admin-form-config__version-row--active' : 'admin-form-config__version-row'} key={version.version}>
              <th scope="row">{disabled ? `v${version.version}` : <Link aria-label={`Open form version ${version.version}`} className="admin-form-config__version-link" params={{ version: String(version.version) }} to="/admin/form-config/$version">v{version.version}</Link>}</th>
              <td>{version.title}</td>
              <td><span className={`admin-form-config__status admin-form-config__status--${version.status}`}>{version.status === 'published' ? 'Inactive' : version.status === 'active' ? 'Active' : 'Draft'}</span></td>
              <td><time dateTime={version.createdAt}>{new Date(version.createdAt).toLocaleDateString()}</time></td>
              <td>{version.publishedAt ? <time dateTime={version.publishedAt}>{new Date(version.publishedAt).toLocaleDateString()}</time> : '—'}</td>
              <td><div className="admin-form-config__controls">
                {version.status === 'draft' ? <>
                  <button aria-label={`Publish version ${version.version}`} className="primary-button" disabled={disabled} onClick={() => onPublish(version.version)} type="button">Publish</button>
                  <button aria-label={`Discard draft version ${version.version}`} className="secondary-button admin-form-config__danger" disabled={disabled} onClick={() => onDiscard(version.version)} type="button">Discard</button>
                </> : <button aria-label={`Duplicate version ${version.version} as draft`} className="secondary-button" disabled={disabled || hasDraft} title={hasDraft ? 'Open or discard the existing draft before duplicating another version.' : undefined} onClick={() => onDuplicate(version.version)} type="button">Duplicate as draft</button>}
              </div></td>
            </tr>
          ))}</tbody>
        </table>
      </div>
      {hasDraft ? <p className="page-card__description">A draft already exists. Open or discard it before duplicating another version.</p> : <p className="page-card__description">To make an older form active, duplicate it as a draft and publish the new version.</p>}
    </section>
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

export function AdminFormConfigVersionPage() {
  const { version } = useParams({ from: '/admin/form-config/$version' })
  return <AdminFormConfigPage key={version} version={version} />
}

export function AdminFormConfigPage({ version }: { version?: string }) {
  const navigate = useNavigate()
  const setFormVersionBreadcrumb = useContext(FormVersionBreadcrumbContext)
  const isEditor = version !== undefined
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
  const editable = selectedVersion?.status === 'draft'
  useEffect(() => {
    if (!isEditor || !selectedVersion) return
    setFormVersionBreadcrumb({ version: selectedVersion.version, status: selectedVersion.status, dirty })
    return () => setFormVersionBreadcrumb(null)
  }, [dirty, isEditor, selectedVersion, setFormVersionBreadcrumb])
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

        const nextVersion = isEditor
          ? response.versions.find((item) => String(item.version) === version)
          : selectInitialFormConfigVersion(response.versions)
        setVersions(response.versions)
        if (!nextVersion) {
          setFeedback({ kind: 'error', message: isEditor ? 'This form version is unavailable.' : 'No saved form schema versions are available.' })
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
  }, [isEditor, version])

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
    if (!visualSchema || !fieldEdit || busy || !editable || !fieldEdit.field.label.trim()) return
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
    if (!visualSchema || !fieldEdit || fieldEdit.fieldIndex === null || busy || !editable) return
    if (visualSchema.sections.reduce((count, section) => count + section.fields.length, 0) <= 1) return
    if (!window.confirm(`Remove ${fieldEdit.field.label}?`)) return
    const next = structuredClone(visualSchema)
    if (next.sections[fieldEdit.sectionIndex]?.fields[fieldEdit.fieldIndex]?.fieldKey !== fieldEdit.field.fieldKey) return
    next.sections[fieldEdit.sectionIndex].fields.splice(fieldEdit.fieldIndex, 1)
    updateEditorText(formatFormSchemaDraft(next))
    closeFieldEditor()
  }

  function updateEditorText(nextEditorText: string) {
    if (busy || !editable) {
      return
    }

    setEditorText(nextEditorText)
    setFeedback(null)
  }

  async function saveDraft() {
    if (!selectedVersion || !editable || !parsed.schema || busy || requestInFlight.current) {
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

  async function publishDraft(versionNumber: number) {
    const target = versions.find((item) => item.version === versionNumber && item.status === 'draft')
    if (!target || busy || requestInFlight.current || (isEditor && !publishAllowed)) return
    if (!window.confirm(`Publish v${versionNumber}? New requests will use v${versionNumber}. Existing Draft requests keep their current version and must be explicitly upgraded before they can be submitted. Already submitted requests keep their saved form snapshot and do not change.`)) return

    requestInFlight.current = true
    setPublishing(true)
    setFeedback(null)

    try {
      const publishedVersion = await api.publishAdminFormConfigDraft({ version: versionNumber })
      const refreshed = await api.fetchAdminFormConfig()
      const nextVersion = selectRefreshedFormConfigVersion(refreshed.versions, publishedVersion)

      setVersions(refreshed.versions)
      if (isEditor) applySelectedVersion(nextVersion)
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

  async function duplicateVersion(version: number) {
    if (busy || requestInFlight.current || versions.some((item) => item.status === 'draft')) return
    requestInFlight.current = true
    setLoading(true)
    setFeedback(null)
    try {
      const created = await api.duplicateAdminFormConfigVersion({ version })
      await navigate({ to: '/admin/form-config/$version', params: { version: String(created.version) } })
    } catch (error) {
      setFeedback({ kind: 'error', message: getAdminFormConfigErrorMessage(error, 'Unable to duplicate form version.') })
    } finally {
      requestInFlight.current = false
      setLoading(false)
    }
  }

  async function discardDraft(version: number) {
    if (busy || requestInFlight.current || !versions.some((item) => item.version === version && item.status === 'draft')) return
    if (!window.confirm(`Discard draft v${version}? This draft will no longer be available, but its version record is retained.`)) return
    requestInFlight.current = true
    setLoading(true)
    setFeedback(null)
    try {
      await api.discardAdminFormConfigDraft(version)
      const refreshed = await api.fetchAdminFormConfig()
      setVersions(refreshed.versions)
      const next = selectInitialFormConfigVersion(refreshed.versions)
      if (next && !isEditor) applySelectedVersion(next)
      setFeedback({ kind: 'success', message: `Draft version ${version} discarded.` })
    } catch (error) {
      setFeedback({ kind: 'error', message: getAdminFormConfigErrorMessage(error, 'Unable to discard draft.') })
    } finally {
      requestInFlight.current = false
      setLoading(false)
    }
  }

  return (
    <article className="page-card admin-form-config">
      {!isEditor ? <div className="page-card__header"><h1>Form management</h1></div> : null}

      <div className="page-card__body admin-form-config__body">
        <AdminFormConfigFeedback feedback={feedback} loading={loading} />

        {!loading && !isEditor && selectedVersion ? <AdminFormConfigVersionSelector
          disabled={busy}
          onDuplicate={(number) => void duplicateVersion(number)}
          onDiscard={(number) => void discardDraft(number)}
          onPublish={(number) => void publishDraft(number)}
          versions={versions}
        /> : null}
        {!loading && isEditor && !selectedVersion ? <Link to="/admin/form-config">Back to Form management</Link> : null}
        {!loading && isEditor && selectedVersion ? (
          <>
            <div className="admin-form-config__section-header">
              <h1 id="form-config-editor-heading">v{selectedVersion.version} · {selectedVersion.title}</h1>
              <button className="secondary-button" disabled={busy} onClick={(event) => {
                previewTriggerRef.current = event.currentTarget
                previewDialogRef.current?.showModal()
              }} type="button">Preview form</button>
            </div>
            {!editable ? <div className="admin-form-config__view-banner" role="status">
              <p>You're viewing v{selectedVersion.version} ({selectedVersion.status === 'active' ? 'Active' : 'Inactive'}). This version is read-only.</p>
              <button className="primary-button" disabled={busy || versions.some((item) => item.status === 'draft')} title={versions.some((item) => item.status === 'draft') ? 'Open or discard the existing draft before duplicating another version.' : undefined} onClick={() => void duplicateVersion(selectedVersion.version)} type="button">Duplicate as draft</button>
            </div> : null}
            {editable ? <div className="admin-form-config__toolbar">
              <span role="status">{dirty ? 'Unsaved changes' : 'All changes saved'}</span>
              <div className="admin-form-config__actions">
                <button className="secondary-button" disabled={busy || !parsed.schema || !dirty} onClick={() => void saveDraft()} type="button">{saving ? 'Saving draft…' : 'Save draft'}</button>
                <button className="primary-button" disabled={!publishAllowed} onClick={() => void publishDraft(selectedVersion.version)} type="button">{publishing ? 'Publishing…' : 'Publish'}</button>
              </div>
            </div> : null}
            <div className="admin-form-config__editor" aria-labelledby="form-config-editor-heading">
              {visualSchema ? (
                <AdminFormConfigEditor
                  disabled={busy}
                  readOnly={!editable}
                  onChange={(draft) => updateEditorText(formatFormSchemaDraft(draft))}
                  onEditField={(sectionIndex, fieldIndex, field, trigger) => {
                    if (busy || !editable) return
                    fieldTriggerRef.current = trigger
                    fieldFallbackRef.current = trigger.closest?.('.admin-form-config__section')?.querySelector('.admin-form-config__add-field') ?? null
                    setFieldEdit({ sectionIndex, fieldIndex, field: structuredClone(field) })
                  }}
                  schema={visualSchema}
                />
              ) : (
                <p className="page-card__description">Fix the JSON below to return to the form editor.</p>
              )}
              {editable ? <details className="admin-form-config__advanced">
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
              </details> : null}
              {parsed.error ? (
                <p className="dynamic-form__error" id="form-config-json-error" role="alert">
                  {parsed.error}
                </p>
              ) : null}

            </div>

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
