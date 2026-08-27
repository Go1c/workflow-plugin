# 编排元数据与 Room 盘点（共享规则）

多 Agent 编排里，调度方要「按批次取卡、按轨道过滤、核对前置、聚合盘点」，落单方要提前把这些信息编码进卡里。**本文件是落单与查询两侧共用的唯一口径**（planning 落单、ops 建单、execute 拿单、调度盘点都指回这里）。原则：**真字段 > 标题前缀 > 正文约定**——能被服务端过滤的优先。

## 一、编码口径表（字段与过滤能力均已按合同核实）

| 编排概念 | 承载 | 落单侧怎么写 | 查询侧怎么取 |
| --- | --- | --- | --- |
| 批次 / 卡集合 | **Room（真字段 `roomId`）** | 建 Room 后按 `roomId` 归属，或 `POST /rooms/<uuid>/objects` 批量收纳既有单 | `GET /requirements?roomId=` 与 `GET /work-items?roomId=`（都 cursor 分页） |
| 阶段 / 时间节点 | **里程碑（真字段，需求侧单选归属）** | `PUT /schedule/requirements/<uuid>/milestone`（`reason` 必填） | 里程碑的 `requirementIds` 列表：`GET /schedule/snapshot`（milestones 恒返回）或 `/search?types=milestone`；状态由需求进度自动派生 |
| 负责人 / 待办人 | **`ownerId` / `activeUserId`（真字段）** | 建单或 PATCH 指派 | `GET /work-items?ownerId=` 或 `?activeUserId=`；需求列表**没有** ownerId 过滤 → 用 `GET /me/workbench`（view=owned）或列表翻页后本地过滤 |
| 专业 / 轨道 | 标题前缀（planning 惯例 `[程序·客户端]` 等） | 标题前缀 | `/search?scope=title` 搜前缀初筛；权威口径 = 列表翻页 + 本地过滤 |
| 模块 | `module`（真字段，但**列表端点不可按它过滤**） | 对齐项目既有取值 | 列表翻页后本地过滤——不要臆造 module 查询参数 |
| 波次 / 前置依赖 | **正文约定**：前置单 displayKey + 完成口径写进卡的「执行前置 / 边界」 | planning 模板与 card-spec 已含 | `/search?scope=body` 搜引用初筛；**权威判定 = 逐张 GET 前置卡看状态**（见第三节） |

## 二、按批取卡骨架（cursor 翻到空为止）

```bash
CURSOR=""
while :; do
  RESP=$(curl -sS -H "Authorization: Bearer $WORKFLOW_TOKEN" \
    --get --data-urlencode "roomId=<room-uuid>" --data-urlencode "limit=250" \
    ${CURSOR:+--data-urlencode "cursor=$CURSOR"} \
    "$WORKFLOW_API_BASE/requirements")
  echo "$RESP" | python3 -c 'import sys,json;[print(i["displayKey"],i["status"],i["title"]) for i in json.load(sys.stdin)["items"]]'
  CURSOR=$(echo "$RESP" | python3 -c 'import sys,json;print(json.load(sys.stdin)["nextCursor"])')
  [ -z "$CURSOR" ] && break
done
```

`/work-items?roomId=` 同款循环；加 `includeTransitions=true` 可在同一响应里带上每张卡的可用流转（`availableTransitions`），省掉逐卡查 transitions 的 N+1。

## 三、前置核对

派卡 / 开工前逐张 `GET` 前置卡，按**卡内声明的完成口径**对照其当前状态——「搜到了」不等于「完成了」。状态词表是项目自定义（G6），不拿固定词硬猜；拿不准某状态算不算「完成」时报给用户判断。

## 四、Room 盘点（聚合验收的数据源）

1. **总账**：`GET /rooms/<uuid>/overview`——服务端在全量数据上算的精确计数：`phase`（派生阶段）、需求分桶（backlog / unstarted / started / completed / canceled / triage / duplicate）、工作项 active/closed、验收缺口（缺验收项的需求数、被阻塞项数、未通过项数）、缺陷未解决数与 blocker 数、下一步建议。需要需求室 + 需求 + 缺陷三个模块的 read，任一不足整份 403。
2. **明细**：`GET /requirements?roomId=`（cursor 到空）→ 每张需求 `GET /requirements/<uuid>/acceptance-items` + `GET /comments?targetType=requirement&targetId=` 取验收状态与证据评论；`GET /work-items?roomId=&includeTransitions=true` 取缺陷/任务与其可用流转。
3. **汇总纪律**：以 overview 计数为准、明细为证；两边对不上先报差异再下结论（常见原因：翻页没走完、模块权限裁剪了明细）。

## 五、平台当前不支持的能力（不得在提示词或蓝图里臆造）

- **需求级依赖关系没有写 API**：`/schedule/relations` 只连工作项、只有 `finish_to_start`。需求间依赖只能落正文约定。
- **`/object-links` 只读**（首版），没有创建端点：「关联单号」用正文 / 评论里的 displayKey 引用表达。
- `/requirements` 列表只有 `roomId` 过滤（无 ownerId / status / module）；`/work-items` 列表无 status 过滤——状态过滤用 `/search?status=`（值先现查）或取回后本地过滤。
- `/rooms` 与 `/comments` 列表只有 `limit`、无 cursor。

需要以上能力时，把它列成**平台需求建议**报给用户，不在插件侧硬绕。
