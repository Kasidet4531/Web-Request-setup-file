import { createFileRoute } from '@tanstack/react-router'
import { RequestsListPage } from '../components/RequestsWorkspace'

export const Route = createFileRoute('/my-drafts')({
  component: () => <RequestsListPage scope="my-drafts" />,
})