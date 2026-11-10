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

## 2026-10-30 combined electorate panels and used-only legends

- Runtime revision: `20261030-combined-electorates-v12`.
- Prediction and free-color legends now always include only parties actually represented in the current map; the redundant “优先显示已使用类别” control was removed.
- Council and legislative district maps render regional, plains Indigenous and mountain Indigenous electorates as three side-by-side panels inside one SVG, at the same geographic scale and with one shared legend.
- Panel titles, district counts, complete county/town boundary overlays, interactions, prediction fills and SVG/PNG export are preserved across all three panels. Empty county-specific identity panels state that the current scope has no such district.
- The former electorate switch is hidden but its saved state remains accepted for backward-compatible project imports.
- Validation: 52 automated checks pass; browser QA verified the nationwide council three-panel layout and a free-color map whose shared legend contained only the one party actually used.
- In progress: refresh `source.zip`, publish the tested runtime files, verify the Pages deployment and live page.

## 2026-10-30 prediction legend filtering

- Prediction maps now always restrict the legend to parties represented by the current prediction display.
- Parties with no predicted winner or current displayed prediction result no longer occupy legend rows, independently of the general “only used” legend preference.

## 2026-10-30 initial legend cleanup

- Removed automatic insertion of every minor candidate party into the initial manual-color list and legend.
- Minor parties are added only after a saved district or township prediction actually references one of their candidates.
- Added a one-time palette migration that removes previously auto-injected, unused candidate parties while retaining default parties, user-added parties, custom parties, and linked colors.
- Widened the exported/map legend to keep the default party names on one line.

## 2026-10-30 export controls, terminology and readability (v14)

- Baseline preserved from public commit `d476f600d18fbb4ba41eaf06bb152ecf41707935`; no earlier runtime files were restored.
- Exported PNG/SVG can include a prediction-winner table (enabled by default) and a user-entered annotation; both settings persist in saved projects. The winner table lists district, ballot number, candidate and party and adapts from one to four columns.
- County/city mayor and township chief prediction legends show candidate name plus party. County/city mayor township-detail legends count municipalities and provincial cities by `区`, and counties by `乡镇市`.
- Switching between candidate prediction and manual party coloring preserves `乡镇市区明细`; changing election office still returns to the district overview.
- Map labels suppress `乌坵`; the geographic inset remains. Static and generated interface text uses `少数民族`, `立法机构民代` and `2026年` terminology.
- Export labels are `导出图片 PNG` and `导出矢量图 SVG`. The page footer now shows `Developed by Alex Wei` and `更新日期：2026年10月30日`; source-download and MIT-license links are absent from the page.
- Interface typography and export-menu spacing were enlarged with desktop/mobile wrapping safeguards. Dead offline functionality remains removed.
- Validation: six JavaScript syntax checks and 55 automated regression tests pass. Local cloud-browser preview was unavailable because that browser cannot reach the workspace loopback server; final visual QA must be performed on the deployed GitHub Pages revision.
- Latest runtime/cache revision: `20261030-export-options-v14`.
- In progress: regenerate `source.zip`, stage only changed runtime files, publish to the original GitHub Pages repository, then verify the live layout and export controls.

### Final v14 publication state

