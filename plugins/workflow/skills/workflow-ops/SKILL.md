---
name: workflow-ops
description: 在 Workflow（workflow.games）项目里建需求、记 bug/缺陷、建任务、查询或搜索工作项、指派负责人、状态流转、写评论、上传附件时使用。所有写操作走 API 并读回验证。
---

# workflow-ops — 在 Workflow 里干活

## 与需求规划的边界

用户给的是一句话、文档或尚未定型的讨论结果，并要求「梳理需求」「规划需求池」「拆跨工种需求」「生成完整 Agent 提示词」时，转 **workflow-planning**。它负责讨论、复杂度判定、模板化蓝图和整体确认后的批量落单。

本技能只处理已经明确的单次业务操作：建一张字段已定的需求/工作项、查询、指派、流转、评论或附件。不得把原始想法临场扩写成一套开发计划，也不得在建单后自动启动实现。

## 前置：凭证与连接检查

按**凭证解析顺序**（三级，setup / ops / 调用模板同一口径）取 `base_url` 与 token（可直接抄的 shell 片段见 `references/call-templates.md`）：

1. 环境变量 `WORKFLOW_API_BASE` + `WORKFLOW_TOKEN`（CI 与一次性覆盖，最高优先）；`WORKFLOW_API_BASE` 以 `/api/v1` 结尾。
2. `.workflow` 标记：从当前目录向上逐级找，取最近的一个，到含 `.git` 的目录或文件系统根为止；按其 `profile` 名到 `~/.config/workflow/config.toml` 的 `[profiles.<名>]` 取 `base_url` 与 `token`；该 profile 不存在 → 走 workflow-setup 的建 token 分支为这个项目补一枚。
3. 全局 `current_profile` 兜底，硬条件：config 里 profile 多于一个且当前目录没有 `.workflow` 时**不得静默使用**——必须先问用户「这个目录绑哪个项目」，答后写 `.workflow` 再继续；只有单 profile 时可直接用。

取到后先 `GET $WORKFLOW_API_BASE/me` 确认连接可用。不通（401/403/网络失败/没有配置）→ **转 workflow-setup 技能**处理，本技能不修配置。

**写操作防呆**：任何写操作（建单/改单/流转/评论/附件）前，`/me` 返回的项目必须与 `.workflow` 指向 profile 的 `base_url` 子域一致；不一致 → 停下转 workflow-setup 重新绑定，**绝不把数据写进错误项目**。

## 真值原则（置顶）

**本技能不内嵌端点与字段快照**——平台迭代快，快照必过期。每次调用前按三级现查：

1. **L1** `https://workflow.games/llms.txt` —— 文档索引，先看有哪些指南。
2. **L2** `https://workflow.games/md/guides/<slug>.md` —— 人读指南，字段口径与易错点。
3. **L3** `https://workflow.games/openapi/gameflow.v1.yaml` —— 合同真值（约 9000 行，**grep 定位 operationId/path 后分段读**，不要整读）。

L2 足够就不必下到 L3；路径、必填字段、枚举拿不准时以 L3 为准。

## 对象模型（三句话）

- **需求**（`R-` 单号）是核心对象；**缺陷没有独立资源**，就是 `POST /work-items` 里 `type=bug` 的工作项（`B-` 单号）。
- **UUID 是 canonical id**：路由与写命令一律用 UUID；`R-`/`B-`/`T-` 单号只做展示与搜索，不当 id 传参。
- 错误一律 RFC 7807 ProblemDetails（带 `traceId`）；列表普遍 cursor 分页；写端点在项目冻结时返回 423。

## 动词分节

- **建需求** → `POST /requirements`（`title` 必填）。
- **记 bug** → 先读同目录 `references/bug-fields.md` 对齐字段口径；**建单前 `GET /search?q=` 查重**（单号精确 + 标题模糊），疑似重复先报给用户；用户只说「记一下」就只记录——**不启动修复，不扩写成开发任务**。
- **查询** → `GET /work-items` 带过滤参数，**cursor 循环取全量**：短页不是终点，`nextCursor` 为空串才是；游标原样回传不自拼。
- **指派 / 改字段** → `PATCH /work-items/{id}`，带 `reason` 写明变更理由；省略的字段不改动。
- **状态流转** → **先 `GET` 该对象的 transitions 端点**（`/work-items/{id}/transitions` 或 `/requirements/{id}/transitions`，确切路径按 L3 现查）看可用动作与 `allowed`，**再 `POST` 执行**；不硬 `PATCH status`——项目可配自定义工作流，状态词表不是固定枚举。
- **评论** → `POST /comments`（`targetType` + `targetId` + Markdown `body`）。
- **附件** → `POST /attachments`（multipart），模板见 `references/call-templates.md`。

**每个写操作后 `GET` 读回验证**，向用户报：`displayKey` + UUID + 标题 + 可点链接（`https://<子域>.workflow.games/...`，优先用读回响应或搜索结果里的 deepLink）。

## 失败处置表

| 状况 | 处置 |
| --- | --- |
| 422 | 按 ProblemDetails 的 errors 补齐/修正字段**重试一次**；第二次仍失败就停下，把 `traceId` 贴给用户 |
| 401 / 403 | 转 workflow-setup 分诊，不在本技能里试来试去 |
| 423 | 项目已冻结，**不重试**，转告用户找管理员解冻 |
| 429 | 限流是 per-token 的（约 60 突发 / 120 每分钟）；按 `Retry-After` 退避重试，**至多 3 次**，并降低后续调用频率 |
| 网络错误 / 5xx | **必须先查询确认是否已落库**（search 或列表），确认未落库才可重发——防重复建单 |

## 收尾

按同目录 `references/delivery.md` 的交付口径向用户汇报。
