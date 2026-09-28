import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import type { FormSchemaDraft } from '../types/forms'
import { AdminFormConfigEditor } from './AdminFormConfigEditor'

interface ElementNode {
  type: unknown
  props: Record<string, unknown>
}

function find(node: unknown, match: (element: ElementNode) => boolean): ElementNode {
  if (Array.isArray(node)) {
    for (const child of node) {
      try { return find(child, match) } catch { /* continue */ }
    }
  } else if (node && typeof node === 'object' && 'props' in node && 'type' in node) {
    const element = node as ElementNode
    if (match(element)) return element
    return find(element.props.children, match)
  }
  throw new Error('Expected editor control was not found')
}

const schema: FormSchemaDraft = {
  formKey: 'psf-request',
  title: 'PSF Request Form',
  sections: [{
    sectionKey: 'requester_information',
    title: 'Requester Information',
    visibleTo: ['requester', 'setup_owner', 'admin'],
    fields: [
      { fieldKey: 'field_1', canonicalKey: 'field_1', label: 'Name', type: 'text', required: true, searchable: true },
      { fieldKey: 'choice', canonicalKey: 'choice', label: 'Priority', type: 'select', required: false, options: ['Low', 'High'] },
    ],
  }],
}

describe('visual form configuration editor', () => {
  it('shows friendly field types and inline errors while preserving editability', () => {
    const invalid: FormSchemaDraft = { ...schema, title: '', sections: [{ ...schema.sections[0], fields: [
      { ...schema.sections[0].fields[0], label: '' },
      { ...schema.sections[0].fields[1], options: [''] },
    ] }] }
    const html = renderToStaticMarkup(<AdminFormConfigEditor schema={invalid} disabled={false} onChange={vi.fn()} />)
    expect(html).toContain('Short text')
    expect(html).toContain('Dropdown')
    expect(html).toContain('id="form-config-title-error"')
    expect(html).toContain('id="form-config-field-label-0-0-error"')
    expect(html).toContain('id="form-config-option-0-1-0-error"')
    expect(html).toContain('Needs attention')
    expect(html).toContain('aria-label="Move field_1 up"')
    const details = find(AdminFormConfigEditor({ schema: invalid, disabled: false, onChange: vi.fn() }), (element) => element.type === 'details' && element.props.className === 'admin-form-config__item')
    expect(details.props).not.toHaveProperty('open')
  })

  it('edits the form title and section visibility without changing field identities', () => {
    const onChange = vi.fn()
    const tree = AdminFormConfigEditor({ schema, disabled: false, onChange })
    const title = find(tree, (element) => element.type === 'input' && element.props.id === 'form-config-title')
    ;(title.props.onChange as (event: unknown) => void)({ target: { value: 'New title' } })
    expect(onChange.mock.calls[0][0]).toEqual({ ...schema, title: 'New title' })
    const role = find(tree, (element) => element.type === 'input' && element.props.id === 'form-config-role-0-setup_owner')
    ;(role.props.onChange as (event: unknown) => void)({ target: { checked: false } })
    expect((onChange.mock.calls[1][0] as FormSchemaDraft).sections[0].visibleTo).toEqual(['requester', 'admin'])
    expect((onChange.mock.calls[1][0] as FormSchemaDraft).sections[0].fields).toEqual(schema.sections[0].fields)
  })

  it('edits field label, type, required flag and choice options without dropping metadata', () => {
    const onChange = vi.fn()
    let tree = AdminFormConfigEditor({ schema, disabled: false, onChange })
    const label = find(tree, (element) => element.type === 'input' && element.props.id === 'form-config-field-label-0-0')
    ;(label.props.onChange as (event: unknown) => void)({ target: { value: 'Full name' } })
    expect((onChange.mock.calls[0][0] as FormSchemaDraft).sections[0].fields[0]).toEqual({ ...schema.sections[0].fields[0], label: 'Full name' })
    const updated = onChange.mock.calls[0][0] as FormSchemaDraft
    tree = AdminFormConfigEditor({ schema: updated, disabled: false, onChange })
    const type = find(tree, (element) => element.type === 'select' && element.props.id === 'form-config-field-type-0-0')
    ;(type.props.onChange as (event: unknown) => void)({ target: { value: 'radio' } })
    const withRadio = onChange.mock.calls[1][0] as FormSchemaDraft
    expect(withRadio.sections[0].fields[0]).toMatchObject({ type: 'radio', options: ['Option 1'], searchable: true })
    tree = AdminFormConfigEditor({ schema: withRadio, disabled: false, onChange })
    const option = find(tree, (element) => element.type === 'input' && element.props.id === 'form-config-option-0-0-0')
    ;(option.props.onChange as (event: unknown) => void)({ target: { value: 'Yes' } })
    expect((onChange.mock.calls[2][0] as FormSchemaDraft).sections[0].fields[0].options).toEqual(['Yes'])
  })

  it('keeps choice values when a field type is changed and changed back', () => {
    const onChange = vi.fn()
    let tree = AdminFormConfigEditor({ schema, disabled: false, onChange })
    const type = find(tree, (element) => element.type === 'select' && element.props.id === 'form-config-field-type-0-1')
    ;(type.props.onChange as (event: unknown) => void)({ target: { value: 'text' } })
    const asText = onChange.mock.calls[0][0] as FormSchemaDraft
    expect(asText.sections[0].fields[1].options).toEqual(['Low', 'High'])
    tree = AdminFormConfigEditor({ schema: asText, disabled: false, onChange })
    const typeAgain = find(tree, (element) => element.type === 'select' && element.props.id === 'form-config-field-type-0-1')
    ;(typeAgain.props.onChange as (event: unknown) => void)({ target: { value: 'radio' } })
    expect((onChange.mock.calls[1][0] as FormSchemaDraft).sections[0].fields[1].options).toEqual(['Low', 'High'])
  })

  it('adds and removes choice options without affecting other fields', () => {
    const onChange = vi.fn()
    let tree = AdminFormConfigEditor({ schema, disabled: false, onChange })
    const add = find(tree, (element) => element.type === 'button' && element.props['aria-label'] === 'Add choice to Priority')
    ;(add.props.onClick as () => void)()
    const withChoice = onChange.mock.calls[0][0] as FormSchemaDraft
    expect(withChoice.sections[0].fields[1].options).toEqual(['Low', 'High', 'Option 3'])
    tree = AdminFormConfigEditor({ schema: withChoice, disabled: false, onChange })
    const remove = find(tree, (element) => element.type === 'button' && element.props['aria-label'] === 'Remove choice 2 from Priority')
    ;(remove.props.onClick as () => void)()
    expect((onChange.mock.calls[1][0] as FormSchemaDraft).sections[0].fields[1].options).toEqual(['Low', 'Option 3'])
    expect(schema.sections[0].fields[1].options).toEqual(['Low', 'High'])
  })

  it('reorders fields without changing their keys and asks before removing a field', () => {
    const onChange = vi.fn()
    let tree = AdminFormConfigEditor({ schema, disabled: false, onChange })
    const move = find(tree, (element) => element.type === 'button' && element.props['aria-label'] === 'Move Priority up')
    ;(move.props.onClick as () => void)()
    const moved = onChange.mock.calls[0][0] as FormSchemaDraft
    expect(moved.sections[0].fields.map((field) => field.fieldKey)).toEqual(['choice', 'field_1'])
    const confirm = vi.fn(() => false)
    vi.stubGlobal('window', { confirm })
    tree = AdminFormConfigEditor({ schema: moved, disabled: false, onChange })
    const remove = find(tree, (element) => element.type === 'button' && element.props['aria-label'] === 'Remove Priority')
    ;(remove.props.onClick as () => void)()
    expect(onChange).toHaveBeenCalledTimes(1)
    confirm.mockReturnValue(true)
    ;(remove.props.onClick as () => void)()
    expect((onChange.mock.calls[1][0] as FormSchemaDraft).sections[0].fields.map((field) => field.fieldKey)).toEqual(['field_1'])
    vi.unstubAllGlobals()
  })

  it('adds, reorders and removes sections with stable keys', () => {
    const onChange = vi.fn()
    let tree = AdminFormConfigEditor({ schema, disabled: false, onChange })
    const add = find(tree, (element) => element.type === 'button' && element.props['aria-label'] === 'Add section')
    ;(add.props.onClick as () => void)()
    const added = onChange.mock.calls[0][0] as FormSchemaDraft
    expect(added.sections[1]).toEqual({ sectionKey: 'section_1', title: 'New section', visibleTo: ['requester', 'setup_owner', 'admin'], fields: [] })
    tree = AdminFormConfigEditor({ schema: added, disabled: false, onChange })
    const move = find(tree, (element) => element.type === 'button' && element.props['aria-label'] === 'Move New section up')
    ;(move.props.onClick as () => void)()
    const moved = onChange.mock.calls[1][0] as FormSchemaDraft
    expect(moved.sections.map((section) => section.sectionKey)).toEqual(['section_1', 'requester_information'])
    tree = AdminFormConfigEditor({ schema: moved, disabled: false, onChange })
    const remove = find(tree, (element) => element.type === 'button' && element.props['aria-label'] === 'Remove New section')
    ;(remove.props.onClick as () => void)()
    expect((onChange.mock.calls[2][0] as FormSchemaDraft).sections).toEqual(schema.sections)
  })

  it('adds a field with a unique stable key without altering existing field metadata', () => {
    const onChange = vi.fn()
    const tree = AdminFormConfigEditor({ schema, disabled: false, onChange })
    const add = find(tree, (element) => element.type === 'button' && element.props['aria-label'] === 'Add field to Requester Information')
    ;(add.props.onClick as () => void)()
    const next = onChange.mock.calls[0][0] as FormSchemaDraft
    expect(next.sections[0].fields[2]).toEqual({ fieldKey: 'field_2', canonicalKey: 'field_2', label: 'New field', type: 'text', required: false })
    expect(next.sections[0].fields[0]).toEqual(schema.sections[0].fields[0])
    expect(schema.sections[0].fields).toHaveLength(2)
  })
})
