# 21. The system sets Due Date at submission from each team's capacity

Status: accepted (24 October 2026, decided by Fook with the PSF team); not yet implemented. Amends decision 3 of [ADR 0017](0017-verbatim-workbook-data-and-core-actor-schedule-fields.md), which kept Due Date an editable form field.

The PSF team wants Due Date never blank, and it is their deadline for the PSF Setup File work (up to PSF Visibility Release), not for the whole request. When a Draft is submitted the system sets Due Date to the submission date + 3 calendar days + floor(Q ÷ C). C is the Team Capacity of the request's Dashboard Team Group: 4 a day for both GNTC and MFG to start, editable by an administrator. Q is that team's Team Queue when the request is submitted: its PSF Requests submitted in this web that have not reached PSF Visibility Release. Due Date is computed once. Any role may postpone it later with a required reason, which Audit History keeps. Requesters no longer type it.

## Considered options

- **Requester-entered Due Date** (ADR 0017). Rejected: often blank or unrealistic.
- **Booking a day slot per request** (plan v2). Rejected for the simpler formula ("follow the formula for now").
- **Recalculating after a reject sends the request back to the Submission Status.** Rejected for now (plan Q3).
- **Counting Imported Requests in Q.** Rejected for now (plan Q30): old open rows may never have been closed.
- **Capacity for MFG only.** Rejected (plan Q6): both teams start equal and either can be changed.

## Consequences

- Imported Requests without a Due Date stay blank and are never Overdue (plan Q4).
- Overdue does not change: an open request past its Due Date stays Overdue until it is completed or cancelled; PSF Visibility Release does not stop it (plan Q16).
- Weekends count and the time of day is ignored.
