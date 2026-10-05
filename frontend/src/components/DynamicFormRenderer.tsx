import { useId, type ChangeEvent, type FormEvent, type KeyboardEvent, type ReactNode } from 'react'
import type {
  DynamicFormErrors,
  DynamicFormValues,
  FormSchema,
  FormSchemaField,
} from '../types/forms'

export type {
  DynamicFormErrors,
  DynamicFormValues,
  FormSchema,
  FormSchemaField,
} from '../types/forms'

export type DynamicFormFieldStatus = 'auto-filled' | 'edited-by-user'

export interface DynamicFormRendererProps {
  footerActions?: ReactNode
  headerTitle?: string
  fieldStatuses?: Partial<Record<string, DynamicFormFieldStatus>>
  schema: FormSchema
  values?: DynamicFormValues
  errors?: DynamicFormErrors
  readOnly?: boolean
  readOnlyFieldKeys?: readonly string[]
  collapseOptionalFields?: boolean
  showSchemaHeader?: boolean
  submitLabel?: string
  onChange?: (fieldKey: string, value: string) => void
  onSubmit?: (values: DynamicFormValues) => void
}

const PRODUCT_TYPE_FIELD_KEY = 'product_type'

export function DynamicFormRenderer({
  errors = {},
  fieldStatuses = {},
  footerActions,
  headerTitle,
  onChange,
  onSubmit,
  readOnly = false,
  readOnlyFieldKeys = [],
  collapseOptionalFields = false,
  schema,
  showSchemaHeader = true,
  submitLabel = 'Submit request',
  values = {},
}: DynamicFormRendererProps) {
  const hasRequiredFields = schema.sections.some((section) => section.fields.some((field) => field.required))

  function handleFieldChange(fieldKey: string) {
    return (event: ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
      if (readOnly || readOnlyFieldKeys.includes(fieldKey)) return
      onChange?.(fieldKey, event.target.value)
    }
  }

  function renderField(field: FormSchemaField) {
    return <FieldControl
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
          const optionalFields = collapseOptionalFields ? section.fields.filter((field) => !field.required) : []
          const mainFields = collapseOptionalFields ? section.fields.filter((field) => field.required) : section.fields
          return (
          <section aria-label={section.title} className="dynamic-form__section" key={section.sectionKey}>
            {schema.sections.length === 1 && section.title === headerTitle ? null : <div className="dynamic-form__section-header">
              <span aria-hidden="true" className="dynamic-form__section-number">{String(sectionIndex + 1).padStart(2, '0')}</span>
              <h3 className="dynamic-form__section-title">{section.title}</h3>
            </div>}
            <div className="dynamic-form__grid">
              {mainFields.map(renderField)}
            </div>
            {optionalFields.length > 0 ? (
              <details className="dynamic-form__additional" open={optionalFields.some((field) => Boolean(errors[field.fieldKey])) || undefined}>
                <summary className="dynamic-form__additional-summary">
                  <span>Additional details</span>
                  <span className="dynamic-form__additional-count">{optionalFields.length} optional {optionalFields.length === 1 ? 'field' : 'fields'}</span>
                </summary>
                <div className="dynamic-form__grid">{optionalFields.map(renderField)}</div>
              </details>
            ) : null}
          </section>
          )
        })}
      </div>

      {!readOnly ? (
        <div className="dynamic-form__actions">
          <button className="ui-button ui-button--primary" type="submit">
            {submitLabel}
          </button>
          {footerActions}
        </div>
      ) : null}
    </form>
  )
}

interface FieldControlProps {
  errors: DynamicFormErrors
  field: FormSchemaField
  fieldStatus?: DynamicFormFieldStatus
  onChange: (event: ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => void
  readOnly: boolean
  value: string
}

function FieldControl({ errors, field, fieldStatus, onChange, readOnly, value }: FieldControlProps) {
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
  const input = <FieldInput
    describedBy={describedBy}
    error={Boolean(error)}
    field={field}
    fieldId={fieldId}
    onChange={onChange}
    readOnly={readOnly}
    value={value}
  />
  const isProductType = field.fieldKey === PRODUCT_TYPE_FIELD_KEY || field.canonicalKey === PRODUCT_TYPE_FIELD_KEY
  const isWide = field.type === 'textarea' || field.type === 'radio' || field.fieldKey === 'title' || field.canonicalKey === 'title'

  return (
    <div
      className={`dynamic-form__field${field.type === 'textarea' ? ' dynamic-form__field--textarea' : ''}${isWide ? ' dynamic-form__field--wide' : ''}${isProductType ? ' dynamic-form__product-type' : ''}`}
    >
      {readOnly ? <>
        <label className="dynamic-form__label" htmlFor={fieldId} id={labelId}>{label}</label>
        <output aria-describedby={describedBy} aria-labelledby={labelId} className="dynamic-form__readonly" id={fieldId}>
          {value || 'Not provided'}
        </output>
      </> : field.type === 'radio' ? (
        <fieldset aria-describedby={describedBy} aria-invalid={Boolean(error) || undefined} aria-required={field.required || undefined}
          aria-labelledby={labelId} className="dynamic-form__choice-fieldset" role="radiogroup">
          <legend className="dynamic-form__label" id={labelId}>{label}</legend>
          {input}
        </fieldset>
      ) : <>
        <label className="dynamic-form__label" htmlFor={fieldId} id={labelId}>{label}</label>
        {input}
      </>}
      {error ? <p className="ui-error" id={errorId}>{error}</p> : null}
      {fieldStatus ? (
        <p className="dynamic-form__autofill-status" id={fieldStatusId} role="status">
          {fieldStatus === 'auto-filled' ? 'Auto-filled' : 'Edited by user'}
        </p>
      ) : null}
    </div>
  )
}

interface FieldInputProps {
  describedBy?: string
  error: boolean
  field: FormSchemaField
  fieldId: string
  onChange: (event: ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => void
  readOnly: boolean
  value: string
}

function FieldInput({ describedBy, error, field, fieldId, onChange, readOnly, value }: FieldInputProps) {
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

  if (field.type === 'select') {
    return (
      <select {...commonProps}>
        <option value="">Select {field.label}</option>
        {(field.options ?? []).map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    )
  }

  if (field.type === 'radio') {
    return (
      <div className="dynamic-form__radio-group">
        {(field.options ?? []).map((option, index) => (
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

  return <input {...commonProps} type={field.type} />
}
