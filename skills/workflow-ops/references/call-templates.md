# 调用模板

> 模板只演示**调用姿势**（鉴权、分页、multipart、读回）。个别端点可能带 `/projects/{projectId}` 前缀或有新增必填字段；路径与字段拿不准时按 [connection.md](connection.md) 的真值分层处理。

## 取凭证与验证连接

**凭证三级解析、可直接抄的 shell 片段、`/me` 与 `/projects/current` 的分工、写操作三方一致性防呆，全部见 [connection.md](connection.md)。** 本文件不再重复，以免两处漂移。

所有模板都遵守 connection.md 第五节的纪律（token 走环境变量、输出只留前缀）。

## 建需求（正文口径见 card-spec.md：裸标题不落库）

```bash
curl -sS -X POST "$WORKFLOW_API_BASE/requirements" \
  -H "Authorization: Bearer $WORKFLOW_TOKEN" \
  -H "content-type: application/json" \
  --data '{
    "title":"战斗结算面板",
    "description":"## 背景\n…\n\n## 目标\n…\n\n## 验收\n- …\n\n## 边界\n…",
    "reason":"按用户指令建单"
  }'
```

## 记 bug（字段口径见 bug-fields.md）

```bash
curl -sS -X POST "$WORKFLOW_API_BASE/work-items" \
  -H "Authorization: Bearer $WORKFLOW_TOKEN" \
  -H "content-type: application/json" \
  --data '{
    "title":"结算页负责人显示为原始 id",
    "description":"现象：…\n期望：…\n证据：…\n仅记录 bug，不启动修复。",
    "type":"bug","priority":"P1",
    "reason":"线上反馈记录，不启动修复"
  }'
```

**不传 `status`**：后端按项目绑定的工作流落初始态；显式传的值要过该工作流的合法状态集校验，硬写 `todo` 在改过初始态名的项目上必 422。`severity` 同理——用户没评估就不传，别默认 `major`（见 bug-fields.md）。

## 查重 / 搜索

**能力口径、必搜场景与模板全部见 [search.md](search.md)**——`/search` 已支持标题+摘要+正文召回、`types`/`scope`/`status` 过滤与 cursor 分页；「不存在证明」仍以列表翻页为准。本文件不再重复，以免两处漂移。

## 列表取全量（cursor 循环）

**空 `nextCursor` 才是终点，短页不是。** 循环骨架：

```bash
CURSOR=""
while :; do
  RESP=$(curl -sS -H "Authorization: Bearer $WORKFLOW_TOKEN" \
    --get --data-urlencode "limit=250" ${CURSOR:+--data-urlencode "cursor=$CURSOR"} \
    "$WORKFLOW_API_BASE/work-items")
  echo "$RESP" | python3 -c 'import sys,json;[print(i["displayKey"],i["title"]) for i in json.load(sys.stdin)["items"]]'
  CURSOR=$(echo "$RESP" | python3 -c 'import sys,json;print(json.load(sys.stdin)["nextCursor"])')
  [ -z "$CURSOR" ] && break
done
```

游标是不透明 token：原样回传，不自拼不修改；伪造/过期游标会 422。

## 指派 / 改字段

```bash
curl -sS -X PATCH "$WORKFLOW_API_BASE/work-items/<uuid>" \
  -H "Authorization: Bearer $WORKFLOW_TOKEN" \
  -H "content-type: application/json" \
  --data '{"ownerId":"<user-uuid>","reason":"按用户指令改派"}'
```

省略的字段一律不改动；清空类操作要用合同里的显式开关（如 `clearRoom`），传空串不生效。

## 状态流转（先看菜单再点菜）

```bash
# 1. 先 GET 可用流转（工作项与需求两条路径均已核实存在）
curl -sS -H "Authorization: Bearer $WORKFLOW_TOKEN" \
  "$WORKFLOW_API_BASE/work-items/<uuid>/transitions"
# 需求单换成 $WORKFLOW_API_BASE/requirements/<uuid>/transitions
# 2. 从返回里选 allowed=true 的 toStateKey，再 POST 执行
curl -sS -X POST "$WORKFLOW_API_BASE/work-items/<uuid>/transition" \
  -H "Authorization: Bearer $WORKFLOW_TOKEN" \
  -H "content-type: application/json" \
  --data '{"toStateKey":"<从 transitions 现查>","reason":"开始处理"}'
```

