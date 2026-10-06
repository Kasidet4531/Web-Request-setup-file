import { createFileRoute } from '@tanstack/react-router'
import { AdminFormConfigVersionPage } from '../../components/AdminFormConfigPage'

export const Route = createFileRoute('/admin/form-config/$version')({
  component: AdminFormConfigVersionPage,
})
