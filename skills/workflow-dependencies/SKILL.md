---
name: workflow-dependencies
description: 分析 Workflow 单据或本地草稿的上下游依赖，补全直接关系、计算传递链并生成可审计的关系写入清单；不负责代码图谱或关系图 UI。
---

# workflow-dependencies — 依赖分析与关系补全

本技能读取线上单据或 `.workflow-drafts/<bundleId>/`，输出依赖 DAG、上下游链、当前阻塞
链和待写入关系。先读取 [dependency-model.md](references/dependency-model.md)
与 [relation-provider.md](../workflow-ops/references/relation-provider.md)。需要线上写入时
转 [workflow-upload](../workflow-upload/SKILL.md)，不绕过权限模式直接调用 API。

## 流程

1. 读取草稿/单据正文、评论、附件元数据、验收项和已有关系；按共享搜索规则做项目级全局搜索。
2. 解析 displayKey、UUID、本地 ID、深链和明确的“依赖/阻塞/前置”语句。
3. 用模型补全语义关系；每条关系必须同时写入证据片段、来源位置、推断方式和置信度。
4. 规范方向为“上游/前置 -> 下游/后继”，去重并检查自环、环、孤儿或跨项目引用。
5. 计算传递闭包、根节点、叶节点、完整关系链和当前阻塞链；状态判定使用 workflow 返回的
   `semantic` 与 `isTerminal`，不硬编码状态名。
6. 将所有可解析的直接边写入 manifest 的边清单。Requirement direct edge 交给
   `bindRequirementReference` 对应的原生 Provider；WorkItem edge 交给 schedule relations。
   按当前权限模式决定后续上传方式；不逐边询问。环、跨项目、无法唯一解析的引用和权限/并发
   冲突是硬阻塞。无向 `references` 只表达关联存在，不能把它当成依赖方向。

## 输出

写入同一 bundle 的 `analysis.json`，并向用户报告：直接边、传递链、阻塞节点、证据、置信度、
Provider 能力和仍需处理的阻塞。Requirement 引用通过 `GET /api/v1/requirement-graph`
读回，但图谱的 `source` / `target` 是无向展示顺序；分析结果不代表依赖方向已经线上落库。
只有上传器完成 Provider 读回后才能报告原生引用已建立。

## 边界

只处理 Workflow PM 对象之间的关系。代码依赖图、需求图谱 UI、自动修改代码和自动删除已有
关系均不在本技能范围。
