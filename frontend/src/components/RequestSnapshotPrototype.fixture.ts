/** Synthetic data used only by vite.snapshot-prototype.config.ts; never sent to the real API. */
import type { PsfRequestResponse, RequestSnapshotResponse } from '../services/api'
import type { FormSchema, FormSchemaSection } from '../types/forms'

function section(sectionKey: string, title: string, fields: [string, string, 'text' | 'textarea' | 'date'][]): FormSchemaSection {
  return { sectionKey, title, fields: fields.map(([fieldKey, label, type]) => ({ fieldKey, canonicalKey: fieldKey, label, type, required: false })) }
}

const requesterSchema: FormSchema = {
  formKey: 'psf-request', version: 2, title: 'PSF Request Form', sections: [
    section('request', 'Request details', [
      ['product_type', 'Request To', 'text'], ['title', 'Product_Description', 'text'],
      ['due_date', 'Due Date', 'date'], ['requester_name', 'Requester', 'text'], ['modified_by', 'Modified By', 'text'],
    ]),
    section('product', 'Product and equipment', [
      ['product', 'Product', 'text'], ['wafer_fab', 'Wafer FAB', 'text'], ['probecard_name', 'Probecard Name', 'text'],
      ['machine', 'Machine', 'text'], ['reference_psf_name', 'Reference PSF Name', 'text'],
    ]),
    section('instructions', 'Request instructions', [
      ['request_note', 'Request Note', 'textarea'], ['technical_requirements', 'Technical Requirements', 'textarea'], ['additional_details', 'Additional Details', 'textarea'],
    ]),
  ],
}
const psfSchema: FormSchema = {
  formKey: 'psf-created-information', version: 1, title: 'PSF Created Information', sections: [
    section('setup', 'Setup files', [
      ['psf_setup_file_name', 'PSF Setup File Name', 'text'], ['job_file_name', 'Job File Name', 'text'], ['psf_revision', 'PSF Revision', 'text'],
    ]),
    section('validation', 'Validation and handover', [
      ['validation_result', 'Validation Result', 'text'], ['validation_date', 'Validation Date', 'date'],
      ['setup_note', 'Setup Note', 'textarea'], ['handover_note', 'Handover Note', 'textarea'],
    ]),
  ],
}

export const snapshotPrototypeFixture: RequestSnapshotResponse = {
  requestNo: 'PSF-000042', currentStatus: '100% -- Completed', status: '10% -- Test Engineer Data Entry', formVersion: 2,
  entry: {
    id: 'entry-1', hasRequestSnapshot: true, actionType: 'REQUESTER_INFORMATION_UPDATED', actorDisplayName: 'Sample Requester', actorRole: 'requester',
    createdAt: '2026-10-21T07:30:00.000Z',
    metadata: { fieldChanges: [
      { fieldKey: 'title', fieldLabel: 'Product_Description', before: 'Probe card transfer for line 4', after: 'Probe card transfer for line 4 — revised pin map' },
      { fieldKey: 'request_note', fieldLabel: 'Request Note', before: 'Use the existing reference file.\nConfirm wafer map orientation before handover.', after: 'Use the existing reference file and retain the wafer map orientation.\nReplace probe card PC-7702 with PC-7781.\nConfirm the revised pin map with the test engineer before handover.' },
    ] },
  },
  schemaSnapshot: requesterSchema, psfCreatedInformationSchema: psfSchema, psfCreatedDataVisible: true,
  requesterData: {
    product_type: 'Product Transfer (MFG transfer from another site)', title: 'Probe card transfer for line 4 — revised pin map', due_date: '2026-11-15',
    requester_name: 'Sample Requester', modified_by: 'Sample Requester', product: 'Sample Product A', wafer_fab: 'Sample Wafer FAB',
    probecard_name: 'PC-7781', machine: 'Sample Prober · Line 4', reference_psf_name: 'REFERENCE_LINE4_REV03.psf',
    request_note: 'Use the existing reference file and retain the wafer map orientation.\nReplace probe card PC-7702 with PC-7781.\nConfirm the revised pin map with the test engineer before handover.',
    technical_requirements: 'Preserve the reference origin and alignment settings. The transfer must keep the existing die numbering and disabled-site list.\n\nCompare the first-wafer map against the approved sample before releasing the setup for production. Record any differences in the setup note.',
    additional_details: '',
  },
  psfCreatedData: {
    psf_setup_file_name: 'SAMPLE_PRODUCT_A_LINE4_PC7781_TRANSFER_REV04_VALIDATED_CONFIGURATION.psf', job_file_name: 'SAMPLE_PRODUCT_A_LINE4.job', psf_revision: '04',
    validation_result: 'Reference wafer comparison completed', validation_date: '2026-10-20',
    setup_note: 'Wafer orientation matches the reference setup.\nThe replacement probe card uses the revised pin map.\nNo disabled sites were added.', handover_note: '',
  },
}

export const snapshotPrototypeStatusFixture: RequestSnapshotResponse = {
  ...snapshotPrototypeFixture,
  status: '20% -- PSF File Creating',
  entry: {
    ...snapshotPrototypeFixture.entry, id: 'status-1', actionType: 'REQUEST_STATUS_CHANGED', createdAt: '2026-10-21T08:00:00.000Z',
    metadata: { fromStatus: '10% -- Test Engineer Data Entry', toStatus: '20% -- PSF File Creating', fieldChanges: [] },
  },
}

export const snapshotPrototypeRequest: PsfRequestResponse = {
  ...snapshotPrototypeFixture, id: 'prototype', formKey: 'psf-request', requester: 'Sample Requester', productType: 'Product Transfer',
  requesterData: snapshotPrototypeFixture.requesterData as Record<string, string>,
  status: snapshotPrototypeFixture.currentStatus,
  canEditPsfCreatedData: false, canEditRequesterData: false, canSubmitDraft: false, requesterUserId: 'sample-user',
  psfReleasedAt: '2026-10-20T07:30:00Z', createdAt: '2026-10-19T07:30:00Z', updatedAt: '2026-10-21T08:30:00Z',
  submittedAt: '2026-10-19T07:45:00Z', psfCreatedAt: '2026-10-20T07:30:00Z', completedAt: '2026-10-21T08:30:00Z',
}
