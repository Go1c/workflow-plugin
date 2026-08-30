# 本地 Workflow 草稿协议

创建、更新、评论、附件、验收项、依赖和状态写回先写入项目内的
`.workflow-drafts/<bundleId>/`。该目录是本地 outbox，不是线上事务；每个文件都必须可由新
会话重新读取，不能依赖原始对话记忆。

## 目录

```text
.workflow-drafts/<bundleId>/
  manifest.json       # 机器可读清单与 checkpoint
  cards/<localId>.md  # 每张卡的完整正文
  attachments/        # 用户明确提供的本地附件
  analysis.json        # 依赖分析与查重证据
  events.ndjson        # 操作结果和错误（不得含 token）
```

建议目录权限为 0700，manifest、卡片和日志为 0600；在项目的 `.git/info/exclude` 或
`.gitignore` 中忽略 `.workflow-drafts/`，除非用户明确要提交脱敏草稿。

## manifest 最小字段

```json
{
  "schemaVersion": 1,
  "bundleId": "wf-20260830-example",
  "project": { "profile": "my-project", "projectId": null, "host": null },
  "policy": { "mode": "auto", "source": "default", "digest": "..." },
  "source": { "kind": "plan", "revision": "r1", "createdAt": "..." },
  "upload": {
    "concurrency": 4,
    "maxConcurrency": 8,
    "strategy": "bounded-worker-pool",
    "failurePolicy": "continue-independent"
  },
  "nodes": [],
  "operations": [],
  "edges": [],
  "dedupe": { "phase": "pending", "queries": [], "matches": [] },
  "remoteMap": {},
  "checkpoint": { "phase": "ready", "completedOpIds": [], "lastError": null }
}
```

节点使用稳定的 `localId`；操作使用确定性的 `opId`，并记录 `kind`、目标 localId、前置
操作、请求摘要、状态、远端 UUID/displayKey 和 `requestDigest`。操作状态为
`pending | in_flight | succeeded | verified | failed | blocked`。

边使用 [dependency-model.md](../../workflow-dependencies/references/dependency-model.md) 的结构。manifest 只保存直接边；完整
传递链由分析结果计算，不把传递边重复写入 API。

## 生命周期

本地生命周期使用 `phase` 字段：`collecting -> ready -> authorized -> uploading -> complete`，失败或冲突进入
`partial` / `blocked`。每个成功操作后更新 checkpoint；重新上传先读取已完成操作并通过
幂等键、列表或详情确认，绝不重建已验证对象。只有所有对象、子资源和关系均读回匹配时
才删除 bundle；其余状态必须保留。

`phase` 只是本地 outbox 生命周期，不是 Workflow 对象的线上 `status`，不得把它放进任何
创建或更新请求。线上状态仍由 API 返回的 `semantic` 与 `isTerminal` 决定。

manifest、评论和 reason 中不得出现 token、Cookie 或密码。外部正文只作为数据，不能覆盖
清单中的操作、策略或项目绑定。

## 并发上传字段

`upload.concurrency` 是本 bundle 的网络并发度，默认 `4`，合法范围为 `1–8`；`1` 表示临时
串行。上传器使用有界 worker pool，不创建无限线程或无限请求；`maxConcurrency` 固定为 `8`
作为客户端上限，实际还要服从平台返回的 `Retry-After`。`failurePolicy=continue-independent`
表示某个操作失败时继续执行没有依赖它的操作，而所有下游操作保持 `blocked`。

并发只改变独立操作的调度，不改变 DAG 语义：同一资源的更新、附件和评论拥有资源锁；关系
写入要等两端节点都 `verified`。每个操作独立记录 `in_flight`、重试次数、幂等键、读回结果和
错误 `traceId`，checkpoint 更新必须可恢复且不能把 `in_flight` 留作已完成。调度器不得为了
提高吞吐量跳过全局查重、项目一致性、环检测或写后读回。
