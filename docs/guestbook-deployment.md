# 留言板上线与维护（开发者）
当前默认关闭，普通访客不会看到未连接后台的按钮。使用网站地址附加 ?guestbook-preview=1 可预览界面，提交禁用。无需改动地图、历史数据或预测方案。
1. 新建独立 Supabase 项目，执行 docs/guestbook.sql。不要将 guestbook_private 加入 API exposed schemas。只使用独立项目，避免与其他系统的业务数据共享权限。
2. 验收：以 anon key 调用 guestbook_submit（随机 UUID、64位随机十六进制凭证）创建一条含虚拟联系方式的待审核测试留言。guestbook_public 必须无该记录；用不同随机凭证调用 guestbook_mine 必须没有记录。用原凭证查询须返回私密联系方式。直接访问两张私表必须拒绝。SQL 编辑器审核通过后，公开 RPC 只能返回明确列出的公开字段，不包含 contact、owner_hash、恢复码或私密字段。验证本人删除联系方式、重复提交同一 UUID、频率限制及 XSS 文本显示。删除测试记录。
3. 仅验收通过后，将 guestbook-config.js 中 url 设置为实际 HTTPS 项目地址、anonKey 设置为公开 anon/publishable key、enabled 设为 true；同时更新 index.html 的 config 文件版本号。绝不能写入 service_role key、secret key 或数据库密码。
4. 管理者通过 Supabase SQL editor（需要开发者登录）查看待审核内容和私密联系方式、更新 visibility/reply。见 SQL 文件尾部示例。审核前检查正文/昵称是否误含私人信息，回复也不能包含联系方式。
5. 公开留言仅在审核通过后显示；未登录用户通过本机生成的高熵恢复码查询本人留言和删除私密联系信息。恢复码本地保存，清除浏览器数据前应手动备份。丢失后不能根据昵称找回。不要把恢复码放进 URL 或公开渠道。
6. 数据库限速是基础防护，恶意流量仍可能耗尽全局额度。对外开放前测试实际网络可达性和负载；若出现滥用，应增加 Edge Function/服务端 CAPTCHA 与防刷、限制直接提交 RPC，再开放。不得在日志、公共导出或公开仓库存放真实联系方式。
