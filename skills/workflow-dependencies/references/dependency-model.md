# 依赖模型

## 节点与边

节点的 `localId` 在 bundle 内稳定，线上对象用 UUID；`displayKey` 只用于展示和正文引用。
核心边模型如下：

```json
{
  "edgeId": "edge-A-C",
  "upstream": { "localId": "A", "objectType": "requirement", "remoteId": null },
  "downstream": { "localId": "C", "objectType": "requirement", "remoteId": null },
  "relation": "prerequisite",
  "classification": "direct",
  "source": "explicit",
  "confidence": 1,
  "inferenceMethod": "explicit-text",
  "evidence": [{ "localId": "C", "locator": "body:边界", "quote": "依赖 A" }],
  "bundleId": "wf-example"
}
```

`upstream -> downstream` 是唯一方向；API 的 `source/target` 由 Provider 映射，核心模型不
直接使用这两个有歧义的名字。`classification=transitive` 只出现在分析输出，不直接写 API。

例如用户先创建 A、B，再创建依赖两者的 C：模型保留两条 direct edge `A -> C`、`B -> C`。
若同时存在 `A -> B`，分析结果还会报告传递链 `A -> B -> C`，但不会把传递边重复写入 Provider。

## 证据与自动化

- manifest 中的 `dependsOn`、明确 displayKey/UUID 和“必须先完成”语句属于 `explicit`。
- 模型从目标、验收、边界、评论和附件上下文推断的关系属于 `inferred`，仍自动加入 bundle，
  但必须保留置信度和原文证据。
- 关系写入失败不通过“降低置信度”掩盖；保留错误、traceId 和 Provider 状态。

## 图算法与状态

对直接边做拓扑排序和传递闭包。发现自环或环时，停止关系写入并保留完整环路径；不把环
拆掉或静默改方向。发现同一端点的重复边时只保留一个确定性 `edgeId`。

当前阻塞链从下游节点反向遍历前置边：前置状态不是完成语义、状态未知、或其验收未达到
项目定义的通过语义时，标记为 `blocked`；终态但语义为取消/重复的节点不能默认视为完成。

所有引用必须解析到同一项目的唯一对象。跨项目引用可在报告中保留 deep link，但不自动
建立项目内关系。