`allowed:false` 的边带 `blockedReason`/`guardCode`——转述给用户，不硬闯。`requireReason=true` 的边必须带非空 `reason`，否则 422；CAS 冲突返回 409，重新读取后再试。

## 重开 / 变更波及（逆向流转）

```bash
# 1. 现查被波及卡的 transitions，找回到工作态的边（逆向边是否存在取决于项目工作流配置）
curl -sS -H "Authorization: Bearer $WORKFLOW_TOKEN" \
  "$WORKFLOW_API_BASE/requirements/<uuid>/transitions"
# 2. 有 allowed=true 的逆向边 → POST，reason 写明波及来源
curl -sS -X POST "$WORKFLOW_API_BASE/requirements/<uuid>/transition" \
  -H "Authorization: Bearer $WORKFLOW_TOKEN" \
  -H "content-type: application/json" \
  --data '{"toStateKey":"<从 transitions 现查>","reason":"上游 <来源单 displayKey> 变更波及，退回重做"}'
# 3. 在被波及卡上补一条评论，关联引发变更的单号
curl -sS -X POST "$WORKFLOW_API_BASE/comments" \
  -H "Authorization: Bearer $WORKFLOW_TOKEN" \
  -H "content-type: application/json" \
  --data '{"targetType":"requirement","targetId":"<uuid>","body":"因 <来源单 displayKey>（<链接>）变更重开：<波及了什么、需要重做什么>"}'
```

没有 `allowed=true` 的逆向边 → 转述 `blockedReason`/`guardCode`，让用户找项目管理员在工作流里配逆向边；**不硬 `PATCH` status 绕道**。

## 建需求室 / 里程碑

```bash
# Room：name ≤ 80、description ≤ 2000、module ≤ 80（字符语义，中文一个字算一个）
curl -sS -X POST "$WORKFLOW_API_BASE/rooms" \
  -H "Authorization: Bearer $WORKFLOW_TOKEN" -H "content-type: application/json" \
  --data '{"name":"战斗结算改版","description":"<共同目标与范围>"}'

# 里程碑：title + targetOn 必填；不传 status（由关联需求进度自动派生）
curl -sS -X POST "$WORKFLOW_API_BASE/schedule/milestones" \
  -H "Authorization: Bearer $WORKFLOW_TOKEN" -H "content-type: application/json" \
  --data '{"title":"结算改版集成","kind":"integration","targetOn":"2026-09-30","reason":"按用户指令创建"}'

# 把需求归属到里程碑（需求侧单选，归属新的自动解除旧的；reason 必填）
curl -sS -X PUT "$WORKFLOW_API_BASE/schedule/requirements/<uuid>/milestone" \
  -H "Authorization: Bearer $WORKFLOW_TOKEN" -H "content-type: application/json" \
  --data '{"milestoneId":"<milestone-uuid>","reason":"纳入结算改版集成节点"}'
```

## 评论

```bash
curl -sS -X POST "$WORKFLOW_API_BASE/comments" \
  -H "Authorization: Bearer $WORKFLOW_TOKEN" \
  -H "content-type: application/json" \
  --data '{"targetType":"bug","targetId":"<uuid>","body":"复现步骤补充：冷启动必现"}'
```

评论要带图：先 POST 评论拿到评论 id，再传 `targetType=comment`、`targetId=<评论 uuid>` 的附件（两次请求，没有复合端点）。评论附件不会出现在宿主对象的附件列表里，要按评论 id 查。

## 附件（multipart）

```bash
curl -sS -X POST "$WORKFLOW_API_BASE/attachments" \
  -H "Authorization: Bearer $WORKFLOW_TOKEN" \
  -F "targetType=bug" -F "targetId=<uuid>" -F "file=@./screenshot.png"
```

上传后用列表端点按 `(targetType, targetId)` 读回确认；**后续列示用响应里返回的 `targetType`**（服务端会按目标真实类型归一）。

## 读回验证

```bash
curl -sS -H "Authorization: Bearer $WORKFLOW_TOKEN" "$WORKFLOW_API_BASE/work-items/<uuid>"
```

每个写操作之后都读回一次，拿 `displayKey` + UUID + 标题进交付报告。
