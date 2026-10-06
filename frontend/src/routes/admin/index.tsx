import { createFileRoute } from '@tanstack/react-router'
import { AdministrationDirectory } from '../../components/AdministrationDirectory'

export const Route = createFileRoute('/admin/')({ component: () => <AdministrationDirectory /> })
