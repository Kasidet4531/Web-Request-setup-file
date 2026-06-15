import { createFileRoute } from '@tanstack/react-router'
import { PagePlaceholder } from '../../components/PagePlaceholder'

export const Route = createFileRoute('/admin/')({
  component: () => (
    <PagePlaceholder
      description="Admin tools for users, form configuration, exports, and workflow rules will be layered in here."
      eyebrow="Route placeholder"
      title="Admin"
    />
  ),
})
