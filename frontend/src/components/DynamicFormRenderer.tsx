import type { ChangeEvent, FormEvent } from 'react'
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

export interface DynamicFormRendererProps {
  schema: FormSchema
  values?: DynamicFormValues
  errors?: DynamicFormErrors
  readOnly?: boolean
  submitLabel?: string
  onChange?: (fieldKey: string, value: string) => void
  onSubmit?: (values: DynamicFormValues) => void
}

const PRODUCT_TYPE_FIELD_KEY = 'product_type'

function getAllFields(schema: FormSchema): FormSchemaField[] {
  return schema.sections.flatMap((section) => section.fields)
}

function findProductTypeField(schema: FormSchema): FormSchemaField | undefined {
  return getAllFields(schema).find(
    (field) => field.fieldKey === PRODUCT_TYPE_FIELD_KEY || field.canonicalKey === PRODUCT_TYPE_FIELD_KEY,
  )
}

function buildFieldId(field: FormSchemaField): string {
  return `dynamic-field-${field.fieldKey}`
}

export function DynamicFormRenderer({
  errors = {},
  onChange,
  onSubmit,
  readOnly = false,
  schema,
  submitLabel = 'Submit request',
  values = {},
}: DynamicFormRendererProps) {
  const productTypeField = findProductTypeField(schema)

  function handleFieldChange(fieldKey: string) {
    return (event: ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
      onChange?.(fieldKey, event.target.value)
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    onSubmit?.(values)
  }

  return (
    <form className="dynamic-form" noValidate onSubmit={handleSubmit}>
      <div className="dynamic-form__header">
        <p className="page-card__eyebrow">Schema preview</p>
        <h2>{schema.title}</h2>
        <p className="dynamic-form__meta">
          {schema.formKey} · version {schema.version}
        </p>
      </div>

      {productTypeField ? (
        <div className="dynamic-form__product-type">
          <FieldControl
            errors={errors}
            field={productTypeField}
            onChange={handleFieldChange(productTypeField.fieldKey)}
            readOnly={readOnly}
            value={values[productTypeField.fieldKey] ?? ''}
          />
        </div>
      ) : null}

      <div className="dynamic-form__sections">
        {schema.sections.map((section) => {
          const fields = section.fields.filter((field) => field.fieldKey !== productTypeField?.fieldKey)

          if (fields.length === 0) {
            return null
          }

          return (
            <section className="dynamic-form__section" key={section.sectionKey}>
              <h3>{section.title}</h3>
              <div className="dynamic-form__grid">
                {fields.map((field) => (
                  <FieldControl
                    errors={errors}
                    field={field}
                    key={field.fieldKey}
                    onChange={handleFieldChange(field.fieldKey)}
                    readOnly={readOnly}
                    value={values[field.fieldKey] ?? ''}
                  />
                ))}
              </div>
            </section>
          )
        })}
      </div>

      {!readOnly ? (
        <div className="dynamic-form__actions">
          <button className="primary-button" type="submit">
            {submitLabel}
          </button>
        </div>
      ) : null}
    </form>
  )
}

interface FieldControlProps {
  errors: DynamicFormErrors
  field: FormSchemaField
  onChange: (event: ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => void
  readOnly: boolean
  value: string
}

function FieldControl({ errors, field, onChange, readOnly, value }: FieldControlProps) {
  const error = errors[field.fieldKey]
  const fieldId = buildFieldId(field)
  const errorId = `${field.fieldKey}-error`
  const describedBy = error ? errorId : undefined

  return (
    <div aria-readonly={readOnly || undefined} className="dynamic-form__field">
      <label className="dynamic-form__label" htmlFor={fieldId}>
        <span>{field.label}</span>
        {field.required ? <span className="dynamic-form__required">Required</span> : null}
      </label>
      <FieldInput
        describedBy={describedBy}
        error={Boolean(error)}
        field={field}
        fieldId={fieldId}
        onChange={onChange}
        readOnly={readOnly}
        value={value}
      />
      {error ? (
        <p className="dynamic-form__error" id={errorId}>
          {error}
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
      <div className="dynamic-form__radio-group" role="radiogroup" aria-describedby={describedBy}>
        {(field.options ?? []).map((option) => (
          <label className="dynamic-form__radio-option" key={option}>
            <input
              aria-invalid={error || undefined}
              checked={value === option}
              disabled={readOnly}
              name={field.fieldKey}
              onChange={onChange}
              required={field.required}
              type="radio"
              value={option}
            />
            <span>{option}</span>
          </label>
        ))}
      </div>
    )
  }

  return <input {...commonProps} type={field.type} />
}
