import { createFileRoute } from '@tanstack/react-router'
import { LoginPage } from './-LoginPage'
import { getLoginRedirect } from '../../services/auth-session'

export const Route = createFileRoute('/login/')({
  validateSearch: (search: Record<string, unknown>): { redirect?: string } => ({
    redirect: search.redirect === undefined ? undefined : getLoginRedirect(search.redirect),
  }),
  component: function LoginRoute() {
    const { redirect } = Route.useSearch()
    return <LoginPage redirectTo={redirect} />
  },
})
