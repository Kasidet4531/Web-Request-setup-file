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
      draft: { formKey: 'psf-request', triggerCanonicalKey: 'deleted_trigger', targetCanonicalKeys: ['deleted_target'] },
      onCancel() {}, onChangeTarget() {}, onChangeTrigger() {}, onSave() {},
    }))
    expect(html).toContain('<option value="product">')
    expect(html).toContain('Removed field (deleted_trigger)')
    expect(html).toContain('Removed field (deleted_target)')
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
