# 2026九合一正式结果导入准备

截至2026-11-16，115年11月28日的选举尚未投票。**本仓库不预先发布2026得票或当选结果。**

## 准备官方候选人ID模板

GitHub Actions: Verify 2026 official result importer 会生成并附带官方结果CSV空白模板；也可运行：

python scripts/build_2026_official_results.py --template reviewed-cec-results-2026.csv

模板保留当前数据库所有2049名合格候选人的稳定candidate_id，以及本地号次作为参考列，**号次、票数、当选栏保持空白**，需要从投票后的中选会或地方选委会正式票数资料逐一填入。务必保留ID，尤其是姓名重复、原住民族名或多席次选区的候选人。与正式公报不符先核查名单，不能重新生成ID覆盖已保存的用户预测。

CSV必填字段：candidate_id,number,votes,elected,source_url,source_date。number和votes非负整数，number必须正数；elected为0/1或明确当选标记，不根据最高票推导。每笔必须有日期不早于2026-11-28且来自CEC或gov.tw HTTPS官方来源。

额外县市长/议员候选人按乡镇市区得票细项CSV（可选）：candidate_id,county,town,votes,source_url,source_date。每名候选人的各乡镇市区得票合计须等于全选区得票，同一选区全体候选人的区域范围须相同。没有精确乡镇票数，不从县市均摊推算。

投票概况CSV（可选）：district_id,registered_voters,ballots_cast,valid_votes,invalid_votes,source_url,source_date。官方有效票必须等于本选区的各候选人实际票数合计，投票数与有效/无效票数需彼此相符；没有正式数据的字段留空。

## 预演与正式发布（严格隔离）

python scripts/build_2026_official_results.py --results reviewed-cec-results-2026.csv
python scripts/build_2026_official_results.py --results reviewed-cec-results-2026.csv --town-votes town-votes.csv --turnout official-turnout.csv

以上仅生成 reports/2026-results-staged.json 和 reports/2026-results-intake-audit.json，不能当作网站选举结果。

选后，**满足下列全部条件**时才能加 --publish: 资料日期不早于11月28日；所有22县市长、221议员、204乡镇市区长选区的2049名候选人得票和官方当选标记齐全；同选区号次不冲突、每个选区当选人数对应应选席位；乡镇票数与县市/选区总票对账通过。若存在妇女保障名额相关异常，提示复核官方标记，程序不擅自改写当选人。

--publish 会创建 assets/history-2026.json 和更新 assets/history-2026-availability.json，不修改 assets/election-2026.js 与任何用户本地预测。只有明确有正式数据后，历史结果页面才可启用2026年份。发布前状态清单始终为 awaiting_results。source status 由 --status provisional|certified 区分；正式认证须在中选会排定的12月4日以后。

备注：这是针对中选会官方资料的**标准化导入器**，不是自动抓取未经核实的开票直播数据；原始PDF/Excel需要核对后转录为CSV，避免把不同层级或不同选区的票数混到一起。


## Verified township turnout and pre-election forecast snapshots

To include township/ward-level turnout for the 2026 county-mayor election, provide a source-backed CSV to the optional --town-turnout parameter. Fields: county,town,registered_voters,ballots_cast,valid_votes,invalid_votes,source_url,source_date. This is accepted only when each mayoral candidate's official town-level vote is also present via --town-votes and all numeric totals reconcile. Unavailable turnout data remains blank, never estimated from county totals.

To prepare line-by-line candidate verification for the November 17 publication, run:
python scripts/audit_2026_official.py --template 2026-official-review.csv

The 2049-row template retains stable candidate IDs and local reference values. Official number, eligibility, party, gender, source URL and publication date are deliberately blank. The official audit is non-mutating.

个人预测保留在本地方案，现已不提供原有预测封存和选后复盘入口。官方历史结果与个人预测完全分开。

## 11月26日发布前复核

现行基准为447个选区、2049名候选人（县市长22区81人，县市议员221区1493人，乡镇市区长204区475人）。名册及选后官方结果必须逐人核对，任何变化先修订经审定的基准，不能根据总量差额增删候选人。

发布时必须将结果文件与对应发布清单一并提交。清单的 file、resultStatus、数量和完整 SHA-256 必须匹配实际文件；不得手动伪造或只修改清单。网站历史地图和趋势共同执行校验，核对候选人稳定ID、号次、选区、得票、当选标记、应选席次及已有乡镇明细，校验失败则不载入该结果。使用 HTTPS 或本地 localhost 测试，普通 HTTP 可能无法使用浏览器 Web Crypto。哈希用于检查文件一致性，不代表官方数字真实性或数字签名，原始官方来源仍须人工核对。

选前先执行 node --test tests/official-2026-gate.test.cjs，再执行既有导入器测试和浏览器回归测试。模拟夹具只在测试环境使用，绝不写入 assets/history-2026.json。当前保持 awaiting_results，直到投票后收齐、核对真实官方数据并按上述发布流程操作。此前已移除预测封存与选后复盘入口，个人预测与历史结果继续独立保存。

## v120 最终接入复核

- 发布日期按台湾当地日期（UTC+8）判定；来源日期不得晚于发布当日；正式公告版不得退回临时开票版。--status certified 仍需人工核对正式公告，不以日期自动认定认证状态。
- 导入器核对稳定ID、选区成员归属、已核实号次及投票统计；即使仅提供投票人数或选举人数，也检查其与候选人票数是否相符。有效票未提供时采用已齐全的候选人得票合计；未知的其他统计仍留空。
- 前端同时检查县市、选区、票种、候选人姓名、政党、乡镇投票统计；失败不载入，重试回到原目标2026年。明确区分官方开票结果与正式公告结果。
- 预演输出不能覆盖网站资产、来源档案或输入CSV；每个JSON文件采用原子替换。正式发布的两个文件仍须同一提交发布，SHA-256用于保证文件匹配。
- 自动回归命令：python3 tests/test_official_2026_contract.py。使用完整现行名册构造仅供测试的票数及当选标记，在临时目录内执行Python生成、Node Web Crypto及前端校验；绝不执行 --publish。此项已接入CI，尚待实际运行报告。
