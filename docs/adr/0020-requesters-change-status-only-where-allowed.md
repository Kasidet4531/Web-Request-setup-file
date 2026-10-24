# 20. Requesters change Status only where an administrator allows it

Status: accepted (24 October 2026, decided by Fook after the 22 October review with the PSF team); not yet implemented.

At the 22 October review the PSF team asked that Requesters only see and press their own steps (submit, accept or reject at 99%, resend after a reject), because every other Work Status belongs to the PSF team. Today every authenticated role may save any catalog Work Status ([status catalog rules](../status-catalog-and-manual-updates.md), 4 October 2026, which added no role restrictions). We decided that each Work Status's Edit modal says whether Requesters may choose it and from which current Work Statuses, and that submitting a Draft enters one administrator-chosen Submission Status for every role instead of a Status picked at submission. Setup File Owners and Admins still choose any Status by hand, and nothing changes Status automatically.

## Considered options

- **Keep every role free.** Rejected: Requesters could move work into PSF-team statuses.
- **A list of Requester-selectable statuses with no "from" condition.** Rejected (plan Q1): a Requester at 10% could choose 100% straight away.
- **A fixed transition matrix for every role**, as first proposed in ADR 0005. Rejected: the PSF team still moves work between any statuses by hand.

## Consequences

- For Requesters only, this replaces the 4 October rule that every role may save any Status.
- The settings belong to the Work Status catalog, so an Initial Data Load resets them and an administrator sets them again ([ADR 0023](0023-go-live-from-an-empty-database.md)).
