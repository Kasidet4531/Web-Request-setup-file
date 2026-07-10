import { createFileRoute } from '@tanstack/react-router'
import { RequestsListPage } from '../../components/RequestsWorkspace'

export const Route = createFileRoute('/requests/')({
  component: RequestsListPage,
})
