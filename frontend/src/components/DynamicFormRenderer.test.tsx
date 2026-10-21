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

// One field of every type, with required flags mixed in, to check the row layout for each control.
const allTypesSchema: FormSchema = {
  formKey: 'psf-request',
  version: 2,
  title: 'PSF Request Form',
  sections: [{
    sectionKey: 'requester_information',
    title: 'Requester Information',
    fields: [
      { fieldKey: 'request_to', canonicalKey: 'product_type', label: 'Request To', type: 'radio', required: true, options: ['New Product (GNTC)', 'Transfer Product (MFG)'] },
      { fieldKey: 'title', canonicalKey: 'title', label: 'Title', type: 'text', required: true },
      { fieldKey: 'die_count', canonicalKey: 'die_count', label: 'Die Count', type: 'number', required: false },
      { fieldKey: 'due_date', canonicalKey: 'due_date', label: 'Due Date', type: 'date', required: true },
      { fieldKey: 'priority', canonicalKey: 'priority', label: 'Priority', type: 'select', required: false, options: ['Normal', 'Urgent'] },
      { fieldKey: 'description', canonicalKey: 'description', label: 'Description', type: 'textarea', required: false },
    ],
  }],
}

/** Returns the markup of each field row, in document order, by matching the row's balanced <div>. */
function rowsOf(html: string): string[] {
  const rows: string[] = []
  const start = /<div class="dynamic-form__row[" ]/g
  for (const match of html.matchAll(start)) {
    const tags = /<div[\s>]|<\/div>/g
    tags.lastIndex = match.index
    let depth = 0
    for (let tag = tags.exec(html); tag; tag = tags.exec(html)) {
      depth += tag[0] === '</div>' ? -1 : 1
      if (depth === 0) {
        rows.push(html.slice(match.index, tag.index + tag[0].length))
        break
      }
    }
  }
  return rows
}

function attribute(markup: string, name: string): string | undefined {
  return markup.match(new RegExp(`\\s${name}="([^"]*)"`))?.[1]
}

