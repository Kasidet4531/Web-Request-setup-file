import { createFileRoute, Link } from '@tanstack/react-router'
import { ArrowLeft, FilePlus } from 'lucide-react'
import { ActiveSchemaForm } from '../../components/ActiveSchemaForm'

export const Route = createFileRoute('/requests/new')({
  component: () => (
    <article className="workflow-page request-create-page">
      <div className="page-header request-create-page__header">
        <div className="page-header__title">
          <Link className="btn-ghost" to="/requests">
            <ArrowLeft size={15} /> Back to Requests
          </Link>
          <span className="page-header__icon">
            <FilePlus size={20} />
          </span>
          <div>
            <p className="page-card__eyebrow">New request</p>
            <h1>Create PSF Request</h1>
            <p className="page-card__description">
              Save a Draft to continue later, then submit from the same server-backed request.
            </p>
          </div>
        </div>
      </div>
      <div className="form-workspace">
        <div className="form-workspace__main">
          <ActiveSchemaForm mode="request" />
        </div>
        <aside className="form-workspace__rail" aria-label="Request lifecycle guidance">
          <section className="form-workspace__guide">
            <p className="page-card__eyebrow">Draft lifecycle</p>
            <h2>Complete at your pace</h2>
            <p>Saving a draft preserves the current server-backed request so it can be completed later.</p>
          </section>
          <section className="form-workspace__guide">
            <p className="page-card__eyebrow">Before submission</p>
            <p>Review required fields, then submit to start the server-authorized workflow.</p>
          </section>
        </aside>
      </div>
    </article>
  ),
})
