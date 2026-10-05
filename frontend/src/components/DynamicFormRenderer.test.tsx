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
  it('suppresses only a single section title that duplicates the supplied pane title', () => {
    const html = renderToStaticMarkup(<DynamicFormRenderer schema={schema} headerTitle="Requester Information" showSchemaHeader={false} />)
    expect(html).toContain('aria-label="Requester Information"')
    expect(html).not.toContain('dynamic-form__section-header')
    for (const field of schema.sections[0].fields) expect(html).toContain(field.label)
  })

  it('preserves distinct and multiple chapter headers, numbering and configured field order', () => {
    const distinctSchema = { ...schema, sections: [{ ...schema.sections[0], title: 'Custom engineering inputs' }] }
    const distinct = renderToStaticMarkup(<DynamicFormRenderer schema={distinctSchema} headerTitle="Requester Information" showSchemaHeader={false} />)
    expect(distinct).toContain('<h3 class="dynamic-form__section-title">Custom engineering inputs</h3>')
    expect(distinct).toContain('dynamic-form__section-number">01</span>')
    const multiSchema = { ...schema, sections: [schema.sections[0], { sectionKey: 'additional', title: 'Additional engineering details', fields: [{ fieldKey: 'custom_ref', canonicalKey: 'custom_ref', label: 'Custom reference', type: 'text' as const, required: false }] }] }
    const multi = renderToStaticMarkup(<DynamicFormRenderer schema={multiSchema} headerTitle="Requester Information" showSchemaHeader={false} />)
    expect(multi).toContain('<h3 class="dynamic-form__section-title">Requester Information</h3>')
    expect(multi).toContain('<h3 class="dynamic-form__section-title">Additional engineering details</h3>')
    expect(multi).toContain('dynamic-form__section-number">02</span>')
    expect(multi.indexOf('Request Note')).toBeLessThan(multi.indexOf('Custom reference'))
  })

  it('names long custom radio groups and associates their errors and autofill status', () => {
    const label = 'ManufacturingRouteIncludingEngineeringReviewAndCustomerSpecificPreparationWithoutBreaks'
    const customSchema: FormSchema = {
      ...schema,
      sections: [{ ...schema.sections[0], fields: [{ ...schema.sections[0].fields[0], label }] }],
    }
    const html = renderToStaticMarkup(<DynamicFormRenderer schema={customSchema}
      errors={{ product_type: 'Choose a manufacturing route.' }}
      fieldStatuses={{ product_type: 'auto-filled' }} />)
    const group = html.match(/<fieldset[^>]*role="radiogroup"[^>]*>([\s\S]*?)<\/fieldset>/)
    expect(group).not.toBeNull()
    expect(group?.[1]).toContain(label)
    const describedBy = group?.[0].match(/aria-describedby="([^"]+)"/)?.[1].split(' ')
    expect(describedBy).toHaveLength(2)
    for (const id of describedBy ?? []) expect(html).toContain(`id="${id}"`)
    expect(group?.[0]).toContain('aria-invalid="true"')
  })

  it('keeps labels and radio selection independent when two forms share field keys', () => {
    const html = renderToStaticMarkup(<>
      <DynamicFormRenderer schema={schema} errors={{ title: 'First form title required.' }} />
      <DynamicFormRenderer schema={{ ...schema, formKey: 'psf-created-information', title: 'PSF Created Information' }} fieldStatuses={{ title: 'auto-filled' }} />
    </>)
    const ids = [...html.matchAll(/ id="([^"]+)"/g)].map((match) => match[1])
    expect(new Set(ids).size).toBe(ids.length)
    const names = [...html.matchAll(/<input[^>]*type="radio"[^>]*>/g)].map((match) => match[0].match(/name="([^"]+)"/)?.[1])
    expect(new Set(names).size).toBe(2)
    for (const match of html.matchAll(/(?:for|aria-labelledby|aria-describedby)="([^"]+)"/g)) {
      for (const id of match[1].split(' ')) expect(ids).toContain(id)
    }
  })

  it('preserves administrator field order and sections even when product type is not first', () => {
    const customSchema: FormSchema = { ...schema, sections: [
      { sectionKey: 'empty', title: 'Engineering notes', fields: [] },
      { ...schema.sections[0], fields: [schema.sections[0].fields[1], schema.sections[0].fields[0]] },
    ] }
    const html = renderToStaticMarkup(<DynamicFormRenderer schema={customSchema} showSchemaHeader={false} />)
    expect(html.indexOf('Title')).toBeLessThan(html.indexOf('Product Type'))
    expect(html).toContain('Engineering notes')
    expect(html).toContain('aria-label="Requester Information"')
  })

  it('exposes read-only values through their custom field labels without disabled controls', () => {
    const html = renderToStaticMarkup(<DynamicFormRenderer schema={schema} readOnly
      values={{ title: 'Customer-specific setup', product_type: 'Transfer Product' }} />)
    expect(html).toContain('<output')
    expect(html).toContain('aria-labelledby=')
    expect(html).toContain('Customer-specific setup')
    expect(html).toContain('Transfer Product')
    expect(html).toContain('Not provided')
    expect(html).not.toContain('disabled=')
    expect(html).not.toContain('type="submit"')
  })

  it('changes the displayed heading without changing the configured title, field order, or values', () => {
    const configuredSchema = structuredClone(schema)
    const html = renderToStaticMarkup(<DynamicFormRenderer schema={configuredSchema}
      headerTitle="Requester Information" values={{ title: 'Engineering setup', priority: 'Urgent' }} />)
    expect(html).toContain('<h2>Requester Information</h2>')
    expect(html).not.toContain('Schema preview')
    expect(html).toContain('PSF Request Form · psf-request · version 1')
    expect(configuredSchema).toEqual(schema)
    expect(html.indexOf('Product Type')).toBeLessThan(html.indexOf('Title'))
    expect(html.indexOf('Title')).toBeLessThan(html.indexOf('Priority'))
    expect(html).toContain('value="Engineering setup"')
    expect(html).toContain('<option value="Urgent" selected="">Urgent</option>')
  })

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
    expect(html).toContain('<h3 class="dynamic-form__section-title">Requester Information</h3>')
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

    expect(html).toMatch(/id="[^"]+product_type-error"/)
    expect(html).toContain('Product Type is required.')
    expect(html).toMatch(/id="[^"]+title-error"/)
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

    expect(html).not.toContain('<input')
    expect(html).toContain('<output')
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
    expect(html).toMatch(/id="[^"]+title-autofill-status"/)
    expect(html).toMatch(/id="[^"]+priority-autofill-status"/)
    expect(html).toMatch(/aria-describedby="[^"]+title-autofill-status"/)
  })
})


