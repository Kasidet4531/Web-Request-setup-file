import { createFileRoute } from '@tanstack/react-router'
import { AdminFormConfigPage } from '../../components/AdminFormConfigPage'

export const Route = createFileRoute('/admin/form-config')({
  component: AdminFormConfigPage,
})
