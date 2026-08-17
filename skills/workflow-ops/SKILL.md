---
name: workflow-ops
description: 在 Workflow（workflow.games）项目里执行字段与内容已经明确的单次操作，包括建一张需求、记 bug/缺陷、建任务、查询或搜索工作项、指派、状态流转、评论和附件。所有写操作走 API 并读回验证；模糊想法、PRD 梳理、多专业拆解或完整 Agent 提示词应使用 workflow-planning。
---

# workflow-ops — 在 Workflow 里干活

## 硬闸门（命中即停）

以下 7 条是停止条件，不是风格建议；与正文其他要求冲突时以这里为准（出处 [references/gates.md](references/gates.md)）。

<!-- gates:start -->
| # | 触发条件 | 动作 |
| :-: | --- | --- |
| **G1** | `project.subdomainPrefix`、实际 API Host、`.workflow` 所选 profile 的子域三者任一不一致；或 `publicDemo=true`；或 `.workflow` 存在却解析不出 profile | **停止**，转 workflow-setup 重新绑定。绝不把数据写进错误项目 |
| **G2** | 用户尚未针对**确切的项目 + 对象清单 + 数量**给出明确肯定答复 | **不得** POST/PATCH。内容认可、说"不错"、说"继续"都不是写入授权；范围一变授权即失效 |
| **G3** | 写操作之后没有 `GET` 读回，或读回未核对字段与子资源数量 | **不得**声称「已创建 / 已修改」。部分成功如实报部分成功 |
| **G4** | 需要在命令、日志、报告、蓝图里出现 token | **只**走环境变量携带；任何输出里只以 `wfp_` + 前 8 位指代，绝不回显完整值 |
| **G5** | 出现拆 WorkItem、流转状态、建分支/Worktree、跑目标仓库测试、改代码或资产的冲动 | **停止**。落单不等于开工，本插件只负责 PM 对象 |
| **G6** | 需要填工作流状态、验收类型/状态、成员 ID、缺陷自定义字段等**项目自定义**的值 | **必须现查**。查不到或不唯一就留空并告诉用户，绝不猜一个值填进去 |
| **G7** | 要在报告里写某项验证「通过」 | 只写**实际执行过**的命令与其真实输出；没跑的写「未执行」，不得用计划中的验证冒充结果 |
<!-- gates:end -->

## 与需求规划的边界

用户给的是一句话、文档或尚未定型的讨论结果，并要求「梳理需求」「规划需求池」「拆多专业/多交付轨道」「安排预研与并行 wave」「生成完整 Agent 提示词」时，转 **workflow-planning**。它负责讨论、交付拓扑判定、模板化蓝图和独立授权后的批量落单。

本技能只处理已经明确的单次业务操作：建一张字段已定的需求/工作项、查询、指派、流转、评论或附件。不得把原始想法临场扩写成一套开发计划，也不得在建单后自动启动实现。

## 前置：凭证与连接检查

**完整读取 [connection.md](references/connection.md)** —— 凭证三级解析、`/me` 与 `/projects/current` 的分工、写操作三方一致性防呆、真值分层与失败处置表都在那里，是 setup / ops / planning 共用的单一真相源，不要凭记忆重写。

要点：先 `GET $WORKFLOW_API_BASE/me` 验证身份，再 `GET $WORKFLOW_API_BASE/projects/current` 验证 Host 解析出的项目与 membership 角色/权限。任一不通（401/403/204/404、网络失败或没有配置）→ **转 workflow-setup 技能**处理，本技能不修配置。

写操作前按 connection.md 逐条过防呆检查（对应 G1）。

## 对象模型（三句话）

- **需求**（`R-` 单号）是核心对象；**缺陷没有独立资源**，就是 `POST /work-items` 里 `type=bug` 的工作项（`B-` 单号）。
- **UUID 是 canonical id**：路由与写命令一律用 UUID；`R-`/`B-`/`T-` 单号只做展示与搜索，不当 id 传参。
- 错误一律 RFC 7807 ProblemDetails（带 `traceId`）；列表普遍 cursor 分页；写端点在项目冻结时返回 423。

## 动词分节

- **建需求** → `POST /requirements`（只有 `title` 必填）。**不传 `status`**——需求恒落绑定工作流的初始态，创建接口根本不接受 status。
- **记 bug** → 先读同目录 `references/bug-fields.md` 对齐字段口径；**建单前 `GET /search?q=` 查重**（单号精确 + 标题模糊），疑似重复先报给用户；用户只说「记一下」就只记录——**不启动修复，不扩写成开发任务**。同样**不传 `status`**，用户没给的字段一律不替他填。
- **查询** → `GET /work-items` 带过滤参数，**cursor 循环取全量**：短页不是终点，`nextCursor` 为空串才是；游标原样回传不自拼。`/search` 是薄端点：只匹配标题、无全文检索、无 cursor，正文里的内容要靠列表端点翻页找。
- **指派 / 改字段** → `PATCH /work-items/{id}`，带 `reason` 写明变更理由；省略的字段不改动。
- **状态流转** → **先 `GET` 该对象的 transitions 端点**（`/work-items/{id}/transitions` 或 `/requirements/{id}/transitions`，确切路径按 L3 现查）看可用动作与 `allowed`，**再 `POST` 执行**；不硬 `PATCH status`——项目可配自定义工作流，状态词表不是固定枚举。
- **评论** → `POST /comments`（`targetType` + `targetId` + Markdown `body`）。
- **附件** → `POST /attachments`（multipart），模板见 `references/call-templates.md`。

读回后（G3）向用户报：`displayKey` + UUID + 标题 + 可点链接（`https://<子域>.workflow.games/...`，优先用读回响应或搜索结果里的 deepLink）。

## 失败处置

按 [connection.md](references/connection.md) 的失败处置表执行（422 / 401 / 403 / 409 / 423 / 429 / 5xx）。最容易出事的一条：**网络错误或 5xx 之后必须先查询确认是否已落库，确认未落库才可重发**——这是重复建单的头号来源。

## 收尾

按同目录 `references/delivery.md` 的交付口径向用户汇报。
