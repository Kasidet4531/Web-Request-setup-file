import { createFileRoute } from '@tanstack/react-router'
import { ActiveSchemaForm } from '../../components/ActiveSchemaForm'

export const Route = createFileRoute('/admin/form-config')({
  component: () => (
    <article className="page-card">
      <div className="page-card__header">
        <div>
          <p className="page-card__eyebrow">Schema preview</p>
          <h1>Active Form Configuration</h1>
          <p className="page-card__description">
            Preview the active requester schema in a read-only state before it is reused by request creation flows.
          </p>
        </div>
      </div>
      <div className="page-card__body">
        <ActiveSchemaForm mode="preview" />
      </div>
    </article>
  ),
})
