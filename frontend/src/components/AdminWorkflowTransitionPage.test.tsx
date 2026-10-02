import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import * as WorkflowRoute from '../routes/admin/workflow'
import { AdminWorkflowTransitionPage } from './AdminWorkflowTransitionPage'

describe('Status Management page', () => {
  it('keeps the existing route and exposes the catalog heading', () => {
    const options = Reflect.get(WorkflowRoute.Route, 'options') as { component: unknown }
    const html = renderToStaticMarkup(createElement(AdminWorkflowTransitionPage))
    expect(options.component).toBe(AdminWorkflowTransitionPage)
    expect(html).toContain('<h1>Status Management</h1>')
  })
})
