import { createFileRoute } from '@tanstack/react-router'
import { AdminDraftManagementPage } from '../../components/AdminDraftManagementPage'
export const Route = createFileRoute('/admin/drafts/')({ component: AdminDraftManagementPage })
