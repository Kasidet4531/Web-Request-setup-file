import { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useBlocker, useNavigate, useParams, useSearch } from '@tanstack/react-router'
import { ArrowLeft, X } from 'lucide-react'
import { PageHeader } from './ui/PageHeader'
import { AsyncNotice } from './ui/AsyncNotice'
import { StatusLabel } from './ui/StatusLabel'
import { ConfirmDialog } from './ui/ConfirmDialog'
import { DynamicFormRenderer } from './DynamicFormRenderer'
import { AdminFormConfigEditor, AdminFormConfigFieldEditor } from './AdminFormConfigEditor'
import { FormVersionBreadcrumbContext } from './formVersionBreadcrumb'
import {
  buildAdminFormConfigSavePayload,
  buildPreviewSchema,
  canPublishFormConfig,
  formatFormSchemaDraft,
  getAdminFormConfigErrorMessage,
  isAdminFormConfigVersionForKey,
  isAdminFormConfigVersionListForKey,
  parseFormSchemaDraft,
  readFormSchemaEditorDraft,
  selectInitialFormConfigVersion,
  selectRefreshedFormConfigVersion,
} from './adminFormConfigState'
import { api } from '../services/api'
import { isFormKey, type FormKey, type FormSchema, type FormSchemaField, type FormSchemaVersionResponse } from '../types/forms'

type AdminFormConfigFeedbackValue = {
  kind: 'success' | 'error'
  message: string
}

function formKeyArgs(formKey: FormKey): [] | [FormKey] {
  return formKey === 'psf-request' ? [] : [formKey]
}

export interface AdminFormConfigVersionSelectorProps {
  disabled: boolean
  formKey?: FormKey
  onDuplicate: (version: number) => void
  onDiscard: (version: number) => void
  onPublish: (version: number) => void
  versions: FormSchemaVersionResponse[]
}

