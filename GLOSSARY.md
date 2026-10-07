# PSF Request Management

Unified portal for managing PSF (Product Setup File) requests, private drafts, workflow progressions, and system auditing.

## Language

**Draft**:
A private, unsubmitted PSF request owned exclusively by its creator until submitted for workflow progression.
_Avoid_: Temporary request, unfinished form, pending request

**PSF Request**:
A submitted request advancing through defined workflow lifecycle stages and team assignments.
_Avoid_: Ticket, order, submission task

**Draft Management**:
An administrative overview allowing admins to inspect unsubmitted drafts, check reminder statuses, and permanently delete orphaned drafts.
_Avoid_: Draft inspection portal, draft admin console

**Audit History**:
A centralized record tracking lifecycle state changes across all requests as well as permanent draft deletion logs.
_Avoid_: Activity feed, transaction logs, change tracker

**Autofill Rule**:
A rule configuration mapping a trigger field value from previously completed PSF requests to automatically populate target fields.
_Avoid_: Auto-complete mapping, field copy rule
