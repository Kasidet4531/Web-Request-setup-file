import {
  ApiError,
  type UpdateAdminUserPayload,
  type UserRole,
} from '../services/api'

export function updateAdminUserRoleDraft(
  current: UpdateAdminUserPayload,
  role: UserRole,
): UpdateAdminUserPayload {
  return {
    role,
    setupOwnerDepartment:
      role === 'setup_owner' ? current.setupOwnerDepartment : null,
  }
}

export function canSaveAdminUserUpdate(
  update: UpdateAdminUserPayload,
): boolean {
  if (update.role === 'setup_owner') {
    return (
      update.setupOwnerDepartment === 'GNTC' ||
      update.setupOwnerDepartment === 'MFG'
    )
  }

  return update.setupOwnerDepartment === null
}

export function getAdminUserManagementErrorMessage(
  error: unknown,
  fallback: string,
): string {
  if (!(error instanceof ApiError)) {
    return fallback
  }

  if (error.status === 401) {
    return `Sign in is required to manage users. The server enforces administrator authorization. ${error.message}`
  }

  if (error.status === 403) {
    return `You do not have permission to manage users. The server enforces administrator authorization. ${error.message}`
  }

  return error.message || fallback
}
