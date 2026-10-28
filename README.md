# 岛屿调色盘 · 台湾地图填色

MIT 开源的静态地图编辑器，包含全台 22 个县市、368 个乡镇市区。

- 全台乡镇市区单张地图，可缩放、平移与筛选。
- 简体中文界面与地名，行政区名称优先放在区域内部。
- 政党配色预设、自定义政党、可编辑图例与行政区边界。
- 浏览器自动保存、撤销/重做、JSON 方案、SVG 和 PNG 导出。
- 无需登录，无外部 CDN 和在线地图依赖，含单文件离线版。

## 发布到 GitHub Pages

本仓库根目录已经包含 index.html 和 .nojekyll。
在仓库 Settings → Pages 中，将 Source 设为 Deploy from a branch，选择默认分支与 / (root)，保存。
发布后的实际地址以 GitHub Pages 返回结果为准。免费网址在中国大陆的可访问性须单独实测。

## 迁移已有填色

在原网址点击“保存方案”下载 JSON，在新网址点击“打开方案”导入。
浏览器自动保存的方案不会随域名迁移。

## 本地运行

```sh
python -m http.server 8080
```

打开 http://localhost:8080；或双击 offline.html 离线使用。

## 源码和许可

完整开发源码包含在 source.zip，内含地图再生成脚本、离线版打包脚本及许可证。
地图数据来自 taiwan-atlas；转换运行时为 OpenCC-JS。第三方许可参见 THIRD_PARTY_NOTICES.md 和 assets/。
原始应用程序采用 MIT 许可。
