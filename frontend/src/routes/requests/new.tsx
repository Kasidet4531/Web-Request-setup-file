import { createFileRoute } from '@tanstack/react-router'
import { ActiveSchemaForm } from '../../components/ActiveSchemaForm'

export const Route = createFileRoute('/requests/new')({
  component: () => (
    <article className="workflow-page request-create-page">
      <div className="page-header request-create-page__header">
        <h1>Create PSF Request</h1>
      </div>
      <ActiveSchemaForm mode="request" />
    </article>
  ),
})
