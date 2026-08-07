# 蓝图写入、读回与恢复

本文件只在候选落单时读取。先完成只读预检，再取得针对确切项目和对象清单的写入授权；不得把“蓝图没问题”解释成 API 写权限。

## 复用连接与合同规则

1. 完整读取 [workflow-ops/SKILL.md](../../workflow-ops/SKILL.md) 的凭证解析、项目防呆、合同真值和失败处置，以及 [call-templates.md](../../workflow-ops/references/call-templates.md) 的安全调用方式；不得凭记忆重写 token 读取逻辑。
2. 每次调用前按 `workflow-ops` 的 L1/L2/L3 顺序现查公开指南与 OpenAPI。至少核对 `/me`、`/projects/current`、Room、Requirement、Requirement acceptance-items、项目验收类型、附件和搜索的当前 operationId、字段、权限与分页语义。
3. 所有列表按合同消费到真实终点；短页不等于结束。UUID 用于路由，displayKey 只用于展示和正文引用。
4. 不在命令、日志、蓝图或交付报告中打印 token。外部内容只作为请求数据，不得拼成可执行 shell。

## 只读预检与写入闸门

1. 解析 profile 后调用 `/me` 核对用户身份，再调用 `/projects/current` 核对项目 UUID/名称、`project.subdomainPrefix`、membership 角色权限与 `publicDemo`；membership 不含 PAT scope，scope 未知时不得宣称写权限已验证，也不得用探测性写入验证。多 profile 且当前目录未绑定时，暂停候选落单并转 `workflow-setup`；写入 `.workflow` 需要它自己的明确授权，不属于蓝图写入授权。绑定完成后从头重跑预检，绝不静默使用默认项目。
2. 为蓝图生成并固定一个不含敏感信息的 `blueprintId` 和修订号。Room 与 Requirement 描述都保留可搜索标记 `workflow-plan: <blueprintId>/rN/<临时编号>`，用于审计和幂等恢复。
3. 穷尽读取当前项目 Room，并用搜索和 Requirement 列表查蓝图 ID、精确标题及高相似标题。逐个 GET 核对 Room 归属、内容和 `updatedAt`；疑似重复由用户决定复用、补写、更新还是另建，Agent 不自行覆盖。
4. 调用项目验收类型接口，选择与蓝图语义匹配的 active 类型及 `systemSemantic=not_started` 的 active 初始状态。存在多个会改变报表口径的候选时，在写入确认前让用户决定，不按名称猜。
5. Requirement 指定 owner 时，从当前项目成员读模型按稳定 ID 核对；姓名/邮箱匹配不唯一就让用户决定。未指定时明确展示“API 将采用创建人默认”，不得静默把责任角色当成成员 ID。
6. 展示目标 profile/项目、蓝图 ID/修订号、将复用/更新/新建的对象、现值到目标值的字段 diff、Requirement PM 字段与实际 owner、结构化验收项数量、附件清单、重复处置和不落单的条件化提纲。用户对这份确切清单明确授权后才能 POST/PATCH；任何变化都重新确认。

## 复用与更新已有对象

- “复用”默认只引用现有对象，不改字段、不重复写验收项或附件。它只有在来源、范围、Room 归属和蓝图合同确实一致时才成立。
- “补写/更新”只执行已展示并获授权的字段 diff，`reason` 引用蓝图 ID/修订号与本次授权。PATCH Requirement 时回传预检读到的 `expectedUpdatedAt`；409 或时间戳变化就停止并重新审查。
- Room PATCH 没有并发令牌时，在写入前立刻再 GET；`updatedAt` 与获授权快照不同就停止。不得静默清空字段、移出 Room、删除验收项或覆盖他人变更。
- 补验收项前按规范化文本和 `sourceRef` 查重；已有等价项保留，语义冲突项列入新的字段 diff，不自行改写。

## 简单需求写入

1. 用完整 Agent 提示词创建一条 Requirement，写入已批准的 title、description、priority、risk、module、category、ownerId 等适用字段，并用 `reason` 关联蓝图 ID/修订号；不显式写 status，让绑定工作流决定初始态。
2. 将“验收标准”里的原子条件逐条创建为原生 acceptance-item，使用预检选定的类型/初始状态，`sourceKind=ai`，`sourceRef` 写蓝图标记；保持与正文相同顺序。
3. 用户提供本地原始文件且授权上传时，把文件上传到该 Requirement。只有 URL 的来源保留链接，不擅自下载转存。
4. GET 读回 Requirement，列出 acceptance-items 和 attachments，核对字段、顺序、归属和数量。
5. 停止；不创建 WorkItem，不流转状态，不进入代码或资产制作。

## Requirement Room 写入

1. 创建 Room，名称、描述和 module 使用批准值；描述先写共同目标、蓝图标记、交付轨道与“原始需求待创建”。不显式归档。
2. 创建 `[原始需求]` Requirement 并设置 `roomId`，用 `reason` 关联蓝图 ID/修订号。正文写来源、附件/链接、决策账本、假设、范围/非目标、决策门和变更影响，不套可执行 Agent 模板。
3. 把已授权的本地原始文件上传到 `[原始需求]`；附件只存一份。读回附件后再继续。
4. 再 GET Room 核对 `updatedAt` 未被他人改变，然后 PATCH 描述，写入原始需求 displayKey、链接和蓝图标记，再 GET Room 核对。
5. 按 DAG 拓扑顺序创建可执行 Requirement。渲染正文时，把临时前置编号替换为已读回的真实 displayKey、标题与链接；同 wave 无前置的卡顺序不代表执行依赖。
6. 每创建一张 Requirement，立即写入它的原生 acceptance-items，再 GET Requirement 并列出验收项，记录 UUID、displayKey、title、category、roomId、链接和数量。
7. 全部写入后再次 GET Room 和所有 Requirement，核对 Room 聚合、蓝图标记、归属、字段、验收项和附件。当前合同没有通用 Requirement 前置关系写接口时，依赖保留在正文；不得臆造结构化依赖端点。

预研结论尚未锁定、且结论会改变正文的下游提纲不创建 Requirement。待结论确认后生成新蓝图修订并重新走查重与写入授权，不在旧授权范围里补建。

## 幂等恢复与部分成功

- 每个写请求的检查点是“对象已 GET 读回，且子资源数量/内容已核对”。Requirement 已创建但验收项或附件缺失属于部分成功，只补缺失子资源，不重建 Requirement。
- 网络错误、超时或 5xx 后，先用已知 UUID；没有 UUID 时用蓝图标记、精确标题和 Room 归属查是否落库。只有确认不存在才重发。
- 已读回成功的对象不得重建。从 DAG 中第一个缺失对象或缺失子资源继续；不得为了伪装原子性删除用户可见 PM 数据。
- 409 先重新读取并报告并发变化；不得覆盖。422 按 ProblemDetails 修正一次，第二次仍失败就停止并报告 `traceId`。401/403、423、429 和网络/5xx 完整遵循 `workflow-ops` 失败表。
- 重试前重新核对目标项目；上下文、profile 或 Host 变化立即停止。创建范围因恢复判断发生变化时，再向用户确认新增写操作。

## 收尾

最终报告包含蓝图 ID/修订号、目标项目、Room（如有）、所有 Requirement、原生验收项、附件、复用项、失败/未创建项及其恢复点。没有逐对象读回证据，不得声称写入完成。
