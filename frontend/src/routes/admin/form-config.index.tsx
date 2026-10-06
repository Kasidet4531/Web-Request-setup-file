import { createFileRoute } from '@tanstack/react-router'
import { AdminFormConfigListPage } from '../../components/AdminFormConfigPage'
import { isFormKey } from '../../types/forms'

export const Route = createFileRoute('/admin/form-config/')({
  validateSearch: (search: Record<string, unknown>) => ({
    formKey: isFormKey(search.formKey) ? search.formKey : 'psf-request',
  }),
  component: AdminFormConfigListPage,
})
