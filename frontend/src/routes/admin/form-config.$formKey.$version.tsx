import { createFileRoute } from '@tanstack/react-router'
import { AdminFormConfigFormKeyVersionPage } from '../../components/AdminFormConfigPage'

export const Route = createFileRoute('/admin/form-config/$formKey/$version')({
  component: AdminFormConfigFormKeyVersionPage,
})
