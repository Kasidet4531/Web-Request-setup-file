# Status Management verification — 2026-10-02

> **Historical verification record (2026-10-02 audit):** Results, test counts, authorizations, fixtures, environment paths and limitations below are preserved as evidence of that scoped run. They are not fresh verification of this checkout, its running services or the current database contents, and do not authorize replaying data changes. Use [Current implementation](../current-implementation.md) for the present source baseline.

## Scope and current gate

The approved Status Management / Request Editing feature is integrated into `rapid-frontend-rewrite`, based on `b5ad4056f2be412928438841677968f920f9dab6`. Delivery is a local commit only; no push, deployment, GitHub artifact, or `local-test-auth` synchronization is authorized. Autofill Rules administration is deferred.

Independent backend and frontend SPEC/QUALITY gates passed. Backend Q1/Q2 remediation passed both independent gates; Q3 remains Minor/nonblocking. Live isolated integration and canonical full checks passed. **The final independent bounded cross-lane review is APPROVED. Hime subsequently recertified canonical parity, reran the complete canonical package chains, and verified isolated-schema/runtime cleanup. The accepted delivery is a local commit, not deployment or connected-browser acceptance.**

The historical scope plan is `../plans/2026-10-01-status-management-and-request-editing.md`. Its older planning-only/routing statements are historical; its latest checkpoint and this verification record take precedence.

## Implemented contract

- Admin manages immutable-identity status entries with verbatim labels and explicit `draft`, `open`, `completed`, or `cancelled` kinds; percentages do not drive transitions. Initial catalog has the 17 approved labels, protected Draft, and an unconfigured visibility trigger.
- Every authenticated role creates owner-private Drafts and sees shared non-Draft work. `My draft` is owner-only; even an Admin/PSF actor cannot access a foreign Draft. First submission explicitly selects a work status and moves the same record; ordinary status changes cannot submit a Draft or return work to Draft.
- The detail Action center is the single submit/status control. Requester and PSF saves remain separate; unsaved edits, dirty navigation, explicit schema upgrades and opaque revision conflicts are preserved.
- All authenticated actors may edit shared requester information or change work status without replacing requester identity or an existing PSF assignment. PSF editing remains backend-authorized for Admin/Setup File Owner, including Completed and accessible own Drafts.
- Requester and PSF required fields use separate captured snapshots. Trigger entry validates PSF requirements before submission, status updates, or bulk status replacement. Release is one-time/sticky; requester-only PSF data/history/export is masked until release.
- Catalog mutations, request CAS, canonical/search projections, release and audit use existing transactional infrastructure. Used rename preserves historical audit/revisions; invalid multirow replacement rolls back entirely.
- Authorized related work is creator OR PSF department, deduplicated. SQL summaries cover the full filtered scope beyond the loaded page; cancelled/completed work is not overdue. My draft filters resolve historical canonical mappings.
- Excel uses real captured descriptors and verbatim labels. Queued status/download resolve the current stored profile and deny an incompatible historical Admin job. Shared due-date projection accepts only valid calendar strings or NULL while preserving raw captured text.

## Fresh canonical package checks

Backend, all exit 0:

```sh
npm run lint -- --no-fix
npm test -- --runInBand --no-cache
npm run test:e2e -- --runInBand
npm run build
```

- Unit: **578 passed / 31 suites**.
- Mocked-HTTP e2e: **18 passed / 1 suite**; these are separate from the live stored-PostgreSQL evidence below.
- Read-only lint and production TypeScript build passed. `--no-fix` prevents the existing lint script's `--fix` from mutating reviewed source.

Frontend, all exit 0:

```sh
npm run lint
npm test
npm run build
```

- **230 passed / 26 test files**.
- Lint and build passed; the existing build includes `tsc -b`.

`git diff --check` passed. After full checks, both tracked lane diffs and all seven new feature files matched the frozen worker patches; all 31 backend manifest hashes remained identical.

## Live HTTP / PostgreSQL / Excel evidence

Hime executed the real compiled AppModule with real services, authorization, session/profile resolution, repositories, transactions and Excel processor. Only database/configuration providers were redirected to approved isolated test coordinates. The closed-enum login bridge exists only in scratch, is development/flag guarded, and uses the ordinary session user ID plus stored profile. No tracked auth endpoint or production development-auth code was added.

**14 named scenarios passed**, with 131 recorded SQL fixtures including one historical export job. Stored row, audit, canonical and projection readbacks were asserted. Scenarios covered all-role Draft privacy/lifecycle, type/required validation, shared edits, six-digit stale/racing CAS, separate snapshot/trigger gates, bulk rollback/replacement, 120-row filtered summaries, historical My draft mappings, real synchronous/queued Excel, Q1 delivery denial and Q2 shared due projection.