export function AdminFormConfigVersionSelector({
  disabled,
  formKey = 'psf-request',
  onDuplicate,
  onDiscard,
  onPublish,
  versions,
}: AdminFormConfigVersionSelectorProps) {
  const hasDraft = versions.some((version) => version.status === 'draft')
  return (
    <section className="admin-form-config__versions">
      <ol aria-label="Form versions" className="admin-form-config__version-catalog">
        {versions.map((version) => (
          <li className={`admin-form-config__version-record admin-form-config__version-record--${version.status}`} key={version.version}>
            <div className="admin-form-config__version-stamp">{disabled ? `v${version.version}` : formKey === 'psf-request'
                ? <Link aria-label={`Open form version ${version.version}`} className="admin-form-config__version-link" params={{ version: String(version.version) }} to="/admin/form-config/$version">v{version.version}</Link>
                : <Link aria-label={`Open form version ${version.version}`} className="admin-form-config__version-link" params={{ formKey, version: String(version.version) }} to="/admin/form-config/$formKey/$version">v{version.version}</Link>}</div>
            <div className="admin-form-config__version-content">
              <div className="admin-form-config__record-heading"><h3>{version.title}</h3><StatusLabel status={version.status === 'published' ? 'Inactive' : version.status === 'active' ? 'Active' : 'Draft'} kind={version.status === 'active' ? 'completed' : version.status === 'draft' ? 'draft' : 'neutral'} /></div>
              {version.description ? <p className="page-card__description">{version.description}</p> : null}
              <dl className="admin-form-config__version-dates">
                <div><dt>Created</dt><dd><time dateTime={version.createdAt}>{new Date(version.createdAt).toLocaleDateString()}</time></dd></div>
                <div><dt>Published</dt><dd>{version.publishedAt ? <time dateTime={version.publishedAt}>{new Date(version.publishedAt).toLocaleDateString()}</time> : '—'}</dd></div>
              </dl>
            </div>
            <div className="admin-form-config__controls">
                {version.status === 'draft' ? <>
                  <button aria-label={`Publish version ${version.version}`} className="primary-button" disabled={disabled} onClick={() => onPublish(version.version)} type="button">Publish</button>
                  <button aria-label={`Discard draft version ${version.version}`} className="secondary-button admin-form-config__danger" disabled={disabled} onClick={() => onDiscard(version.version)} type="button">Discard</button>
                </> : <button aria-label={`Duplicate version ${version.version} as draft`} className="secondary-button" disabled={disabled || hasDraft} title={hasDraft ? 'Open or discard the existing draft before duplicating another version.' : undefined} onClick={() => onDuplicate(version.version)} type="button">Duplicate as draft</button>}
            </div>
          </li>
        ))}
      </ol>
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
  if (loading) return <AsyncNotice kind="loading" title="Loading form schema versions…" />
  return feedback ? <AsyncNotice kind={feedback.kind} title={feedback.message} /> : null
}

export function AdminFormConfigListPage() {
  const { formKey } = useSearch({ from: '/admin/form-config/' })
  return <AdminFormConfigPage key={`list:${formKey}`} formKey={formKey} />
}

export function AdminFormConfigVersionPage() {
  const { version } = useParams({ from: '/admin/form-config/$version' })
  return <AdminFormConfigPage key={`psf-request:${version}`} formKey="psf-request" version={version} />
}

export function AdminFormConfigFormKeyVersionPage() {
  const { formKey, version } = useParams({ from: '/admin/form-config/$formKey/$version' })
  if (!isFormKey(formKey)) return <p className="status-pill status-pill--error" role="alert">Unsupported form key.</p>
  return <AdminFormConfigPage key={`${formKey}:${version}`} formKey={formKey} version={version} />
}

export function AdminFormConfigPage({ formKey = 'psf-request', version }: { formKey?: FormKey; version?: string }) {
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
  const [confirmation, setConfirmation] = useState<{ action: 'publish' | 'discard'; version: number } | null>(null)
  const [fieldEdit, setFieldEdit] = useState<{ sectionIndex: number; fieldIndex: number | null; field: FormSchemaField } | null>(null)
  const requestInFlight = useRef(false)
  const fieldDialogRef = useRef<HTMLDialogElement>(null)
  const previewDialogRef = useRef<HTMLDialogElement>(null)
  const fieldTriggerRef = useRef<HTMLButtonElement>(null)
  const fieldFallbackRef = useRef<HTMLButtonElement>(null)
  const previewTriggerRef = useRef<HTMLButtonElement>(null)

  const parsed = useMemo(() => parseFormSchemaDraft(editorText, formKey), [editorText, formKey])
  const visualSchema = useMemo(() => readFormSchemaEditorDraft(editorText, formKey), [editorText, formKey])
  const dirty = editorText !== savedEditorText
  const busy = loading || saving || publishing
  const editable = selectedVersion?.status === 'draft'
  const pageMounted = useRef(false)
  const shouldBlockEditorExit = useCallback(({ current, next }: { current: { pathname: string }; next: { pathname: string } }) => {
    return isEditor && dirty && current.pathname !== next.pathname &&
      !window.confirm('Discard unsaved form changes and leave this page?')
  }, [dirty, isEditor])
  useBlocker({
    shouldBlockFn: shouldBlockEditorExit,
    enableBeforeUnload: isEditor && dirty,
  })

  useEffect(() => {
    pageMounted.current = true
    return () => { pageMounted.current = false }
  }, [])

  useEffect(() => {
    if (!isEditor || !selectedVersion) return
    setFormVersionBreadcrumb({ formKey, version: selectedVersion.version, status: selectedVersion.status, dirty })
    return () => setFormVersionBreadcrumb(null)
  }, [dirty, formKey, isEditor, selectedVersion, setFormVersionBreadcrumb])
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
        const response = await api.fetchAdminFormConfig(...formKeyArgs(formKey))
        if (!mounted) return
        if (!isAdminFormConfigVersionListForKey(response, formKey)) {
          setFeedback({ kind: 'error', message: 'The server returned a different form family. This selection was not loaded.' })
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
        if (mounted) setLoading(false)
      }
    }

    void loadInitialVersions()

    return () => {
      mounted = false
    }
  }, [formKey, isEditor, version])

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
        ...formKeyArgs(formKey),
      )
      if (!isAdminFormConfigVersionForKey(savedDraft, formKey)) throw new Error('The server returned a different form family. The draft was not loaded.')
      const refreshed = await api.fetchAdminFormConfig(...formKeyArgs(formKey))
      if (!isAdminFormConfigVersionListForKey(refreshed, formKey)) throw new Error('The server returned a different form family. The draft was not loaded.')
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

    requestInFlight.current = true
    setPublishing(true)
    setFeedback(null)

    try {
      const publishedVersion = await api.publishAdminFormConfigDraft({ version: versionNumber }, ...formKeyArgs(formKey))
      if (!isAdminFormConfigVersionForKey(publishedVersion, formKey)) throw new Error('The server returned a different form family. The published version was not loaded.')
      const refreshed = await api.fetchAdminFormConfig(...formKeyArgs(formKey))
      if (!isAdminFormConfigVersionListForKey(refreshed, formKey)) throw new Error('The server returned a different form family. The published version was not loaded.')
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
      setConfirmation(null)
    }
  }

  async function duplicateVersion(version: number) {
    if (busy || requestInFlight.current || versions.some((item) => item.status === 'draft')) return
    requestInFlight.current = true
    setLoading(true)
    setFeedback(null)
    try {
      const created = await api.duplicateAdminFormConfigVersion({ version }, ...formKeyArgs(formKey))
      if (!pageMounted.current) return
      if (!isAdminFormConfigVersionForKey(created, formKey)) throw new Error('The server returned a different form family. The new draft was not opened.')
      if (formKey === 'psf-request') {
        await navigate({ to: '/admin/form-config/$version', params: { version: String(created.version) } })
      } else {
        await navigate({ to: '/admin/form-config/$formKey/$version', params: { formKey, version: String(created.version) } })
      }
    } catch (error) {
      if (pageMounted.current) {
        setFeedback({ kind: 'error', message: getAdminFormConfigErrorMessage(error, 'Unable to duplicate form version.') })
      }
    } finally {
      if (pageMounted.current) {
        requestInFlight.current = false
        setLoading(false)
      }
    }
  }

  async function discardDraft(version: number) {
    if (busy || requestInFlight.current || !versions.some((item) => item.version === version && item.status === 'draft')) return
    requestInFlight.current = true
    setLoading(true)
    setFeedback(null)
    try {
      await api.discardAdminFormConfigDraft(version, ...formKeyArgs(formKey))
      const refreshed = await api.fetchAdminFormConfig(...formKeyArgs(formKey))
      if (!isAdminFormConfigVersionListForKey(refreshed, formKey)) throw new Error('The server returned a different form family. The refreshed list was not loaded.')
      setVersions(refreshed.versions)
      const next = selectInitialFormConfigVersion(refreshed.versions)
      if (next && !isEditor) applySelectedVersion(next)
      setFeedback({ kind: 'success', message: `Draft version ${version} discarded.` })
    } catch (error) {
      setFeedback({ kind: 'error', message: getAdminFormConfigErrorMessage(error, 'Unable to discard draft.') })
    } finally {
      requestInFlight.current = false
      setLoading(false)
      setConfirmation(null)
    }
  }

  function switchFormFamily(nextFormKey: string) {
    if (!isFormKey(nextFormKey) || nextFormKey === formKey || busy) return
    void navigate({ to: '/admin/form-config', search: { formKey: nextFormKey } })
  }

  function requestConfirmation(action: 'publish' | 'discard', number: number) {
    if (busy || requestInFlight.current || !versions.some((item) => item.version === number && item.status === 'draft')) return
    if (action === 'publish' && isEditor && !publishAllowed) return
    setConfirmation({ action, version: number })
  }

  const familyLabel = formKey === 'psf-request' ? 'Requester Information' : 'PSF Created Information'
  const confirmationDescription = confirmation?.action === 'discard'
    ? `Discard draft v${confirmation.version}? This unpublished draft will be permanently deleted.`
    : formKey === 'psf-created-information'
      ? `Publish PSF Created Information v${confirmation?.version}? New requests will use this PSF version. Existing requests keep their current PSF form and data and are not upgraded.`
      : `Publish v${confirmation?.version}? New requests will use v${confirmation?.version}. Existing Draft requests keep their current version and must be explicitly upgraded before they can be submitted. Already submitted requests keep their saved form snapshot and do not change.`

  return (
    <article className="page-card admin-form-config">
      {!isEditor ? <PageHeader title="Form management" description="Manage requester and PSF forms independently. Duplicate a saved version to prepare a draft." /> : null}

      <div className="page-card__body admin-form-config__body">
        <div className={`admin-form-config__workspace${isEditor ? ' admin-form-config__workspace--editor' : ''}`}>
        <aside aria-label="Form family selection" className="admin-form-config__family-panel">
        <p className="page-card__eyebrow">Form families</p>
        {!isEditor ? <nav aria-label="Form families" className="admin-form-config__family-nav">
          <Link aria-current={formKey === 'psf-request' ? 'page' : undefined} className="admin-form-config__family-link" search={{ formKey: 'psf-request' }} to="/admin/form-config"><span>Requester Information</span><small>Fields completed by the requester</small></Link>
          <Link aria-current={formKey === 'psf-created-information' ? 'page' : undefined} className="admin-form-config__family-link" search={{ formKey: 'psf-created-information' }} to="/admin/form-config"><span>PSF Created Information</span><small>Fields maintained by the setup team</small></Link>
        </nav> : <label className="admin-form-config__field" htmlFor="admin-form-config-family">
          <span>Form to manage</span>
          <select aria-label="Form to manage" disabled={busy} id="admin-form-config-family" onChange={(event) => switchFormFamily(event.target.value)} value={formKey}>
            <option value="psf-request">Requester Information</option>
            <option value="psf-created-information">PSF Created Information</option>
          </select>
        </label>}
        {isEditor ? <div><Link className="secondary-button" search={{ formKey }} to="/admin/form-config"><ArrowLeft aria-hidden="true" size={15} /> Back to Form management</Link></div> : null}
        <p className="admin-form-config__family-note">Each family has its own versions and one draft at a time.</p>
        </aside>
        <div className={isEditor ? 'admin-form-config__editor-surface' : 'admin-form-config__catalog'}>
        {!isEditor ? <header className="admin-form-config__family-context"><p className="page-card__eyebrow">Version catalog</p><h2>{familyLabel}</h2><p className="page-card__description">Active versions are used for new requests. Existing requests retain their captured form versions.</p></header> : null}
        <AdminFormConfigFeedback feedback={feedback} loading={loading} />

        {!loading && !isEditor && selectedVersion ? <AdminFormConfigVersionSelector
          disabled={busy}
          formKey={formKey}
          onDuplicate={(number) => void duplicateVersion(number)}
          onDiscard={(number) => requestConfirmation('discard', number)}
          onPublish={(number) => requestConfirmation('publish', number)}
          versions={versions}
        /> : null}
        {!loading && isEditor && selectedVersion ? (
          <>
            <div className="admin-form-config__section-header">
              <div className="admin-form-config__version-heading"><span className="admin-form-config__version-stamp">v{selectedVersion.version}</span><div><p className="page-card__eyebrow">{familyLabel}</p><h1 id="form-config-editor-heading">{selectedVersion.title}</h1></div></div>
              <button className="secondary-button" disabled={busy} onClick={(event) => {
                previewTriggerRef.current = event.currentTarget
                previewDialogRef.current?.showModal()
              }} type="button">Preview form</button>
            </div>
            <div className="admin-form-config__identity">
              <StatusLabel status={selectedVersion.status === 'active' ? 'Active' : selectedVersion.status === 'draft' ? 'Draft' : 'Inactive'} kind={selectedVersion.status === 'active' ? 'completed' : selectedVersion.status === 'draft' ? 'draft' : 'neutral'} />
              <span className="admin-form-config__key">Family: {formKey}</span>
              <span>Created by {selectedVersion.createdBy} · <time dateTime={selectedVersion.createdAt}>{new Date(selectedVersion.createdAt).toLocaleDateString()}</time></span>
              {selectedVersion.description ? <span>{selectedVersion.description}</span> : null}
            </div>
            {!editable ? <div className="admin-form-config__view-banner" role="status">
              <p>You're viewing v{selectedVersion.version} ({selectedVersion.status === 'active' ? 'Active' : 'Inactive'}). This version is read-only.</p>
              <button className="primary-button" disabled={busy || versions.some((item) => item.status === 'draft')} title={versions.some((item) => item.status === 'draft') ? 'Open or discard the existing draft before duplicating another version.' : undefined} onClick={() => void duplicateVersion(selectedVersion.version)} type="button">Duplicate as draft</button>
            </div> : null}
            {editable ? <div className="admin-form-config__toolbar">
              <div><span role="status">{saving ? 'Saving changes…' : dirty ? 'Unsaved changes' : 'All changes saved'}</span><p className="ui-help">{dirty ? 'Save your changes before publishing.' : !parsed.schema ? 'Fix validation errors before publishing.' : 'Publish makes this saved draft active for new requests.'}</p></div>
              <div className="admin-form-config__actions">
                <button className="secondary-button" disabled={busy || !parsed.schema || !dirty} onClick={() => void saveDraft()} type="button">{saving ? 'Saving draft…' : 'Save draft'}</button>
                <button className="primary-button" disabled={!publishAllowed} onClick={() => requestConfirmation('publish', selectedVersion.version)} type="button">{publishing ? 'Publishing…' : 'Publish'}</button>
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
                <button aria-label="Close preview" className="icon-button" onClick={() => previewDialogRef.current?.close()} type="button"><X aria-hidden="true" size={16} /></button>
              </div>
              <div aria-label="Preview fields" className="admin-form-config__preview-content" role="region" tabIndex={0}>
              {previewSchema ? (
                <AdminFormConfigPreview schema={previewSchema} />
              ) : (
                <p className="page-card__description">Fix the form errors above to see the preview.</p>
              )}
              </div>
            </dialog>
          </>
        ) : null}
        </div>
        </div>
      </div>
      <ConfirmDialog
        open={confirmation !== null}
        title={confirmation?.action === 'discard' ? `Discard draft v${confirmation.version}?` : `Publish version ${confirmation?.version ?? ''}?`}
        description={confirmationDescription}
        confirmLabel={confirmation?.action === 'discard' ? 'Discard draft' : 'Publish'}
        pending={busy}
        tone={confirmation?.action === 'discard' ? 'danger' : 'default'}
        onCancel={() => { if (!busy) setConfirmation(null) }}
        onConfirm={() => {
          if (!confirmation) return
          if (confirmation.action === 'publish') void publishDraft(confirmation.version)
          else void discardDraft(confirmation.version)
        }}
      />
    </article>
  )
}
