# 调用模板

> 模板只演示**调用姿势**（鉴权、分页、multipart、读回）。个别端点可能带 `/projects/{projectId}` 前缀或有新增必填字段；路径与字段拿不准时按 [connection.md](connection.md) 的真值分层处理。

## 取凭证与验证连接

**凭证三级解析、可直接抄的 shell 片段、`/me` 与 `/projects/current` 的分工、写操作三方一致性防呆，全部见 [connection.md](connection.md)。** 本文件不再重复，以免两处漂移。

所有模板都遵守 connection.md 第五节的纪律（token 走环境变量、输出只留前缀）。

## 建需求

```bash
curl -sS -X POST "$WORKFLOW_API_BASE/requirements" \
  -H "Authorization: Bearer $WORKFLOW_TOKEN" \
  -H "content-type: application/json" \
  --data '{"title":"战斗结算面板","priority":"P1"}'
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

```bash
curl -sS -H "Authorization: Bearer $WORKFLOW_TOKEN" \
  --get --data-urlencode "q=结算 闪退" "$WORKFLOW_API_BASE/search"
```

单号（`R-00001` / `B-00042`）走精确匹配；返回的 `deepLink` 可直接拼成 `https://<子域>.workflow.games<deepLink>` 给用户。

**能力边界**：`/search` 是薄端点——只对**标题**做 ILIKE 模糊匹配，**不做全文检索**，正文/描述里的内容搜不到，也没有 cursor 分页（只有 `limit`）。要按描述里的标记找对象，必须走对应列表端点分页逐条比对，不能指望 search。

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
# 1. 先 GET 可用流转（确切路径按合同现查）
curl -sS -H "Authorization: Bearer $WORKFLOW_TOKEN" \
  "$WORKFLOW_API_BASE/work-items/<uuid>/transitions"
# 2. 从返回里选 allowed=true 的 toStateKey，再 POST 执行
curl -sS -X POST "$WORKFLOW_API_BASE/work-items/<uuid>/transition" \
  -H "Authorization: Bearer $WORKFLOW_TOKEN" \
  -H "content-type: application/json" \
  --data '{"toStateKey":"in_progress","reason":"开始处理"}'
```

`allowed:false` 的边带 `blockedReason`/`guardCode`——转述给用户，不硬闯。

## 评论

```bash
curl -sS -X POST "$WORKFLOW_API_BASE/comments" \
  -H "Authorization: Bearer $WORKFLOW_TOKEN" \
  -H "content-type: application/json" \
  --data '{"targetType":"bug","targetId":"<uuid>","body":"复现步骤补充：冷启动必现"}'
```

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
