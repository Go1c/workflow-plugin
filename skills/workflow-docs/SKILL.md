---
name: workflow-docs
description: 用户询问 Workflow（workflow.games）的 API 或产品功能怎么用、字段什么含义、支不支持某个能力、错误码什么意思，但不需要立刻执行操作时使用。抓取线上文档作答，不凭记忆。
---

# workflow-docs — 查 Workflow 文档并作答

## 铁律：必须抓取来源作答，不凭记忆

平台迭代快，你记忆里的端点、字段、枚举很可能已经过期。**每个答案都要有当次抓取的来源支撑**；抓不到就说抓不到，不编。

## 三级下钻

按 [workflow-ops/references/connection.md](../workflow-ops/references/connection.md) 第三节的 L1 → L2 → L3 阶梯抓取：**L1** 文档索引 → **L2** 人读指南（多数问题到这层就够）→ **L3** OpenAPI 合同（13000+ 行，**grep 定位后分段读，不要整读**）。「究竟哪个字段必填」「枚举到底有哪些值」以 L3 为准。

## 回答口径

- 涉及具体端点时，给出 **operationId** 和人读参考页链接：`https://workflow.games/wiki/api/<operationId>`（页面上有 curl 示例，用户可直接照抄）。
- 讲字段含义时注明来源层级（哪份 guide / 合同哪个 schema），让用户可复核。
- 支不支持某能力：以当次抓取的合同为准——合同里没有就回答「当前合同没有这个能力」，**不猜测未公开的 roadmap**，不替平台承诺「以后会有」。
- 错误码含义：结合 ProblemDetails 结构解释（`title` / `detail` / `traceId`），常见约定——401 未认证、403 权限不足、422 字段问题、423 项目冻结、429 限流（看 `Retry-After`）。

## 从「问」变「做」

用户从询问转为要实际执行操作（建需求、记 bug、改状态……）时，**转 workflow-ops 技能**；需要先接入或修连接问题时转 workflow-setup。本技能只答疑，不执行写操作。
