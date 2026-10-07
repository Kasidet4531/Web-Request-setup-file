import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import * as AdminAutofillRoute from '../routes/admin/autofill'
import { AdminAutofillRulesPage, AdminAutofillRuleEditor, AdminAutofillRulesTable } from './AdminAutofillRulesPage'
import type { FormSchemaField } from '../types/forms'

describe('AdminAutofillRulesPage', () => {
  const fields: FormSchemaField[] = [{ fieldKey: 'product', canonicalKey: 'product', label: 'Product', type: 'text', required: false }]

  it('offers unflagged schema fields as triggers and lets admins remove deleted targets', () => {
    const html = renderToStaticMarkup(createElement(AdminAutofillRuleEditor, {
      disabled: false, isEditing: true, fields,
      draft: { formKey: 'psf-request', triggerCanonicalKey: 'deleted_trigger', targetCanonicalKeys: ['deleted_target'], status: 'active' },
      onCancel() {}, onChangeTarget() {}, onChangeTrigger() {}, onChangeStatus() {}, onSave() {},
    }))
    expect(html).toContain('<option value="product">')
    expect(html).toContain('Removed trigger field')
    expect(html).toContain('Removed target field 1')
    expect(html).toContain('admin-autofill-target-deleted_target')
  })

  it('shows inactive rules with a reason and an edit action', () => {
    const html = renderToStaticMarkup(createElement(AdminAutofillRulesTable, {
      disabled: false, fields, onEdit() {},
      rules: [{ id: 'rule-1', formKey: 'psf-request', triggerCanonicalKey: 'deleted_trigger', targetCanonicalKeys: ['product'], lookupSource: 'previous_completed_submission', status: 'inactive', inactiveReason: 'Trigger field was removed from the published form.', createdAt: '', updatedAt: '' }],
    }))
    expect(html).toContain('Inactive')
    expect(html).toContain('Trigger field was removed from the published form.')
    expect(html).toContain('admin-autofill-edit-rule-1')
  })

  it('shows only labels in rule cells and offers status selection without Source column', () => {
    const schemaFields: FormSchemaField[] = [
      { fieldKey: 'trigger_key', canonicalKey: 'trigger_key', label: 'Reference', type: 'text', required: false },
      { fieldKey: 'target_key', canonicalKey: 'target_key', label: 'Product label', type: 'text', required: false },
    ]
    const rule = { id: 'r', formKey: 'psf-request', triggerCanonicalKey: 'trigger_key', targetCanonicalKeys: ['target_key'], lookupSource: 'previous_completed_submission' as const, status: 'inactive' as const, createdAt: '', updatedAt: '' }
    const table = renderToStaticMarkup(createElement(AdminAutofillRulesTable, { disabled: false, fields: schemaFields, rules: [rule], onEdit() {} }))
    expect(table).toContain('Reference')
    expect(table).toContain('Product label')
    expect(table).not.toContain('trigger_key')
    expect(table).not.toContain('target_key')
    expect(table).not.toContain('>Source<')
    const editor = renderToStaticMarkup(createElement(AdminAutofillRuleEditor, { disabled: false, isEditing: true, fields: schemaFields, draft: { formKey: 'psf-request', triggerCanonicalKey: 'trigger_key', targetCanonicalKeys: ['target_key'], status: 'inactive' }, onCancel() {}, onChangeTarget() {}, onChangeTrigger() {}, onChangeStatus() {}, onSave() {} }))
    expect(editor).toContain('Rule status')
    expect(editor).toContain('<option value="inactive" selected="">Inactive</option>')
    expect(editor).not.toContain('Reference (trigger_key)')
    expect(editor).not.toContain('Canonical keys')
  })

  it('renders table action header with sr-only and structures the dialog with source column', () => {
    const schemaFields: FormSchemaField[] = [{ fieldKey: 'trigger_key', canonicalKey: 'trigger_key', label: 'Reference', type: 'text', required: false }]
    const table = renderToStaticMarkup(createElement(AdminAutofillRulesTable, { disabled: false, fields: schemaFields, rules: [], onEdit() {} }))
    expect(table).toContain('<th scope="col"><span class="sr-only">Actions</span></th>')

    const editor = renderToStaticMarkup(createElement(AdminAutofillRuleEditor, {
      disabled: false, isEditing: true, fields: schemaFields,
      draft: { formKey: 'psf-request', triggerCanonicalKey: 'trigger_key', targetCanonicalKeys: [], status: 'active' },
      onCancel() {}, onChangeTarget() {}, onChangeTrigger() {}, onChangeStatus() {}, onSave() {},
    }))
    expect(editor).toContain('admin-autofill-rules__source')
    expect(editor).toContain('admin-autofill-rules__editor-grid')
  })

  it('wires the admin autofill route to a focused rule-management page', () => {
    const routeOptions = Reflect.get(AdminAutofillRoute.Route, 'options') as {
      component: unknown
    }
    const html = renderToStaticMarkup(createElement(AdminAutofillRulesPage))

    expect(routeOptions.component).toBe(AdminAutofillRulesPage)
    expect(html).toContain('<h1>Auto-fill Rules</h1>')
    expect(html).toContain('Create rule')
  })
})
