# Draft lifecycle and team filtering verification — 7 October 2026

## Scope and environment

Implemented the [confirmed specification](../specs/2026-10-07-draft-lifecycle-and-product-team-filtering.md)
in the existing `main` checkout, starting at `43f6d6a`. The user requested local
implementation and declined GitHub issue publication.

The change includes Admin read-only Draft Management, creator/Admin permanent
deletion, seven-day once-per-Draft reminders, assignment removal and Product Type
Dashboard grouping. Account roles/departments and cross-team PSF rights remain.

Commands used Node 24.21.0 through
`/home/kasidet4531/.nvm/versions/node/v24.21.0/bin` on PATH. Browser validation
used existing Playwright and `/usr/bin/google-chrome`; the Browser plugin was
absent. Tests ran compiled frontend/backend on temporary
`http://127.0.0.1:<allocated-port>` origins, disposable PostgreSQL/PGlite and local
LDAP/SOAP substitutes. No application HTTP responses were mocked, and no company
database/LDAP/mail endpoint was used.

## Final test results

| Check | Command/scope | Result |
| --- | --- | --- |
| Backend regression | Backend `npm test -- --runInBand` | 44 suites, 698 tests passed |
| Frontend regression | Frontend `npm test` | 36 files, 464 tests passed |
| SQL lifecycle/reminders | Standalone lifecycle, reminder and independent-connection concurrency suites | 19 tests passed |
| New public system flows | `node --test test/email-system.draft-lifecycle.e2e.mjs` | 4 tests passed |
| Existing email/trigger/loading flows | Existing email, fixture, PSF-trigger and loading suites | 10 tests passed |
| Existing form-preview/layout | `node --test test/form-management-system.e2e.mjs` | 4 tests passed |
| Final shell/management component checks | AppShell, NavSidebar, Draft Management and Delete dialog | 48 tests passed |
| Typechecking/build | Backend and frontend `npm run build` | Passed |
| Focused lint | Changed source and system/SQL fixtures | Passed |
| Diff and documentation references | Whitespace and local file-link checks | Passed |

The SQL command used an absolute ts-node preload so worker module resolution
remained valid when a fixture changed its working directory:

```sh
node --require /home/kasidet4531/Desktop/Web_Setup_file/main/backend/node_modules/ts-node/register \
  --test --test-concurrency=1 test/draft-lifecycle.postgres.test.ts \
  test/draft-reminders.postgres.test.ts test/draft-reminders.concurrent.test.ts
```

The public system command sets `EMAIL_E2E_CHROME=/usr/bin/google-chrome` and
`EMAIL_E2E_ARTIFACTS_DIR=/tmp/psf-draft-lifecycle-20261007`. The convenient
`npm run test:drafts:system` script builds both packages before running it.
Local browser/database sockets require fixture process permissions.

An initial combined existing-flow run passed 13/14 checks; its sole failure was
the obsolete expectation that Owner/Dept remained visible. That expectation
was changed to require absence, and the complete four-test form suite passed.
An old exact Worker-options assertion was also updated after a real retained-
export test reproduced a dependency-resolution error from an isolated app cwd;
the worker now receives the resolved ExcelJS module path.

## Primary acceptance seam

Visible browser actions and public HTTP were tested with independent authenticated
creator/Admin/Requester/GNTC/MFG sessions and actual locally captured mail:

- Admin read-only inspection of a foreign Draft, with server denial of mutation.
- Creator Delete from My Drafts and Admin Delete from management detail.
- Revision/authentication/state enforcement, prior audit/mail erasure, minimal
  Admin-only deletion logs and invalidation of an already completed XLSX artifact.
- Exactly one logical job at the seven-day boundary across concurrent scans and
  a fresh scanner instance; creator/all-Admin recipients and missing-address UI.
- Independent creator Submit versus Admin Delete with one committed winner.
- Public Submit/Delete winning before reminder preparation produced no Draft
  mail. When actual SOAP delivery won first, Admin Delete waited until the
  fixture released acceptance; retained payloads were then erased.
- Cross-team PSF writes succeeded, latest Product Type changes regrouped work
  without erasing PSF values, and submitted deletion was rejected.
- Account department stayed intact while request assignment fields disappeared.

The database gate/time setup and SOAP acceptance gate belong only to the test
fixture. Production clients gain no timestamp override or delivery-control route.

## Browser and visual checks

| Check | Evidence |
| --- | --- |
| Page identity/nonblank | Dashboard and Draft Management routes/headings rendered after real login |
| Framework overlay | None observed in retained images |
| Console health | Fixture page-error/console and boundary-health assertions passed |
| Interaction | Inspect, native Delete confirmation, successful deletion, denied actions, grouping and reminder reporting verified |
| Keyboard/mobile | Mobile row Delete opened via keyboard; Escape restored opener focus; confirmation bounds fit viewport |
| Responsive/theme | Desktop 1440×1000 and mobile 390×844, light/dark screenshots inspected |

Admin tables scroll horizontally on mobile so all columns/actions remain
available. Mobile breadcrumbs show the current page and an accessible parent Back
link, avoiding overlapping parent labels. Themes were exercised through the
existing root theme class; preference persistence was not changed.

Retained representative images:

- [Draft Management desktop/light](assets/2026-10-07-draft-lifecycle/draft-management-desktop-light.png)
- [Draft Management mobile/dark](assets/2026-10-07-draft-lifecycle/draft-management-mobile-dark.png)
- [Team Dashboard desktop/light](assets/2026-10-07-draft-lifecycle/team-dashboard-desktop-light.png)
- [Team Dashboard mobile/dark](assets/2026-10-07-draft-lifecycle/team-dashboard-mobile-dark.png)
- [Delete confirmation desktop/light](assets/2026-10-07-draft-lifecycle/draft-delete-confirmation-desktop-light.png)
- [Delete confirmation mobile/dark](assets/2026-10-07-draft-lifecycle/draft-delete-confirmation-mobile-dark.png)

## Standards

Independent read-only review found no documented-standard violations or actionable
baseline smell findings. Final incremental alert cleanup, fixture gates and
documentation changes were also reviewed without findings.

## Spec

Initial review found one P2: aggregate ADMIN_ALERT messages could retain copied
Draft reminder metadata after deletion. The accepted fix excludes Draft reminders
from aggregate mail, purges legacy copies at initialization/deletion and fences
alert transport using the current locked claim. Draft failure remains inspectable
in management. Ordinary request failure summaries still operate.

The regression proves copied legacy Draft summaries disappear while unrelated
alerts survive, and a deleted claimed summary cannot send. A further public-system
test closed the review's acceptance gap for independent-session lifecycle versus
actual external delivery. Follow-up review reported no remaining Spec findings.

Final summary: Standards 0 findings; Spec 0 remaining findings (1 resolved P2).

## Practical limits

Permanent deletion conservatively invalidates all cached exports owned by the
Draft creator; those exports may need regeneration. Existing assignment cleanup
is scoped/idempotent and preserves unrelated requests and account authorization.
Email already accepted externally and files already downloaded cannot be recalled.
One logical reminder uses the existing at-least-once transport retry semantics.

Validation covers local fixtures and Chrome at the named viewports. Corporate
service connectivity, deployed data, deployment and other browsers were not
certified. This implementation was committed locally; push is a separate action.
