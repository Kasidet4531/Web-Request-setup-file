import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { DynamicFormRenderer, type FormSchema } from './DynamicFormRenderer'
import { validateRequiredFields } from '../services/formValidation'

const schema: FormSchema = {
  formKey: 'psf-request',
  version: 1,
  title: 'PSF Request Form',
  sections: [
    {
      sectionKey: 'requester_information',
      title: 'Requester Information',
      visibleTo: ['requester'],
      fields: [
        {
          fieldKey: 'product_type',
          canonicalKey: 'product_type',
          label: 'Product Type',
          type: 'radio',
          required: true,
          options: ['New Product', 'Transfer Product'],
        },
        {
          fieldKey: 'title',
          canonicalKey: 'title',
          label: 'Title',
          type: 'text',
          required: true,
        },
        {
          fieldKey: 'priority',
          canonicalKey: 'priority',
          label: 'Priority',
          type: 'select',
          required: true,
          options: ['Normal', 'Urgent'],
        },
        {
          fieldKey: 'request_note',
          canonicalKey: 'request_note',
          label: 'Request Note',
          type: 'textarea',
          required: false,
        },
      ],
    },
  ],
}

describe('DynamicFormRenderer', () => {
  it('renders product type prominently before the rest of the schema-driven fields', () => {
    const html = renderToStaticMarkup(
      <DynamicFormRenderer
        schema={schema}
        values={{ product_type: 'New Product' }}
        onChange={() => undefined}
      />,
    )

    expect(html.indexOf('dynamic-form__product-type')).toBeGreaterThan(-1)
    expect(html.indexOf('Product Type')).toBeLessThan(html.indexOf('Title'))
    expect(html).toContain('type="radio"')
    expect(html).toContain('<select')
    expect(html).toContain('<textarea')
  })

  it('shows required validation messages next to the related field', () => {
    const errors = validateRequiredFields(schema, { product_type: '', title: '', priority: 'Normal' })

    expect(errors).toEqual({
      product_type: 'Product Type is required.',
      title: 'Title is required.',
    })

    const html = renderToStaticMarkup(
      <DynamicFormRenderer
        errors={errors}
        schema={schema}
        values={{ priority: 'Normal' }}
        onChange={() => undefined}
      />,
    )

    expect(html).toContain('id="product_type-error"')
    expect(html).toContain('Product Type is required.')
    expect(html).toContain('id="title-error"')
    expect(html).toContain('Title is required.')
  })

  it('can render read-only fields for schema preview flows', () => {
    const html = renderToStaticMarkup(
      <DynamicFormRenderer
        readOnly
        schema={schema}
        values={{ product_type: 'Transfer Product', title: 'Probe card update' }}
      />,
    )

    expect(html).toContain('aria-readonly="true"')
    expect(html).toContain('disabled=""')
    expect(html).toContain('Probe card update')
  })
})
