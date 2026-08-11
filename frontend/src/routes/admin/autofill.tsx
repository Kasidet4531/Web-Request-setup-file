import { createFileRoute } from '@tanstack/react-router'
import { AdminAutofillRulesPage } from '../../components/AdminAutofillRulesPage'

export const Route = createFileRoute('/admin/autofill')({
  component: AdminAutofillRulesPage,
})
