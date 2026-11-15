# 官方候选人、历史选区及视觉回归核查

## 2026候选人官方资料

监测入口：.github/workflows/official-2026-candidates.yml，每天台湾时间12:20检查中选会选举专区、资格审定及最新公告。中选会正式选务日程：11月12日公告直辖市长名单，11月17日公告直辖市议员及县市长、县市议员名单，11月28日投票。真正的公告内容以原始官方页面为准。

核查器：scripts/audit_2026_official.py。使用已核实的官方CSV：type,county,districtId,name,number,party,gender,eligible,source_url,source_date；districtId沿用网站稳定选区ID。source_url只接受HTTPS下的cec.gov.tw或gov.tw站点，source_date为YYYY-MM-DD。

使用：
- python scripts/audit_2026_official.py --output reports/local-2026-audit.json
- python scripts/audit_2026_official.py --roster reviewed-cec-roster.csv --output reports/differences.json
- python -m unittest discover -s tests -p test_official_2026_audit.py

差异报告区分匹配、字段冲突、官方但本地找不到及身份有歧义。官方公告网页变更仅作为复核线索，不能代替正式候选人级数据。程序只读，不自动覆盖现有2026候选人、候选人ID、预测方案或浏览器保存的数据。登记人数与合格参选人数不能混用；原始底表的2064条登记记录包含后来审查剔除的记录。截至2026-11-08当前网站名单为2051人（县市长81、议员1492、乡镇市区长478），号次全部已有数值，但其依据包含第三方资料或推算，仍应复核新的官方公告。

## 1992—2004立法机构区域选区

代码按选区记录边界资料来源年份、归属行政区、缺失区域及近似等级。1992年的图形借1995年乡镇归属，不当作1992精确历史界线；1995、1998、2001、2004按当届归属结合现行地图轮廓重建。每一个早期图形都带近似提示，无法还原的分村里界线与整县替代轮廓单独识别，原始当选人结果不受影响。

运行 node scripts/audit_legacy_legislative_boundaries.cjs，报告输出到reports/historic-legislative-boundary-audit.json；自动检查27、27、29、29、29共142个选区图形、跨年度引用、是否缺图及是否误称精确。

这些检查保证“没有悄然遗漏”，但并不意味已有所有历史村里原始地图。真正的精确复原仍需要当届官方划界文书及同年代行政区形状。

## 视觉回归

.github/workflows/visual-regression.yml在页面/地图源码变更后，用Playwright将当前提交与上一提交分别作为两个本地网站启动，截图比较：桌面1440x900、手机390x844，覆盖县市长、议员、乡镇市区长、自由填色、2004/2024历史地图及预测、历史SVG导出。

若变化超过1.5%像素，需要审核前后对照；超过8%列为明显变化；地图图形大量缺失、网页异常或导出截图失败会让工作流失败。工作流输出before/after/diff PNG及summary.json，以Artifact保存30天。这些截图不复制进网站发布包，也不会覆盖用户的任何预测数据。
