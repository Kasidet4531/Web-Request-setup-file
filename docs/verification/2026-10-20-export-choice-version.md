# Excel export: unlisted choices, unequal columns and multiple form versions

> Historical prototype results. The application has since been integrated on the isolated branch; see [application integration and HTTP verification](2026-10-21-export-app-integration.md). The scale/concurrency CLIs now exercise the application implementation; old mode labels remain readable in these archived JSON reports.

The subsequent [concurrency benchmark](2026-10-20-export-concurrency.md) checks this fixture under parallel execution and simultaneous queue submissions.

This follow-up expands the synthetic fixture requested by the user. It checks stored values against explicit expected cells; configured choice lists do not define which stored values may be exported. The performance candidate remains a test-only prototype in `export/correctness-100k`. This follow-up does not change the production export service, SQL or authorization rules. The previously added Setup Owner-to-Requester restriction was removed following the user's scope clarification, and the controller matches the original checkout.

## Added cases

- Every one of the **29 data choice columns** receives values outside both its captured choice list and the current list. This includes Requester, historical and PSF fields, not just Diameter.
- Diameter and all other data choice columns contain numeric `6`, text `"6"`, numeric `200`, text `"200"`, `"0006"`, retired text, Thai/emoji/XML-sensitive text and legacy arrays. Existing valid options remain mixed into the scale dataset.
- Diameter options change between versions: v1 has `6, 8`, v2 has `8, 200`, and v3 has `8, 12`. This exercises values formerly allowed, values absent from both lists, and values allowed only in another version. Stored values must not become `8`/`12` or disappear merely because the options changed.
- A stored status absent from the current status choices remains present as metadata; Draft requests are still excluded.
- Requester and PSF forms each span three versions in the same file. Column counts differ in both directions, field order changes, field keys change, and current labels replace old labels for the same canonical key. Historical-only fields stay in the union; a row lacking a field has a blank at that column, rather than a shifted neighboring value.
- An additional captured Requester v3 has different field keys from the published v3. Matching only the form key/version is deliberately insufficient.
- Stored canonical projections and raw snapshot fallback both contain out-of-choice values. Released/unreleased PSF masking remains checked separately for Admin, Setup Owner and Requester.

| Form version | Requester fields | PSF fields |
| ------------ | ---------------: | ---------: |
| v1           |               52 |         16 |
| v2           |               49 |         17 |
| v3           |               47 |         18 |

The exported union remains **76 columns**: four metadata columns, 47 current Requester columns, seven historical Requester columns, and 18 PSF columns. Request For is absent from Requester v1; Trench Thickness is absent from v1/v2. Physical Wafer is absent from PSF v1; Wafer ID format is absent from PSF v1/v2. The expected rows specify these memberships independently of the schema/source constructors.

## Verification layers

1. **Production exporter regression:** 420 deterministic rows cover schema combinations, field-presence differences, seven choice samples, stored-canonical/fallback data and PSF visibility. Six tests exercise real ExcelJS files through synchronous and queued rendering for all three roles. Every header, logical cell value and nonblank number/string type is checked. Distinct values for each field expose column misalignment.
2. **Actual persisted fixture coverage:** after seeding PostgreSQL, read the first 780 persisted records and inspect their captured schemas and raw data. For every data choice column, assert out-of-list values exist, all four numeric/text `6`/`200` variants exist, and each relevant data path is exercised. Assert all three versions and three distinct field counts for each form. These observations are recorded in each dataset's `compatibilityCoverage`.
3. **Full scale:** 5,570 and 100,000 non-Draft requests for each role, checked cell by cell with the independent ZIP/SAX reader and fixture oracle. The existing six committed concurrent mutations run during every export. The output must match its initial database snapshot.
4. **Secondary reader:** normal ExcelJS document loading independently reads each 5,570 file and must match the primary reader's value/type digest. The known ExcelJS streaming-reader UTF-8 defect is not used as an acceptance gate.

Select fields, including numeric-looking and originally numeric values, produce text cells under the existing export contract. Number fields produce numbers when parseable. Omitted and explicit empty cells are equivalent logical blanks; nonblank value/type differences are rejected. No choice filtering or replacement is permitted by the expected data.

## Results

The expanded fixture passes exact cell checks in all six scale cases:

| Requests | Actor       | Logical cells checked, including header | Differences |
| -------: | ----------- | --------------------------------------: | ----------: |
|    5,570 | Admin       |                                 423,396 |           0 |
|    5,570 | Setup Owner |                                 423,396 |           0 |
|    5,570 | Requester   |                                 423,396 |           0 |
|  100,000 | Admin       |                               7,600,076 |           0 |
|  100,000 | Setup Owner |                               7,600,076 |           0 |
|  100,000 | Requester   |                               7,600,076 |           0 |

This checks **24,070,416 logical cells** in the expanded scale fixture. All six cases confirm the concurrent writes committed outside the export snapshot, with zero CRLF or other differences. Admin and Setup Owner value/type digests are identical at both sizes. The process exits 0 with `strictCellAcceptancePassed: true`.

Both seeded datasets pass the persisted-data coverage assertions for all 29 choice columns and both forms' three versions. For example, the 780-row persisted probe contains 420 Diameter values absent from both captured and current lists: 336 through stored canonical projections and 84 through raw snapshot fallback. All four numeric/text `6`/`200` variants also exist in the persisted data.

The normal ExcelJS document reader agrees with every cell in all three 5,570 files. Full backend regression after adding the tests passes **46 suites, 714 tests**. ESLint, Prettier and the TypeScript-checked runner also pass.

- [Full scale and persisted-data coverage results](2026-10-20-export-compatibility-results.json).
- [Normal ExcelJS reader agreement](2026-10-20-export-compatibility-readers.json).
- [Production-exporter regression tests](../../backend/src/export/export.schema-compatibility.spec.ts).

## Test sensitivity

Three temporary mutations were applied separately to the worktree exporter, tested, and fully restored:

| Injected error                                             | Regression result  |
| ---------------------------------------------------------- | ------------------ |
| Return blank for select values absent from current choices | All six tests fail |
| Omit captured Requester schemas from exported column union | All six tests fail |
| Extract raw historical data using the active schema        | All six tests fail |

These are assertion failures on workbook content, not compilation failures. `git diff --exit-code -- backend/src/export/excel_export.service.ts` confirms the production exporter is restored. [Mutation results](2026-10-20-export-compatibility-mutation-controls.json).

## Reproduce

From `backend`, with dependencies installed and permission to start a local PostgreSQL server:

```bash
npm test -- --runInBand export/export.schema-compatibility.spec.ts
npm run test:export:scale -- --candidate-only --sizes=780 --output-dir=../.cache/export-compatibility-smoke
npm run test:export:scale -- --candidate-only --output-dir=../.cache/export-compatibility-scale
node --require ts-node/register scripts/verify-export-scale.ts --cross-read=../.cache/export-compatibility-scale/report.json --document-only
```

The fixture uses the user's retained column mapping and synthetic records only. No configured database or real request data is read. These checks establish behavior for this fixture, not certification of every real stored record or a manual Microsoft Excel open. Production rollout still requires validation against the real data and integration of the performance prototype.
