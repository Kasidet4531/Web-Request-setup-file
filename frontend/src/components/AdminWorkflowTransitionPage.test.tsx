import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as WorkflowRoute from '../routes/admin/workflow'
import type { WorkflowConfiguration } from '../services/api'
import { AdminWorkflowTransitionPage } from './AdminWorkflowTransitionPage'

const hookState = vi.hoisted(() => ({ configuration: null as WorkflowConfiguration | null, calls: 0 }))
vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react')>()
  return { ...actual, useState: (initial: unknown) => actual.useState(hookState.calls++ === 0 && hookState.configuration ? hookState.configuration : initial) }
})

beforeEach(() => { hookState.configuration = null; hookState.calls = 0 })

describe('Status Management page', () => {
  it('keeps the existing route and exposes the catalog heading', () => {
    const options = Reflect.get(WorkflowRoute.Route, 'options') as { component: unknown }
    const html = renderToStaticMarkup(createElement(AdminWorkflowTransitionPage))
    expect(options.component).toBe(AdminWorkflowTransitionPage)
    expect(html).toContain('<h1>Status Management</h1>')
  })

  it('labels the status type and displays Cancel without changing its API value', () => {
    hookState.configuration = {
      statuses: ['Draft', 'Canceled request'],
      entries: [
        { id: 'draft', name: 'Draft', kind: 'draft', requestCount: null },
        { id: 'cancel', name: 'Canceled request', kind: 'cancelled', requestCount: 0 },
      ],
      psfVisibilityTriggerId: null,
      updatedAt: '2026-10-02T00:00:00.123456Z',
    }
    const html = renderToStaticMarkup(createElement(AdminWorkflowTransitionPage))
    expect(html).toContain('Status type</span><select')
    expect(html).toContain('<th scope="col">Status type</th>')
    expect(html).toContain('<option value="cancelled">Cancel</option>')
    expect(html).toContain('<td>Cancel</td>')
    expect(html).not.toContain('Meaning')
    expect(html).not.toContain('Cancelled')
  })
})
