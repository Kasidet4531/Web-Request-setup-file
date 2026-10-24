import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import type { FormSchemaDraft, FormSchemaField } from '../types/forms'
import { AdminFormConfigEditor, AdminFormConfigFieldEditor } from './AdminFormConfigEditor'

// The editor keeps typed positions in local state; these tests call it as a
// function, so useState is replaced by a minimal per-render store.
const hooks = vi.hoisted(() => ({
  states: [] as unknown[],
  index: 0,
  begin() { this.index = 0 },
  reset() { this.states = []; this.index = 0 },
  useState(initial: unknown) {
    const index = this.index++
    if (index === this.states.length) this.states.push(initial)
    return [this.states[index], (next: unknown) => { this.states[index] = next }]
  },
}))
vi.mock('react', async (load) => ({ ...(await load<typeof import('react')>()), useState: hooks.useState.bind(hooks) }))
beforeEach(() => hooks.reset())

interface ElementNode { type: unknown; props: Record<string, unknown> }
function find(node: unknown, match: (element: ElementNode) => boolean): ElementNode {
  if (Array.isArray(node)) {
    for (const child of node) { try { return find(child, match) } catch { /* continue */ } }
  } else if (node && typeof node === 'object' && 'props' in node && 'type' in node) {
    const element = node as ElementNode
    if (match(element)) return element
    return find(element.props.children, match)
  }
  throw new Error('Expected editor control was not found')
}

const schema: FormSchemaDraft = {
  formKey: 'psf-request', title: 'PSF Request Form',
  sections: [{
    sectionKey: 'requester_information', title: 'Requester Information',
    fields: [
      { fieldKey: 'field_1', canonicalKey: 'field_1', label: 'Name', type: 'text', required: true, searchable: true },
      { fieldKey: 'choice', canonicalKey: 'choice', label: 'Priority', type: 'select', required: false, options: ['Low', 'High'] },
    ],
  }],
}
const onEditField = vi.fn()
const editor = (draft = schema, onChange = vi.fn()) => { hooks.begin(); return AdminFormConfigEditor({ schema: draft, disabled: false, onChange, onEditField }) }
const fieldEditor = (field: FormSchemaField, onChange = vi.fn()) => AdminFormConfigFieldEditor({
  field, isNew: false, canRemove: true, onChange, onApply: vi.fn(), onCancel: vi.fn(), onRemove: vi.fn(),
})

