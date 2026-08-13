import { useEffect, useMemo, useRef, useState } from 'react'
import { DynamicFormRenderer } from './DynamicFormRenderer'
import {
  activeSchemaFromRequest,
  applyRuntimeAutofillSuggestions,
  buildRequestValuesForSchema,
  canSubmitDraftForSchemaVersion,
  classifyDraftSchemaVersion,
  createDraftSchemaUpgradeLock,
  DRAFT_STATUS,
  getRequesterAutofillTriggerField,
  type RuntimeAutofillFieldState,
  type DraftSchemaVersionClassification,
  isDraftSchemaDecisionRequired,
  requesterFieldsAreReadOnly,
  resolveRequestFormSchema,
} from './activeSchemaFormState'
import {
  ApiError,
  api,
  type PsfRequestResponse,
  type RuntimeAutofillSuggestionsResponse,
} from '../services/api'
import { validateRequiredFields } from '../services/formValidation'
import type {
  ActiveFormSchemaResponse,
  DynamicFormErrors,
  DynamicFormValues,
  FormSchema,
  FormSchemaField,
} from '../types/forms'

const PSF_REQUEST_FORM_KEY = 'psf-request'

function buildInitialValues(schema: FormSchema): DynamicFormValues {
  return schema.sections.reduce<DynamicFormValues>((values, section) => {
    section.fields.forEach((field) => {
      values[field.fieldKey] = ''
    })

    return values
  }, {})
}

export interface ActiveSchemaFormProps {
  mode: 'request' | 'preview'
  requestId?: string
}

export interface RequestDraftStatusProps {
  request: PsfRequestResponse
}

export function RequestDraftStatus({ request }: RequestDraftStatusProps) {
  const requestPath = `/requests/${encodeURIComponent(request.id)}/`
  const requestLinkLabel = request.status === DRAFT_STATUS ? 'Open saved draft' : 'Open request details'

  return (
    <p className="page-card__description">
      {request.requestNo} · {request.status} · <a href={requestPath}>{requestLinkLabel}</a>
      {request.status !== DRAFT_STATUS ? ' · requester-owned fields are locked after Draft status.' : null}
    </p>
  )
}

export interface DraftSchemaUpgradeDecisionProps {
  activeVersion: number
  currentVersion: number
  error: string | null
  hasRemained?: boolean
  isUpgradePending: boolean
  onReload: () => void
  onRemain: () => void
  onUpgrade: () => void
  showRemain?: boolean
}

export function DraftSchemaUpgradeDecision({
  activeVersion,
  currentVersion,
  error,
  hasRemained = false,
  isUpgradePending,
  onReload,
  onRemain,
  onUpgrade,
  showRemain = true,
}: DraftSchemaUpgradeDecisionProps) {
  return (
    <section
      aria-busy={isUpgradePending}
      aria-labelledby="draft-schema-upgrade-heading"
      className="draft-schema-upgrade"
    >
      <h2 id="draft-schema-upgrade-heading">
        {hasRemained ? 'Schema upgrade required before submit' : 'Schema update required'}
      </h2>
      <p>
        This Draft uses schema version {currentVersion}; the active request schema is version {activeVersion}.
        {' '}
        {hasRemained
          ? 'You can keep editing this version, but Upgrade is required before submitting.'
          : 'Choose whether to upgrade now or remain on the Draft schema while editing.'}
      </p>
      {isUpgradePending ? <p role="status">Upgrading Draft schema…</p> : null}
      {error ? (
        <p className="status-pill status-pill--error" role="alert">
          {error}
        </p>
      ) : null}
      <div className="draft-schema-upgrade__actions">
        <button
          className="primary-button"
          disabled={isUpgradePending}
          onClick={onUpgrade}
          type="button"
        >
          {isUpgradePending ? 'Upgrading schema…' : `Upgrade to version ${activeVersion}`}
        </button>
        {showRemain ? (
          <button
            className="secondary-button"
            disabled={isUpgradePending}
            onClick={onRemain}
            type="button"
          >
            Remain on version {currentVersion}
          </button>
        ) : null}
        {error ? (
          <button
            className="secondary-button"
            disabled={isUpgradePending}
            onClick={onReload}
            type="button"
          >
            Reload draft
          </button>
        ) : null}
      </div>
    </section>
  )
}

