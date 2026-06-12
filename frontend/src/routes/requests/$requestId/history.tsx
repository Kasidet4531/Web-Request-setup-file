import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/requests/$requestId/history')({
  component: () => <div>Request History Structure Placeholder</div>,
})
