export interface FormSchemaField {
  fieldKey: string;
  canonicalKey: string;
  label: string;
  type: 'text' | 'textarea' | 'date' | 'select' | 'radio';
  required: boolean;
  options?: string[];
  searchable?: boolean;
  exportable?: boolean;
  autofillTrigger?: boolean;
}

export interface FormSchemaSection {
  sectionKey: string;
  title: string;
  fields: FormSchemaField[];
}

export interface FormSchemaJson {
  formKey: string;
  version: number;
  title: string;
  sections: FormSchemaSection[];
}

export const PSF_REQUEST_FORM_KEY = 'psf-request';
export const PSF_CREATED_INFORMATION_FORM_KEY = 'psf-created-information';
export const SUPPORTED_FORM_KEYS = [
  PSF_REQUEST_FORM_KEY,
  PSF_CREATED_INFORMATION_FORM_KEY,
] as const;

export const DEFAULT_PSF_REQUEST_SCHEMA: FormSchemaJson = {
  formKey: PSF_REQUEST_FORM_KEY,
  version: 1,
  title: 'PSF Request Form',
  sections: [
    {
      sectionKey: 'requester_information',
      title: 'Requester Information',
      fields: [
        {
          fieldKey: 'product_type',
          canonicalKey: 'product_type',
          label: 'Product Type',
          type: 'radio',
          required: true,
          options: ['New Product', 'Transfer Product', 'Existing Product'],
          searchable: true,
          exportable: true,
        },
        {
          fieldKey: 'title',
          canonicalKey: 'title',
          label: 'Title',
          type: 'text',
          required: true,
          searchable: true,
          exportable: true,
        },
        {
          fieldKey: 'requester_name',
          canonicalKey: 'requester',
          label: 'Requester Name',
          type: 'text',
          required: true,
          searchable: true,
          exportable: true,
        },
        {
          fieldKey: 'due_date',
          canonicalKey: 'due_date',
          label: 'Due Date',
          type: 'date',
          required: true,
          searchable: true,
          exportable: true,
        },
        {
          fieldKey: 'priority',
          canonicalKey: 'priority',
          label: 'Priority',
          type: 'select',
          required: true,
          options: ['Low', 'Normal', 'High', 'Urgent'],
          searchable: true,
          exportable: true,
        },
        {
          fieldKey: 'product',
          canonicalKey: 'product',
          label: 'Product',
          type: 'text',
          required: true,
          searchable: true,
          exportable: true,
        },
        {
          fieldKey: 'wafer_fab',
          canonicalKey: 'wafer_fab',
          label: 'Wafer FAB',
          type: 'text',
          required: true,
          searchable: true,
          exportable: true,
        },
        {
          fieldKey: 'probecard_name',
          canonicalKey: 'probecard_name',
          label: 'Probecard Name',
          type: 'text',
          required: true,
          searchable: true,
          exportable: true,
        },
        {
          fieldKey: 'reference_psf_name',
          canonicalKey: 'reference_psf_name',
          label: 'Reference PSF Name',
          type: 'text',
          required: false,
          searchable: true,
          exportable: true,
          autofillTrigger: true,
        },
        {
          fieldKey: 'request_note',
          canonicalKey: 'request_note',
          label: 'Request Note',
          type: 'textarea',
          required: false,
          exportable: true,
        },
      ],
    },
  ],
};

function deepFreeze<T>(value: T): T {
  if (typeof value === 'object' && value !== null && !Object.isFrozen(value)) {
    Object.freeze(value);
    Object.values(value).forEach(deepFreeze);
  }
  return value;
}

export const PSF_CREATED_INFORMATION_SCHEMA = deepFreeze<FormSchemaJson>({
  formKey: PSF_CREATED_INFORMATION_FORM_KEY,
  version: 1,
  title: 'PSF Created Information',
  sections: [
    {
      sectionKey: 'psf_created_information',
      title: 'PSF Created Information',
      fields: [
        {
          fieldKey: 'first_die_ref_xy',
          canonicalKey: 'first_die_ref_xy',
          label: 'First Die Ref. (X,Y)',
          type: 'text',
          required: false,
        },
        {
          fieldKey: 'probe_coordinate_quadrant',
          canonicalKey: 'probe_coordinate_quadrant',
          label: 'Probe & Coordinate Quadrant',
          type: 'text',
          required: false,
        },
        {
          fieldKey: 'wafer_id_format',
          canonicalKey: 'wafer_id_format',
          label: 'Wafer ID Format',
          type: 'text',
          required: false,
        },
        {
          fieldKey: 'mirror_die_available',
          canonicalKey: 'mirror_die_available',
          label: 'Mirror Die Available',
          type: 'select',
          required: false,
          options: ['Yes', 'No'],
        },
        {
          fieldKey: 'prepare_fpc_and_physical_wafer_to_psf_cabinet_e2',
          canonicalKey: 'prepare_fpc_and_physical_wafer_to_psf_cabinet_e2',
          label: 'Prepare FPC & Physical Wafer to PSF Cabinet E2',
          type: 'select',
          required: false,
          options: ['Yes', 'No'],
        },
        {
          fieldKey: 'psf_setup_file_name',
          canonicalKey: 'psf_setup_file_name',
          label: 'PSF Setup File Name',
          type: 'text',
          required: false,
        },
        {
          fieldKey: 'job_file_name',
          canonicalKey: 'job_file_name',
          label: 'Job File Name',
          type: 'text',
          required: false,
        },
        {
          fieldKey: 'template',
          canonicalKey: 'template',
          label: 'Template',
          type: 'text',
          required: false,
        },
        {
          fieldKey: 'layout',
          canonicalKey: 'layout',
          label: 'Layout',
          type: 'text',
          required: false,
        },
        {
          fieldKey: 'attachment_reference',
          canonicalKey: 'attachment_reference',
          label: 'Attachment Reference',
          type: 'text',
          required: false,
        },
      ],
    },
  ],
});

export const LEGACY_PSF_CREATED_INFORMATION_SCHEMA =
  PSF_CREATED_INFORMATION_SCHEMA;

export function resolvePsfCreatedInformationSchema(
  snapshot: unknown,
): FormSchemaJson {
  if (snapshot === null || snapshot === undefined) {
    return LEGACY_PSF_CREATED_INFORMATION_SCHEMA;
  }
  if (
    typeof snapshot !== 'object' ||
    Array.isArray(snapshot) ||
    !('formKey' in snapshot) ||
    snapshot.formKey !== PSF_CREATED_INFORMATION_FORM_KEY ||
    !('version' in snapshot) ||
    !Number.isSafeInteger(snapshot.version) ||
    !('title' in snapshot) ||
    typeof snapshot.title !== 'string' ||
    !('sections' in snapshot) ||
    !Array.isArray(snapshot.sections)
  ) {
    throw new Error(
      'Stored PSF Created Information schema snapshot is invalid.',
    );
  }
  return snapshot as FormSchemaJson;
}
