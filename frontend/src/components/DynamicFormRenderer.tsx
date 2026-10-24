import { useId, type ChangeEvent, type FormEvent, type KeyboardEvent, type ReactNode } from 'react'
import type {
  DynamicFormErrors,
  DynamicFormValues,
  FormSchema,
  FormSchemaField,
} from '../types/forms'
import {
  AUTOFILL_HIGHLIGHT_LABELS,
  autofillHighlightRowClass,
  type AutofillHighlight,
  type AutofillHighlights,
} from './autofillHighlight'

export type {
  DynamicFormErrors,
  DynamicFormValues,
  FormSchema,
  FormSchemaField,
} from '../types/forms'

/** A field's Autofill highlight (see `autofillHighlight.ts`). */
export type DynamicFormFieldStatus = AutofillHighlight

/** The latest result of the bar's action (saving, saved, or the error), shown in the bar beside the buttons. */
export interface DynamicFormActionFeedback {
  kind: 'pending' | 'success' | 'error'
  message: string
}

export interface DynamicFormRendererProps {
  /**
   * Shown in the action bar, left of the buttons. While it is pending the buttons stay in place, disabled, even
   * though the form is read-only; once the form is read-only the bar keeps showing it without buttons.
   */
  actionFeedback?: DynamicFormActionFeedback
  deleteAction?: ReactNode
  footerActions?: ReactNode
  headerTitle?: string
  /** Autofill highlights of the open form: each colours its field's row beside its text label. */
  fieldStatuses?: AutofillHighlights
  schema: FormSchema
  values?: DynamicFormValues
  errors?: DynamicFormErrors
  readOnly?: boolean
  readOnlyFieldKeys?: readonly string[]
  showSchemaHeader?: boolean
  submitLabel?: string
  onChange?: (fieldKey: string, value: string) => void
  onSubmit?: (values: DynamicFormValues) => void
}

const HEADER_METADATA_FIELD_KEYS = new Set(['requester_name', 'modified_by', 'start_date'])

function isHeaderMetadataField(field: FormSchemaField): boolean {
  return HEADER_METADATA_FIELD_KEYS.has(field.fieldKey) || field.canonicalKey === 'modified_by' || field.canonicalKey === 'start_date'
}

/**
 * Lays out every Form Schema rendering: one row per visible field, the label on the left and the
 * control (or, read-only, the stored value) on the right. Fields keep their configured order.
 */
export function DynamicFormRenderer({
  actionFeedback,
  deleteAction,
  errors = {},
  fieldStatuses = {},
  footerActions,
  headerTitle,
  onChange,
  onSubmit,
  readOnly = false,
  readOnlyFieldKeys = [],
  schema,
  showSchemaHeader = true,
  submitLabel = 'Submit request',
  values = {},
}: DynamicFormRendererProps) {
  const visibleFields = (fields: FormSchemaField[]) => fields.filter((field) => !isHeaderMetadataField(field))
  // A form locked while its save runs keeps its buttons (disabled), so the bar does not change shape;
  // a form that turned read-only after its action keeps the bar for the result, without buttons.
  const showButtons = !readOnly || actionFeedback?.kind === 'pending'
  // Progress and success are announced politely; an error is announced as an alert.
  const errorFeedback = actionFeedback?.kind === 'error' ? actionFeedback : undefined
  const politeFeedback = actionFeedback?.kind === 'error' ? undefined : actionFeedback
  const hasRequiredFields = schema.sections.some((section) => visibleFields(section.fields).some((field) => field.required))

  function handleFieldChange(fieldKey: string) {
    return (event: ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
      if (readOnly || readOnlyFieldKeys.includes(fieldKey)) return
      onChange?.(fieldKey, event.target.value)
    }
  }

  function renderField(field: FormSchemaField) {
    return <FieldRow
      errors={errors}
      field={field}
      fieldStatus={fieldStatuses[field.fieldKey]}
      key={field.fieldKey}
      onChange={handleFieldChange(field.fieldKey)}
      readOnly={readOnly || readOnlyFieldKeys.includes(field.fieldKey)}
      value={values[field.fieldKey] ?? ''}
    />
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    onSubmit?.(values)
  }

  function handleKeyDown(event: KeyboardEvent<HTMLFormElement>) {
    const input = event.target as HTMLInputElement
    if (
      event.key === 'Enter' &&
      !event.nativeEvent.isComposing &&
      input.tagName === 'INPUT' &&
      !['button', 'submit', 'reset', 'image'].includes(input.type)
    ) {
      event.preventDefault()
    }
  }

  return (
    <form className={`dynamic-form${readOnly ? ' dynamic-form--readonly' : ''}`} noValidate onKeyDown={handleKeyDown} onSubmit={handleSubmit}>
      {showSchemaHeader ? (
        <div className="dynamic-form__header">
          {headerTitle === undefined ? <p className="page-card__eyebrow">Schema preview</p> : null}
          <h2>{headerTitle ?? schema.title}</h2>
          <p className="dynamic-form__meta">
            {headerTitle !== undefined ? `${schema.title} · ` : ''}{schema.formKey} · version {schema.version}
          </p>
        </div>
      ) : null}

      {hasRequiredFields ? (
        <p className="ui-help">Fields marked <span aria-hidden="true">*</span> are required for submission.</p>
      ) : null}
      <div className="dynamic-form__sections">
        {schema.sections.map((section, sectionIndex) => {
          return (
          <section aria-label={section.title} className="dynamic-form__section" key={section.sectionKey}>
            {schema.sections.length === 1 && section.title === headerTitle ? null : <div className="dynamic-form__section-header">
              <span aria-hidden="true" className="dynamic-form__section-number">{String(sectionIndex + 1).padStart(2, '0')}</span>
              <h3 className="dynamic-form__section-title">{section.title}</h3>
            </div>}
            <div className="dynamic-form__rows">
              {visibleFields(section.fields).map(renderField)}
            </div>

          </section>
          )
        })}
      </div>

      {showButtons || actionFeedback ? (
        <div className="dynamic-form__actions">
          {/* The status region stays mounted, empty when idle, so a message placed in it is announced. */}
          <p className={`dynamic-form__status${politeFeedback ? ` dynamic-form__status--${politeFeedback.kind}` : ''}`} role="status">{politeFeedback?.message}</p>
          {errorFeedback ? <p className="dynamic-form__status dynamic-form__status--error" role="alert">{errorFeedback.message}</p> : null}
          {showButtons ? (
            <div className="dynamic-form__buttons">
              {deleteAction}
              {footerActions}
              <button className="ui-button ui-button--primary" disabled={readOnly} type="submit">
                {submitLabel}
              </button>
            </div>
          ) : null}
        </div>
      ) : null}
    </form>
  )
}