describe('DynamicFormRenderer field policy', () => {
  it('locks actual field keys individually while preserving editing of other fields', () => {
    const html = renderToStaticMarkup(<DynamicFormRenderer schema={schema} readOnlyFieldKeys={['title']} values={{ title: 'Locked identity', priority: 'Urgent' }} />)
    expect(html).toMatch(/<output[^>]*>Locked identity<\/output>/)
    expect(html).not.toContain('value="Locked identity"')
    expect(html).toContain('<select')
    expect(html).toContain('type="submit"')
  })

  it('groups only optional fields, preserving sections and making future required fields visible', () => {
    const configured: FormSchema = { ...schema, sections: [...schema.sections, { sectionKey: 'engineering', title: 'Engineering checks', fields: [
      { fieldKey: 'new_required', canonicalKey: 'new_required', label: 'Future Required', type: 'text', required: true },
      { fieldKey: 'new_optional', canonicalKey: 'new_optional', label: 'Future Optional', type: 'text', required: false },
    ] }] }
    const html = renderToStaticMarkup(<DynamicFormRenderer schema={configured} collapseOptionalFields />)
    const groups = [...html.matchAll(/<details[^>]*>([\s\S]*?)<\/details>/g)]
    expect(groups).toHaveLength(2)
    expect(groups[0][1]).toContain('Additional details')
    expect(groups[0][1]).toContain('Request Note')
    expect(groups[0][1]).not.toContain('Priority')
    expect(groups[1][1]).toContain('Future Optional')
    expect(groups[1][1]).not.toContain('Future Required')
    expect(html).toContain('Future Required')
    expect(html.indexOf('Requester Information')).toBeLessThan(html.indexOf('Engineering checks'))
    expect(html).not.toContain('<details open')
  })

  it('opens optional details when a field inside has an error', () => {
    const html = renderToStaticMarkup(<DynamicFormRenderer schema={schema} collapseOptionalFields errors={{ request_note: 'Too long' }} />)
    expect(html).toMatch(/<details[^>]*open=""[^>]*>[\s\S]*Too long/)
  })
})
