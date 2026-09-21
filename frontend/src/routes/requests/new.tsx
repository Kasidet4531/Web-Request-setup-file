import { createFileRoute, Link } from '@tanstack/react-router'
import { ArrowLeft } from 'lucide-react'
import { ActiveSchemaForm } from '../../components/ActiveSchemaForm'

export const Route = createFileRoute('/requests/new')({
  component: () => (
    <article className="workflow-page request-create-page">
      <div className="page-header request-create-page__header">
        <div className="page-header__title">
          <Link className="btn-ghost" to="/requests">
            <ArrowLeft size={15} /> Back to Requests
          </Link>
          <h1>Create PSF Request</h1>
        </div>
      </div>
      <ActiveSchemaForm mode="request" />
    </article>
  ),
})
