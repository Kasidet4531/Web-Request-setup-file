import { useEffect, useMemo, useRef, useState } from 'react'
import { DynamicFormRenderer } from './DynamicFormRenderer'
import { AsyncNotice } from './ui/AsyncNotice'
import {
  activeSchemaFromRequest,
  applyRuntimeAutofillSuggestions,
  buildRequestValuesForSchema,
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
import type {
  ActiveFormSchemaResponse,
  DynamicFormErrors,
  DynamicFormValues,
  FormSchema,
  FormSchemaField,
} from '../types/forms'

const PSF_REQUEST_FORM_KEY = 'psf-request'

function isRequesterIdentityKey(canonicalKey: string): boolean {
  return canonicalKey === 'requester' || canonicalKey === 'requester_name'
}

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
  headerTitle?: string
  requestId?: string
  disabled?: boolean
  explicitEdit?: boolean
  requesterIdentity?: string
  onDirtyChange?: (dirty: boolean) => void
  onDraftSchemaSubmitAllowedChange?: (allowed: boolean) => void
  onRequestSaved?: (request: PsfRequestResponse) => void
  onSavingChange?: (saving: boolean) => void
  onSubmissionConflictSettled?: (pending: boolean) => void
  requestSnapshot?: PsfRequestResponse
  submissionConflict?: number
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
      {!request.canEditRequesterData ? ' · Requester information editing is unavailable for this request.' : null}
    </p>
  )
}

