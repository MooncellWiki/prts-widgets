# 使用本地 IDA 审查 PR

`Claude IDA Review` 是手动触发的实验性 workflow：GitHub runner 加入 Tailscale，
Claude Code 通过 HTTP 调用本地 [HexRaysSA/ida-mcp](https://github.com/HexRaysSA/ida-mcp)，
并在指定 PR 下发布中文审查评论。不会因外部 PR 或评论自动运行。

## 本地服务

按上游说明安装 IDA、idalib 和 ida-mcp（当前上游要求 IDA 9.4+、Python 3.11+）。
在装有 IDA 的电脑上启动：

```bash
uvx ida-mcp http --host 127.0.0.1 --port 8737
tailscale serve --bg http://127.0.0.1:8737
```

使用 Serve 输出的 HTTPS 地址，加上 `/mcp` 作为 MCP URL。Serve 仅面向 tailnet，
无需启用 Funnel 或开放公网端口。机器和服务需保持在线；可使用 headless idalib，
连接已有 GUI 数据库时需要安装上游 GUI 插件。数据库路径是本地 IDA 主机路径，
不是 GitHub runner 路径；请选定与审查目标对应版本的二进制或 IDB 副本。

## GitHub 与 Tailscale 配置

在仓库 Settings → Secrets and variables → Actions 设置：

| 类型 | 名称 | 内容 |
| --- | --- | --- |
| Secret | `ANTHROPIC_API_KEY` | Claude API key（运行会产生 API 费用） |
| Secret | `TS_OAUTH_CLIENT_ID` | Tailscale OAuth client ID |
| Secret | `TS_OAUTH_SECRET` | Tailscale OAuth client secret |
| Variable | `IDA_MCP_URL` | `https://<machine>.<tailnet>.ts.net/mcp` |
| Variable | `IDA_DATABASE` | IDA 主机上的二进制或 IDB 绝对路径 |

按 [Tailscale Action 文档](https://tailscale.com/docs/integrations/github/github-action)
创建能生成带 `tag:ida-review` 标签临时节点的 OAuth client。
配置 tagOwners，并通过 tailnet ACL/grants 仅允许该标签访问 IDA 主机的 TCP 443
（Serve 的 HTTPS 端口）。同时检查现有宽泛规则：新增窄规则不会撤销原有访问授权。
任务结束后 Action 会退出临时节点。

## 运行与限制

合并后，在 Actions → Claude IDA Review → Run workflow 选择默认分支并填写 PR 编号。
workflow 只在默认分支运行，从 GitHub 下载 PR diff，不检出或运行 PR 代码；
所有 IDA review 共用一个 concurrency group，避免同时操作本地数据库。
检查评论中的 head SHA，PR 更新后需重新运行。GitHub concurrency 可能替换已有的
pending run，因此批量提交时应确认每个 PR 都实际执行。

官方 MCP 使用 `execute_python` 完成反编译和查询；它也能修改数据库、读写主机文件、
执行任意 Python。工具白名单和“只读分析”提示词不构成沙箱。
仅对维护者信任的 PR 手动运行，建议使用专用账户/隔离机器和数据库副本，
不要把个人工作环境直接当作公开 PR 的自动分析服务。
分析结果和反编译片段会发给 Claude API，审查证据可能出现在 PR 评论中。

未配置变量或凭据时任务会在联网前失败。连接失败时检查本地服务、Serve 地址、
ACL 和数据库路径；Claude 应在评论中明确无法验证的部分。
本仓库的静态检查不代表已经打通你的 tailnet 或 IDA，需要配置后手动试跑验证。

参考：[Claude Action MCP 配置](https://github.com/anthropics/claude-code-action/blob/main/docs/configuration.md)。
