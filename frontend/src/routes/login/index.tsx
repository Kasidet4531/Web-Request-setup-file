import { createFileRoute } from '@tanstack/react-router'
import { PagePlaceholder } from '../../components/PagePlaceholder'

export const Route = createFileRoute('/login/')({
  component: () => (
    <PagePlaceholder
      description="Authentication UI will land here once local login/session work is ready."
      eyebrow="Route placeholder"
      title="Login"
    />
  ),
})
