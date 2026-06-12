// Database entities placeholder structure
export class FormDefinition {
  id: string;
  formKey: string;
  version: number;
  title: string;
  description: string;
  schemaJson: any;
  status: string;
  createdBy: string;
  createdAt: Date;
  publishedAt: Date;
}

export class PSFRequest {
  id: string;
  requestNo: string;
  formKey: string;
  formVersion: number;
  status: string;
  requester: string;
  setupOwner: string;
  setupOwnerRole: string;
  productType: string;
  requesterDataJson: any;
  psfCreatedDataJson: any;
  schemaSnapshotJson: any;
  createdAt: Date;
  updatedAt: Date;
  submittedAt: Date;
  psfCreatedAt: Date;
  completedAt: Date;
}

export class FieldMapping {
  id: string;
  formKey: string;
  formVersion: number;
  fieldKey: string;
  canonicalKey: string;
}

export class CanonicalSubmissionValue {
  id: string;
  requestId: string;
  canonicalKey: string;
  value: string;
  updatedAt: Date;
}

export class PSFRequestSearchIndex {
  requestId: string;
  requestNo: string;
  title: string;
  referencePsfName: string;
  psfSetupFileName: string;
  probecardName: string;
  product: string;
  waferFab: string;
  status: string;
  priority: string;
  requester: string;
  setupOwner: string;
  setupOwnerRole: string;
  productType: string;
  requestDate: Date;
  dueDate: Date;
  updatedAt: Date;
}

export class PSFRequestAuditLog {
  id: string;
  requestId: string;
  actionType: string;
  fieldKey: string;
  fieldLabel: string;
  oldValue: string;
  newValue: string;
  changedBy: string;
  changedByRole: string;
  changedAt: Date;
  reason: string;
  metadataJson: any;
}

export class AutofillRule {
  id: string;
  formKey: string;
  triggerCanonicalKey: string;
  lookupSource: string;
  fillTargetsJson: any;
  status: string;
  createdAt: Date;
  updatedAt: Date;
}

export class ExportProfile {
  id: string;
  formKey: string;
  profileName: string;
  columnsJson: any;
  isDefault: boolean;
  createdAt: Date;
  updatedAt: Date;
}