describe('visual form configuration editor', () => {
  it('shows read-only versions as text, without editable controls or actions', () => {
    const html = renderToStaticMarkup(<AdminFormConfigEditor schema={schema} disabled={false} readOnly onChange={vi.fn()} onEditField={vi.fn()} />)
    expect(html).toContain('Form title:')
    expect(html).toContain('Requester Information')
    expect(html).not.toContain('Visible to')
    expect(html).toContain('Choices: Low, High')
    expect(html).not.toMatch(/<input|<textarea|<button|<fieldset/)
  })
  it('exposes immutable field and canonical identities in both editor and read-only view', () => {
    const field = { ...schema.sections[0].fields[0], canonicalKey: 'requester' }
    const draft = { ...schema, sections: [{ ...schema.sections[0], fields: [field] }] }
    const view = renderToStaticMarkup(<AdminFormConfigEditor schema={draft} disabled={false} readOnly onChange={vi.fn()} onEditField={vi.fn()} />)
    const modal = renderToStaticMarkup(fieldEditor(field))
    expect(view).toContain('Field key:')
    expect(view).toContain('Canonical key:')
    expect(modal).toContain('Canonical key:')
    expect(modal).toContain('requester')
    expect(modal).not.toMatch(/<input[^>]*value="(field_1|requester)"/)
  })

  it('shows compact field rows with edit actions, and shows field errors inside the editor', () => {
    const invalid: FormSchemaDraft = { ...schema, title: '', sections: [{ ...schema.sections[0], fields: [
      { ...schema.sections[0].fields[0], label: '' },
      { ...schema.sections[0].fields[1], options: [''] },
    ] }] }
    const html = renderToStaticMarkup(<AdminFormConfigEditor schema={invalid} disabled={false} onChange={vi.fn()} onEditField={onEditField} />)
    expect(html).toContain('id="form-config-title-error"')
    expect(html).toContain('Needs attention')
    expect(html).toContain('aria-label="Edit field_1"')
    expect(html).not.toContain('<details class="admin-form-config__item"')
    const dialogHtml = renderToStaticMarkup(<AdminFormConfigFieldEditor field={invalid.sections[0].fields[1]} isNew={false} canRemove onChange={vi.fn()} onApply={vi.fn()} onCancel={vi.fn()} onRemove={vi.fn()} />)
    expect(dialogHtml).toContain('Dropdown')
    expect(dialogHtml).toContain('id="form-config-option-0-error"')
    expect(dialogHtml).toContain('disabled="" type="submit"')
  })

  it('edits form title without changing field identities or exposing role controls', () => {
    const onChange = vi.fn()
    const tree = editor(schema, onChange)
    const title = find(tree, (element) => element.type === 'input' && element.props.id === 'form-config-title')
    ;(title.props.onChange as (event: unknown) => void)({ target: { value: 'New title' } })
    expect(onChange.mock.calls[0][0]).toEqual({ ...schema, title: 'New title' })
    expect((onChange.mock.calls[0][0] as FormSchemaDraft).sections[0].fields).toEqual(schema.sections[0].fields)
    expect(renderToStaticMarkup(tree)).not.toContain('Visible to')
  })

  it('edits a field label, type, required flag and options without dropping metadata or choice values', () => {
    const onChange = vi.fn()
    let tree = fieldEditor(schema.sections[0].fields[0], onChange)
    const label = find(tree, (element) => element.type === 'input' && element.props.id === 'form-config-field-label')
    ;(label.props.onChange as (event: unknown) => void)({ target: { value: 'Full name' } })
    expect(onChange.mock.calls[0][0]).toEqual({ ...schema.sections[0].fields[0], label: 'Full name' })
    tree = fieldEditor(onChange.mock.calls[0][0] as FormSchemaField, onChange)
    const type = find(tree, (element) => element.type === 'select' && element.props.id === 'form-config-field-type')
    ;(type.props.onChange as (event: unknown) => void)({ target: { value: 'radio' } })
    const withRadio = onChange.mock.calls[1][0] as FormSchemaField
    expect(withRadio).toMatchObject({ type: 'radio', options: ['Option 1'], searchable: true })
    tree = fieldEditor(withRadio, onChange)
    const option = find(tree, (element) => element.type === 'input' && element.props.id === 'form-config-option-0')
    ;(option.props.onChange as (event: unknown) => void)({ target: { value: 'Yes' } })
    expect((onChange.mock.calls[2][0] as FormSchemaField).options).toEqual(['Yes'])
    const priority = schema.sections[0].fields[1]
    tree = fieldEditor(priority, onChange)
    ;(find(tree, (element) => element.type === 'select' && element.props.id === 'form-config-field-type').props.onChange as (event: unknown) => void)({ target: { value: 'text' } })
    const asText = onChange.mock.calls[3][0] as FormSchemaField
    expect(asText.options).toEqual(['Low', 'High'])
    tree = fieldEditor(asText, onChange)
    ;(find(tree, (element) => element.type === 'select' && element.props.id === 'form-config-field-type').props.onChange as (event: unknown) => void)({ target: { value: 'radio' } })
    expect((onChange.mock.calls[4][0] as FormSchemaField).options).toEqual(['Low', 'High'])
  })

  it('keeps the Choices heading above a separate list of labeled choice rows', () => {
    const tree = fieldEditor(schema.sections[0].fields[1])
    const group = find(tree, (element) => element.type === 'fieldset')
    const list = find(group, (element) => element.props.className === 'admin-form-config__choice-list')
    const html = renderToStaticMarkup(tree)
    expect(html.indexOf('<legend>Choices</legend>')).toBeLessThan(html.indexOf('admin-form-config__choice-list'))
    expect(find(list, (element) => element.props['aria-label'] === 'Add choice to Priority').type).toBe('button')
    expect(html).toContain('for="form-config-option-0"')
    expect(html).toContain('Choice 1')
    expect(html).toContain('Choice 2')
    const single = fieldEditor({ ...schema.sections[0].fields[1], options: ['Only choice'] })
    expect(find(single, (element) => element.props['aria-label'] === 'Remove choice 1 from Priority').props.disabled).toBe(true)
  })

  it('adds and removes choices in the dialog without affecting another field', () => {
    const onChange = vi.fn()
    let tree = fieldEditor(schema.sections[0].fields[1], onChange)
    ;(find(tree, (element) => element.type === 'button' && element.props['aria-label'] === 'Add choice to Priority').props.onClick as () => void)()
    const withChoice = onChange.mock.calls[0][0] as FormSchemaField
    expect(withChoice.options).toEqual(['Low', 'High', 'Option 3'])
    tree = fieldEditor(withChoice, onChange)
    ;(find(tree, (element) => element.type === 'button' && element.props['aria-label'] === 'Remove choice 2 from Priority').props.onClick as () => void)()
    expect((onChange.mock.calls[1][0] as FormSchemaField).options).toEqual(['Low', 'Option 3'])
    expect(schema.sections[0].fields[1].options).toEqual(['Low', 'High'])
  })

  it('reorders fields without changing their keys and opens the same editor for existing and new fields', () => {
    const onChange = vi.fn()
    let tree = editor(schema, onChange)
    ;(find(tree, (element) => element.type === 'button' && element.props['aria-label'] === 'Move Priority up').props.onClick as () => void)()
    const moved = onChange.mock.calls[0][0] as FormSchemaDraft
    expect(moved.sections[0].fields.map((field) => field.fieldKey)).toEqual(['choice', 'field_1'])
    const trigger = { focus: vi.fn() } as unknown as HTMLButtonElement
    onEditField.mockReset()
    tree = editor(moved)
    ;(find(tree, (element) => element.type === 'button' && element.props['aria-label'] === 'Edit Priority').props.onClick as (event: unknown) => void)({ currentTarget: trigger })
    expect(onEditField).toHaveBeenCalledWith(0, 0, moved.sections[0].fields[0], trigger)
    ;(find(tree, (element) => element.type === 'button' && element.props['aria-label'] === 'Add field to Requester Information').props.onClick as (event: unknown) => void)({ currentTarget: trigger })
    expect(onEditField).toHaveBeenCalledWith(0, null, { fieldKey: 'field_2', canonicalKey: 'field_2', label: 'New field', type: 'text', required: false }, trigger)
    expect(moved.sections[0].fields).toHaveLength(2)
  })

  it.each([1, 2])('confirms the exact consequence before removing a section with %i fields', (fieldCount) => {
    const onChange = vi.fn()
    const confirm = vi.fn(() => false)
    vi.stubGlobal('window', { confirm })
    try {
      const draft = { ...schema, sections: [
        { ...schema.sections[0], fields: schema.sections[0].fields.slice(0, fieldCount) },
        { sectionKey: 'retained_section', title: 'Retained section', fields: [] },
      ] }
      const tree = editor(draft, onChange)
      const remove = find(tree, (element) => element.type === 'button' && element.props['aria-label'] === 'Remove Requester Information').props.onClick as () => void
      remove()
      expect(confirm).toHaveBeenCalledWith(`Remove Requester Information and its ${fieldCount} ${fieldCount === 1 ? 'field' : 'fields'}?`)
      expect(onChange).not.toHaveBeenCalled()
      confirm.mockReturnValue(true)
      remove()
      expect((onChange.mock.calls[0][0] as FormSchemaDraft).sections).toEqual([draft.sections[1]])
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('adds, reorders and removes sections with stable keys', () => {
    const onChange = vi.fn()
    let tree = editor(schema, onChange)
    ;(find(tree, (element) => element.type === 'button' && element.props['aria-label'] === 'Add section').props.onClick as () => void)()
    const added = onChange.mock.calls[0][0] as FormSchemaDraft
    expect(added.sections[1]).toEqual({ sectionKey: 'section_1', title: 'New section', fields: [] })
    tree = editor(added, onChange)
    ;(find(tree, (element) => element.type === 'button' && element.props['aria-label'] === 'Move New section up').props.onClick as () => void)()
    const moved = onChange.mock.calls[1][0] as FormSchemaDraft
    expect(moved.sections.map((section) => section.sectionKey)).toEqual(['section_1', 'requester_information'])
    tree = editor(moved, onChange)
    ;(find(tree, (element) => element.type === 'button' && element.props['aria-label'] === 'Remove New section').props.onClick as () => void)()
    expect((onChange.mock.calls[2][0] as FormSchemaDraft).sections).toEqual(schema.sections)
  })
})

describe('Field Help Text and choice layout in the field dialog', () => {
  const nameField = schema.sections[0].fields[0]
  const requestTo: FormSchemaField = { fieldKey: 'product_type', canonicalKey: 'product_type', label: 'Request To', type: 'radio', required: true, options: ['Create new PSF', 'Revise from old PSF'] }
  const helpTextArea = (tree: unknown) => find(tree, (element) => element.type === 'textarea' && element.props.id === 'form-config-field-help-text')
  const layoutChoice = (tree: unknown, value: string) => find(tree, (element) => element.type === 'input' && element.props.name === 'form-config-field-option-layout' && element.props.value === value)
  const type = (tree: unknown, value: string) => (helpTextArea(tree).props.onChange as (event: unknown) => void)({ target: { value } })

  it("edits a field's help text, keeping its other properties, and drops it when cleared", () => {
    const onChange = vi.fn()
    type(fieldEditor(nameField, onChange), 'Put NA if not Motion Sensor')
    const withHelp = onChange.mock.calls[0][0] as FormSchemaField
    expect(withHelp).toEqual({ ...nameField, helpText: 'Put NA if not Motion Sensor' })

    const html = renderToStaticMarkup(fieldEditor(withHelp))
    expect(html).toContain('>Put NA if not Motion Sensor</textarea>')
    expect(html).toContain('maxLength="500"')

    type(fieldEditor(withHelp, onChange), '')
    expect(onChange.mock.calls[1][0]).toEqual(nameField)
    expect(Object.hasOwn(onChange.mock.calls[1][0] as object, 'helpText')).toBe(false)
  })

  it('refuses help text over 500 characters with a message and keeps Apply disabled', () => {
    const tree = fieldEditor({ ...nameField, helpText: 'x'.repeat(501) })
    const area = helpTextArea(tree)

    expect(area.props['aria-invalid']).toBe(true)
    const error = find(tree, (element) => element.props.id === 'form-config-field-help-text-error')
    expect(error.props.children).toBe('Help text must be 500 characters or fewer.')
    expect(String(area.props['aria-describedby']).split(' ')).toContain('form-config-field-help-text-error')
    expect(find(tree, (element) => element.type === 'button' && element.props.type === 'submit').props.disabled).toBe(true)
    expect(find(fieldEditor({ ...nameField, helpText: 'x'.repeat(500) }), (element) => element.type === 'button' && element.props.type === 'submit').props.disabled).toBe(false)
  })

  it('offers a horizontal or vertical layout for a Multiple choice field, horizontal by default', () => {
    const onChange = vi.fn()
    const tree = fieldEditor(requestTo, onChange)
    expect(layoutChoice(tree, 'horizontal').props.checked).toBe(true)
    expect(layoutChoice(tree, 'vertical').props.checked).toBe(false)
    expect(renderToStaticMarkup(tree)).toContain('<legend>Choice layout</legend>')

    ;(layoutChoice(tree, 'vertical').props.onChange as () => void)()
    const vertical = onChange.mock.calls[0][0] as FormSchemaField
    expect(vertical).toEqual({ ...requestTo, optionLayout: 'vertical' })
    expect(layoutChoice(fieldEditor(vertical), 'vertical').props.checked).toBe(true)

    ;(layoutChoice(fieldEditor(vertical, onChange), 'horizontal').props.onChange as () => void)()
    expect(onChange.mock.calls[1][0]).toEqual(requestTo)
  })

  it('offers no choice layout for other field types and drops it when a field stops being Multiple choice', () => {
    for (const field of [nameField, schema.sections[0].fields[1]]) expect(renderToStaticMarkup(fieldEditor(field))).not.toContain('Choice layout')

    const onChange = vi.fn()
    const tree = fieldEditor({ ...requestTo, optionLayout: 'vertical' }, onChange)
    ;(find(tree, (element) => element.type === 'select' && element.props.id === 'form-config-field-type').props.onChange as (event: unknown) => void)({ target: { value: 'select' } })
    expect(onChange.mock.calls[0][0]).toEqual({ ...requestTo, type: 'select' })
  })

  it('shows help text and a vertical layout in the field list and the read-only view', () => {
    const configured: FormSchemaDraft = { ...schema, sections: [{ ...schema.sections[0], fields: [
      { ...requestTo, optionLayout: 'vertical', helpText: 'Revise from old PSF copies files.' },
      { ...nameField, helpText: 'Put NA if not Motion Sensor' },
    ] }] }

    const list = renderToStaticMarkup(editor(configured))
    expect(list).toContain('Multiple choice · Required · Vertical · Help text')
    expect(list).toContain('Short text · Required · Help text')
    const view = renderToStaticMarkup(<AdminFormConfigEditor schema={configured} disabled={false} readOnly onChange={vi.fn()} onEditField={vi.fn()} />)
    expect(view).toContain('Choice layout: Vertical')
    expect(view).toContain('Help text: Revise from old PSF copies files.')
    expect(view).toContain('Help text: Put NA if not Motion Sensor')
    const plain = renderToStaticMarkup(<AdminFormConfigEditor schema={schema} disabled={false} readOnly onChange={vi.fn()} onEditField={vi.fn()} />)
    expect(plain).not.toMatch(/Help text|Choice layout/)
  })
})

describe('moving a field to a typed position', () => {
  const field = (key: string) => ({ fieldKey: key, canonicalKey: key, label: key.toUpperCase(), type: 'text' as const, required: false })
  const fourFields: FormSchemaDraft = {
    formKey: 'psf-request', title: 'PSF Request Form',
    sections: [
      { sectionKey: 'first', title: 'First', fields: [field('a'), field('b'), field('c'), field('d')] },
      { sectionKey: 'second', title: 'Second', fields: [field('e'), field('f')] },
    ],
  }
  function submitPosition(draft: FormSchemaDraft, onChange: Parameters<typeof editor>[1], label: string, value: string) {
    ;(find(editor(draft, onChange), (element) => element.props['aria-label'] === `Position of ${label}`).props.onChange as (event: unknown) => void)({ target: { value } })
    const form = find(editor(draft, onChange), (element) => element.type === 'form' && (() => { try { find(element.props.children, (child) => child.props['aria-label'] === `Position of ${label}`); return true } catch { return false } })())
    ;(form.props.onSubmit as (event: unknown) => void)({ preventDefault() {} })
  }

  it('moves the field there in one step and shifts the others, keeping their keys', () => {
    const onChange = vi.fn()
    expect(find(editor(fourFields, onChange), (element) => element.props['aria-label'] === 'Position of D').props.value).toBe('4')

    submitPosition(fourFields, onChange, 'D', '2')

    expect(onChange).toHaveBeenCalledTimes(1)
    const moved = onChange.mock.calls[0][0] as FormSchemaDraft
    expect(moved.sections[0].fields.map((item) => item.fieldKey)).toEqual(['a', 'd', 'b', 'c'])
    expect(moved.sections[1]).toEqual(fourFields.sections[1])
  })

  it.each(['0', '5', '1.5', '', 'two'])('refuses position %j with a message and moves nothing', (value) => {
    const onChange = vi.fn()

    submitPosition(fourFields, onChange, 'B', value)

    expect(onChange).not.toHaveBeenCalled()
    const tree = editor(fourFields, onChange)
    expect(find(tree, (element) => element.props.role === 'alert').props.children).toBe('Enter a whole number from 1 to 4.')
    expect(find(tree, (element) => element.props['aria-label'] === 'Position of B').props['aria-invalid']).toBe(true)
  })

  it("counts positions within the field's own section", () => {
    const onChange = vi.fn()

    submitPosition(fourFields, onChange, 'E', '3')

    expect(onChange).not.toHaveBeenCalled()
    expect(find(editor(fourFields, onChange), (element) => element.props.role === 'alert').props.children).toBe('Enter a whole number from 1 to 2.')
  })
})
