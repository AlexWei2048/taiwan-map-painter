# Historical Data Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the existing 2022-only result viewer into a unified, extensible historical election workspace for 2022 county/city chief, county/city councillor, and township/city/district chief results.

**Architecture:** Preserve the existing static GitHub Pages application and map renderer. Add a versioned history data model and pure aggregation helpers, keep `history-2022.js` as the 2022 geometry/data adapter, and move generic filters, views, summaries, badges, and exports into a focused `history-workspace.js`. Migrate through a compatibility layer so prediction and free-colouring state remain untouched.

**Tech Stack:** Vanilla JavaScript, SVG, HTML/CSS, Python 3 data builder, Node.js built-in test runner, Playwright browser smoke tests, GitHub Pages.

**Spec:** `docs/superpowers/specs/2026-11-10-history-phase-1-design.md`

## Global Constraints

- The public UI remains Simplified Chinese and uses “全台”, “县市议员”, “乡镇市区长”, and “少数民族”.
- Official winner markers are authoritative; the site must not infer winners when the source has no official mark.
- County/city-chief township maps say “得票领先”, never “当选”.
- Councillor “all identities” summaries must not calculate one combined turnout across overlapping electorates.
- Councillor result maps use neutral district fills and party/seat-count badges, with complete composition in tooltip and tables.
- Existing prediction, free-colouring, local save files, history access gate, party colours/logos, SVG/PNG export, and CSV protection must remain compatible.
- No new runtime framework or server is introduced.

## Review Focus

- Missing or partially downloaded 2022 source files must fail the build without overwriting the last valid asset (Task 1 test).
- Official winner marks `＊`, `！`, and `？` must survive normalization without silently converting uncertain results to winners (Task 1 test).
- Councillor all-identity mode must show three separate turnout summaries and never double-count overlapping electorates (Task 3 test).
- A district with many parties, a tie in seat counts, or too little label space must retain a readable, keyboard-accessible badge/index fallback (Task 4 test).
- Entering and leaving history mode, including failed history loading, must preserve prediction/free-colouring state and locally saved projects (Task 6 test).

---

## File Structure

- `scripts/build_history_2022.py`: download, normalize, validate, and publish the version-2 2022 snapshot plus provenance.
- `sources/history-2022-manifest.json`: source URLs, filenames, hashes, fetch date, and builder schema version.
- `assets/history-2022.json`: compact runtime asset containing elections, contests, candidacies, and compatibility rows.
- `history-core.js`: pure identifiers, normalization, grouping, turnout, winner, seat, and export helpers.
- `history-workspace.js`: generic history state, filters, three content views, summaries, tables, and event binding.
- `history-2022.js`: 2022 asset loading, geography joins, map paint/detail adapter, and legacy bridge.
- `index.html`: history filters, view switcher, summary containers, dialog metadata, and script loading order.
- `style.css`: unified history workspace, summary cards, seat badges, responsive tables, and accessibility states.
- `app.js`: shared SVG label/badge hooks, export readiness, and state-preserving workspace integration only.
- `export-ui.js`: historical filename/metadata and compact result-table export integration.
- `tests/history-model.test.cjs`: schema, validation, aggregation, official marker, turnout, and seat tests.
- `tests/history-workspace.test.cjs`: DOM contract and state/filter option tests.
- `tests/history-geography.test.cjs`: 2022 geometry joins and badge fallback tests.
- `tests/browser-smoke.mjs`: end-to-end history navigation, map, table, access, export, and state preservation.
- `test-ui-contract.cjs`: script order, unique IDs, terminology, and compatibility contracts.

### Task 1: Versioned 2022 History Snapshot

**Files:**
- Modify: `scripts/build_history_2022.py`
- Create: `sources/history-2022-manifest.json`
- Modify: `assets/history-2022.json` (generated)
- Create: `tests/history-model.test.cjs`
- Modify: `requirements-build.txt` only if an already-used dependency is missing

**Interfaces:**
- Produces: snapshot object `{schemaVersion:2, elections:Election[], contests:Contest[], candidacies:Candidacy[], rows:LegacyRow[], provenance:Provenance}`.
- Produces: stable IDs `election_id`, `contest_id`, `candidacy_id`; nullable `candidate_id`.
- Produces: official marker enum `'' | '*' | '!' | '?'` while retaining `elected_official:boolean`.

- [ ] **Step 1: Add failing builder/model tests**

