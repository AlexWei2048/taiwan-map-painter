# 2026九合一正式结果导入准备

截至2026-11-16，115年11月28日的选举尚未投票。**本仓库不预先发布2026得票或当选结果。**

## 准备官方候选人ID模板

GitHub Actions: Verify 2026 official result importer 会生成并附带官方结果CSV空白模板；也可运行：

python scripts/build_2026_official_results.py --template reviewed-cec-results-2026.csv

模板保留当前数据库所有2051名合格候选人的稳定candidate_id，以及本地号次作为参考列，**号次、票数、当选栏保持空白**，需要从投票后的中选会或地方选委会正式票数资料逐一填入。务必保留ID，尤其是姓名重复、原住民族名或多席次选区的候选人。与正式公报不符先核查名单，不能重新生成ID覆盖已保存的用户预测。

CSV必填字段：candidate_id,number,votes,elected,source_url,source_date。number和votes非负整数，number必须正数；elected为0/1或明确当选标记，不根据最高票推导。每笔必须有日期不早于2026-11-28且来自CEC或gov.tw HTTPS官方来源。

额外县市长/议员候选人按乡镇市区得票细项CSV（可选）：candidate_id,county,town,votes,source_url,source_date。每名候选人的各乡镇市区得票合计须等于全选区得票，同一选区全体候选人的区域范围须相同。没有精确乡镇票数，不从县市均摊推算。

投票概况CSV（可选）：district_id,registered_voters,ballots_cast,valid_votes,invalid_votes,source_url,source_date。官方有效票必须等于本选区的各候选人实际票数合计，投票数与有效/无效票数需彼此相符；没有正式数据的字段留空。

## 预演与正式发布（严格隔离）

python scripts/build_2026_official_results.py --results reviewed-cec-results-2026.csv
python scripts/build_2026_official_results.py --results reviewed-cec-results-2026.csv --town-votes town-votes.csv --turnout official-turnout.csv

以上仅生成 reports/2026-results-staged.json 和 reports/2026-results-intake-audit.json，不能当作网站选举结果。

选后，**满足下列全部条件**时才能加 --publish: 资料日期不早于11月28日；所有22县市长、221议员、204乡镇市区长选区的2051名候选人得票和官方当选标记齐全；同选区号次不冲突、每个选区当选人数对应应选席位；乡镇票数与县市/选区总票对账通过。若存在妇女保障名额相关异常，提示复核官方标记，程序不擅自改写当选人。

--publish 会创建 assets/history-2026.json 和更新 assets/history-2026-availability.json，不修改 assets/election-2026.js 与任何用户本地预测。只有明确有正式数据后，历史结果页面才可启用2026年份。发布前状态清单始终为 awaiting_results。source status 由 --status provisional|certified 区分；正式认证须在中选会排定的12月4日以后。

备注：这是针对中选会官方资料的**标准化导入器**，不是自动抓取未经核实的开票直播数据；原始PDF/Excel需要核对后转录为CSV，避免把不同层级或不同选区的票数混到一起。
