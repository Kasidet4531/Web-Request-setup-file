import { describe, expect, it } from 'vitest'
import {
  applyRuntimeAutofillSuggestions,
  getRequesterAutofillTriggerField,
} from './activeSchemaFormState'
import type { FormSchema } from '../types/forms'

const schema: FormSchema = {
  formKey: 'psf-request',
  version: 1,
  title: 'Runtime autofill test schema',
  sections: [
    {
      sectionKey: 'requester_information',
      title: 'Requester Information',
      visibleTo: ['requester'],
      fields: [
        {
          fieldKey: 'reference_psf_input',
          canonicalKey: 'reference_psf_name',
          label: 'Reference PSF Name',
          type: 'text',
          required: false,
          autofillTrigger: true,
        },
        {
          fieldKey: 'product_input',
          canonicalKey: 'product',
          label: 'Product',
          type: 'text',
          required: false,
        },
        {
          fieldKey: 'wafer_fab_input',
          canonicalKey: 'wafer_fab',
          label: 'Wafer FAB',
          type: 'text',
          required: false,
        },
      ],
    },
    {
      sectionKey: 'admin_only',
      title: 'Admin-only data',
      visibleTo: ['admin'],
      fields: [
        {
          fieldKey: 'private_admin_input',
          canonicalKey: 'private_admin_value',
          label: 'Private Admin Value',
          type: 'text',
          required: false,
        },
      ],
    },
  ],
}

describe('runtime autofill form state', () => {
  it('recognizes only requester-visible configured trigger fields', () => {
    expect(getRequesterAutofillTriggerField(schema, 'reference_psf_input')).toMatchObject({
      canonicalKey: 'reference_psf_name',
      autofillTrigger: true,
    })
    expect(getRequesterAutofillTriggerField(schema, 'product_input')).toBeNull()
    expect(getRequesterAutofillTriggerField(schema, 'private_admin_input')).toBeNull()
  })

  it('maps only blank requester fields from canonical suggestions and preserves manual values or newer edits', () => {
    const applied = applyRuntimeAutofillSuggestions({
      currentEditVersions: {
        product_input: 4,
        wafer_fab_input: 2,
      },
      currentValues: {
        product_input: '',
        reference_psf_input: 'REF-PSF-1',
        wafer_fab_input: 'Existing FAB',
      },
      lookupEditVersions: {
        product_input: 4,
        wafer_fab_input: 2,
      },
      schema,
      suggestedValues: {
        private_admin_value: 'must not apply',
        product: 'New Product',
        unknown_value: 'must not apply',
        wafer_fab: 'Fab A',
      },
    })

    expect(applied.appliedFieldKeys).toEqual(['product_input'])
    expect(applied.values).toEqual({
      product_input: 'New Product',
      reference_psf_input: 'REF-PSF-1',
      wafer_fab_input: 'Existing FAB',
    })

    const staleAfterManualEdit = applyRuntimeAutofillSuggestions({
      currentEditVersions: { product_input: 5 },
      currentValues: { product_input: '' },
      lookupEditVersions: { product_input: 4 },
      schema,
      suggestedValues: { product: 'Late suggestion' },
    })

    expect(staleAfterManualEdit.appliedFieldKeys).toEqual([])
    expect(staleAfterManualEdit.values).toEqual({ product_input: '' })
  })

  it('does not coerce non-string canonical values into string-only form controls', () => {
    const applied = applyRuntimeAutofillSuggestions({
      currentEditVersions: {},
      currentValues: { product_input: '' },
      lookupEditVersions: {},
      schema,
      suggestedValues: {
        product: ['Product A', 'Product B'],
        wafer_fab: true,
      },
    })

    expect(applied).toEqual({
      appliedFieldKeys: [],
      values: { product_input: '' },
    })
  })
})
