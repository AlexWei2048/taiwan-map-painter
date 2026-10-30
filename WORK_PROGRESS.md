# Taiwan map workbench progress

Latest working tree: GitHub Pages repository in this directory, based on 390e9582a84e04ce43f2d32782936946815f292e. Do not restore earlier source over this working tree.

## Completed and checked before interruption
- Workbench restructuring; prediction-first entry, compact manual brushes, one legend editor, shared forecast data for numeric coloring, coordinated candidate lookup, toolbar menus and right-side prediction drawer.
- Council districts grouped within their county, all three identities included in lists and progress; geometry layers stay separate because identity boundaries overlap.
- Searchable/exportable reference tables for 221 council districts and 75 legislative districts; nationwide legislative indigenous seats remain two districts, three seats each.
- Complete boundary overlay geometry preserved.
- 32 calculation, migration and metadata checks passed. County council totals matched the uploaded August 20 announcement.
- Browser checks passed for Taipei's eight council districts, indigenous prediction entry, shared vote-to-color display, coordinated lookup and legislative reference table.

## In progress
Latest runtime asset revision: 20261029-workspace-v4.
- Offline root cause confirmed in browser: predictionUsesGradient referenced before workspace-ui.js loads. Embedded-map initialization now waits for DOMContentLoaded. Browser verified error panel hidden, all 22 map paths rendered, prediction drawer usable.
- Ballot sorting implemented centrally in directoryCandidates: positive integer ballot numbers ascending, unconfirmed numbers last, stable ties; IDs and original data untouched. Focused checks passed: all 447 district rosters retain their candidate IDs and are sorted numerically; browser shows Taipei mayor numbers 1–6.

## Pending
- Publication is authorized; browser GitHub upload session is signed in. No new permission question is required.
- Candidate CSV numeric order verified; PNG (2400×1980) and scheme JSON downloaded and parsed. SVG serialization exercised successfully by PNG export; direct SVG click shows success without browser download event. Attachment MIME experiment made no difference and was reverted; original SVG download behavior retained.
- Rebuild offline.html and source.zip from current sources, then publish to original GitHub Pages repository and verify deployed UI.
- Save final screenshot and record final deployed commit and check results here.

## Source locations
- Runtime source: this directory (flat GitHub Pages layout).
- Full source/package build: ../build-source (runtime files in dist/).
- Preview staging: ../preview-stage/dist/.
- User's district announcement: ../project_sources/01-1153150253-.pdf.
- Known preview route: use the exact URL returned by sites-preview start ../preview-stage.
- Terminal GitHub read works; write credentials were unavailable. Authenticated GitHub browser upload was available before interruption; no upload/commit had been performed.

## Decisions
- Preserve existing plans and local scenario data; no generated predictions ship with source.
- Keep cross-district reservation wording from the announcement; do not add it once per district.
- Legislative reference remains the 2024 geography; do not add 2026 local candidates as legislative candidates.
- Historical election module is reserved for later, not implemented in this task.

## Publication checkpoint
- Runtime revision: 20261029-workspace-v4.
- Published source commit: d858d6368d70ff582916a1a8a5c0fb01cfaba9d2.
- GitHub Pages run: 40906339854, awaiting final live verification.
- All 10 published files compared byte-for-byte with checked local sources.
- Remaining: confirm deployment completion, inspect live table and ballot order, save final screenshot.

## Final verification
- Pages deployment #27 completed successfully (31 seconds) for d858d6368d70ff582916a1a8a5c0fb01cfaba9d2.
- Live URL: https://alexwei2048.github.io/taiwan-map-painter/
- Live revision v4 confirmed, map error hidden, Taipei council dropdown and table both contain 8 districts.
- Live Taipei first district candidate rows verified in numeric order 1–20.
- Online SVG downloaded successfully and parsed as SVG; this resolves the earlier offline-browser download-event verification gap.
- Previously completed checks preserved; two new sorting checks passed. No user forecast values are included in deployed files.
- Remaining: final screenshot and handoff.

## Final task state
Completed: source edits, offline initialization repair, ballot sorting, original URL publication, live verification, screenshot.
In progress: none.
Pending: none for this request. Historical election module remains a separate future feature.
Latest verified runtime: 20261029-workspace-v4, public commit d858d6368d70ff582916a1a8a5c0fb01cfaba9d2.
Screenshot: /workspace/scratch/taiwan-map-workbench-live-1793289527691.jpg.
Next action: respond with the original live URL and concise change summary.

