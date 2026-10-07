import { Pool } from 'pg';
import { AuditLogService } from '../src/audit/audit_log.service';
import {
  FormSchemaService,
  type FormSchemaJson,
} from '../src/admin/form_schema.service';
import { WorkflowTransitionService } from '../src/admin/workflow_transition.service';
import {
  RequestsService,
  type PsfRequestResponse,
} from '../src/requests/requests.service';
import { SearchIndexService } from '../src/requests/search-index.service';
import type { AuthenticatedUserProfile } from '../src/auth/session.types';
import { NotificationService } from '../src/notifications/notification.service';

export const requester: AuthenticatedUserProfile = {
  id: '00000000-0000-4000-8000-000000000101',
  username: 'requester',
  displayName: 'Requester',
  role: 'requester',
  setupOwnerDepartment: null,
};
export const ownerA: AuthenticatedUserProfile = {
  id: '00000000-0000-4000-8000-000000000102',
  username: 'owner-a',
  displayName: 'Same Name',
  role: 'setup_owner',
  setupOwnerDepartment: 'GNTC',
};
export const ownerB: AuthenticatedUserProfile = {
  id: '00000000-0000-4000-8000-000000000103',
  username: 'owner-b',
  displayName: 'Same Name',
  role: 'setup_owner',
  setupOwnerDepartment: 'MFG',
};
export const admin: AuthenticatedUserProfile = {
  id: '00000000-0000-4000-8000-000000000104',
  username: 'admin',
  displayName: 'Administrator',
  role: 'admin',
  setupOwnerDepartment: null,
};
export const submittedStatus = '10% -- Test Engineer Data Entry';
export const schema: FormSchemaJson = {
  formKey: 'psf-request',
  version: 1,
  title: 'Request',
  sections: [
    {
      sectionKey: 'request',
      title: 'Request',
      fields: [
        {
          fieldKey: 'title',
          canonicalKey: 'title',
          label: 'Title',
          type: 'text',
          required: true,
        },
        {
          fieldKey: 'requester_name',
          canonicalKey: 'requester',
          label: 'Requester',
          type: 'text',
          required: false,
        },
      ],
    },
  ],
};
export const psfSchema: FormSchemaJson = {
  formKey: 'psf-created-information',
  version: 1,
  title: 'PSF',
  sections: [
    {
      sectionKey: 'psf',
      title: 'PSF',
      fields: [
        {
          fieldKey: 'file',
          canonicalKey: 'psf_setup_file_name',
          label: 'File',
          type: 'text',
          required: false,
        },
      ],
    },
  ],
};
export async function lifecycleFixture(pool: Pool) {
  const audit = new AuditLogService(pool);
  const forms = new FormSchemaService(pool);
  const workflow = new WorkflowTransitionService(pool, audit);
  const index = new SearchIndexService(pool);
  let mailCount = 0;
  const notifications = {
    enqueueRequest: () => {
      mailCount++;
      return Promise.resolve();
    },
  } as unknown as NotificationService;
  const service = new RequestsService(
    pool,
    forms,
    workflow,
    index,
    audit,
    notifications,
  );
  await pool.query(
    `CREATE TABLE app_users (id uuid PRIMARY KEY, username text, display_name text, role text, setup_owner_department text, updated_at timestamp, password_hash text)`,
  );
  for (const actor of [requester, ownerA, ownerB, admin])
    await pool.query(
      'INSERT INTO app_users (id,username,display_name,role,setup_owner_department,updated_at) VALUES ($1,$2,$3,$4,$5,NOW())',
      [
        actor.id,
        actor.username,
        actor.displayName,
        actor.role,
        actor.setupOwnerDepartment,
      ],
    );
  await audit.onModuleInit();
  await forms.onModuleInit();
  await workflow.onModuleInit();
  await index.onModuleInit();
  await service.onModuleInit();
  for (const form of [schema, psfSchema])
    await pool.query(
      "UPDATE form_definitions SET schema_json=$2, version=1 WHERE form_key=$1 AND status='active'",
      [form.formKey, form],
    );
  async function draft(actor = requester) {
    return service.createDraft(
      {
        requesterData: { title: 'Test request' },
      },
      actor,
    );
  }
  async function submit(row: PsfRequestResponse) {
    return service.submitRequest(
      row.id,
      {
        formVersion: 1,
        expectedUpdatedAt: row.updatedAt,
        status: submittedStatus,
      },
      requester,
    );
  }
  async function reset() {
    await pool.query(
      'TRUNCATE psf_requests, psf_request_search_index, psf_request_audit_logs, canonical_submission_values CASCADE',
    );
    await pool.query(
      "UPDATE app_users SET role='setup_owner', display_name='Same Name', setup_owner_department=CASE WHEN id=$1 THEN 'GNTC' ELSE 'MFG' END WHERE id=ANY($2::uuid[])",
      [ownerA.id, [ownerA.id, ownerB.id]],
    );
  }
  return {
    pool,
    service,
    audit,
    forms,
    workflow,
    index,
    draft,
    submit,
    reset,
    mailCount: () => mailCount,
  };
}
