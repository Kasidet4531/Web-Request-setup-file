import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/requests/$requestId/')({
  component: () => <div>Request Detail Structure Placeholder</div>,
})