export interface DraftSchemaUpgradeDecisionProps {
  activeVersion: number
  currentVersion: number
  disabled?: boolean
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
  disabled = false,
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
      aria-label={hasRemained ? 'Schema upgrade required before submit' : 'Schema update required'}
      className="draft-schema-upgrade"
    >
      <h2>
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
      {error ? <AsyncNotice kind="error" title={error} /> : null}
      <div className="draft-schema-upgrade__actions">
        <button
          className="ui-button ui-button--primary"
          disabled={isUpgradePending || disabled}
          onClick={onUpgrade}
          type="button"
        >
          {isUpgradePending ? 'Upgrading schema…' : `Upgrade to version ${activeVersion}`}
        </button>
        {showRemain ? (
          <button
            className="ui-button ui-button--secondary"
            disabled={isUpgradePending || disabled}
            onClick={onRemain}
            type="button"
          >
            Remain on version {currentVersion}
          </button>
        ) : null}
        {error ? (
          <button
            className="ui-button ui-button--secondary"
            disabled={isUpgradePending || disabled}
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

export function ActiveSchemaForm({ mode, headerTitle, requestId, disabled = false, explicitEdit = false, requesterIdentity, onDirtyChange, onDraftSchemaSubmitAllowedChange, onRequestSaved, onSavingChange, onSubmissionConflictSettled, requestSnapshot, submissionConflict = 0 }: ActiveSchemaFormProps) {
  const savedValuesRef = useRef<DynamicFormValues>({})
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
  const [saveError, setSaveError] = useState<string | null>(null)
  const [saveMessage, setSaveMessage] = useState<string | null>(null)
  const [upgradeError, setUpgradeError] = useState<string | null>(null)
  const [submissionConflictError, setSubmissionConflictError] = useState<string | null>(null)
  const [upgradePending, setUpgradePending] = useState(false)
  const [values, setValues] = useState<DynamicFormValues>({})
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false)
  const [editingInformation, setEditingInformation] = useState(false)
  const draftSchemaUpgradeLock = useRef(createDraftSchemaUpgradeLock())
  const autofillLookupGeneration = useRef(0)
  const fieldEditVersions = useRef<Record<string, number>>({})
  const handledSubmissionConflict = useRef(0)
  const isMountedRef = useRef(true)
  const valuesRef = useRef<DynamicFormValues>({})
  const onRequestSavedRef = useRef(onRequestSaved)
  const loadKey = `${mode}:${requestId ?? 'new'}:${reloadKey}`

  function replaceValues(nextValues: DynamicFormValues) {
    valuesRef.current = nextValues
    setValues(nextValues)
    setHasUnsavedChanges(JSON.stringify(nextValues) !== JSON.stringify(savedValuesRef.current))
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
    onRequestSavedRef.current = onRequestSaved
  }, [onRequestSaved])

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
          setEditingInformation(false)
          // Publish the same snapshot so the shell cannot rebase this load onto its old request.
          if (mode === 'request') onRequestSavedRef.current?.(request)
          setActiveRequestSchema(requestSchema)
          setActiveSchema(resolvedSchema)
          setDraftSchemaVersion(classification)
          onDraftSchemaSubmitAllowedChange?.(classification === 'equal')
          setDraftSchemaDecision(
            isDraftSchemaDecisionRequired(classification) ? 'unresolved' : 'not-needed',
          )
          const nextValues = buildRequestValuesForSchema(resolvedSchema.schema, request.requesterData)
          savedValuesRef.current = nextValues
          onDirtyChange?.(false)
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
        setEditingInformation(false)
        setActiveRequestSchema(null)
        setDraftSchemaDecision('not-needed')
        setDraftSchemaVersion('not-applicable')
        onDraftSchemaSubmitAllowedChange?.(false)
        setActiveSchema(response)
        const nextValues = buildInitialValues(response.schema)
        savedValuesRef.current = nextValues
        onDirtyChange?.(false)
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
  }, [loadKey, mode, onDirtyChange, onDraftSchemaSubmitAllowedChange, requestId])

  useEffect(() => {
    if (mode !== 'request' || requestId || currentRequest || !activeSchema || loadedSchemaKey !== loadKey || !requesterIdentity?.trim()) return
    const identityFields = activeSchema.schema.sections.flatMap((section) => section.fields)
      .filter((field) => isRequesterIdentityKey(field.canonicalKey))
    if (!identityFields.some((field) => valuesRef.current[field.fieldKey] !== requesterIdentity)) return

    const nextBaseline = { ...savedValuesRef.current }
    const nextValues = { ...valuesRef.current }
    identityFields.forEach((field) => {
      nextBaseline[field.fieldKey] = requesterIdentity
      nextValues[field.fieldKey] = requesterIdentity
    })
    savedValuesRef.current = nextBaseline
    // Account data can arrive after schema loading and must preserve typed fields.
    replaceValues(nextValues)
    onDirtyChange?.(JSON.stringify(nextValues) !== JSON.stringify(nextBaseline))
  }, [activeSchema, currentRequest, loadedSchemaKey, loadKey, mode, onDirtyChange, requestId, requesterIdentity])

  useEffect(() => {
    if (
      mode !== 'request' ||
      !requestId ||
      !requestSnapshot ||
      requestSnapshot.id !== requestId ||
      !currentRequest ||
      requestSnapshot === currentRequest
    ) {
      return
    }

    const nextActiveRequestSchema = requestSnapshot.status === DRAFT_STATUS
      ? activeRequestSchema
      : null
    const classification = classifyDraftSchemaVersion(mode, requestSnapshot, nextActiveRequestSchema)
    const resolvedSchema = resolveRequestFormSchema(mode, requestSnapshot, nextActiveRequestSchema)
    const requestDataWithLocalEdits = { ...requestSnapshot.requesterData }
    Object.keys(valuesRef.current).forEach((fieldKey) => {
      if (valuesRef.current[fieldKey] !== savedValuesRef.current[fieldKey]) {
        requestDataWithLocalEdits[fieldKey] = valuesRef.current[fieldKey]
      }
    })
    const latestSavedValues = buildRequestValuesForSchema(resolvedSchema.schema, requestSnapshot.requesterData)
    const nextValues = buildRequestValuesForSchema(resolvedSchema.schema, requestDataWithLocalEdits)
    const schemaChanged =
      currentRequest.formVersion !== requestSnapshot.formVersion ||
      currentRequest.schemaSnapshot.version !== requestSnapshot.schemaSnapshot.version

    // This external server snapshot must rebase the child's editable local state.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCurrentRequest(requestSnapshot)
    setActiveRequestSchema(nextActiveRequestSchema)
    setActiveSchema(resolvedSchema)
    setDraftSchemaVersion(classification)
    onDraftSchemaSubmitAllowedChange?.(classification === 'equal')
    setDraftSchemaDecision(
      classification === 'not-applicable'
        ? 'not-needed'
        : schemaChanged && isDraftSchemaDecisionRequired(classification)
          ? 'unresolved'
          : draftSchemaDecision,
    )
    savedValuesRef.current = latestSavedValues
    replaceValues(nextValues)
    onDirtyChange?.(JSON.stringify(nextValues) !== JSON.stringify(latestSavedValues))
    setErrors({})
    invalidateRuntimeAutofill()
  }, [
    activeRequestSchema,
    currentRequest,
    draftSchemaDecision,
    mode,
    onDirtyChange,
    onDraftSchemaSubmitAllowedChange,
    requestId,
    requestSnapshot,
  ])

  useEffect(() => {
    if (
      mode !== 'request' ||
      !requestId ||
      !currentRequest ||
      submissionConflict === 0 ||
      handledSubmissionConflict.current === submissionConflict
    ) {
      return
    }

    handledSubmissionConflict.current = submissionConflict
    onDraftSchemaSubmitAllowedChange?.(false)
    const conflictRequestId = requestId
    let mounted = true
    let settled = false

    function settleConflictRecovery() {
      if (!settled) {
        settled = true
        onSubmissionConflictSettled?.(false)
      }
    }

    async function refreshAfterSubmissionConflict() {
      try {
        const latestRequest = await api.fetchPsfRequest(conflictRequestId)
        const latestRequestSchema = latestRequest.status === DRAFT_STATUS
          ? await api.fetchActiveFormSchema(latestRequest.formKey)
          : null

        if (!mounted) return

        const classification = classifyDraftSchemaVersion('request', latestRequest, latestRequestSchema)
        const resolvedSchema = resolveRequestFormSchema('request', latestRequest, latestRequestSchema)
        const requesterDataWithLocalEdits = { ...latestRequest.requesterData }
        Object.keys(valuesRef.current).forEach((fieldKey) => {
          if (valuesRef.current[fieldKey] !== savedValuesRef.current[fieldKey]) {
            requesterDataWithLocalEdits[fieldKey] = valuesRef.current[fieldKey]
          }
        })
        const latestSavedValues = buildRequestValuesForSchema(resolvedSchema.schema, latestRequest.requesterData)
        const nextValues = buildRequestValuesForSchema(resolvedSchema.schema, requesterDataWithLocalEdits)

        setCurrentRequest(latestRequest)
        onRequestSaved?.(latestRequest)
        setActiveRequestSchema(latestRequestSchema)
        setActiveSchema(resolvedSchema)
        setDraftSchemaVersion(classification)
        onDraftSchemaSubmitAllowedChange?.(classification === 'equal')
        setDraftSchemaDecision(
          isDraftSchemaDecisionRequired(classification) ? 'unresolved' : 'not-needed',
        )
        savedValuesRef.current = latestSavedValues
        replaceValues(nextValues)
        onDirtyChange?.(JSON.stringify(nextValues) !== JSON.stringify(latestSavedValues))
        setErrors({})

        if (isDraftSchemaDecisionRequired(classification)) {
          setSubmissionConflictError(null)
          setUpgradeError(
            'The active schema changed while this Draft was being submitted. Your unsaved edits are preserved. Choose Upgrade, Remain, or Reload the Draft before continuing.',
          )
        } else {
          setUpgradeError(null)
          setSubmissionConflictError(
            classification === 'newer-or-inconsistent'
              ? 'This Draft schema does not match the active request schema. Your edits are preserved, but it cannot be submitted. Reload the Draft.'
              : 'The Draft changed while it was being submitted. Your edits are preserved. Reload the Draft before continuing.',
          )
        }
      } catch {
        if (mounted) {
          setSubmissionConflictError(
            'The Draft changed while it was being submitted. Your edits are preserved; reload the Draft to refresh its schema and revision.',
          )
        }
      } finally {
        settleConflictRecovery()
      }
    }

    void refreshAfterSubmissionConflict()
    return () => {
      mounted = false
      settleConflictRecovery()
    }
  }, [currentRequest, mode, onDirtyChange, onDraftSchemaSubmitAllowedChange, onRequestSaved, onSubmissionConflictSettled, requestId, submissionConflict])

  const schemaDecisionRequired = isDraftSchemaDecisionRequired(draftSchemaVersion)
  const isSchemaChoicePending = schemaDecisionRequired && draftSchemaDecision === 'unresolved'
  const hasInconsistentDraftSchema = draftSchemaVersion === 'newer-or-inconsistent'
  const requestSnapshotPending = Boolean(
    requestSnapshot &&
    requestSnapshot.id === requestId &&
    currentRequest &&
    requestSnapshot !== currentRequest,
  )
  const readOnly = requesterFieldsAreReadOnly(
    mode,
    requestSnapshotPending && requestSnapshot ? requestSnapshot : currentRequest,
  )
  const usesExplicitEdit = explicitEdit && mode === 'request' && Boolean(currentRequest && currentRequest.status !== DRAFT_STATUS)
  const formUnavailable = readOnly || disabled || requestSnapshotPending || saving || upgradePending || hasInconsistentDraftSchema
  const formReadOnly = formUnavailable || (usesExplicitEdit && !editingInformation)
  const readOnlyFieldKeys = activeSchema?.schema.sections.flatMap((section) => section.fields
    .filter((field) => isRequesterIdentityKey(field.canonicalKey))
    .map((field) => field.fieldKey)) ?? []
  const submitLabel = useMemo(() => {
    if (usesExplicitEdit) return 'Save information'
    if (currentRequest) {
      if (currentRequest.status === DRAFT_STATUS) return 'Save draft changes'
      return currentRequest.canEditRequesterData ? 'Save requester information' : 'Requester edits locked'
    }

    return mode === 'request' ? 'Save draft request' : 'Preview only'
  }, [currentRequest, mode, usesExplicitEdit])

  function cancelInformationEdit() {
    if (formUnavailable) return
    invalidateRuntimeAutofill()
    fieldEditVersions.current = {}
    replaceValues({ ...savedValuesRef.current })
    setAutofillStatuses({})
    setErrors({})
    setAutofillError(null)
    setSaveError(null)
    setSaveMessage(null)
    onDirtyChange?.(false)
    setEditingInformation(false)
  }

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
      suggestedValues: Object.fromEntries(Object.entries(response.suggestedValues)
        .filter(([canonicalKey]) => !isRequesterIdentityKey(canonicalKey))),
    })
    if (applied.appliedFieldKeys.length === 0) {
      return
    }

    replaceValues(applied.values)
    onDirtyChange?.(JSON.stringify(applied.values) !== JSON.stringify(savedValuesRef.current))
    setAutofillStatuses((currentStatuses) => {
      const nextStatuses = { ...currentStatuses }
      applied.appliedFieldKeys.forEach((fieldKey) => {
        nextStatuses[fieldKey] = 'auto-filled'
      })
      return nextStatuses
    })
  }

  function updateField(fieldKey: string, value: string) {
    if (formReadOnly || readOnlyFieldKeys.includes(fieldKey)) {
      return
    }

    const nextValues = { ...valuesRef.current, [fieldKey]: value }
    const nextEditVersion = (fieldEditVersions.current[fieldKey] ?? 0) + 1
    fieldEditVersions.current = {
      ...fieldEditVersions.current,
      [fieldKey]: nextEditVersion,
    }
    replaceValues(nextValues)
    onDirtyChange?.(JSON.stringify(nextValues) !== JSON.stringify(savedValuesRef.current))
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
    setSubmissionConflictError(null)
    setSaveError(null)
    setSaveMessage(null)
  }

  function reloadDraftSchema() {
    if (disabled || saving || upgradePending || loadedSchemaKey !== loadKey) return
    if (JSON.stringify(valuesRef.current) !== JSON.stringify(savedValuesRef.current) &&
      !window.confirm('Discard unsaved requester changes and reload this request?')) return
    invalidateRuntimeAutofill()
    onDraftSchemaSubmitAllowedChange?.(false)
    setUpgradeError(null)
    setSubmissionConflictError(null)
    setReloadKey((currentReloadKey) => currentReloadKey + 1)
  }

  async function saveDraft(currentValues: DynamicFormValues) {
    const mutationLock = draftSchemaUpgradeLock.current
    if (
      !activeSchema ||
      formReadOnly ||
      isSchemaChoicePending ||
      !mutationLock.tryStart()
    ) {
      return
    }

    setErrors({})
    invalidateRuntimeAutofill()
    setSaving(true)
    onSavingChange?.(true)
    setSaveError(null)
    setSaveMessage(null)

    try {
      const savedRequest = currentRequest
        ? await api.updateDraftRequesterData(currentRequest.id, {
            formVersion: currentRequest.formVersion,
            expectedUpdatedAt: currentRequest.updatedAt,
            requesterData: currentValues,
          })
        : await api.createDraftRequest({ requesterData: currentValues })
      const nextActiveRequestSchema =
        currentRequest && activeRequestSchema
          ? activeRequestSchema
          : activeSchema ?? activeSchemaFromRequest(savedRequest)
      const classification = classifyDraftSchemaVersion(mode, savedRequest, nextActiveRequestSchema)
      const resolvedSchema = resolveRequestFormSchema(mode, savedRequest, nextActiveRequestSchema)

      setCurrentRequest(savedRequest)
      onRequestSaved?.(savedRequest)
      setActiveRequestSchema(nextActiveRequestSchema)
      setActiveSchema(resolvedSchema)
      setDraftSchemaVersion(classification)
      onDraftSchemaSubmitAllowedChange?.(classification === 'equal')
      setDraftSchemaDecision(
        isDraftSchemaDecisionRequired(classification) ? 'remain' : 'not-needed',
      )
      setSubmissionConflictError(null)
      fieldEditVersions.current = {}
      const savedValues = buildRequestValuesForSchema(resolvedSchema.schema, savedRequest.requesterData)
      savedValuesRef.current = savedValues
      onDirtyChange?.(false)
      setAutofillError(null)
      setAutofillStatuses({})
      replaceValues(buildRequestValuesForSchema(resolvedSchema.schema, savedRequest.requesterData))
      setEditingInformation(false)
      setSaveMessage(savedRequest.status === DRAFT_STATUS ? `Draft ${savedRequest.requestNo} saved.` : 'Requester information saved.')
    } catch (error) {
      if (error instanceof ApiError && error.status === 409 && currentRequest) {
        try {
          const latestRequest = await api.fetchPsfRequest(currentRequest.id)
          const latestRequestSchema = latestRequest.status === DRAFT_STATUS
            ? await api.fetchActiveFormSchema(latestRequest.formKey)
            : null
          const classification = classifyDraftSchemaVersion(mode, latestRequest, latestRequestSchema)
          const resolvedSchema = resolveRequestFormSchema(mode, latestRequest, latestRequestSchema)
          const requesterDataWithLocalEdits = { ...latestRequest.requesterData }
          Object.keys(valuesRef.current).forEach((fieldKey) => {
            if (valuesRef.current[fieldKey] !== savedValuesRef.current[fieldKey]) {
              requesterDataWithLocalEdits[fieldKey] = valuesRef.current[fieldKey]
            }
          })
          const latestSavedValues = buildRequestValuesForSchema(resolvedSchema.schema, latestRequest.requesterData)
          const nextValues = buildRequestValuesForSchema(resolvedSchema.schema, requesterDataWithLocalEdits)
          const schemaChanged =
            currentRequest.formVersion !== latestRequest.formVersion ||
            currentRequest.schemaSnapshot.version !== latestRequest.schemaSnapshot.version ||
            activeRequestSchema?.version !== latestRequestSchema?.version

          setCurrentRequest(latestRequest)
          onRequestSaved?.(latestRequest)
          setActiveRequestSchema(latestRequestSchema)
          setActiveSchema(resolvedSchema)
          setDraftSchemaVersion(classification)
          onDraftSchemaSubmitAllowedChange?.(classification === 'equal')
          setDraftSchemaDecision(
            isDraftSchemaDecisionRequired(classification)
              ? schemaChanged ? 'unresolved' : draftSchemaDecision
              : 'not-needed',
          )
          savedValuesRef.current = latestSavedValues
          replaceValues(nextValues)
          onDirtyChange?.(JSON.stringify(nextValues) !== JSON.stringify(latestSavedValues))
          setErrors({})
          setUpgradeError(
            isDraftSchemaDecisionRequired(classification)
              ? 'The active schema changed while this Draft was being saved. Your compatible edits are preserved. Choose Upgrade, Remain, or Reload before continuing.'
              : null,
          )
          setSubmissionConflictError(
            classification === 'newer-or-inconsistent'
              ? 'This Draft schema does not match the active request schema. Your edits are preserved, but it cannot be saved. Reload the Draft.'
              : null,
          )
          setSaveError('This request changed in another session. Your unsaved requester values are preserved; review them against the latest revision before saving again.')
        } catch {
          setSaveError('This request changed in another session. Your unsaved requester values are preserved; reload before saving again.')
        }
      } else {
        setSaveError(error instanceof Error ? error.message : 'Unable to save draft request')
      }
    } finally {
      mutationLock.finish()
      onSavingChange?.(false)
      setSaving(false)
    }
  }

  async function upgradeDraftSchema() {
    if (
      !currentRequest ||
      !activeRequestSchema ||
      !schemaDecisionRequired ||
      formReadOnly
    ) {
      return
    }

    const upgradeLock = draftSchemaUpgradeLock.current
    if (!upgradeLock.tryStart()) {
      return
    }

    invalidateRuntimeAutofill()
    setUpgradePending(true)
    onSavingChange?.(true)
    setUpgradeError(null)
    setSaveError(null)
    setSaveMessage(null)

    try {
      const upgradedRequest = await api.upgradeDraftSchema(currentRequest.id, {
        formVersion: activeRequestSchema.version,
      })
      const upgradedSchema = resolveRequestFormSchema('request', upgradedRequest, activeRequestSchema)
      const classification = classifyDraftSchemaVersion('request', upgradedRequest, upgradedSchema)

      setCurrentRequest(upgradedRequest)
      onRequestSaved?.(upgradedRequest)
      setActiveRequestSchema(upgradedSchema)
      setActiveSchema(upgradedSchema)
      setDraftSchemaVersion(classification)
      onDraftSchemaSubmitAllowedChange?.(classification === 'equal')
      setDraftSchemaDecision('not-needed')
      const savedValues = buildRequestValuesForSchema(upgradedSchema.schema, upgradedRequest.requesterData)
      savedValuesRef.current = savedValues
      const nextValues = buildRequestValuesForSchema(upgradedSchema.schema, valuesRef.current)
      onDirtyChange?.(JSON.stringify(nextValues) !== JSON.stringify(savedValues))
      setSubmissionConflictError(null)
      setErrors({})
      fieldEditVersions.current = {}
      setAutofillError(null)
      setAutofillStatuses({})
      replaceValues(nextValues)
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
      onSavingChange?.(false)
      setUpgradePending(false)
    }
  }

  let editState = currentRequest ? 'Saved' : 'Not saved'
  if (hasUnsavedChanges) editState = 'Unsaved changes'
  if (upgradePending) editState = 'Upgrading schema…'
  if (saving) editState = 'Saving…'
  if (hasInconsistentDraftSchema) editState = 'Editing is unavailable until the Draft schema is reloaded.'
  if (disabled) editState = 'Editing is temporarily unavailable while another action is pending.'
  if (readOnly) editState = 'Requester information is read-only.'
  if (mode === 'preview') editState = 'Read-only preview'

  if (loading || loadedSchemaKey !== loadKey) {
    return <AsyncNotice kind="loading" title="Loading PSF request draft…" />
  }

  if (loadError || !activeSchema) {
    return <AsyncNotice kind="error" title={loadError ?? 'PSF request draft is unavailable.'} />
  }

  if (isSchemaChoicePending && currentRequest && activeRequestSchema) {
    return (
      <>
        {!requestId ? <RequestDraftStatus request={currentRequest} /> : null}
        <DraftSchemaUpgradeDecision
          activeVersion={activeRequestSchema.version}
          currentVersion={currentRequest.formVersion}
          disabled={formReadOnly}
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
    <div className="active-schema-form">
      {currentRequest && !requestId ? <RequestDraftStatus request={currentRequest} /> : null}
      {saving ? <AsyncNotice kind="loading" title="Saving requester information…" /> : null}
      {saveMessage ? <AsyncNotice kind="success" title={saveMessage} /> : null}
      {saveError ? <AsyncNotice kind="error" title={saveError} /> : null}
      {submissionConflictError ? (
        <AsyncNotice kind="error" title={submissionConflictError} action={
          <button className="ui-button ui-button--secondary" onClick={reloadDraftSchema} type="button">
            Reload draft
          </button>
        } />
      ) : null}
      {autofillLoading ? <p className="sr-only" role="status">Loading autofill suggestions…</p> : null}
      {autofillError ? (
        <AsyncNotice kind="error" title={`Autofill suggestions could not be loaded: ${autofillError}`} />
      ) : null}
      {schemaDecisionRequired &&
      draftSchemaDecision === 'remain' &&
      currentRequest &&
      activeRequestSchema ? (
        <DraftSchemaUpgradeDecision
          activeVersion={activeRequestSchema.version}
          currentVersion={currentRequest.formVersion}
          disabled={formReadOnly}
          error={upgradeError}
          hasRemained
          isUpgradePending={upgradePending}
          onReload={reloadDraftSchema}
          onRemain={remainOnDraftSchema}
          onUpgrade={() => void upgradeDraftSchema()}
          showRemain={false}
        />
      ) : null}
      <div className="active-schema-form__identity">
        <div>
          {headerTitle ? <h2>{headerTitle}</h2> : null}
          <span className="active-schema-form__version">{headerTitle ? 'Form version' : `${activeSchema.title} · version`} {activeSchema.version}</span>
        </div>
        <p className={`form-edit-state${hasUnsavedChanges ? ' form-edit-state--dirty' : ''}`}>{editState}</p>
        {usesExplicitEdit && !editingInformation && !readOnly ? (
          <button className="ui-button ui-button--secondary" disabled={formUnavailable} onClick={() => { if (!formUnavailable) setEditingInformation(true) }} type="button">
            Edit information
          </button>
        ) : null}
      </div>
      <DynamicFormRenderer
        collapseOptionalFields={mode === 'request' && (!currentRequest || currentRequest.status === DRAFT_STATUS || usesExplicitEdit)}
        errors={errors}
        footerActions={!formReadOnly ? <>
          {usesExplicitEdit ? <button className="ui-button ui-button--secondary" onClick={cancelInformationEdit} type="button">Cancel</button> : null}
          <div className="active-schema-form__footer">
          <p className={`form-edit-state${hasUnsavedChanges ? ' form-edit-state--dirty' : ''}`}>{editState}</p>
          <p className="ui-help">{currentRequest ? 'Requester information is saved separately from PSF information.' : 'You can review and submit after saving the draft.'}</p>
        </div></> : undefined}
        headerTitle={headerTitle}
        fieldStatuses={autofillStatuses}
        onChange={!formReadOnly ? updateField : undefined}
        onSubmit={!formReadOnly ? saveDraft : undefined}
        readOnly={formReadOnly}
        readOnlyFieldKeys={readOnlyFieldKeys}
        schema={activeSchema.schema}
        showSchemaHeader={false}
        submitLabel={saving ? usesExplicitEdit ? 'Saving information…' : 'Saving draft…' : submitLabel}
        values={values}
      />
    </div>
  )
}
