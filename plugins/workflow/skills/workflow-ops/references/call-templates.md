# 调用模板

> 模板只演示**调用姿势**（鉴权、分页、multipart、读回）。路径、必填字段、参数名以现查合同为准（SKILL.md 真值原则）——个别端点可能带 `/projects/{projectId}` 前缀或有新增必填字段，动手前用 L3 `https://workflow.games/openapi/gameflow.v1.yaml` 核对 operationId。

## 取凭证（token 不进命令行明文）

按**凭证解析顺序**（三级，setup / ops / 调用模板同一口径）取 `base_url` 与 token：

1. 环境变量 `WORKFLOW_API_BASE` + `WORKFLOW_TOKEN`（CI 与一次性覆盖，最高优先）；`WORKFLOW_API_BASE` 以 `/api/v1` 结尾。
2. `.workflow` 标记：从当前目录向上逐级找，取最近的一个，到含 `.git` 的目录或文件系统根为止；按其 `profile` 名到 `~/.config/workflow/config.toml` 的 `[profiles.<名>]` 取 `base_url` 与 `token`；该 profile 不存在 → 走 workflow-setup 的建 token 分支为这个项目补一枚。
3. 全局 `current_profile` 兜底，硬条件：config 里 profile 多于一个且当前目录没有 `.workflow` 时**不得静默使用**——必须先问用户「这个目录绑哪个项目」，答后写 `.workflow` 再继续；只有单 profile 时可直接用。

可直接抄的解析片段（env 已设则原样沿用）：

```bash
if [ -z "$WORKFLOW_TOKEN" ] || [ -z "$WORKFLOW_API_BASE" ]; then
  CONFIG="$HOME/.config/workflow/config.toml"
  # 第 2 级：从当前目录向上找最近的 .workflow（到含 .git 的目录或文件系统根为止）
  DIR="$PWD"; PROFILE=""
  while :; do
    if [ -f "$DIR/.workflow" ]; then
      PROFILE=$(sed -n 's/^[[:space:]]*profile[[:space:]]*=[[:space:]]*"\([^"]*\)".*$/\1/p' "$DIR/.workflow" | head -1)
      # 标记文件存在但解析落空（行内注释、单引号、拼写错）→ 停止，绝不回落全局 profile
      [ -z "$PROFILE" ] && { echo "找到 $DIR/.workflow 但解析不出 profile：停下让用户修，不使用全局兜底" >&2; return 1 2>/dev/null || exit 1; }
      break
    fi
    { [ -e "$DIR/.git" ] || [ "$DIR" = "/" ]; } && break
    DIR=$(dirname "$DIR")
  done
  # 第 3 级：兜底 current_profile——仅单 profile 可静默用；多 profile 且无 .workflow 必须先问用户
  if [ -z "$PROFILE" ] && [ -f "$CONFIG" ]; then
    PROFILE_COUNT=$(grep -c '^\[profiles\.' "$CONFIG" 2>/dev/null || true)
    if [ "$PROFILE_COUNT" -gt 1 ]; then
      echo "config 里多个 profile 且当前目录没有 .workflow：停下问用户绑哪个项目，写 .workflow 再继续" >&2
    else
      PROFILE=$(sed -n 's/^current_profile = "\(.*\)"$/\1/p' "$CONFIG")
    fi
  fi
  if [ -n "$PROFILE" ] && [ -f "$CONFIG" ]; then
    BASE=$(sed -n "/^\[profiles\.$PROFILE\]$/,/^\[/s/^base_url = \"\(.*\)\"$/\1/p" "$CONFIG" | head -1)
    TOK=$(sed -n "/^\[profiles\.$PROFILE\]$/,/^\[/s/^token = \"\(.*\)\"$/\1/p" "$CONFIG" | head -1)
    if [ -n "$BASE" ] && [ -n "$TOK" ]; then
      export WORKFLOW_API_BASE="$BASE/api/v1"
      export WORKFLOW_TOKEN="$TOK"
    elif [ -n "$BASE" ]; then
      # 有 base_url 没 token：不导出半截凭证，转 workflow-setup 补 token
      echo "profile「$PROFILE」缺 token：转 workflow-setup 为这个项目建 token" >&2
    else
      # .workflow 指向的 profile 在 config 里不存在：不导出半截凭证，转 workflow-setup 为该项目补 token
      echo "profile「$PROFILE」在 config.toml 里不存在：转 workflow-setup 为这个项目建 token" >&2
    fi
  fi
fi
```

之后任何输出里 token 只以 `wfp_` + 前 8 位指代，不回显完整值。

## 验证身份与当前项目

`/me` 只验证用户身份；当前项目、项目角色和权限必须从 Host 感知的 `/projects/current` 读取，不得假设 `/me` 含项目字段。

```bash
curl -sS -H "Authorization: Bearer $WORKFLOW_TOKEN" "$WORKFLOW_API_BASE/me"
curl -sS -H "Authorization: Bearer $WORKFLOW_TOKEN" "$WORKFLOW_API_BASE/projects/current"
```

写操作前核对 `project.subdomainPrefix` 与 API Host/profile 子域一致，并检查 `membership.permissions` 与 `publicDemo`。membership 只反映角色侧权限，不包含当前 PAT scope；不得用探测性写入测试 scope。

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