Isolation: database `psf_setup_db`, namespace `status_verify_94eb255ec6f1`, application search path contains that namespace and `pg_catalog` only. Copied users/forms/autofill retained their original three table hashes. All nine public table hashes matched the user-approved public baseline before and after the live run. Owned listeners closed and source freezes remained unchanged. After the final review, Hime dropped only that task-owned namespace and read back its absence; all nine public hashes remained identical to the approved baseline, and preserved copy hashes matched before removal.

An earlier preflight aborted before AppModule startup, listener or fixtures: hashing TIMESTAMPTZ JSON in UTC differed from the original Bangkok hashes; public had also independently diverged from the original copy in two users' `updated_at` fields only. Read-only diagnostics identified these separately. The user authorized retaining the unchanged original copy and recording the current public baseline. Hash transactions now use the original Bangkok timezone while the application remains UTC. No public data was restored, reset or modified, and no unchanged-since-original-copy claim is made.

Unchanged startup checks public relation existence as metadata and issues `CREATE EXTENSION IF NOT EXISTS` only after preflight proves pgcrypto already exists. Actual app table operations stay in the isolated namespace; public row hashing uses a separate explicitly read-only pool.

## Evidence boundaries and retained findings

- Required/custom historical schemas are tagged fresh SQL request captures, not proof of publishing/capture through the normal configuration API.
- The live run tests backend HTTP, stored PostgreSQL and Excel, not a real frontend browser connected to that backend. Earlier independent mounted-React/DOM conflict/navigation checks used synthetic transport and remain separate frontend evidence.
- Q2 live custom-text coverage exercises requester, PSF and status mutations. Submission through the shared binding has independent four-caller regression/SELECT evidence; a custom-text Draft submission was not asserted in this live run.
- Q1 denies XLSX payload/content, not the ordinary JSON body of a 404.
- **Q3 deferred:** catalog and dependent list/count reads may observe different committed snapshots during an interleaved rename. This is transient classification/count inconsistency, not stored corruption or a demonstrated privilege expansion.
- No deployment, remote/LAN reachability or production runtime acceptance is claimed.

## Retained scratch evidence

Under `/opt/data/cache/scratch/status-workers/control/`:

- `native-backend-quality-remediation-spec-review.md` and `native-backend-quality-remediation-quality-review.md`.
- `native-frontend-remediation-spec-rereview.md` and `native-frontend-remediation-quality-rereview.md`.
- `hime-backend-quality-post-review-recertification.json`.
- `hime-status-live-integration-result.json`, `status-live-integration.cjs`, and `hime-status-live-launch.cjs`.
- `hime-status-preflight-users-diagnostic.json`, `hime-status-live-public-baseline.json`, and retained preflight failure.
- `hime-canonical-status-full-checks.json` and `canonical-status-*.log`.

Scratch artifacts are temporary execution evidence, not a production harness or a new dependency. This committed verification record preserves the delivery facts and coverage limits if scratch is later pruned.

## Final independent review and closeout

- `native-status-final-integration-review.md`: **APPROVED** for frozen cross-lane contracts and supplied HTTP/PostgreSQL/Excel evidence; no Critical or Important findings. It intentionally does not certify a moving canonical worktree or connected frontend-browser execution.
- Hime closed its two outstanding handoff checks on the settled canonical tree: exact inventory and bytes matched all **31 backend and 23 frontend files**, and both complete package-script chains above freshly passed again (**578 unit + 18 mocked-HTTP**, **230 frontend tests**, lint/build and frontend build-time type checks). Source parity remained identical after those runs.
- Reviewed backend tracked diff SHA256: `4023537cc413d0038fcfc05b0c5f9d125abafe57db69aefbcdaf9b8af86b72fc`; changed-source manifest: `6df6337d7e5986d74aeb2a5705cea914fe8ed787c358840f32e5064a0096dd19`.
- Reviewed frontend tracked diff SHA256: `f7293d610a0212066d785f87d4de2e5414c718b5a20fae85529522a03b9b8003`; changed-source manifest: `15d314343996e67ca3e7aebce19d0d165a1b546930527e2cd520adfca249da8e`.
- Cleanup removed `status_verify_94eb255ec6f1` only, with absence readback, no live integration connections, and unchanged nine public hashes. The initial dependency guard stopped before DROP because it counted nine table-owned PostgreSQL TOAST relations as external; the revised guard excludes only internal relations linked by their owner's `reltoastrelid`, not arbitrary external objects. The successful cleanup retained the evidence files.
- The owned mounted harness was stopped; its PID disappeared and loopback ports 5317, 5301 and 3005 were closed at readback. The existing source runtime was not stopped or edited.
- Temporary delegation `model`, `provider` and `reasoning_effort` overrides were restored to their recorded original empty values through the Hermes configuration CLI. Full parsed-configuration comparison confirmed every other setting and the parent model were unchanged.
- `local-test-auth` remained clean at `9c6b3a4e31efecdb2adbcebf3d1bae4aa08e598b`; no synchronization, push, deployment or GitHub change was performed.

Q3 remains deliberately deferred as documented above. Autofill Rules is the next separate product task, not an unfinished Status Management acceptance gate.