Test `build_history_2022.py` fixture input for stable IDs, original/normalized names, turnout fields, official markers, completeness failure, and no partial output overwrite. Assert councillor metadata remains 215 districts and 910 seats.

- [ ] **Step 2: Run the tests and confirm the v1 snapshot fails them**

Run: `node --test tests/history-model.test.cjs`
Expected: FAIL because schema version 2 and normalized entities do not exist.

- [ ] **Step 3: Refactor the builder into fetch, normalize, validate, and atomic publish functions**

Add exact Python interfaces:

- `normalize_files(files: list[SourceFile]) -> Snapshot`
- `validate_snapshot(snapshot: dict) -> None`
- `write_snapshot_atomic(snapshot: dict, output: Path) -> None`
- `write_manifest_atomic(manifest: dict, output: Path) -> None`

Preserve compatibility `rows` until all UI consumers migrate. Store source hashes and official field names in the manifest.

- [ ] **Step 4: Generate and validate the new asset**

Run: `python3 scripts/build_history_2022.py`
Expected: publishes schema v2 only after every source and invariant passes.

- [ ] **Step 5: Run model and existing import/geography tests**

Run: `node --test tests/history-model.test.cjs tests/history-import.test.cjs tests/history-geography.test.cjs`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add scripts/build_history_2022.py sources/history-2022-manifest.json assets/history-2022.json tests/history-model.test.cjs requirements-build.txt
git commit -m "feat: add versioned 2022 history snapshot"
```

### Task 2: Pure Historical Aggregation Model

**Files:**
- Modify: `history-core.js`
- Modify: `tests/history-model.test.cjs`

**Interfaces:**
- Consumes: Task 1 `Snapshot`, `Election`, `Contest`, and `Candidacy`.
- Produces: `HistoryCore.index(snapshot) -> HistoryIndex`.
- Produces: `HistoryCore.filter(index, selection) -> HistoryResult`.
- Produces: `HistoryCore.contestSummary(contest, candidacies) -> ContestSummary`.
- Produces: `HistoryCore.overview(result) -> Overview` with `turnoutGroups` separated by electorate.
- Produces: `HistoryCore.councilBadges(contestSummary) -> SeatBadgeItem[]`.

- [ ] **Step 1: Add failing pure-function tests**

Cover single-seat leader/margin, township “leader not elected”, councillor seat composition, official women-priority marker, tied party seat counts, absent turnout, separate electorate summaries, stable-ID geography joins, and CSV formula protection.

- [ ] **Step 2: Run the tests and confirm the helpers are missing**

Run: `node --test tests/history-model.test.cjs`
Expected: FAIL on missing `index`, `filter`, `contestSummary`, `overview`, or `councilBadges`.

- [ ] **Step 3: Implement the pure APIs in `history-core.js`**

Keep existing `identity`, `districtNumber`, `key`, `sameScope`, `csv`, and `mergePaths` signatures compatible.

- [ ] **Step 4: Run the model tests**

Run: `node --test tests/history-model.test.cjs tests/history-import.test.cjs tests/history-geography.test.cjs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add history-core.js tests/history-model.test.cjs tests/history-import.test.cjs tests/history-geography.test.cjs
git commit -m "feat: add historical result aggregation model"
```

### Task 3: Unified History Workspace and Three Views

**Files:**
- Create: `history-workspace.js`
- Modify: `history-2022.js`
- Modify: `index.html`
- Modify: `style.css`
- Create: `tests/history-workspace.test.cjs`
- Modify: `test-ui-contract.cjs`

**Interfaces:**
- Consumes: `HistoryCore.index/filter/overview` from Task 2.
- Produces: `window.HistoryWorkspace.activate(initialSelection?)`, `deactivate()`, `selection()`, `render()`, and `openContest(contestId)`.
- Emits: `historyselectionchange` CustomEvent with normalized selection.
- Keeps: `window.History2022` compatibility methods used by the map.

- [ ] **Step 1: Add failing DOM and state tests**

Assert unique controls for year, office, electorate, county, level, metric, candidate/party; assert view buttons “结果地图 / 候选人结果 / 选举概况”; assert invalid combinations normalize; assert councillor all-mode produces three separate overview cards and no combined turnout.

- [ ] **Step 2: Run contract tests and confirm failure**

Run: `node --test tests/history-workspace.test.cjs test-ui-contract.cjs`
Expected: FAIL because the generic workspace and view controls do not exist.

- [ ] **Step 3: Add the history workspace markup and styles**

Keep the left filter hierarchy; put view switcher and result panels beneath the map. Add live regions for load/error/coverage status and a retry control.

- [ ] **Step 4: Implement normalized state and view rendering**

Move generic filter/search/table/overview behavior from `history-2022.js` into `history-workspace.js`. Keep 2022-specific geometry and loading in `history-2022.js`.

- [ ] **Step 5: Run workspace and contract tests**

Run: `node --test tests/history-workspace.test.cjs test-ui-contract.cjs`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add history-workspace.js history-2022.js index.html style.css tests/history-workspace.test.cjs test-ui-contract.cjs
git commit -m "feat: add unified historical election workspace"
```

