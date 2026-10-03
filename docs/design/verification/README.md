# Frontend verification artifacts

These files support the approved Direction C redesign. All records and responses are synthetic. No credentials or real business exports are stored here. The [fidelity ledger](../2026-10-03-frontend-fidelity-ledger.md) records comparisons, contract checks and limitations; [screenshot-manifest.json](screenshot-manifest.json) lists retained image dimensions.

## Live review after browser feedback

On 2026-10-03 the user authorized starting the configured development backend and requested that the preview use PostgreSQL data. The temporary synthetic gateway on port 4174 was stopped and deleted. The six browser scripts that installed or depended on synthetic fixtures were removed. The retained screenshots and JSON results below are historical evidence of the earlier fixture run, not the current runtime.

Start the existing backend and frontend separately:

```sh
npm --prefix backend run start:dev
npm --prefix frontend run dev -- --host 127.0.0.1 --port 5173 --strictPort
```

Open `http://127.0.0.1:5173/login`. The existing development sign-in creates a real backend session and reads the configured PostgreSQL database; it does not supply mock requests or form schemas. Company LDAP sign-in remains a separate unverified path. Backend startup runs the existing storage initialization and background workers.

Use a fresh browser session without `page.route` overrides for live checks. Keep screenshots of database records outside the repository. Do not run the retired fixture scenarios against the connected database. `command-results.json` and `*-results.json` retain their original run's scope and hashes.

## What is checked

- Earlier screen matrix: 43 desktop/mobile/native/tablet/dark renders, visible page heading, 52 px header, 16 px mobile gutter, bounded body width, local table overflow, mobile input/select heights, no unexpected alert or console/page error.
- Earlier state checks: 16 loading/empty/error/retry, catalog, role, release/privacy, custom status/long identifier, keyboard link, scroll, session and motion checks.
- Earlier history check: client-side request-history navigation to denied access excluded the previous request identity/events.
- Earlier reflow checks: 12 skip-link, drawer focus/Tab/Escape, responsive detail order, canonical border and reflow assertions. A 720×450 viewport represented the layout space available at 200% zoom from 1440×900, not native browser menu zoom or scaled raster output.
- Earlier extra captures: exact create concept dimensions, complete mobile create/detail, light login and dark login stylesheet.

Owners separately exercised create/reopen, independent form saves, schema upgrade/Remain/Reload, autofill races, version Apply/Cancel/save/publish, status revisions/replacement, user edits/partial refresh, audit query boundaries and queued export download/retry with fulfilled mutation fixtures. Screenshots from these runs are retained beside the root matrix. These are frontend behavior and payload checks, not live database, LDAP, authorization or backend workbook-generation proof.

Run the production checks from `frontend`:

```sh
npm test
npm run lint
npm run build
```

Final integrated results: 300 tests in 30 files, lint and production build passed. No new dependency, service contract, backend file, business schema/state helper or generated route tree was changed.
