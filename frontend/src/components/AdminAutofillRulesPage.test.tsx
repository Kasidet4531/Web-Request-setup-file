import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import * as AdminAutofillRoute from '../routes/admin/autofill'
import { AdminAutofillRulesPage } from './AdminAutofillRulesPage'

describe('AdminAutofillRulesPage', () => {
  it('wires the admin autofill route to a focused rule-management page', () => {
    const routeOptions = Reflect.get(AdminAutofillRoute.Route, 'options') as {
      component: unknown
    }
    const html = renderToStaticMarkup(createElement(AdminAutofillRulesPage))

    expect(routeOptions.component).toBe(AdminAutofillRulesPage)
    expect(html).toContain('<h1>Autofill rule management</h1>')
    expect(html).toContain('Create rule')
  })
})
