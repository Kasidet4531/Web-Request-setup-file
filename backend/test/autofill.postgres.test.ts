import { BadRequestException } from '@nestjs/common';
import { AutofillRuleController } from '../src/admin/autofill_rule.controller';
import type { AuthService } from '../src/auth/auth.service';
import { PGlite } from '@electric-sql/pglite';
import assert from 'node:assert/strict';
import { describe, it, before, beforeEach, after } from 'node:test';
import type { Pool } from 'pg';
import { AutofillRuleService } from '../src/admin/autofill_rule.service';
import { FormSchemaService } from '../src/admin/form_schema.service';
import type { WorkflowTransitionService } from '../src/admin/workflow_transition.service';
import { AutofillService } from '../src/requests/autofill.service';

const actor = {
  id: 'admin',
  username: 'admin',
  displayName: 'Admin',
  role: 'admin' as const,
  setupOwnerDepartment: null,
};
const ruleInput = {
  formKey: 'psf-request',
  triggerCanonicalKey: 'product',
  targetCanonicalKeys: ['wafer_fab', 'probecard_name'],
};

void describe('autofill PostgreSQL integration', () => {
  let db: PGlite;
  let rules: AutofillRuleService;
  let schemas: FormSchemaService;
  let autofill: AutofillService;

  before(
    async () => {
      db = new PGlite();
      const query = (sql: string, values?: unknown[]) => db.query(sql, values);
      const pool = {
        query,
        connect: () => Promise.resolve({ query, release() {} }),
      } as unknown as Pool;
      schemas = new FormSchemaService(pool);
      rules = new AutofillRuleService(pool, schemas);
      const workflow = {
        getConfiguration: () =>
          Promise.resolve({
            entries: [{ name: 'Done', kind: 'completed' }],
          }),
      } as unknown as WorkflowTransitionService;
      autofill = new AutofillService(pool, rules, schemas, workflow);
      await schemas.onModuleInit();
      await rules.onModuleInit();
      await db.exec(`
      CREATE TABLE psf_requests (
        id UUID PRIMARY KEY, form_key TEXT, status TEXT, completed_at TIMESTAMP,
        requester_data_json JSONB, schema_snapshot_json JSONB
      );
      CREATE TABLE canonical_submission_values (
        request_id UUID, canonical_key TEXT, value_json JSONB,
        PRIMARY KEY (request_id, canonical_key)
      );
    `);
    },
    { timeout: 30000 },
  );

  beforeEach(async () => {
    await db.exec(
      'TRUNCATE psf_requests, canonical_submission_values, autofill_rules, form_definitions',
    );
    await schemas.onModuleInit();
  });

  after(async () => {
    await db.close();
  });

  async function seedSource(id: number, wafer: string, visibleTo?: unknown) {
    const section = {
      sectionKey: 'historical',
      title: 'Historical fields',
      ...(visibleTo === undefined ? {} : { visibleTo }),
      fields: [
        {
          fieldKey: 'old_product',
          canonicalKey: 'product',
          label: 'Old Product Label',
          type: 'text',
        },
        {
          fieldKey: 'old_wafer',
          canonicalKey: 'wafer_fab',
          label: 'Old Wafer Label',
          type: 'text',
        },
      ],
    };
    await db.query(
      `INSERT INTO psf_requests VALUES ($1::uuid, 'psf-request', 'Done', $2::timestamp, $3::jsonb, $4::jsonb)`,
      [
        `00000000-0000-4000-8000-${String(id).padStart(12, '0')}`,
        `2026-10-02 12:00:${String(id).padStart(2, '0')}`,
        JSON.stringify({ old_product: '  Product A  ', old_wafer: wafer }),
        JSON.stringify({ sections: [section] }),
      ],
    );
  }

  async function lookup() {
    return autofill.lookupSuggestions({
      formKey: 'psf-request',
      field: 'product',
      value: 'Product A',
    });
  }

  void it('persists admin-selected inactivity through legacy edits and publication, then activates explicitly', async () => {
    const controller = new AutofillRuleController(rules, {
      getProfile: () => Promise.resolve(actor),
    } as unknown as AuthService);
    const request = { session: { userId: actor.id } } as never;
    const saved = await controller.createRule(
      { ...ruleInput, status: 'inactive' },
      request,
    );
    assert.equal(saved.status, 'inactive');
    assert.equal(saved.inactiveReason, 'Disabled by administrator.');
    await seedSource(1, 'Fab A');
    assert.deepEqual(await lookup(), { matched: false, suggestedValues: {} });
    const inactiveSchema = await schemas.getActiveSchema('psf-request', true);
    assert.notEqual(
      inactiveSchema.schema.sections
        .flatMap((section) => section.fields)
        .find((field) => field.canonicalKey === 'product')?.autofillTrigger,
      true,
    );
    const edited = await controller.updateRule(saved.id, ruleInput, request);
    assert.equal(edited.status, 'inactive');
    assert.equal(edited.inactiveReason, 'Disabled by administrator.');
    const draft = await schemas.duplicateVersion(1, actor);
    await schemas.publishDraft(draft.version);
    assert.equal((await rules.listRules('psf-request'))[0].status, 'inactive');
    const enabled = await controller.updateRule(
      saved.id,
      { ...ruleInput, status: 'active' },
      request,
    );
    assert.equal(enabled.status, 'active');
    assert.equal(enabled.inactiveReason, undefined);
    assert.equal((await lookup()).matched, true);
    const activeSchema = await schemas.getActiveSchema('psf-request', true);
    assert.equal(
      activeSchema.schema.sections
        .flatMap((section) => section.fields)
        .find((field) => field.canonicalKey === 'product')?.autofillTrigger,
      true,
    );
    assert.equal(
      (await rules.updateRule(saved.id, ruleInput)).status,
      'active',
    );
    const disabled = await controller.updateRule(
      saved.id,
      { ...ruleInput, status: 'inactive' },
      request,
    );
    assert.equal(disabled.inactiveReason, 'Disabled by administrator.');
    assert.deepEqual(await rules.listActiveRules('psf-request'), []);
    const persisted = await db.query<{
      status: string;
      inactive_reason: string;
    }>('SELECT status, inactive_reason FROM autofill_rules WHERE id=$1', [
      saved.id,
    ]);
    assert.deepEqual(persisted.rows[0], {
      status: 'inactive',
      inactive_reason: 'Disabled by administrator.',
    });
  });

  void it('rejects invalid activation values and schema-invalid saves without changing storage', async () => {
    const saved = await rules.createRule(ruleInput);
    for (const status of [null, true, '', 'paused', 'Active']) {
      await assert.rejects(
        rules.updateRule(saved.id, { ...ruleInput, status }),
        BadRequestException,
      );
    }
    for (const status of ['active', 'inactive']) {
      await assert.rejects(
        rules.updateRule(saved.id, {
          ...ruleInput,
          status,
          targetCanonicalKeys: ['removed'],
        }),
        BadRequestException,
      );
    }
    assert.equal((await rules.listRules('psf-request'))[0].status, 'active');
  });

  void it('matches unindexed historical fields by canonical key despite renamed inputs and labels', async () => {
    await rules.createRule(ruleInput);
    await seedSource(1, '  Fab A  ');
    assert.deepEqual(await lookup(), {
      matched: true,
      suggestedValues: { wafer_fab: 'Fab A' },
    });
    const schema = await schemas.getActiveSchema('psf-request', true);
    assert.equal(
      schema.schema.sections[0].fields.find(
        (field) => field.canonicalKey === 'product',
      )?.autofillTrigger,
      true,
    );
  });

  for (const { visibleTo } of [
    { visibleTo: ['admin'] },
    { visibleTo: ['requester'] },
    { visibleTo: [] },
    { visibleTo: null },
    { visibleTo: 'admin' },
    { visibleTo: ['admin', 'admin', 'requester'] },
  ]) {
    void it(`excludes a newer restricted historical snapshot with visibleTo=${JSON.stringify(visibleTo)}`, async () => {
      await rules.createRule(ruleInput);
      await seedSource(1, 'Public Fab');
      await seedSource(2, 'Private Fab', visibleTo);
      assert.deepEqual(await lookup(), {
        matched: true,
        suggestedValues: { wafer_fab: 'Public Fab' },
      });
    });
  }

  void it('accepts shared legacy metadata and still chooses the latest completed source', async () => {
    await rules.createRule(ruleInput);
    await seedSource(1, 'Older Fab');
    await seedSource(2, 'Latest Fab', ['setup_owner', 'admin', 'requester']);
    assert.deepEqual(await lookup(), {
      matched: true,
      suggestedValues: { wafer_fab: 'Latest Fab' },
    });
  });

  void it('prefers indexed target values while matching an unindexed historical trigger', async () => {
    await rules.createRule(ruleInput);
    await seedSource(1, 'Snapshot Fab');
    await db.query(
      `INSERT INTO canonical_submission_values VALUES ($1::uuid, 'wafer_fab', $2::jsonb)`,
      ['00000000-0000-4000-8000-000000000001', JSON.stringify('Indexed Fab')],
    );
    assert.deepEqual(await lookup(), {
      matched: true,
      suggestedValues: { wafer_fab: 'Indexed Fab' },
    });
  });

  void it('keeps a rule active after published label and field key changes preserve its canonical key', async () => {
    await rules.createRule(ruleInput);
    await seedSource(1, 'Fab A');
    const draft = await schemas.duplicateVersion(1, actor);
    const product = draft.schema.sections[0].fields.find(
      (field) => field.canonicalKey === 'product',
    )!;
    product.fieldKey = 'renamed_product_input';
    product.label = 'Renamed Product';
    await schemas.saveDraft(
      { draftVersion: draft.version, schema: draft.schema },
      actor,
    );
    await schemas.publishDraft(draft.version);
    assert.equal((await rules.listActiveRules('psf-request')).length, 1);
    assert.deepEqual(await lookup(), {
      matched: true,
      suggestedValues: { wafer_fab: 'Fab A' },
    });
  });

  void it('rolls back schema publication when persisting an inactive rule fails', async () => {
    await rules.createRule(ruleInput);
    const draft = await schemas.duplicateVersion(1, actor);
    draft.schema.sections[0].fields = draft.schema.sections[0].fields.filter(
      (field) => field.canonicalKey !== 'product',
    );
    await schemas.saveDraft(
      { draftVersion: draft.version, schema: draft.schema },
      actor,
    );
    await db.exec(
      "ALTER TABLE autofill_rules ADD CONSTRAINT test_reject_inactive CHECK (status <> 'inactive')",
    );
    try {
      await assert.rejects(schemas.publishDraft(draft.version));
      assert.equal((await schemas.getActiveSchema()).version, 1);
      assert.equal((await rules.listActiveRules('psf-request')).length, 1);
    } finally {
      await db.exec(
        'ALTER TABLE autofill_rules DROP CONSTRAINT test_reject_inactive',
      );
    }
  });

  void it('changes rule lifecycle only on publish and requires explicit save after restoring a trigger', async () => {
    const saved = await rules.createRule(ruleInput);
    const draft = await schemas.duplicateVersion(1, actor);
    draft.schema.sections[0].fields = draft.schema.sections[0].fields.filter(
      (field) => field.canonicalKey !== 'product',
    );
    await schemas.saveDraft(
      { draftVersion: draft.version, schema: draft.schema },
      actor,
    );
    assert.equal((await rules.listActiveRules('psf-request')).length, 1);
    await schemas.publishDraft(draft.version);
    const inactive = (await rules.listRules('psf-request'))[0];
    assert.equal(inactive.id, saved.id);
    assert.equal(inactive.status, 'inactive');
    assert.equal(
      inactive.inactiveReason,
      'Trigger field was removed from the published form.',
    );
    assert.deepEqual(await lookup(), {
      matched: false,
      suggestedValues: {},
    });
    const restored = await schemas.duplicateVersion(1, actor);
    await schemas.publishDraft(restored.version);
    assert.deepEqual(await rules.listActiveRules('psf-request'), []);
    assert.equal(
      (await rules.updateRule(saved.id, ruleInput)).inactiveReason,
      'Trigger field was removed from the published form.',
    );
    assert.equal(
      (await rules.updateRule(saved.id, { ...ruleInput, status: 'active' }))
        .status,
      'active',
    );
  });

  void it('continues filling surviving targets and inactivates the rule when its last target is deleted', async () => {
    await rules.createRule(ruleInput);
    await seedSource(1, 'Fab A');
    const draft = await schemas.duplicateVersion(1, actor);
    draft.schema.sections[0].fields = draft.schema.sections[0].fields.filter(
      (field) => field.canonicalKey !== 'probecard_name',
    );
    await schemas.saveDraft(
      { draftVersion: draft.version, schema: draft.schema },
      actor,
    );
    await schemas.publishDraft(draft.version);
    assert.deepEqual(await lookup(), {
      matched: true,
      suggestedValues: { wafer_fab: 'Fab A' },
    });
    const empty = await schemas.duplicateVersion(draft.version, actor);
    empty.schema.sections[0].fields = empty.schema.sections[0].fields.filter(
      (field) => field.canonicalKey !== 'wafer_fab',
    );
    await schemas.saveDraft(
      { draftVersion: empty.version, schema: empty.schema },
      actor,
    );
    await schemas.publishDraft(empty.version);
    const inactive = (await rules.listRules('psf-request'))[0];
    assert.equal(inactive.status, 'inactive');
    assert.equal(
      inactive.inactiveReason,
      'All target fields were removed from the published form.',
    );
  });
});
