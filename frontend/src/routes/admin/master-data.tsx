import { createFileRoute, Link } from '@tanstack/react-router'
import { PageHeader } from '../../components/ui/PageHeader'
import { AsyncNotice } from '../../components/ui/AsyncNotice'

export const Route = createFileRoute('/admin/master-data')({
  component: () => <article className="workflow-page">
    <PageHeader title="Master data" />
    <AsyncNotice kind="info" title="Not configured" action={<Link className="btn-secondary" to="/admin">View available tools</Link>}>
      Master data management is not available in this application. Request forms use their configured fields and options.
    </AsyncNotice>
  </article>,
})
