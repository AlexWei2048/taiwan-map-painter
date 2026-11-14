# Legislative History Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add complete 1992—2024 legislative election history with era-correct ballot semantics and geographic views.

**Architecture:** Build one validated JSON shard per year from source-indexed CSVs, expose it through a small loader, and extend the existing history workspace rather than creating a parallel UI. Keep election semantics in a focused legislative model so pre-/post-2008 rendering rules remain testable.

**Tech Stack:** Python data builder, JSON assets, vanilla JavaScript/SVG, Node tests, GitHub Pages.

**Spec:** `docs/superpowers/specs/2026-11-14-legislative-history-design.md`

## Global Constraints

- Preserve historical names and source attribution.
- 1992—2004 derived list allocation votes must never be labeled as a separate party ballot.
- Never manufacture geographic detail absent from source data.
- Include Kinmen and Matsu in nationwide views.

## Review Focus

- Switching across 2004/2008 must change ballot wording and rendering mode.
- Multi-seat regional races must show every elected party badge without duplicate candidates.
- Indigenous and party/list results must aggregate exactly from town to county to nationwide totals.
- Historical counties must not disappear after modern county consolidation.
- Missing 1992 fine-grain data must degrade to district level without exceptions.

---

### Task 1: Source builder and validation

**Files:** Create `scripts/build_history_legislative.py`, `tests/test_history_legislative_builder.py`, generated `assets/history-legislative-*.json`, `sources/history-legislative-manifest.json`.

- [ ] Write failing tests for year coverage, ballot types, winner markers, aggregation identities and pre-2008 derived-vote labeling.
- [ ] Implement the indexed CSV downloader/parser and per-year snapshot builder.
- [ ] Run builder tests and source-total validation.
- [ ] Commit the builder, shards and manifest.

### Task 2: Legislative history model

**Files:** Create `history-legislative.js`, modify `history-workspace.js`, test `tests/history-legislative.test.cjs`.

- [ ] Write failing tests for available years, electorates, levels, single-seat fills and multi-seat badges.
- [ ] Implement loader/model adapters and wire them into existing history selection and export models.
- [ ] Run model tests.
- [ ] Commit model changes.

### Task 3: Controls, map rendering and details

**Files:** Modify `index.html`, `history-workspace.js`, `app.js`, `style.css`, `test-ui-contract.cjs`.

- [ ] Add failing UI contract assertions for the office, ballots, dynamic levels and explanatory copy.
- [ ] Add controls and render single-seat fills, multi-seat badges and three-level list/indigenous results.
- [ ] Update detail tables, overview scopes, legends, titles and exports.
- [ ] Run UI contract tests.
- [ ] Commit UI changes.

### Task 4: Full verification and publication

**Files:** Modify `README.md`, `WORK_PROGRESS.md` and cache-busting asset versions.

- [ ] Document coverage, sources, caveats and data refresh command.
- [ ] Run Python, Node, geometry and browser smoke suites.
- [ ] Inspect representative years 1992, 2004, 2008 and 2024 in desktop and narrow layouts.
- [ ] Commit, push `main`, confirm GitHub Pages deployment and live smoke checks.

