# 独立留言板部署与维护（不依赖任何数据库云服务）
留言板前端已在网站中集成，后台使用 Python 3.11+ 标准库和 SQLite，无第三方依赖，无需 Supabase。
- 本地测试：进入 guestbook-backend，运行 python -m unittest -v test_guestbook。
- 运行：设置 GUESTBOOK_DB 为网站静态目录之外的持久化私密路径（如 /var/lib/island-guestbook/guestbook.sqlite3），设置 GUESTBOOK_ORIGIN 为实际网站 origin（默认 https://alexwei2048.github.io），运行 python server.py serve --host 127.0.0.1 --port 8787。以独立非 root 服务账户运行。SQLite 文件须持久化备份，含私人信息，不可提交到仓库。
- 公网部署：使用已有服务器上的 HTTPS 反向代理，限制请求体和并发、设置限速和超时；禁止公网直接访问内部 HTTP 端口。代理只转发 /api/guestbook/ 和 /health，不开放数据库或服务器文件目录。不要记录请求正文、凭证或联系方式。前端必须使用 HTTPS 地址。
- 管理者在服务器上运行 python server.py list --status pending 查看待审核留言（含私密联系方式）；python server.py review <留言UUID> approved --reply "感谢建议" 公开留言并回复。rejected 为不公开。审核前检查昵称、正文和回复是否含个人信息。
- 上线验收：运行测试，实际 HTTPS 访问验证 CORS、跨设备持有凭证查询、错误凭证隔离、公开字段、联系方式删除、审核、频率限制与 XSS；删除测试记录。确认大陆访问情况，再修改 guestbook-config.js，填入 HTTPS 服务 origin，将 enabled 改为 true 并更新 index.html 缓存版本号。
- 没有后端地址时默认关闭留言入口，?guestbook-preview=1 仅显示不可提交的预览。不得用本机存储模拟公共留言，也不允许将联系方式写入公开仓库。
- 防刷：每个凭证10分钟3条，全站10分钟50条，仍需反向代理的请求频率/并发控制以抵抗恶意流量。不要把浏览器身份凭证当作真人验证。后端不记录访客 IP 和请求体。
