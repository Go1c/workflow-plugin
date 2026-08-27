# 拿单到交回（完整路径与模板）

调用姿势（鉴权、分页、multipart、读回）沿用 [workflow-ops 的 call-templates.md](../../workflow-ops/references/call-templates.md)；连接前置按 [connection.md](../../workflow-ops/references/connection.md)；读单按 [read-card.md](../../workflow-ops/references/read-card.md)；搜索按 [search.md](../../workflow-ops/references/search.md)。本文件只写执行者特有的路径。**全部写操作仅模式一执行**；模式二把对应动作的意图与素材写进交回报告（[handoff.md](handoff.md) 第二节）。

## 1. 找到自己该做的单

```bash
# 用户点名单号：精确定位拿 UUID
curl -sS -H "Authorization: Bearer $WORKFLOW_TOKEN" \
  --get --data-urlencode "q=R-00012" "$WORKFLOW_API_BASE/search"

# 没点名：我的工作台（PAT 自动收敛到 token 绑定的项目）
curl -sS -H "Authorization: Bearer $WORKFLOW_TOKEN" "$WORKFLOW_API_BASE/me/workbench"

# 或按负责人 / 待办人过滤工作项（<me-uuid> 从 GET /me 读 id）
curl -sS -H "Authorization: Bearer $WORKFLOW_TOKEN" \
  --get --data-urlencode "ownerId=<me-uuid>" "$WORKFLOW_API_BASE/work-items"
curl -sS -H "Authorization: Bearer $WORKFLOW_TOKEN" \
  --get --data-urlencode "activeUserId=<me-uuid>" "$WORKFLOW_API_BASE/work-items"
```

- workbench 的 `view=owned`（默认）= 我负责的需求 + 指派给我的工作项；`workItemsTruncated` / `requirementsTruncated` 为 true 时说明还有更多，改走列表端点翻页取全。
- `ownerId` 是负责人、`activeUserId` 是当前轮到的待办人，两者独立；「轮到我处理」优先看后者。
- 多张候选 → 列 displayKey + 标题 + 状态给用户/调度方选，不自作主张挑一张开工。

## 2–3. 读单、找关联、核对前置

- [read-card.md](../../workflow-ops/references/read-card.md) 四路拉全；正文里引用的前置单、关联单**逐张 GET** 看状态。
- 「以前有没有做过类似的 / 当时怎么决策的」按 [search.md](../../workflow-ops/references/search.md) 先搜（历史同类单的评论与 activity 是现成答案）。
- 前置未满足（按卡内声明的客观口径）→ 停止并报告缺什么，不偷跑、不自行降级前置。

## 4. 开工流转

```bash
# 需求单
curl -sS -H "Authorization: Bearer $WORKFLOW_TOKEN" "$WORKFLOW_API_BASE/requirements/<uuid>/transitions"
curl -sS -X POST "$WORKFLOW_API_BASE/requirements/<uuid>/transition" \
  -H "Authorization: Bearer $WORKFLOW_TOKEN" -H "content-type: application/json" \
  --data '{"toStateKey":"<从 transitions 选 allowed=true 的进行中语义边>","reason":"开始执行 <本卡 displayKey>"}'
# 工作项 / 缺陷：把路径换成 /work-items/<uuid>/transitions 与 /work-items/<uuid>/transition
```

- 工作项处于**待认领态**（`activeSlotKey` 非空且 `activeUserId` 为空）且自己是槽成员 → 先认领再开工：`POST /work-items/<uuid>/slots/<slotKey>/claim`。
- 卡已在进行中且待办人是自己 → 不重复流转，直接开工。
- 没有语义匹配且 `allowed=true` 的边 → 转述 `blockedReason` / `guardCode` 给用户/调度方，问明再动；不硬闯、不跳状态、不 PATCH status。
- 读回确认状态已变（G3）再进入执行。

## 5. 干活（本插件不管辖）

目标仓库里的开发/制作按卡内要求与所在环境规则执行。期间：发现需求描述有误、发现新 bug、需要越出卡内范围 → **报给用户/调度方**，不擅自建单、改单、动别人的卡。

## 6. 完成回写（固定顺序，每步读回）

顺序不是风格问题：先有证据、再有结论、最后才流转——倒过来会出现「已流转待验收但一条证据都没有」的窗口。

1. **上传证据附件**（截图 / 报告文件）→ 按 `(targetType, targetId)` 读回核对数量与归属。
2. **POST 证据评论**（模板见 [handoff.md](handoff.md) 第一节）→ 读回核对正文与目标单。评论要引用截图的，先传附件再在正文里写文件名。
3. **流转到待验收**：`GET` transitions → 选 `allowed=true` 且语义为「待验收 / 待验证」的边 → `POST` 带 reason → 读回。没有合适的边 → **保持当前状态**，在交回报告里写明建议状态与 `blockedReason`，让有权限的人处理。
4. **不做的事**：不改 description、不动验收项状态（`run_acceptance` 是验收方的）、不把卡流转到完成态——完成由验收方判定。

## 失败处置

按 [connection.md](../../workflow-ops/references/connection.md) 失败处置表。执行场景最容易踩的一条：**评论 / 附件在网络错误或 5xx 后重发前，必须先读回列表确认是否已落库**——重复证据评论会让验收方核对两份对不上的清单。
