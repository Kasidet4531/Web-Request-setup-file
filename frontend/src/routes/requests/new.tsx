import { createFileRoute } from '@tanstack/react-router'
import { RequestCreatePage } from '../../components/RequestsWorkspace'

export const Route = createFileRoute('/requests/new')({
  component: RequestCreatePage,
})
