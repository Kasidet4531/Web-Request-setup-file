import { createFileRoute } from '@tanstack/react-router'
import { AdminDraftDetailPage } from '../../components/AdminDraftManagementPage'
export const Route = createFileRoute('/admin/drafts/$requestId')({ component: AdminDraftDetailPage })
