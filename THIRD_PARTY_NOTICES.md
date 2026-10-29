# 第三方来源与许可

## 选区定义与对应关系

议员和立委选区定义来自中央选举委员会公开数据，依政府资料开放授权条款第 1 版使用： https://data.gov.tw/license 。议员公告： https://www.cec.gov.tw/central/article/63625 ；立委范围： https://data.gov.tw/dataset/170247 。边界版本分别为 2026 年区域议员选区和第 11 届（2024 年）区域立委选区。

议员村里对应关系参考 kiang/db.cec.gov.tw，Copyright (c) 2021 Finjon Kiang，MIT 许可，许可原文保留在 assets/LICENSE-election-mapping.txt（源码包中位于 dist/assets/）。选区划分仍以官方公告为准；此对应关系不包含当前候选人、真实得票或预测结果。

本项目原创网页代码采用 MIT 许可证。第三方资料与程序保留其原有许可，MIT 不取代第三方权利声明。

- 地图：内政部国土测绘中心开放行政区边界，经 dkaoster/taiwan-atlas 转换、简化和投影。项目 https://github.com/dkaoster/taiwan-atlas ，MIT 许可文本见 dist/assets/LICENSE-taiwan-atlas.txt；原始政府数据的许可和说明以该项目列出的来源为准。
- 简繁转换：OpenCC-JS 1.0.5，https://github.com/nk2028/opencc-js ，许可见 dist/assets/LICENSE-opencc-js.txt。
- 政党名称与十六进制色值：用户指定的维基百科《Template:中華民國政黨色彩/doc》，https://zh.wikipedia.org/wiki/Template:中華民國政黨色彩/doc ，核对日期为 2026-10-28。此处收录名称及色值事实，并提供来源链接；原页面说明文字未收录。预设目录包含历史政党，不表示当前登记状态。

地图仅供示意，行政区代码和几何数据来自上述地图源；离岛在部分视图中经过移位。用户填色数据不包含在本源码包内。
