import { createFileRoute } from '@tanstack/react-router'
import { AdminUserManagementPage } from '../../components/AdminUserManagementPage'

export const Route = createFileRoute('/admin/users')({
  component: AdminUserManagementPage,
})