interface FieldRowProps {
  errors: DynamicFormErrors
  field: FormSchemaField
  fieldStatus?: DynamicFormFieldStatus
  onChange: (event: ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => void
  readOnly: boolean
  value: string
}

/** One field's row: a label cell, then a control cell holding the control or value and the field's notes. */
function FieldRow({ errors, field, fieldStatus, onChange, readOnly, value }: FieldRowProps) {
  const instanceId = useId()
  const error = errors[field.fieldKey]
  const fieldId = `dynamic-field-${instanceId}-${field.fieldKey}`
  const labelId = `${fieldId}-label`
  const errorId = `${fieldId}-error`
  const fieldStatusId = `${fieldId}-autofill-status`
  const describedBy = [error ? errorId : null, fieldStatus ? fieldStatusId : null]
    .filter((id): id is string => id !== null)
    .join(' ') || undefined
  const label = <>
    <span>{field.label}</span>
    {field.required ? <span aria-hidden="true" className="dynamic-form__required">*</span> : null}
  </>
  // A radio group has no single control for a <label> to point at; the group names itself from this cell.
  const labelsGroup = !readOnly && field.type === 'radio'

  return (
    <div className={fieldStatus ? `dynamic-form__row ${autofillHighlightRowClass(fieldStatus)}` : 'dynamic-form__row'}>
      {labelsGroup ? <span className="dynamic-form__label" id={labelId}>{label}</span>
        : <label className="dynamic-form__label" htmlFor={fieldId} id={labelId}>{label}</label>}
      <div className="dynamic-form__control">
        {readOnly ? (
          <output aria-describedby={describedBy} aria-labelledby={labelId} className="dynamic-form__readonly" id={fieldId}>
            {value || 'Not provided'}
          </output>
        ) : <FieldInput
          describedBy={describedBy}
          error={Boolean(error)}
          field={field}
          fieldId={fieldId}
          labelId={labelId}
          onChange={onChange}
          readOnly={readOnly}
          value={value}
        />}
        {error ? <p className="ui-error" id={errorId}>{error}</p> : null}
        {fieldStatus ? (
          <p className="dynamic-form__autofill-status" id={fieldStatusId} role="status">
            {AUTOFILL_HIGHLIGHT_LABELS[fieldStatus]}
          </p>
        ) : null}
      </div>
    </div>
  )
}

interface FieldInputProps {
  describedBy?: string
  error: boolean
  field: FormSchemaField
  fieldId: string
  /** Names the radio group, since a legend cannot sit in the row's label cell. */
  labelId: string
  onChange: (event: ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => void
  readOnly: boolean
  value: string
}

function FieldInput({ describedBy, error, field, fieldId, labelId, onChange, readOnly, value }: FieldInputProps) {
  const commonProps = {
    'aria-describedby': describedBy,
    'aria-invalid': error || undefined,
    className: 'ui-control',
    disabled: readOnly,
    id: fieldId,
    name: field.fieldKey,
    onChange,
    required: field.required,
    value,
  }

  if (field.type === 'textarea') {
    return <textarea {...commonProps} rows={4} />
  }

  const options =
    value && !(field.options ?? []).includes(value)
      ? [value, ...(field.options ?? [])]
      : (field.options ?? [])

  if (field.type === 'select') {
    return (
      <select {...commonProps}>
        <option value="">Select {field.label}</option>
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    )
  }

  if (field.type === 'radio') {
    return (
      <div aria-describedby={describedBy} aria-invalid={error || undefined} aria-labelledby={labelId}
        aria-required={field.required || undefined} className="dynamic-form__radio-group" role="radiogroup">
        {options.map((option, index) => (
          <label className={`dynamic-form__radio-option${value === option ? ' dynamic-form__radio-option--selected' : ''}`} key={option}>
            <input
              aria-describedby={describedBy}
              aria-invalid={error || undefined}
              id={`${fieldId}-${index}`}
              checked={value === option}
              disabled={readOnly}
              name={fieldId}
              onChange={onChange}
              required={field.required}
              type="radio"
              value={option}
            />
            <span className="dynamic-form__choice-label">{option}</span>
          </label>
        ))}
      </div>
    )
  }

  return <input {...commonProps} step={field.type === 'number' ? 'any' : undefined} type={field.type} />
}
