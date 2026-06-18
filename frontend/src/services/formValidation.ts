import type { DynamicFormErrors, DynamicFormValues, FormSchema } from '../types/forms'

export function validateRequiredFields(
  schema: FormSchema,
  values: DynamicFormValues,
): DynamicFormErrors {
  return schema.sections
    .flatMap((section) => section.fields)
    .reduce<DynamicFormErrors>((errors, field) => {
      if (field.required && !String(values[field.fieldKey] ?? '').trim()) {
        errors[field.fieldKey] = `${field.label} is required.`
      }

      return errors
    }, {})
}