### Task 4: Historical Map Metrics and Councillor Seat Badges

**Files:**
- Modify: `history-2022.js`
- Modify: `app.js`
- Modify: `style.css`
- Modify: `tests/history-geography.test.cjs`
- Modify: `tests/history-workspace.test.cjs`
- Modify: `tests/browser-smoke.mjs`

**Interfaces:**
- Consumes: Task 2 `HistoryResult`, `ContestSummary`, and `SeatBadgeItem[]`.
- Produces: `History2022.featurePresentation(feature) -> {fill, ariaLabel, tooltip, badgeItems}`.
- Produces: SVG groups `#historySeatBadges` and `#historySeatBadgeLeaders`.

- [ ] **Step 1: Add failing map presentation tests**

Assert county-chief default is party colour plus lead-margin tone; township detail says “得票领先”; turnout/share/vote metrics use the chosen candidate; councillor districts have neutral fill; badges show every winning party and seat count; crowded districts fall back to numbered/indexed badges with leader lines and keyboard labels.

- [ ] **Step 2: Run the targeted tests**

Run: `node --test tests/history-geography.test.cjs tests/history-workspace.test.cjs`
Expected: FAIL on neutral fill and missing badge groups/presentation.

- [ ] **Step 3: Implement map presentation and SVG badges**

Reuse existing label layout, number-key, party logo, and leader-line helpers. Do not encode councillor composition using dominant-party fill. Add badge collision fallback without changing prediction map labels.

- [ ] **Step 4: Add a Playwright history-map flow**

Open each election category and identity, verify expected region count, neutral councillor fills, badge text/ARIA, tooltip composition, and township leader wording at desktop and narrow viewport sizes.

- [ ] **Step 5: Run unit and browser tests**

Run: `node --test tests/history-geography.test.cjs tests/history-workspace.test.cjs`
Expected: PASS.

Run with local server: `python3 -m http.server 8765` then `MAP_TEST_URL=http://127.0.0.1:8765/ node --test tests/browser-smoke.mjs --test-name-pattern="history|Historical|councillor"`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add history-2022.js app.js style.css tests/history-geography.test.cjs tests/history-workspace.test.cjs tests/browser-smoke.mjs
git commit -m "feat: add historical map metrics and seat badges"
```

### Task 5: Candidate Results, Election Overview, and Drill-down

**Files:**
- Modify: `history-workspace.js`
- Modify: `history-2022.js`
- Modify: `index.html`
- Modify: `style.css`
- Modify: `tests/history-workspace.test.cjs`
- Modify: `tests/browser-smoke.mjs`

**Interfaces:**
- Consumes: Task 2 `HistoryResult` and `Overview`.
- Produces: candidate results table with official mark image only.
- Produces: separate overview cards by electorate plus source/boundary/coverage notes.
- Produces: contest dialog summary and `openCountyTownView(countyId)`.

- [ ] **Step 1: Add failing candidate and overview tests**

Assert complete columns, image-only winner marks, blank non-winner cells, number/vote sorting, search, party filtering, turnout/effective/invalid ballots, gender/incumbency composition, coverage notes, comparison visibility rules, and explicit back navigation.

- [ ] **Step 2: Run tests and confirm missing behavior**

Run: `node --test tests/history-workspace.test.cjs`
Expected: FAIL on overview, sorting/filtering, and drill-down assertions.

- [ ] **Step 3: Implement candidate result and overview views**

Use stable candidate/contest IDs for DOM keys. Preserve original source terminology only inside provenance/source notes; all visible primary labels use the normalized Simplified Chinese terms.

- [ ] **Step 4: Implement contest dialog and county-to-town drill-down**

Add contest voting summary, complete candidate table, “查看乡镇市区分布”, “返回全台”, and “返回上一级” controls with focus restoration.

- [ ] **Step 5: Run browser flows**

Run with local server: `MAP_TEST_URL=http://127.0.0.1:8765/ node --test tests/browser-smoke.mjs --test-name-pattern="history|Historical"`
Expected: PASS at desktop and mobile viewports.