# 2026-10-30 township prediction extension
Completed baseline: published v4 (d858d63), preserve all prior changes.
In progress: mayor township winner/vote forecasts; council township vote forecasts; public ballot-number audit (325 pending across 13 office/county groups).
Design: separate local estimates from district winner choices; town ID plus district ID identifies council subarea, so split towns and indigenous electorates cannot mix candidate lists. Percentages do not auto-sum across towns; only complete local vote counts may be aggregated on explicit request.
Pending: local-data migration/CSV tests, browser QA, refreshed offline/source archive and publish.
Research sidecars write ballot-research-east.json and ballot-research-west.json outside runtime.

## Township extension implementation checkpoint
Completed: 221 council districts mapped to township subareas (split towns clipped only to relevant district); mayor local winners and candidate vote/share maps; council local votes/shares including indigenous districts; separate records and JSON migration; stable-ID CSV template/import/export; explicit full-vote aggregation preserving district winner decisions.
Completed ballot audit: 199 of 325 pending resolved; remaining126 (Changhua council1; township Kaohsiung6/Hsinchu1/Miaoli28/Nantou12/Pingtung62/Kinmen16). Two name conflicts retained pending. Source evidence and attempts preserved in source package; no guessed ballot slots or old-election numbers.
Validation:27 relevant automated checks passed. Browser: mayor vote-derived65.93% local lead, partial council candidate12%, JSON refresh display restoration, Hsinchu split scope, localCSV imported6 candidate rows then aggregation100–600 counts preserved with zero district winners, indigenous7-town district, offline feature initialization. Test data lives only in preview browser, never source.
Latest files:20261030-town-v5; baseline public commit d858d63 retained. In progress: regenerate source/offline artifacts and publish; pending: live deployment check and screenshot.

