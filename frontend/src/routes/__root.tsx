import { createRootRoute } from '@tanstack/react-router'
import { AppShell } from '../components/AppShell'
import { LayoutPrototypeSwitcher } from '../components/prototype/LayoutPrototypeSwitcher'

export const Route = createRootRoute({
  // PROTOTYPE, throwaway: the layout switcher shows in dev builds only.
  component: () => <><AppShell />{import.meta.env.DEV ? <LayoutPrototypeSwitcher /> : null}</>,
})
