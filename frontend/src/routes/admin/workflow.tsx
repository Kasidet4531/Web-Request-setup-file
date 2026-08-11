import { createFileRoute } from '@tanstack/react-router'
import { AdminWorkflowTransitionPage } from '../../components/AdminWorkflowTransitionPage'

export const Route = createFileRoute('/admin/workflow')({
  component: AdminWorkflowTransitionPage,
})
