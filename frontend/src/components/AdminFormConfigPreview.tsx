import { useState } from 'react'
import { DynamicFormRenderer } from './DynamicFormRenderer'
import { validateRequiredFields } from '../services/formValidation'
import type { DynamicFormValues, FormSchema } from '../types/forms'

function createPreviewState(schema: FormSchema | null) {
  const values: DynamicFormValues = {}
  return { key: schema ? `${schema.formKey}:${schema.version}` : null, values, checked: false }
}

export function AdminFormConfigPreview({ schema }: { schema: FormSchema | null }) {
  const [preview, setPreview] = useState(() => createPreviewState(schema))
  const schemaKey = schema ? `${schema.formKey}:${schema.version}` : null
  const current = preview.key === schemaKey ? preview : createPreviewState(schema)
  // Reset only when the selected version changes; config edits keep trial input.
  if (preview.key !== schemaKey) setPreview(current)
  if (!schema) return null

  const identityKeys = schema.formKey === 'psf-request'
    ? schema.sections.flatMap((section) => section.fields)
      .filter((field) => field.canonicalKey === 'requester' || field.canonicalKey === 'requester_name')
      .map((field) => field.fieldKey)
    : []
  const values = { ...current.values }
  for (const fieldKey of identityKeys) values[fieldKey] = 'Sample requester (preview only)'
  const errors = current.checked ? validateRequiredFields(schema, values) : {}
  const familyLabel = schema.formKey === 'psf-request' ? 'Requester Information' : 'PSF Created Information'

  return <div className={schema.formKey === 'psf-request' ? 'active-schema-form' : 'psf-created-panel'}>
    <p className="ui-help">Preview only. Trial values stay here and no request is saved.{identityKeys.length > 0 ? ' Requester identity uses sample data and is locked like the request form.' : ''}</p>
    <DynamicFormRenderer
      errors={errors}
      headerTitle={familyLabel}
      onChange={(fieldKey, value) => {
        if (identityKeys.includes(fieldKey)) return
        setPreview((state) => ({ ...state, values: { ...state.values, [fieldKey]: value } }))
      }}
      onSubmit={() => setPreview((state) => ({ ...state, checked: true }))}
      readOnlyFieldKeys={identityKeys}
      schema={schema}
      showSchemaHeader={false}
      submitLabel="Check required fields"
      values={values}
    />
    {current.checked && Object.keys(errors).length === 0 ? <p className="ui-help" role="status">All required fields are complete.</p> : null}
  </div>
}
