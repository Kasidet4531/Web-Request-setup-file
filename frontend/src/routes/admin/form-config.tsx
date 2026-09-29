import { Outlet, createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/admin/form-config')({
  component: Outlet,
})
