import { createFileRoute } from '@tanstack/react-router'
import { DashboardPage } from '../../components/RequestsWorkspace'

export const Route = createFileRoute('/dashboard/')({
  component: DashboardPage,
})