describe('DynamicFormRenderer rows', () => {
  it('renders every editable field as one row holding its label and its associated control', () => {
    const html = renderToStaticMarkup(<DynamicFormRenderer schema={allTypesSchema} showSchemaHeader={false} onChange={() => undefined} />)
    const rows = rowsOf(html)

    expect(rows).toHaveLength(6)
    const controls = [
      /<input[^>]*type="text"[^>]*>/,
      /<input[^>]*type="number"[^>]*>/,
      /<input[^>]*type="date"[^>]*>/,
      /<select[^>]*>/,
      /<textarea[^>]*>/,
    ]
    const labelled = [rows[1], rows[2], rows[3], rows[4], rows[5]]
    const labels = ['Title', 'Die Count', 'Due Date', 'Priority', 'Description']
    labelled.forEach((row, index) => {
      const label = row.match(/<label[^>]*>[\s\S]*?<\/label>/)?.[0] ?? ''
      expect(label).toContain(labels[index])
      const control = row.match(controls[index])?.[0] ?? ''
      expect(control).not.toBe('')
      expect(attribute(control, 'id')).toBe(attribute(label, 'for'))
    })
    expect(rows[0]).toContain('Request To')
    expect(rows[0].match(/type="radio"/g)).toHaveLength(2)
  })

  it('renders every read-only field as one row holding its label and the stored value it names', () => {
    const values = {
      request_to: 'Transfer Product (MFG)',
      title: 'Probe card update',
      die_count: '1200',
      due_date: '2030-01-15',
      priority: 'Urgent',
      description: 'Line one\nLine two',
    }
    const html = renderToStaticMarkup(<DynamicFormRenderer readOnly schema={allTypesSchema} showSchemaHeader={false} values={values} />)
    const rows = rowsOf(html)

    expect(rows).toHaveLength(6)
    allTypesSchema.sections[0].fields.forEach((field, index) => {
      const row = rows[index]
      const label = row.match(/<label[^>]*>[\s\S]*?<\/label>/)?.[0] ?? ''
      expect(label).toContain(field.label)
      const output = row.match(/<output[^>]*>([\s\S]*?)<\/output>/)
      expect(output?.[1]).toBe(values[field.fieldKey as keyof typeof values])
      expect(attribute(output?.[0] ?? '', 'aria-labelledby')).toBe(attribute(label, 'id'))
      expect(attribute(output?.[0] ?? '', 'id')).toBe(attribute(label, 'for'))
      expect(row).not.toMatch(/<input|<select|<textarea|role="radiogroup"/)
    })
    const empty = rowsOf(renderToStaticMarkup(<DynamicFormRenderer readOnly schema={allTypesSchema} showSchemaHeader={false} />))
    for (const row of empty) expect(row).toMatch(/<output[^>]*>Not provided<\/output>/)
  })

  it('keeps each required marker and field error inside its own row and on its control', () => {
    const fields = allTypesSchema.sections[0].fields
    const errors = Object.fromEntries(fields.map((field) => [field.fieldKey, `${field.label} needs attention.`]))
    const html = renderToStaticMarkup(<DynamicFormRenderer errors={errors} schema={allTypesSchema} showSchemaHeader={false} onChange={() => undefined} />)
    const rows = rowsOf(html)

    fields.forEach((field, index) => {
      const row = rows[index]
      const labelCell = row.slice(0, row.indexOf('<div class="dynamic-form__control"'))
      expect(labelCell).toContain(field.label)
      expect(labelCell.includes('aria-hidden="true" class="dynamic-form__required">*</span>')).toBe(field.required)
      const errorId = row.match(/<p class="ui-error" id="([^"]+)">([^<]*)<\/p>/)
      expect(errorId?.[2]).toBe(`${field.label} needs attention.`)
      const control = row.match(field.type === 'radio' ? /<div[^>]*role="radiogroup"[^>]*>/ : /<(?:input|select|textarea)[^>]*>/)?.[0] ?? ''
      expect(attribute(control, 'aria-invalid')).toBe('true')
      expect(attribute(control, 'aria-describedby')?.split(' ')).toContain(errorId?.[1])
      if (field.type === 'radio') {
        expect(attribute(control, 'aria-required')).toBe('true')
        for (const radio of row.match(/<input[^>]*type="radio"[^>]*>/g) ?? []) expect(radio).toContain('required=""')
      } else {
        expect(control.includes('required=""')).toBe(field.required)
      }
    })
    expect(html.match(/class="ui-error"/g)).toHaveLength(fields.length)
  })

  it('keeps Auto-fill status and the previous value inside the row of the field they describe', () => {
    const editable = rowsOf(renderToStaticMarkup(<DynamicFormRenderer schema={allTypesSchema} showSchemaHeader={false}
      fieldStatuses={{ title: 'auto-filled', priority: 'edited-by-user' }} onChange={() => undefined} />))
    expect(editable[1]).toMatch(/<p class="dynamic-form__autofill-status" id="[^"]+" role="status">Auto-filled<\/p>/)
    expect(editable[4]).toMatch(/role="status">Edited by user<\/p>/)
    expect(editable.filter((row) => row.includes('role="status"'))).toHaveLength(2)

    const readOnly = rowsOf(renderToStaticMarkup(<DynamicFormRenderer readOnly schema={allTypesSchema} showSchemaHeader={false}
      values={{ title: 'Renamed', due_date: '2030-02-01' }} previousValues={{ title: 'Original', due_date: '' }} />))
    expect(readOnly[1]).toContain('Previous: Original')
    expect(readOnly[3]).toContain('Previous: Empty')
    expect(readOnly.filter((row) => row.includes('Previous:'))).toHaveLength(2)
    const titleOutput = readOnly[1].match(/<output[^>]*>/)?.[0] ?? ''
    expect(readOnly[1]).toContain(`id="${attribute(titleOutput, 'aria-describedby')}"`)
  })
})

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
    const [row] = rowsOf(html)
    expect(row).not.toContain('<fieldset')
    expect(row).not.toContain('<legend')
    const group = row.match(/<[a-z]+[^>]*role="radiogroup"[^>]*>/)?.[0] ?? ''
    expect(group).not.toBe('')
    const labelId = attribute(group, 'aria-labelledby')
    const labelCell = row.match(new RegExp(`<([a-z]+)[^>]*id="${labelId}"[^>]*>([\\s\\S]*?)</\\1>`))
    expect(labelCell?.[2]).toContain(label)
    expect(row.indexOf(`id="${labelId}"`)).toBeLessThan(row.indexOf('role="radiogroup"'))
    const describedBy = attribute(group, 'aria-describedby')?.split(' ')
    expect(describedBy).toHaveLength(2)
    for (const id of describedBy ?? []) expect(row).toContain(`id="${id}"`)
    expect(group).toContain('aria-invalid="true"')
    expect(group).toContain('aria-required="true"')
    expect(row).toContain('Choose a manufacturing route.')
    expect(row).toContain('Auto-filled')
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
  it('renders product type, title and the text area as ordinary rows in their configured place', () => {
    const html = renderToStaticMarkup(
      <DynamicFormRenderer
        schema={schema}
        values={{ product_type: 'New Product' }}
        onChange={() => undefined}
      />,
    )
    const rows = rowsOf(html)

    expect(rows).toHaveLength(4)
    // No field is singled out to span the form: every row opens the same way.
    for (const row of rows) expect(row.slice(0, row.indexOf('>') + 1)).toBe('<div class="dynamic-form__row">')
    expect(rows[0]).toContain('Product Type')
    expect(rows[0]).toContain('type="radio"')
    expect(rows[1]).toContain('Title')
    expect(rows[2]).toContain('<select')
    expect(rows[3]).toContain('<textarea')
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


describe('DynamicFormRenderer previous values', () => {
  it('marks only the fields that changed and shows what each held before', () => {
    const html = renderToStaticMarkup(<DynamicFormRenderer
      readOnly
      schema={schema}
      values={{ title: 'Renamed', priority: 'Urgent', request_note: 'Kept' }}
      previousValues={{ title: 'Original', priority: '' }}
    />)

    expect(html.match(/Previous: /g)).toHaveLength(2)
    expect(html).toContain('Previous: Original')
    expect(html).toContain('Previous: Empty')
    const note = html.slice(html.indexOf('Request Note'))
    expect(note).not.toContain('Previous:')
    const titleDescription = html.match(/<output aria-describedby="([^"]+)"[^>]*>Renamed<\/output>/)?.[1]
    expect(html).toContain(`id="${titleDescription}"`)
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

  it('keeps interleaved optional controls between required fields in configured order', () => {
    const configured: FormSchema = { ...schema, sections: [{ ...schema.sections[0], fields: [
      schema.sections[0].fields[1],
      { ...schema.sections[0].fields[2], required: false },
      schema.sections[0].fields[0],
    ] }] }
    // The legacy flag must no longer move any configured field.
    const html = renderToStaticMarkup(<DynamicFormRenderer {...{ collapseOptionalFields: true }} schema={configured} />)
    expect(html.indexOf('Title')).toBeLessThan(html.indexOf('Priority'))
    expect(html.indexOf('Priority')).toBeLessThan(html.indexOf('Product Type'))
    expect(html).toContain('<select')
    expect(html).not.toContain('Additional details')
    expect(html).not.toContain('<details')
  })

  it('includes a non-empty legacy select or radio value in the rendered options so it stays selected during editing', () => {
    const html = renderToStaticMarkup(
      <DynamicFormRenderer
        schema={schema}
        values={{
          product_type: 'Revise Old PSF (Update Layout )',
          priority: 'Legacy Priority',
        }}
      />,
    )
    expect(html).toContain('checked="" value="Revise Old PSF (Update Layout )"')
    expect(html).toContain('<option value="Legacy Priority" selected="">Legacy Priority</option>')
    const schemaWithHeaderFields: FormSchema = {
      ...schema,
      sections: [
        {
          ...schema.sections[0],
          fields: [
            ...schema.sections[0].fields,
            { fieldKey: 'requester_name', canonicalKey: 'requester', label: 'Requester Name', type: 'text', required: true },
            { fieldKey: 'modified_by', canonicalKey: 'modified_by', label: 'Modified By', type: 'text', required: false },
            { fieldKey: 'start_date', canonicalKey: 'start_date', label: 'Start Date', type: 'date', required: false },
            { fieldKey: 'due_date', canonicalKey: 'due_date', label: 'Due Date', type: 'date', required: false },
          ],
        },
      ],
    }
    const headerHtml = renderToStaticMarkup(
      <DynamicFormRenderer
        schema={schemaWithHeaderFields}
        values={{ requester_name: 'Hathai', modified_by: 'Boonchai', start_date: '2026-08-04', due_date: '2026-08-07' }}
      />,
    )
    expect(headerHtml).not.toContain('Requester Name')
    expect(headerHtml).not.toContain('Modified By')
    expect(headerHtml).not.toContain('Start Date')
    expect(headerHtml).toContain('Due Date')
  })
})
