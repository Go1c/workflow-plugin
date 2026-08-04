# 调用模板

> 模板只演示**调用姿势**（鉴权、分页、multipart、读回）。路径、必填字段、参数名以现查合同为准（SKILL.md 真值原则）——个别端点可能带 `/projects/{projectId}` 前缀或有新增必填字段，动手前用 L3 `https://workflow.games/openapi/gameflow.v1.yaml` 核对 operationId。

## 环境变量（token 不进命令行明文）

从凭证文件读当前 profile，赋给环境变量后再调 curl：

```bash
CONFIG="$HOME/.config/workflow/config.toml"
PROFILE=$(sed -n 's/^current_profile = "\(.*\)"$/\1/p' "$CONFIG")
BASE=$(sed -n "/^\[profiles\.$PROFILE\]$/,/^\[/s/^base_url = \"\(.*\)\"$/\1/p" "$CONFIG" | head -1)
export WORKFLOW_API_BASE="$BASE/api/v1"
export WORKFLOW_TOKEN=$(sed -n "/^\[profiles\.$PROFILE\]$/,/^\[/s/^token = \"\(.*\)\"$/\1/p" "$CONFIG" | head -1)
```

之后任何输出里 token 只以 `wfp_` + 前 8 位指代，不回显完整值。

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
    "type":"bug","status":"todo","priority":"P1","severity":"major",
    "reason":"线上反馈记录，不启动修复"
  }'
```

## 查重 / 搜索

```bash
curl -sS -H "Authorization: Bearer $WORKFLOW_TOKEN" \
  --get --data-urlencode "q=结算 闪退" "$WORKFLOW_API_BASE/search"
```

单号（`R-00001` / `B-00042`）走精确匹配；返回的 `deepLink` 可直接拼成 `https://<子域>.workflow.games<deepLink>` 给用户。

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