- [ ] **Step 6: Commit**

```bash
git add history-workspace.js history-2022.js index.html style.css tests/history-workspace.test.cjs tests/browser-smoke.mjs
git commit -m "feat: add historical results and overview views"
```

### Task 6: Historical Export, Compatibility, and Access Gate

**Files:**
- Modify: `export-ui.js`
- Modify: `app.js`
- Modify: `history-access.js`
- Modify: `workspace-categories.js`
- Modify: `history-workspace.js`
- Modify: `index.html`
- Modify: `tests/browser-smoke.mjs`
- Modify: `test-ui-contract.cjs`

**Interfaces:**
- Consumes: Task 3 selection and Task 5 visible result rows.
- Produces: export filename `2022-<类别>-<范围>-<指标>.<ext>`.
- Produces: CSV with both normalized labels and original official labels.
- Preserves: existing history owner token, project JSON schema, predictions, local predictions, fills, palette, and export settings.

- [ ] **Step 1: Add failing export/state/access tests**

Assert PNG/SVG titles contain year/category/scope/metric, councillor badge composition appears in SVG, compact tables use winner image, CSV contains normalized and official names, unauthorized users see only the development dialog, and history round-trips do not mutate prediction/free-colouring state.

- [ ] **Step 2: Run targeted tests and confirm failure**

Run: `node --test test-ui-contract.cjs`
Expected: FAIL on new export naming/metadata contracts.

- [ ] **Step 3: Implement historical export adapters**

Reuse existing compact export layout and elected-mark asset. Wait for lazy history geometry, party logos, and badge layout before PNG/SVG capture.

- [ ] **Step 4: Implement compatibility and access checks**

Version only history selection state; do not change the existing project-save version unless migration is required. On load failure, show retry and leave all user-created state intact.

- [ ] **Step 5: Run export/access/state browser tests**

Run with local server: `MAP_TEST_URL=http://127.0.0.1:8765/ node --test tests/browser-smoke.mjs --test-name-pattern="history|Historical|export|access|preserve"`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add export-ui.js app.js history-access.js workspace-categories.js history-workspace.js index.html tests/browser-smoke.mjs test-ui-contract.cjs
git commit -m "feat: complete historical export and compatibility"
```

### Task 7: Full Verification, Visual QA, and Release

**Files:**
- Modify: `README.md`
- Modify: `WORK_PROGRESS.md`
- Modify: cache-busting query strings in `index.html`
- Modify: tests or implementation files only for defects found during verification

**Interfaces:**
- Consumes: all prior tasks.
- Produces: a release-ready static site commit with documented data sources and verified public access behavior.

- [ ] **Step 1: Run all non-browser tests**

Run: `node --test tests/*.test.cjs test-ui-contract.cjs`
Expected: all tests PASS.

Run: `python3 -m unittest test_boundary_geometry.py`
Expected: PASS.

- [ ] **Step 2: Run the complete browser suite**

Start: `python3 -m http.server 8765`

Run: `MAP_TEST_URL=http://127.0.0.1:8765/ node --test tests/browser-smoke.mjs`
Expected: all tests PASS with no page exceptions.

- [ ] **Step 3: Perform visual QA**

Inspect desktop and mobile for all three categories, all councillor identities, full-island and county scopes, all metrics, table overflow, badge collision/index fallback, dialog focus, exports, load/retry, and unauthorized access.

- [ ] **Step 4: Verify data invariants and generated artifacts**

Run: `python3 scripts/build_history_2022.py --verify-existing`
Expected: hashes, source count, contest totals, seat totals, vote totals, and geometry joins all PASS without changing files.

- [ ] **Step 5: Update documentation and cache versions**

Document the unified history workspace, 2022 coverage, source/licence, terminology, owner-only development status, and known first-stage limits.

- [ ] **Step 6: Commit the release candidate**

```bash
git add README.md WORK_PROGRESS.md index.html
git commit -m "docs: prepare unified history workspace release"
```

- [ ] **Step 7: Push only after final branch review**

Push `main` to `origin`, wait for GitHub Pages deployment, then verify the live site in a fresh unauthorized session and in the authorized owner session.

