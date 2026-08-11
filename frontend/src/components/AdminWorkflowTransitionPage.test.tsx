import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import * as AdminWorkflowRoute from '../routes/admin/workflow'
import {
  AdminWorkflowTransitionMatrix,
  AdminWorkflowTransitionPage,
} from './AdminWorkflowTransitionPage'

describe('AdminWorkflowTransitionPage', () => {
  it('renders directed transition controls with role and department selectors', () => {
    const html = renderToStaticMarkup(
      <AdminWorkflowTransitionMatrix
        disabled={false}
        onToggleDepartment={vi.fn()}
        onToggleEnabled={vi.fn()}
        onToggleRole={vi.fn()}
        statuses={['Submitted', 'Setup In Progress']}
        transitions={[
          {
            fromStatus: 'Submitted',
            toStatus: 'Setup In Progress',
            enabled: true,
            allowedRoles: ['setup_owner'],
            allowedSetupOwnerDepartments: ['GNTC'],
          },
          {
            fromStatus: 'Setup In Progress',
            toStatus: 'Submitted',
            enabled: false,
            allowedRoles: [],
            allowedSetupOwnerDepartments: [],
          },
        ]}
      />,
    )

    expect(html).toContain('From Submitted')
    expect(html).toContain('Setup In Progress')
    expect(html).toContain('Enabled')
    expect(html).toContain('Setup File Owner')
    expect(html).toContain('Administrator')
    expect(html).toContain('GNTC')
    expect(html).toContain('MFG')
  })

  it('wires the admin workflow route to the transition editor', () => {
    const routeOptions = Reflect.get(AdminWorkflowRoute.Route, 'options') as {
      component: unknown
    }
    const html = renderToStaticMarkup(createElement(AdminWorkflowTransitionPage))

    expect(routeOptions.component).toBe(AdminWorkflowTransitionPage)
    expect(html).toContain('<h1>Workflow transition editor</h1>')
  })
})