type DraftSchemaDecision = 'not-needed' | 'remain' | 'unresolved'

export function ActiveSchemaForm({ mode, requestId }: ActiveSchemaFormProps) {
  const [activeSchema, setActiveSchema] = useState<ActiveFormSchemaResponse | null>(null)
  const [activeRequestSchema, setActiveRequestSchema] = useState<ActiveFormSchemaResponse | null>(null)
  const [currentRequest, setCurrentRequest] = useState<PsfRequestResponse | null>(null)
  const [draftSchemaDecision, setDraftSchemaDecision] = useState<DraftSchemaDecision>('not-needed')
  const [draftSchemaVersion, setDraftSchemaVersion] = useState<DraftSchemaVersionClassification>('not-applicable')
  const [errors, setErrors] = useState<DynamicFormErrors>({})
  const [autofillStatuses, setAutofillStatuses] = useState<
    Partial<Record<string, RuntimeAutofillFieldState>>
  >({})
  const [autofillError, setAutofillError] = useState<string | null>(null)
  const [autofillLoading, setAutofillLoading] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [loadedSchemaKey, setLoadedSchemaKey] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [reloadKey, setReloadKey] = useState(0)
  const [saving, setSaving] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [saveMessage, setSaveMessage] = useState<string | null>(null)
  const [upgradeError, setUpgradeError] = useState<string | null>(null)
  const [upgradePending, setUpgradePending] = useState(false)
  const [values, setValues] = useState<DynamicFormValues>({})
  const draftSchemaUpgradeLock = useRef(createDraftSchemaUpgradeLock())
  const autofillLookupGeneration = useRef(0)
  const fieldEditVersions = useRef<Record<string, number>>({})
  const isMountedRef = useRef(true)
  const valuesRef = useRef<DynamicFormValues>({})
  const loadKey = `${mode}:${requestId ?? 'new'}:${reloadKey}`

  function replaceValues(nextValues: DynamicFormValues) {
    valuesRef.current = nextValues
    setValues(nextValues)
  }

  function invalidateRuntimeAutofill() {
    autofillLookupGeneration.current += 1
    setAutofillLoading(false)
  }

  useEffect(() => {
    isMountedRef.current = true

    return () => {
      isMountedRef.current = false
    }
  }, [])

  useEffect(() => {
    let mounted = true
    autofillLookupGeneration.current += 1

    async function loadSchemaOrRequest() {
      try {
        if (requestId) {
          const request = await api.fetchPsfRequest(requestId)

          if (!mounted) {
            return
          }

          const requestSchema =
            mode === 'request' && request.status === DRAFT_STATUS
              ? await api.fetchActiveFormSchema(request.formKey)
              : null

          if (!mounted) {
            return
          }

          const classification = classifyDraftSchemaVersion(mode, request, requestSchema)
          const resolvedSchema = resolveRequestFormSchema(mode, request, requestSchema)
          setLoadError(null)
          setSaveError(null)
          setSaveMessage(null)
          setUpgradeError(null)
          setErrors({})
          setCurrentRequest(request)
          setActiveRequestSchema(requestSchema)
          setActiveSchema(resolvedSchema)
          setDraftSchemaVersion(classification)
          setDraftSchemaDecision(
            isDraftSchemaDecisionRequired(classification) ? 'unresolved' : 'not-needed',
          )
          const nextValues = buildRequestValuesForSchema(resolvedSchema.schema, request.requesterData)
          invalidateRuntimeAutofill()
          fieldEditVersions.current = {}
          replaceValues(nextValues)
          setAutofillError(null)
          setAutofillLoading(false)
          setAutofillStatuses({})
          return
        }

        const response = await api.fetchActiveFormSchema(PSF_REQUEST_FORM_KEY)

        if (!mounted) {
          return
        }

        setLoadError(null)
        setSaveError(null)
        setSaveMessage(null)
        setUpgradeError(null)
        setErrors({})
        setCurrentRequest(null)
        setActiveRequestSchema(null)
        setDraftSchemaDecision('not-needed')
        setDraftSchemaVersion('not-applicable')
        setActiveSchema(response)
        const nextValues = buildInitialValues(response.schema)
        invalidateRuntimeAutofill()
        fieldEditVersions.current = {}
        replaceValues(nextValues)
        setAutofillError(null)
        setAutofillLoading(false)
        setAutofillStatuses({})
      } catch (error) {
        if (mounted) {
          setLoadError(error instanceof Error ? error.message : 'Unable to load PSF request draft')
        }
      } finally {
        if (mounted) {
          setLoadedSchemaKey(loadKey)
          setLoading(false)
        }
      }
    }

    void loadSchemaOrRequest()

    return () => {
      mounted = false
    }
  }, [loadKey, mode, requestId])

  const schemaDecisionRequired = isDraftSchemaDecisionRequired(draftSchemaVersion)
  const isSchemaChoicePending = schemaDecisionRequired && draftSchemaDecision === 'unresolved'
  const hasInconsistentDraftSchema = draftSchemaVersion === 'newer-or-inconsistent'
  const readOnly = requesterFieldsAreReadOnly(mode, currentRequest)
  const formReadOnly = readOnly || saving || submitting || upgradePending || hasInconsistentDraftSchema
  const canSubmitDraft =
    mode === 'request' &&
    currentRequest?.status === DRAFT_STATUS &&
    !isSchemaChoicePending &&
    canSubmitDraftForSchemaVersion(draftSchemaVersion)
  const submitIsBlockedBySchema =
    mode === 'request' &&
    currentRequest?.status === DRAFT_STATUS &&
    !isSchemaChoicePending &&
    !canSubmitDraftForSchemaVersion(draftSchemaVersion)

  const submitLabel = useMemo(() => {
    if (currentRequest) {
      return currentRequest.status === DRAFT_STATUS ? 'Save draft changes' : 'Requester edits locked'
    }

    return mode === 'request' ? 'Save draft request' : 'Preview only'
  }, [currentRequest, mode])

  const schemaSubmissionMessage = useMemo(() => {
    if (!currentRequest || currentRequest.status !== DRAFT_STATUS) {
      return null
    }

    if (draftSchemaVersion === 'older') {
      return `Schema version ${currentRequest.formVersion} is still editable, but Upgrade to version ${activeRequestSchema?.version ?? 'the active version'} is required before submitting.`
    }

    if (draftSchemaVersion === 'newer-or-inconsistent') {
      return 'This Draft schema does not match the active schema. Its values remain unchanged, but it cannot be submitted until the mismatch is resolved.'
    }

    return null
  }, [activeRequestSchema?.version, currentRequest, draftSchemaVersion])

  function isCurrentRuntimeAutofillLookup(
    generation: number,
    triggerFieldKey: string,
    triggerValue: string,
  ): boolean {
    return (
      isMountedRef.current &&
      autofillLookupGeneration.current === generation &&
      valuesRef.current[triggerFieldKey] === triggerValue
    )
  }

  async function loadRuntimeAutofillSuggestions(
    field: FormSchemaField,
    triggerValue: string,
    generation: number,
    lookupEditVersions: Record<string, number | undefined>,
    schema: FormSchema,
  ) {
    let response: RuntimeAutofillSuggestionsResponse

    try {
      response = await api.fetchRuntimeAutofillSuggestions({
        formKey: schema.formKey,
        field: field.canonicalKey,
        value: triggerValue.trim(),
      })
    } catch (error) {
      if (isCurrentRuntimeAutofillLookup(generation, field.fieldKey, triggerValue)) {
        setAutofillError(
          error instanceof Error
            ? error.message
            : 'Unable to load autofill suggestions. You can continue editing the form.',
        )
      }
      return
    } finally {
      if (isCurrentRuntimeAutofillLookup(generation, field.fieldKey, triggerValue)) {
        setAutofillLoading(false)
      }
    }

    if (!isCurrentRuntimeAutofillLookup(generation, field.fieldKey, triggerValue) || !response.matched) {
      return
    }

    const applied = applyRuntimeAutofillSuggestions({
      currentEditVersions: fieldEditVersions.current,
      currentValues: valuesRef.current,
      lookupEditVersions,
      schema,
      suggestedValues: response.suggestedValues,
    })
    if (applied.appliedFieldKeys.length === 0) {
      return
    }

    replaceValues(applied.values)
    setAutofillStatuses((currentStatuses) => {
      const nextStatuses = { ...currentStatuses }
      applied.appliedFieldKeys.forEach((fieldKey) => {
        nextStatuses[fieldKey] = 'auto-filled'
      })
      return nextStatuses
    })
  }

  function updateField(fieldKey: string, value: string) {
    const nextValues = { ...valuesRef.current, [fieldKey]: value }
    const nextEditVersion = (fieldEditVersions.current[fieldKey] ?? 0) + 1
    fieldEditVersions.current = {
      ...fieldEditVersions.current,
      [fieldKey]: nextEditVersion,
    }
    replaceValues(nextValues)
    setErrors((currentErrors) => {
      const nextErrors = { ...currentErrors }
      delete nextErrors[fieldKey]
      return nextErrors
    })
    setAutofillStatuses((currentStatuses) =>
      currentStatuses[fieldKey] === 'auto-filled'
        ? { ...currentStatuses, [fieldKey]: 'edited-by-user' }
        : currentStatuses,
    )
    setAutofillError(null)
    setSaveError(null)
    setSaveMessage(null)

    if (
      mode !== 'request' ||
      formReadOnly ||
      isSchemaChoicePending ||
      !activeSchema
    ) {
      return
    }

    const triggerField = getRequesterAutofillTriggerField(activeSchema.schema, fieldKey)
    if (!triggerField) {
      return
    }

    const generation = autofillLookupGeneration.current + 1
    autofillLookupGeneration.current = generation
    if (value.trim().length === 0) {
      setAutofillLoading(false)
      return
    }

    const lookupEditVersions = { ...fieldEditVersions.current }
    setAutofillLoading(true)
    void loadRuntimeAutofillSuggestions(
      triggerField,
      value,
      generation,
      lookupEditVersions,
      activeSchema.schema,
    )
  }

  function remainOnDraftSchema() {
    setDraftSchemaDecision('remain')
    setUpgradeError(null)
    setSaveError(null)
    setSaveMessage(null)
  }

  function reloadDraftSchema() {
    invalidateRuntimeAutofill()
    setUpgradeError(null)
    setReloadKey((currentReloadKey) => currentReloadKey + 1)
  }

  async function saveDraft(currentValues: DynamicFormValues) {
    if (!activeSchema || formReadOnly || isSchemaChoicePending) {
      return
    }

    const nextErrors = validateRequiredFields(activeSchema.schema, currentValues)
    setErrors(nextErrors)

    if (Object.keys(nextErrors).length > 0) {
      return
    }

    invalidateRuntimeAutofill()
    setSaving(true)
    setSaveError(null)
    setSaveMessage(null)

    try {
      const savedRequest = currentRequest
        ? await api.updateDraftRequesterData(currentRequest.id, {
            formVersion: currentRequest.formVersion,
            requesterData: currentValues,
          })
        : await api.createDraftRequest({ requesterData: currentValues })
      const nextActiveRequestSchema =
        currentRequest && activeRequestSchema
          ? activeRequestSchema
          : activeSchemaFromRequest(savedRequest)
      const classification = classifyDraftSchemaVersion(mode, savedRequest, nextActiveRequestSchema)
      const resolvedSchema = resolveRequestFormSchema(mode, savedRequest, nextActiveRequestSchema)

      setCurrentRequest(savedRequest)
      setActiveRequestSchema(nextActiveRequestSchema)
      setActiveSchema(resolvedSchema)
      setDraftSchemaVersion(classification)
      setDraftSchemaDecision(
        isDraftSchemaDecisionRequired(classification) ? 'remain' : 'not-needed',
      )
      fieldEditVersions.current = {}
      setAutofillError(null)
      setAutofillStatuses({})
      replaceValues(buildRequestValuesForSchema(resolvedSchema.schema, savedRequest.requesterData))
      setSaveMessage(`Draft ${savedRequest.requestNo} saved.`)
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : 'Unable to save draft request')
    } finally {
      setSaving(false)
    }
  }

  async function upgradeDraftSchema() {
    if (
      !currentRequest ||
      !activeRequestSchema ||
      !schemaDecisionRequired
    ) {
      return
    }

    const upgradeLock = draftSchemaUpgradeLock.current
    if (!upgradeLock.tryStart()) {
      return
    }

    invalidateRuntimeAutofill()
    setUpgradePending(true)
    setUpgradeError(null)
    setSaveError(null)
    setSaveMessage(null)

    try {
      const upgradedRequest = await api.upgradeDraftSchema(currentRequest.id, {
        formVersion: activeRequestSchema.version,
      })
      const upgradedSchema = activeSchemaFromRequest(upgradedRequest)
      const classification = classifyDraftSchemaVersion('request', upgradedRequest, upgradedSchema)

      setCurrentRequest(upgradedRequest)
      setActiveRequestSchema(upgradedSchema)
      setActiveSchema(upgradedSchema)
      setDraftSchemaVersion(classification)
      setDraftSchemaDecision('not-needed')
      setErrors({})
      fieldEditVersions.current = {}
      setAutofillError(null)
      setAutofillStatuses({})
      replaceValues(buildRequestValuesForSchema(upgradedSchema.schema, valuesRef.current))
      setSaveMessage(
        `Draft ${upgradedRequest.requestNo} upgraded to schema version ${upgradedRequest.formVersion}.`,
      )
    } catch (error) {
      setUpgradeError(
        error instanceof Error
          ? error.message
          : 'Unable to upgrade the Draft schema. Reload and try again.',
      )
    } finally {
      upgradeLock.finish()
      setUpgradePending(false)
    }
  }

  async function submitDraft() {
    if (!activeSchema || !currentRequest || !canSubmitDraft || formReadOnly) {
      return
    }

    invalidateRuntimeAutofill()
    setSubmitting(true)
    setSaveError(null)
    setSaveMessage(null)

    try {
      const latestActiveSchema = await api.fetchActiveFormSchema(currentRequest.formKey)
      const latestClassification = classifyDraftSchemaVersion(
        'request',
        currentRequest,
        latestActiveSchema,
      )

      if (!canSubmitDraftForSchemaVersion(latestClassification)) {
        const lockedSchema = activeSchemaFromRequest(currentRequest)
        const requiresChoice = isDraftSchemaDecisionRequired(latestClassification)

        setActiveRequestSchema(latestActiveSchema)
        setActiveSchema(lockedSchema)
        setDraftSchemaVersion(latestClassification)
        setDraftSchemaDecision(requiresChoice ? 'unresolved' : 'not-needed')
        setErrors({})
        fieldEditVersions.current = {}
        setAutofillError(null)
        setAutofillStatuses({})
        replaceValues(buildRequestValuesForSchema(lockedSchema.schema, valuesRef.current))
        if (requiresChoice) {
          setUpgradeError(
            'A newer active schema is available. Your unsaved edits are preserved. Choose Upgrade, Remain, or Reload the Draft before continuing.',
          )
        } else {
          setSaveError(
            'The Draft schema no longer matches the active schema. Reload the Draft before submitting.',
          )
        }
        return
      }

      const nextRequesterData = buildRequestValuesForSchema(latestActiveSchema.schema, valuesRef.current)
      const nextErrors = validateRequiredFields(latestActiveSchema.schema, nextRequesterData)

      setActiveRequestSchema(latestActiveSchema)
      setActiveSchema(latestActiveSchema)
      setDraftSchemaVersion(latestClassification)
      replaceValues(nextRequesterData)
      setErrors(nextErrors)

      if (Object.keys(nextErrors).length > 0) {
        return
      }

      const savedRequesterData = buildRequestValuesForSchema(
        latestActiveSchema.schema,
        currentRequest.requesterData,
      )
      const hasUnsavedChanges =
        JSON.stringify(savedRequesterData) !== JSON.stringify(nextRequesterData)
      const readyToSubmit = hasUnsavedChanges
        ? await api.updateDraftRequesterData(currentRequest.id, {
            formVersion: currentRequest.formVersion,
            requesterData: nextRequesterData,
          })
        : currentRequest
      const submittedRequest = await api.submitPsfRequest(readyToSubmit.id, {
        formVersion: latestActiveSchema.version,
      })

      setCurrentRequest(submittedRequest)
      setActiveRequestSchema(null)
      setActiveSchema(activeSchemaFromRequest(submittedRequest))
      setDraftSchemaVersion('not-applicable')
      setDraftSchemaDecision('not-needed')
      fieldEditVersions.current = {}
      setAutofillError(null)
      setAutofillStatuses({})
      replaceValues(buildRequestValuesForSchema(submittedRequest.schemaSnapshot, submittedRequest.requesterData))
      setSaveMessage(`Request ${submittedRequest.requestNo} submitted.`)
    } catch (error) {
      if (error instanceof ApiError && error.status === 409) {
        try {
          const refreshedActiveSchema = await api.fetchActiveFormSchema(currentRequest.formKey)
          const refreshedClassification = classifyDraftSchemaVersion(
            'request',
            currentRequest,
            refreshedActiveSchema,
          )

          if (isDraftSchemaDecisionRequired(refreshedClassification)) {
            const lockedSchema = activeSchemaFromRequest(currentRequest)

            setActiveRequestSchema(refreshedActiveSchema)
            setActiveSchema(lockedSchema)
            setDraftSchemaVersion(refreshedClassification)
            setDraftSchemaDecision('unresolved')
            setErrors({})
            fieldEditVersions.current = {}
            setAutofillError(null)
            setAutofillStatuses({})
            replaceValues(buildRequestValuesForSchema(lockedSchema.schema, valuesRef.current))
            setUpgradeError(
              'The active schema changed while this Draft was being submitted. Your unsaved edits are preserved. Choose Upgrade, Remain, or Reload the Draft before continuing.',
            )
            return
          }
        } catch {
          // Preserve the original submit conflict when the active schema cannot be refreshed.
        }
      }

      setSaveError(error instanceof Error ? error.message : 'Unable to submit request')
    } finally {
      setSubmitting(false)
    }
  }

  if (loading || loadedSchemaKey !== loadKey) {
    return <p className="page-card__description">Loading PSF request draft…</p>
  }

  if (loadError || !activeSchema) {
    return (
      <p className="status-pill status-pill--error" role="alert">
        {loadError ?? 'PSF request draft is unavailable.'}
      </p>
    )
  }

  if (isSchemaChoicePending && currentRequest && activeRequestSchema) {
    return (
      <>
        <RequestDraftStatus request={currentRequest} />
        <DraftSchemaUpgradeDecision
          activeVersion={activeRequestSchema.version}
          currentVersion={currentRequest.formVersion}
          error={upgradeError}
          isUpgradePending={upgradePending}
          onReload={reloadDraftSchema}
          onRemain={remainOnDraftSchema}
          onUpgrade={() => void upgradeDraftSchema()}
        />
      </>
    )
  }

  return (
    <>
      {currentRequest ? <RequestDraftStatus request={currentRequest} /> : null}
      {saveMessage ? (
        <p className="status-pill status-pill--success" role="status">
          {saveMessage}
        </p>
      ) : null}
      {saveError ? (
        <p className="status-pill status-pill--error" role="alert">
          {saveError}
        </p>
      ) : null}
      {autofillLoading ? <p role="status">Loading autofill suggestions…</p> : null}
      {autofillError ? (
        <p className="status-pill status-pill--error" role="alert">
          Autofill suggestions could not be loaded: {autofillError}
        </p>
      ) : null}
      {schemaDecisionRequired &&
      draftSchemaDecision === 'remain' &&
      currentRequest &&
      activeRequestSchema ? (
        <DraftSchemaUpgradeDecision
          activeVersion={activeRequestSchema.version}
          currentVersion={currentRequest.formVersion}
          error={upgradeError}
          hasRemained
          isUpgradePending={upgradePending}
          onReload={reloadDraftSchema}
          onRemain={remainOnDraftSchema}
          onUpgrade={() => void upgradeDraftSchema()}
          showRemain={false}
        />
      ) : null}
      <DynamicFormRenderer
        errors={errors}
        fieldStatuses={autofillStatuses}
        onChange={!formReadOnly ? updateField : undefined}
        onSubmit={!formReadOnly ? saveDraft : undefined}
        readOnly={formReadOnly}
        schema={activeSchema.schema}
        submitLabel={saving ? 'Saving draft…' : submitLabel}
        values={values}
      />
      {currentRequest?.status === DRAFT_STATUS ? (
        <div className="dynamic-form__actions">
          <button
            aria-describedby={submitIsBlockedBySchema ? 'draft-schema-submit-status' : undefined}
            className="secondary-button"
            disabled={saving || submitting || upgradePending || !canSubmitDraft}
            onClick={() => void submitDraft()}
            type="button"
          >
            {submitting ? 'Submitting request…' : 'Submit request'}
          </button>
          {submitIsBlockedBySchema && schemaSubmissionMessage ? (
            <p id="draft-schema-submit-status" role="status">
              {schemaSubmissionMessage}
            </p>
          ) : null}
        </div>
      ) : null}
    </>
  )
}
