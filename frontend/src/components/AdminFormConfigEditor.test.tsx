import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import type { FormSchemaDraft, FormSchemaField } from '../types/forms'
import { AdminFormConfigEditor, AdminFormConfigFieldEditor } from './AdminFormConfigEditor'

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
    sectionKey: 'requester_information', title: 'Requester Information', visibleTo: ['requester', 'setup_owner', 'admin'],
    fields: [
      { fieldKey: 'field_1', canonicalKey: 'field_1', label: 'Name', type: 'text', required: true, searchable: true },
      { fieldKey: 'choice', canonicalKey: 'choice', label: 'Priority', type: 'select', required: false, options: ['Low', 'High'] },
    ],
  }],
}
const onEditField = vi.fn()
const editor = (draft = schema, onChange = vi.fn()) => AdminFormConfigEditor({ schema: draft, disabled: false, onChange, onEditField })
const fieldEditor = (field: FormSchemaField, onChange = vi.fn()) => AdminFormConfigFieldEditor({
  field, isNew: false, canRemove: true, onChange, onApply: vi.fn(), onCancel: vi.fn(), onRemove: vi.fn(),
})

describe('visual form configuration editor', () => {
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

  it('edits form title and section visibility without changing field identities', () => {
    const onChange = vi.fn()
    const tree = editor(schema, onChange)
    const title = find(tree, (element) => element.type === 'input' && element.props.id === 'form-config-title')
    ;(title.props.onChange as (event: unknown) => void)({ target: { value: 'New title' } })
    expect(onChange.mock.calls[0][0]).toEqual({ ...schema, title: 'New title' })
    const role = find(tree, (element) => element.type === 'input' && element.props.id === 'form-config-role-0-setup_owner')
    ;(role.props.onChange as (event: unknown) => void)({ target: { checked: false } })
    expect((onChange.mock.calls[1][0] as FormSchemaDraft).sections[0].visibleTo).toEqual(['requester', 'admin'])
    expect((onChange.mock.calls[1][0] as FormSchemaDraft).sections[0].fields).toEqual(schema.sections[0].fields)
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

  it('adds, reorders and removes sections with stable keys', () => {
    const onChange = vi.fn()
    let tree = editor(schema, onChange)
    ;(find(tree, (element) => element.type === 'button' && element.props['aria-label'] === 'Add section').props.onClick as () => void)()
    const added = onChange.mock.calls[0][0] as FormSchemaDraft
    expect(added.sections[1]).toEqual({ sectionKey: 'section_1', title: 'New section', visibleTo: ['requester', 'setup_owner', 'admin'], fields: [] })
    tree = editor(added, onChange)
    ;(find(tree, (element) => element.type === 'button' && element.props['aria-label'] === 'Move New section up').props.onClick as () => void)()
    const moved = onChange.mock.calls[1][0] as FormSchemaDraft
    expect(moved.sections.map((section) => section.sectionKey)).toEqual(['section_1', 'requester_information'])
    tree = editor(moved, onChange)
    ;(find(tree, (element) => element.type === 'button' && element.props['aria-label'] === 'Remove New section').props.onClick as () => void)()
    expect((onChange.mock.calls[2][0] as FormSchemaDraft).sections).toEqual(schema.sections)
  })
})
