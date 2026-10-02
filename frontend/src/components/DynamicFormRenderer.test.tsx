import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
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
  it('prevents Enter in a text field from implicitly saving the request', () => {
    const form = DynamicFormRenderer({ schema })
    const preventDefault = vi.fn()
    form.props.onKeyDown?.({ key: 'Enter', target: { tagName: 'INPUT', type: 'text' }, nativeEvent: { isComposing: false }, preventDefault })
    expect(preventDefault).toHaveBeenCalledOnce()
  })

  it.each([
    { key: 'Enter', tagName: 'TEXTAREA', type: undefined, composing: false },
    { key: 'Enter', tagName: 'BUTTON', type: 'submit', composing: false },
    { key: 'Enter', tagName: 'INPUT', type: 'submit', composing: false },
    { key: 'Enter', tagName: 'SELECT', type: undefined, composing: false },
    { key: 'Tab', tagName: 'INPUT', type: 'text', composing: false },
    { key: 'Enter', tagName: 'INPUT', type: 'text', composing: true },
  ])('preserves normal keyboard behavior for $tagName/$type/$key composing=$composing', ({ key, tagName, type, composing }) => {
    const form = DynamicFormRenderer({ schema })
    const preventDefault = vi.fn()
    form.props.onKeyDown?.({ key, target: { tagName, type }, nativeEvent: { isComposing: composing }, preventDefault })
    expect(preventDefault).not.toHaveBeenCalled()
  })

  it('still saves when the submit button submits the form explicitly', () => {
    const onSubmit = vi.fn()
    const values = { title: 'A request' }
    const form = DynamicFormRenderer({ schema, values, onSubmit })
    form.props.onSubmit({ preventDefault: vi.fn() })
    expect(onSubmit).toHaveBeenCalledWith(values)
  })
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
    expect(html).toContain('dynamic-form__field dynamic-form__field--textarea')
  })

  it('can omit the schema-preview header when an enclosing requester screen supplies context', () => {
    const html = renderToStaticMarkup(
      <DynamicFormRenderer
        schema={schema}
        showSchemaHeader={false}
        values={{ product_type: 'New Product' }}
        onChange={() => undefined}
      />,
    )

    expect(html).not.toContain('Schema preview')
    expect(html).not.toContain('<h2>PSF Request Form</h2>')
    expect(html).toContain('<h3>Requester Information</h3>')
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

  it('renders accessible local runtime-autofill provenance labels only when supplied by an editable caller', () => {
    const html = renderToStaticMarkup(
      <DynamicFormRenderer
        fieldStatuses={{ priority: 'edited-by-user', title: 'auto-filled' }}
        schema={schema}
        values={{ priority: 'Normal', title: 'Suggested title' }}
        onChange={() => undefined}
      />,
    )

    expect(html).toContain('Auto-filled')
    expect(html).toContain('Edited by user')
    expect(html).toContain('id="title-autofill-status"')
    expect(html).toContain('id="priority-autofill-status"')
    expect(html).toContain('aria-describedby="title-autofill-status"')
  })
})