- Published public commit: `5df32fb37e059716a2f1748d9df8b1870d2a8c3f` (`Improve prediction exports and terminology`). All 11 uploaded files match the tested staging hashes.
- GitHub Pages workflow run `41045604674` (#40) completed successfully in 29 seconds.
- Live QA passed: enlarged desktop layout has no visible overlap; export menu shows the default-on winner-table option, annotation field, PNG label and SVG-vector label; signature/date and normalized terminology are visible; `乌坵` is not rendered on the map.
- Detail preservation passed live: switching from `乡镇市区明细` to manual party coloring and back retained the detail level and Taipei scope.
- Candidate legends passed live: Taipei mayor local prediction displayed `蒋万安 · 中国国民党（1区）`; district prediction displayed `蒋万安 · 中国国民党`.
- Export passed live: annotated SVG contained the prediction table and all four requested fields; disabling the table removed it while retaining the annotation; PNG rendered at 2400×2398 with the annotation, map, candidate-party legend and one-row winner table without overlap.
- Final screenshot: `/workspace/scratch/taiwan-map-v14-live-1793358649084.jpg`.
- In progress: none. Pending: none for this request. Historical election visualization remains a future module.

## 2026-10-30 export clarity, council export layouts and four legislative categories (v15)

- PNG export rasterization increased from 2× to 3× (3600 px base width) with high-quality smoothing; SVG remains the editable vector option.
- Council exports now offer four scopes: all three maps, regional only, plains minority only, or mountain minority only. Export rendering temporarily forces the matching used-party legend and always includes the scale bar and north arrow without changing the user's on-screen legend setting.
- Free-color legislative maps now show four categories: regional, party-list, plains minority and mountain minority. The latter three use independent township/district fill stores, so the same township can be colored differently in each category; all four panels share one used-party legend.
- Removed “全国” from the legislative map note and updated the scope explanation and reference note.
- Candidate-directory sticky filters now use an opaque overscan header at the top of the scrolling dialog, preventing candidate rows from peeking through above the filters.
- Project migration preserves the three new legislative township fill stores and the selected council export scope; reset and party deletion also clean the new stores.
- Validation: 58 automated tests pass. Browser preview verified 73 regional paths plus 368 township paths in each of the other three legislative panels, independent coloring and persistence after reload, a one-party shared legend, candidate-dialog scrolling, council single-map export, and successful 3× PNG download.
- Latest runtime/cache revision: `20261030-export-layout-v15`.
- Published public commit: `2891d930dae8ce001971aded7413e15d328c74cd` (`Improve map exports and legislative coloring`).
- GitHub Pages workflow run `41085276149` (#42) completed successfully.
- Live QA passed: legislative free-color maps render regional (73 paths), party-list (368 township/district paths), plains minority (368) and mountain minority (368) as four independently colorable panels with one used-party legend; the page note contains no `全国` wording.
- Council export menu passed live with all-three, regional-only, plains-minority-only and mountain-minority-only choices. Single-map SVG and 3× PNG exports completed successfully with the matching legend, scale bar and north arrow.
- Candidate-directory sticky filters passed live with an opaque overscan header; scrolled candidate content no longer shows above the filter area.
- Final screenshot: `/workspace/scratch/taiwan-map-v15-live.jpg`.
- In progress: none. Pending: none for this request.

## 2026-10-31 mayor party legends and complete winner tables (v16)

- Baseline: deployed public commit `2891d930dae8ce001971aded7413e15d328c74cd`; retained v15 export scopes, map furniture, three-times PNG rendering, and independent legislative fills.
- County/city mayor legends aggregate parties and seats in district overview, including vote-gradient displays; township-detail legends retain the correct `区` / `乡镇市` unit. Township-chief candidate/party legends remain available.
- Exported winner rows include district, ballot number, candidate name, gender, party with embedded emblem, and tri-state incumbent status (`是` / `否` / `待核`).
- Column widths depend on the actual contents, centered short fields have fixed widths, and long names/party names wrap completely without ellipses. Latin words stay together where possible. Multiple-block large tables expand the export canvas rather than shrinking text.
- Forecast legends also retain represented parties missing from an imported project's palette, without adding unused parties to the initial palette.
- Validation: browser PNG exports succeeded for 22 county/city mayors (3600 × 5801) and 61 Taipei council seats (3600 × 5661); embedded emblems, all six columns, wrapped names and shared map furniture were visually checked. Behavioral regressions cover full field preservation, tri-state incumbency, unfinished-district exclusion, layouts up to 910 winner rows, mayor legend units and imported-party completeness.
- Latest runtime/cache revision: `20261031-complete-winners-v16`.
- In progress: final source packaging and publication to the original GitHub Pages site; then verify deployed revision.


## 2026-11-01 功能审计修复

- 手选当选人/乡镇胜出者与得票独立保存；历史浏览的自动保存与JSON仍指向用户方案。
- 历史结果统一编号和身份键，并用实际乡镇集合核对身份选区范围；主图和导出放大图共用配色。
- 恢复未来/历史选区表的搜索和CSV下载，修正历史CSV换行；CSV导入新增变更预览及空白保留策略。
- 全台县市主图补齐22个名称或编号；增加避让后的外置数字引线，提高并列地图字号。
- 增加完整/紧凑导出预览、像素尺寸和得票表；手机保留SVG。县市长最终图例统一政党＋席次。
- 修复基础地图缓存命中早于后续脚本初始化的竞态，等待DOMContentLoaded后首次渲染。
- 本地58项计算/回归检查通过；新增7项独立浏览器流程测试供CI执行。地图分片重建与现有几何、顺序一致。
- 将旧source.zip明确移为archive/build-inputs-20261030.zip，恢复公开构建脚本、审计输入恢复器和数据校验清单；当前源码以主分支为准。
- 未改变候选人ID、号次、性别及地图原始几何；数据核验日期仍为2026-10-30。


### 2026-11-01 密集区域与缺失编号修复
- 议员及区域立法机构民代选区保留实际号次；同字号区内放置失败后使用有序外置标注。
- 乡镇参考编号按地理次序生成；两侧按纬度排列并避让，沿当前区域纬度带寻找外侧边缘，减少长引线。
- 全国选区总览随缩放重算编号；不改选区号次、地图资料或用户预测。
- 屏幕及导出的数字对照表改到图下，避免遮挡外置编号；修正议员乡镇模式被误当选区编号的问题。
- 增加布局回归用例与22县市、全国缩放、密集乡镇导出、手机布局浏览器检查。

## 2026-11-01 navigation and remaining nationwide numbers (v77)
- Live audit of v76 found 163 labels for 221 council regions. Added non-overlapping panel gutter slots after local callouts are exhausted; retain official numbers and font sizes.
- Coalesce SVG viewport writes per animation frame; defer council/legislative/village label collision layout until 160 ms after navigation stops. County/town labels reuse their existing SVG during navigation.
- Flush pending viewport before wheel anchor conversion; fit and full renders cancel obsolete label jobs.
- Local calculation/layout/navigation regression checks: 66 passed. Browser workflows run through existing GitHub Actions after publication.
- Preview verification: nationwide council 221/221 labels at fit and after zoom; Kaohsiung council 15/15. Found and filled the remaining Qianjin township name (38/38 Kaohsiung labels).
- Removed workspace-ui.js's secondary applyView wrapper, which had queued another full label layout every frame despite the main navigation scheduler.
- Direct main publication was blocked by automatic approval review; preparing a review branch without changing the public site.
- CI verified exports with embedded emblems and incumbency, historical switching, CSV flows, all county council/legislative labels, national zoom, and mobile names. Remaining routing assertions initially rejected excessively bent grid routes; added obstacle-checked shortcutting. Updated the route validator's minimum from three segments to one, because a straight horizontal callout is also valid orthogonal routing; the seven-segment limit remains.

## 2026-11-02 administrative number keys (v90)
- Unified administrative name placement for county, township, village, prediction and identity-panel views: full names must fit inside the polygon; overflow uses geographic reference numbers with a complete lookup.
- The lookup card is positioned above the legend, with a dedicated map margin and scrolling for long on-screen lists. Official electoral district numbers keep their existing values.
- SVG/PNG export expands every lookup row and places the legend beneath the key; keyed areas no longer trigger redundant export enlargement panels.
- Updated regression and browser workflows to verify the new user-requested name-or-number contract instead of requiring external full-name leaders.
- Local regression checks: 73 pass; preview verified Kaohsiung 38 labels, 29 number/key pairs, and the key above the legend.

## 2026-11-02 island labels and inset barriers (v91)
- Referenced Esri's island-label examples and Taiwan election-map inset layouts. Renamed the reference card/export heading to 行政区索引.
- Mainland external-number columns reject both text rectangles and leader segments entering offshore inset frames; local/gutter fallbacks retain frame avoidance.
- Offshore county features always use full county names centred at the bottom inside their inset frames, without reference digits.
- Scoped Kinmen/Lienchiang/Penghu township maps omit inset frames. Names that cannot fit inside are placed nearby with short, obstacle-checked leaders that cannot cross another township; reference digits remain the fallback.
- Local preview verified all six Kinmen townships (including Wuqiu), four Lienchiang townships and six Penghu townships, plus all 22 nationwide county labels and Hsinchu City's frame clearance.
- Added browser checks for inset title placement, mainland frame barriers, offshore township names and matching exports; 73 local regression checks pass.

## 2026-11-02 interactive administrative index and island captions (v92)
- Index entries retain their exact displayed feature, including identity-panel and township prediction features. Hover/focus highlights the same polygon; clicking or keyboard activation performs the same action as clicking that polygon.
- Polygon/name hover and focus highlight the matching index row without changing saved party fills. Index actions use accessible buttons and keyboard focus styles.
- Green Island and Orchid Island (Taitung) and Liuqiu (Pingtung) always use full-name captions centred immediately below their island extents, with bottom fitting room reserved for captions and export parity.
- Added behavioural checks for index interaction and the three island captions. Local regression checks: 74 pass. Preview confirmed index click opens the matching Keelung prediction dialog and both Taitung captions are below their islands.

## 2026-11-03 township election coverage (v93)
- Township-chief election maps use a neutral grey for administrative areas without a corresponding township-chief election district. Eligible but unpredicted districts retain the existing pale fill, including municipal indigenous district-chief elections.
- The coverage mask applies to prediction and manual party-colouring modes within this election view, with explicit tooltip/click feedback and a grey legend entry. Grey areas are excluded from election-area counts and gradient missing-result status.
- The same fill and legend are included in exports; switching to free colouring, mayor/council maps or historical views does not apply this mask.
- Added real-dataset unit coverage and browser export/mode-switch regression checks; 75 local regression checks pass. Preview confirms national urban areas are grey while eligible mountainous districts remain available.

## 2026-11-03 township county navigation and council overview (v94)
- Areas without township-chief elections use white instead of grey, retaining the coverage explanation and protected election editing.
- National township-chief maps drill into the clicked county before any prediction action. All 22 counties are available as map scopes; county township-chief views show a return-to-Taiwan button. Navigation preserves entered forecasts and fills.
- National council panels retain electoral geometry and colours but use full county names instead of district numbers. County-scoped maps retain official district labels. Exports follow the same county-name overview without adding redundant per-district coverage appendices.
- Updated browser checks for national council names, white unsupported areas and township county drilldown/return; 75 local regression checks pass. Preview verified Taipei can be entered without a prediction dialog and council national labels are all county names.


## 2026-11-03 v95 议员全台入口
- 议员预测全台地图合并为一张县市地图，完整标出22县市名称，不再按身份分三张。
- 点击县市进入县市议员预测，县市图及乡镇预测图均可返回全台；导航不改变预测。
- 全台入口隐藏身份筛选与乡镇层级，县市内部保留选区类别与预测功能。
- 75项本地检查通过；预览验证高雄市点击进入和返回。


## 2026-11-03 v96 议员胜负预测与县市席次颜色
- 议员仅保留手动选择当选者，隐藏票数/得票率及乡镇得票预测入口；已有数据保留。
- 全台按各县市三类身份选区中已选当选者合计席次着色，最多政党色、并列灰、未填浅色；图例汇总全国席次。
- 议员CSV模板与导出仅含当选列，拒绝导入新的议员票数/得票率。
- 76项本地检查通过，新增跨身份、部分填写、并列、空白聚合验证及浏览器保存导航测试。


## 2026-11-03 v97 议员席次圆圈与党徽
- 县市议员预测改为每席一个固定大小符号：未预测空心圆，已预测党徽，独立/无党徽实心灰圆；同党集中排列。
- 县市地图放大，区域图为主、平地/山地在右侧上下排列；拥挤选区采用带编号和引线的就近席次组。
- 点击席次组可编辑预测，屏幕与SVG/PNG导出共用布局；全台保留县市席次最多政党填色。
- 预览检查22县市符号无画布裁切，新增全县市席次/党徽/灰圆/导出回归。


## 2026-11-03 v98 席次框归属与无党籍标识
- 无党籍席次使用现有“無”标识，与图例一致；其他无党徽政党继续灰圆。
- 区内席次框检查完整矩形与边界，外置框必须完全避开所有选区；空间不足时自动留出地图外围空间。
- 席次框显式接收鼠标事件，框内留白也可悬停/点击；框和地图双向高亮，支持键盘聚焦。
- 引线绘于席次框后方；屏幕及导出共享位置。新增全县市边界归属和真实悬停/聚焦回归。


## 2026-11-03 v99 席次框就近引线
- 外置席次框按与对应选区的距离、紧凑程度共同择位，减少远距离连接。
- 引线采用县市长地图同款绿灰细线、白色描边与选区内圆点；直角折线接至框边，优先避开其他框和既有引线。
- 新增圆点位于对应选区、线点连接、折线路由与避框测试；屏幕和导出共用同一逻辑。


## 2026-11-03 v100 自由填色界面与导航
- 删除村里入口及四个图层按钮下的小字，四个简洁按钮始终可见，分行政区/选区排列。旧村里方案进入自由模式时转到乡镇图，保留已保存数据。
- 乡镇、议员、立法机构民代全台图统一按县市显示，点击进入县市填色；县市图均可返回全台，县市图层仍直接填色。
- 全台颜色按各县市已填区域最多政党汇总，保留底层颜色、撤销/重做、图例及导出；图例汇总实际已填区域。
- 乡镇名称布局沿用2026规则；议员县市图采用放大的区域主图与两类少数民族副图，立法机构民代保留四类地图。
- 新增四入口、无副标题、逐层导航、返回与填色保留回归。


## 2026-11-03 v102 自由填色区域民代地图
- 图层入口改为“议员”“立法机构区域民代”。
- 立法机构区域民代仅显示区域选区，移除其他三类分图与分图外框、标题；沿用县市导航与返回。
- 图例显示当前范围区域选区数量；全台73区，县市按实际数量。资料表、全台颜色汇总与导出同步仅取区域选区，已有其他类别数据保留但不参与显示。
- 新增单图、无分图框/标题、73/8选区数量和导出回归。

## 2026-11-10 历史数据第一阶段

- 将2022县市长、县市议员、乡镇市区长整合为统一历史工作台，新增年份、选举类型、县市、地图层级和指标筛选，以及结果地图、候选人结果、选举概况三个视图。
- 2022快照升级为版本2实体模型：3场选举、441个选举区、2280条候选记录，并保留旧版兼容行、稳定ID、官方当选标记、原始名称、来源网址和SHA256校验信息。
- 县市议员采用中性底图与党徽/席次数徽章，区域、平地少数民族、山地少数民族可分别查看；全部类型概况不合并投票率。
- 候选人表支持搜索与政党筛选，当选仅使用官方标记图片；县市长可下钻查看乡镇市区得票领先分布，避免把地区领先写成当选。
- 历史SVG/PNG文件名包含年份、类别、范围和指标；CSV同时输出规范名称与官方原始名称，并防止表格公式注入。进入、退出历史模式不改动预测与自由填色方案。
- 数据快照、几何拓扑和108项Node回归检查全部通过。当前执行环境缺少Playwright且限制Chromium进程套接字，新增浏览器断言已提交，待CI或具备浏览器权限的环境执行。