Publication: ballot commit60a7e7be8d44461982f7d5c187a84a631800595a; feature commit6417c543bf9d04465ebae40546adcf971fbb01e0. All12 changed public files compared byte-for-byte with tested local files. GitHub Pages run40913205128 (#29), awaiting live QA. Remaining: live feature check and screenshot only.

Live QA follow-up: local drawer inherited global dialog max-width380px and generic flex wrapper. Fixed with explicit max-width:none, block table wrapper and readable minimum column widths. Revisionv5.1 CSS cache key; regenerating offline/source and publishing4 updated files before final screenshot.

Final layout follow-up published6c5ca797fb24dbd1d9ed912a39d29f533f1aad74. Page run40913755211 (#30). Preview screenshot confirms readable850px drawer, complete horizontal candidate/party/vote/share columns; no additional logic changes. Remaining: final livev5.1 stylesheet/screenshot only.

## Final township task state
Completed: county/city mayor township winner + votes/shares; council township votes/shares; candidate-specific shading; split-town and indigenous electorate handling; independent plans/CSV + explicit complete-vote aggregation;199 verified ballot numbers added and126 pending filter/download; refreshed offline/source archives;27 automated checks; preview and live browser QA.
Published latest6c5ca797fb24dbd1d9ed912a39d29f533f1aad74 (feature6417c54, ballots60a7e7b). GitHub Pages run40913755211 succeeded30s. All changed public files match local checked bytes. Live CSSv5.1 confirmed and drawer width850px verified.
Final screenshot:/workspace/scratch/taiwan-town-prediction-final-20261029.jpg.
In progress:none. Pending:none for this request.126 ballot numbers remain explicitly unresolved due unavailable reliable2026 sources or two name conflicts. Historical elections remain future work.
Next:handoff original URL with feature entry and199/126 audit result; preserve current files for continuation.

# 2026-10-30 user-specified emblem and Wikipedia ballot supplement
Baseline remote6c5ca79; local67ae21f. Inspect fresh assets, preserve township functionality.
Completed: uploaded SDP image inspected and bundled as sdp emblem; exact-scope/name comparisons of221 council and117 township tables;55 pending numbers identified (council1/township54),71 remain (Kaohsiung6,Hsinchu1,Miaoli2,Pingtung62). Six existing-number conflicts across Tianwei/Yuanchang/Nan'ao identified; official Tianwei preserved, four third-party comparisons under bounded research. Name differences: Hong健/建, Yang士/仕 retained explicitly.
In progress: source-conflict verification, browser QA, offline/source refresh and publication.
Pending: final complete71-name list and name-difference explanation; avoid assuming table ordering is ballot number.

Research completed:4 previously secondary-source numbers upgraded to officialPDF evidence; all6 Wiki/official discrepancies support originalnumbers (Tianwei Xu2/Liu1,Yuanchang Chen2/Li1,Nan'ao You3/Jiang1). Preserve official numbers, document6 comparisons. Reproducible supplementary helper + input snapshots + officialPDFs saved in source.
Browser: fresh v6 directory shows uploaded SDP logo for Miao15 and audit55/71. Numeric audit tests8passed. In progress: regenerate offline/source and publish assets+runtime; pending live proof and complete71-name handoff.

Publication checkpoint:asset commitb8dff26e756f313edabef6335233863f98212c25; runtime9d701d22afc12a5aaa909da6d1c7f23fc1d25a85. All9 changed files compared toorigin/main byte-for-byte. Pages#32 run40917875565 in progress. Remaining:livev6 emblem/audit/count proof then final71-name table; no further implementation pending.

## Final user-specified ballot/emblem task state
Completed:SDP user image bundled and online;55 new ballot numbers (1council+54township);all1492 council numbers filled;71township pending listed individually in webpage/download (Kaohsiung6/Hsinchu1/Miaoli2/Pingtung62). Six Wikipedia reversals checked against115officialPDFs and originalnumbers retained; four oldsecondarysources upgradedtoofficial. Two name differences documented:Hong健/建 now9perexactWikiuserreference;Yang士/仕 stillpending.
Latest public9d701d22afc12a5aaa909da6d1c7f23fc1d25a85;assetb8dff26e756f313edabef6335233863f98212c25;revision20261030-ballots-v6. All9 changed publicfiles matchtestedlocal;Pages#32run40917875565 success34s. Liveconfirmed councilpending0,townshippending71,SDProseonMiao15. Offlinesamechecks;8targetedaudittests passed;sourcearchiveincludesoriginalupload,snapshotsandofficialproofs.
In progress:none.Pending:noneforrequestedchanges;71numbers remainexplicitlyunknown underavailable2026sources. Finalhandoffmustincludeall71namesandtwoexactnamevariants.
Proof:/workspace/scratch/taiwan-sdp-ballot-update-20261030.jpg.

# 2026-10-30 candidate party-column alignment
Completed locally: candidate party cells now always reserve a fixed20px emblem slot, followed by the existing6px color marker and party name. Rows without an emblem keep an empty slot, so emblems, color markers and names align vertically without adding visual placeholders. Existing party data, colors, emblems and forecast behavior are unchanged. Cache key updated only for candidate-directory.js. Validation:44 automated tests passed, including a new fixed-slot regression test; browser geometry confirmed identical slot/bar/name x positions for rows with and without emblems; desktop preview visually verified. Refreshed offline.html and source.zip.
Published: runtime commit42958236aca0be8292f5704b560737bf6c05566f. GitHub Pages#33 run40995385126 succeeded30s. All four public files match tested local bytes. Live geometry verified on12 Taipei council rows: rows with/without emblems share slotX598.15625, slotW20, barX625.15625 and nameX638.15625. Final live screenshot:/workspace/scratch/taiwan-party-alignment-live-20261030.jpg. In progress:none. Pending:none for this request.

# 2026-10-30 manual party manager
Completed: official Judicial Reform Party emblem saved and bundled; official charter has no specified party color, so the site uses emblem-derived blue #549DBF with an explicit non-official-color notice. Default 15-party order matches the requested legend, with Judicial Reform Party after SDP and Other Parties before Nonpartisan. Manual list now owns drag/keyboard reorder, visible delete, preset add and custom add; duplicate ordering controls were removed from the legend dialog and party creation was removed from Appearance & Tools. 46 automated tests pass; browser QA verified initial ordering, fixed logo/color alignment, keyboard reorder, preset add, custom form and deduplicated legend controls. Offline HTML and source archive regenerated.
In progress: stage tested runtime files for GitHub upload.
Pending: request confirmation immediately before the assets and root commits, then verify Pages deployment and live UI.
Latest source revision: 20261030-no-offline-v11.

## 2026-10-30 offline feature removal

- Removed the “下载离线版” entry from the export menu.
- Removed `offline.html` and its generator from the distributable project.
- Source packaging and regeneration instructions no longer include the offline build step.

## 2026-10-30 prediction legend filtering

- Prediction maps now always restrict the legend to parties represented by the current prediction display.
- Parties with no predicted winner or current displayed prediction result no longer occupy legend rows, independently of the general “only used” legend preference.

## 2026-10-30 initial legend cleanup

- Removed automatic insertion of every minor candidate party into the initial manual-color list and legend.
- Minor parties are added only after a saved district or township prediction actually references one of their candidates.
- Added a one-time palette migration that removes previously auto-injected, unused candidate parties while retaining default parties, user-added parties, custom parties, and linked colors.
- Widened the exported/map legend to keep the default party names on one line.
