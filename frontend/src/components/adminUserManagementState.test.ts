import { describe, expect, it } from 'vitest'
import { ApiError, type UpdateAdminUserPayload } from '../services/api'
import {
  canSaveAdminUserUpdate,
  getAdminUserManagementErrorMessage,
  updateAdminUserRoleDraft,
} from './adminUserManagementState'

describe('admin user management state', () => {
  it('clears a department when changing a Setup File Owner to another role', () => {
    const update = updateAdminUserRoleDraft(
      { role: 'setup_owner', setupOwnerDepartment: 'GNTC' },
      'requester',
    )

    expect(update).toEqual({ role: 'requester', setupOwnerDepartment: null })
  })

  it('requires a valid department only for Setup File Owners', () => {
    const validSetupOwner: UpdateAdminUserPayload = {
      role: 'setup_owner',
      setupOwnerDepartment: 'MFG',
    }

    expect(canSaveAdminUserUpdate(validSetupOwner)).toBe(true)
    expect(
      canSaveAdminUserUpdate({
        role: 'setup_owner',
        setupOwnerDepartment: null,
      }),
    ).toBe(false)
    expect(
      canSaveAdminUserUpdate({
        role: 'admin',
        setupOwnerDepartment: 'GNTC',
      }),
    ).toBe(false)
    expect(
      canSaveAdminUserUpdate({ role: 'admin', setupOwnerDepartment: null }),
    ).toBe(true)
  })

  it('explains server-authoritative unauthenticated and forbidden management responses', () => {
    const unauthenticated = getAdminUserManagementErrorMessage(
      new ApiError('Not authenticated', 401, 'Unauthorized', null),
      'Unable to load users.',
    )
    const forbidden = getAdminUserManagementErrorMessage(
      new ApiError('Only admins can manage users.', 403, 'Forbidden', null),
      'Unable to load users.',
    )

    expect(unauthenticated).toContain('Sign in is required')
    expect(forbidden).toContain('do not have permission')
    expect(unauthenticated).toContain('server enforces administrator authorization')
    expect(forbidden).toContain('Only admins can manage users.')
  })
})
