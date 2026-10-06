import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import type { AdminUserProfile } from '../services/api'
import * as AdminUsersRoute from '../routes/admin/users'
import {
  AdminUserManagementFeedback,
  AdminUserManagementPage,
  AdminUserManagementUsersTable,
} from './AdminUserManagementPage'

const setupOwner: AdminUserProfile = {
  id: 'setup-owner-1',
  username: 'setup.gntc.demo',
  displayName: 'Setup Owner GNTC Demo',
  role: 'setup_owner',
  setupOwnerDepartment: 'GNTC',
  email: 'owner@example.test',
}

describe('AdminUserManagementPage', () => {
  it('shows a read-only user directory with email and a per-user Edit action', () => {
    const html = renderToStaticMarkup(
      <AdminUserManagementUsersTable
        onEdit={vi.fn()}
        savingUserId={null}
        users={[setupOwner]}
      />,
    )

    expect(html).toContain('Setup Owner GNTC Demo')
    expect(html).toContain('setup.gntc.demo')
    expect(html).toContain('owner@example.test')
    expect(html).toContain('Setup File Owner department')
    expect(html).toContain('GNTC')
    expect(html).toContain('Edit')
    expect(html).not.toContain('<select')
    expect(html).not.toContain('Save user')
  })

  it('renders accessible loading and authorization feedback', () => {
    const loadingHtml = renderToStaticMarkup(
      <AdminUserManagementFeedback feedback={null} loading />,
    )
    const errorHtml = renderToStaticMarkup(
      <AdminUserManagementFeedback
        feedback={{
          kind: 'error',
          message: 'Only admins can manage users.',
        }}
        loading={false}
      />,
    )

    expect(loadingHtml).toContain('Loading users…')
    expect(loadingHtml).toContain('role="status"')
    expect(errorHtml).toContain('role="alert"')
    expect(errorHtml).toContain('Only admins can manage users.')
  })

  it('wires only the admin users route to the dedicated management page', () => {
    const routeOptions = Reflect.get(AdminUsersRoute.Route, 'options') as {
      component: unknown
    }
    const html = renderToStaticMarkup(createElement(AdminUserManagementPage))

    expect(routeOptions.component).toBe(AdminUserManagementPage)
    expect(html).toContain('<h1>Users &amp; Roles</h1>')
  })
})
