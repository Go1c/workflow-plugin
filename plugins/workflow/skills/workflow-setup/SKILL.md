---
name: workflow-setup
description: 首次接入 Workflow（workflow.games）、还没有账号或 API token、调 Workflow API 遇到 401 或 403 需要诊断、想查当前连接状态、或要新增/切换项目 profile 时使用。负责注册引导、token 配置写盘与连接验证，不做业务操作。
---

# workflow-setup — 接入 Workflow 并验证连接

## 完成判据（先看这个）

`GET <base_url>/api/v1/me` 返回 200，并且你已经向用户报告：**「以 <用户名> 连接到项目 <项目>，角色 <角色>」**。没走到这一步，接入就不算完成——中间任何分支做完都要回到这条验证。

## Step 0 — 静默探测（每次都先做，不问用户）

按**凭证解析顺序**（三级，setup / ops / 调用模板同一口径）取 `base_url` 与 token：

1. 环境变量 `WORKFLOW_API_BASE` + `WORKFLOW_TOKEN`（CI 与一次性覆盖，最高优先）；`WORKFLOW_API_BASE` 以 `/api/v1` 结尾。
2. `.workflow` 标记：从当前目录向上逐级找，取最近的一个，到含 `.git` 的目录或文件系统根为止；按其 `profile` 名到 `~/.config/workflow/config.toml` 的 `[profiles.<名>]` 取 `base_url` 与 `token`；该 profile 不存在 → 走 workflow-setup 的建 token 分支为这个项目补一枚。
3. 全局 `current_profile` 兜底，硬条件：config 里 profile 多于一个且当前目录没有 `.workflow` 时**不得静默使用**——必须先问用户「这个目录绑哪个项目」，答后写 `.workflow` 再继续；只有单 profile 时可直接用。

取到凭证 → 探测 `GET <base_url>/api/v1/me`。探测通过 → 直接按完成判据报告，结束本技能。探测失败或全局 config 不存在 → 按下面分支走。

curl 携带 token 一律走环境变量，不把明文拼进命令行：

```bash
curl -sS -H "Authorization: Bearer $WORKFLOW_TOKEN" "$WORKFLOW_API_BASE/me"
```

## 项目绑定与多项目（`.workflow` 标记）

一台机器接多个项目时，插件全局只装一份、`config.toml` 每项目一节 profile，项目目录用 `.workflow` 标记文件声明「这个目录绑哪个 profile」：

- **位置**：项目仓库根（或当前工作目录）。查找规则：从当前目录向上逐级找，取最近的一个，到含 `.git` 的目录或文件系统根为止。
- **内容**：一行 TOML——`profile = "<profile 名>"`（双引号）；允许**整行** `#` 注释（不支持行内注释，会导致解析落空）；仅此一键，**不含 token**，可提交进版本库与全队共享（每人的 token 仍在各自全局 config 里）。
- **写入时机**：setup 完成项目绑定时问用户「要不要把绑定写进当前项目（`.workflow` 文件）」，默认写。

`.workflow` 是独立文件，**绝不合并进 `config.toml`**——`config.toml` 的格式合同一个键都不能加（见分支 C 的写盘规则）。

## 分支 A — 用户还没有账号

输出下面这份浏览器 checklist，并明说：**「这三步需要你在浏览器完成，做完回来告诉我」**。等待期间不轮询、不重复催。

1. 打开 https://workflow.games 注册（邮箱 + 验证码）。
2. 首次引导里：建组织 → 建项目 → 选**子域前缀**。提醒用户记下前缀——它就是 API 域名（`https://<前缀>.workflow.games`）。
3. 打开 `https://<前缀>.workflow.games/settings/integrations/tokens` 创建 API token。

## 分支 B — 有账号，还没有 token

给出建 token 页地址：`https://<子域前缀>.workflow.games/settings/integrations/tokens`。

**scopeMode 怎么选**（只有两档）：Agent 要做写操作（建需求、记 bug、流转）选 `all`；只做只读查询报表选 `read_only`。

三个必须提醒：

- **plainToken 只在创建时显示一次**，之后任何页面只能看到前缀。让用户创建后立刻复制。
- **建 token 需要项目管理权限。** 用户页面上没有这个入口时，给一段可直接转发给项目管理员的申请话术，例如：「我需要在项目 <项目名> 里创建一个 API token 给 AI Agent 使用（scopeMode 按用途选 all 或 read_only），请帮我在 设置 → 集成 → API Token 页创建，或给我项目管理权限。」
- **token 绑定「本人 × 单个项目」**：有效权限 = token scope ∩ 本人此刻在该项目的角色权限；换项目要在那个项目的设置页另建 token。

**token 的硬边界**（提前知道，省得撞 401/403 时误诊）：

- **PAT 不能管理 PAT**：token 的创建/列表/吊销只认浏览器会话，拿 token 调这些端点必 401。
- **`/admin` 与 `/orgs` 一律拒 PAT**：平台运营面和组织面是会话专属，token 再大权限也进不去。
- **跨项目聚合端点对 PAT 收敛到 token 所属项目**：比如查「我的项目」只会看到这枚 token 绑的那一个。

## 分支 C — 拿到 token，写配置

请用户把 token 粘贴到会话里，并坦诚声明：**token 会出现在本会话记录中；介意的话可以在配置完成后到 token 页吊销这枚、重新签发一枚**。同时给一条零暴露备选——用户可自行执行的写文件命令（用户在自己终端跑，token 不经过会话）：

```bash
umask 177 && mkdir -p ~/.config/workflow && cat > ~/.config/workflow/config.toml <<'EOF'
current_profile = "<子域前缀>"

[profiles.<子域前缀>]
base_url = "https://<子域前缀>.workflow.games"
token = "wfp_xxxxxxxx..."
EOF
```

> ⚠️ 这条命令是**整文件覆盖**，只适用于该文件还不存在的首次配置。文件已存在（比如已配过别的项目 profile）时不要给用户这条命令——改为按下面的合并规则由你读出现有内容、合并后再写回，或让用户手工编辑追加 profile 小节。

写盘规则（**格式是硬合同，逐字遵守**——这是 Workflow 各工具共用的凭证文件，多余或写错的键会让其他读取方直接报错拒载）：

- 路径 `~/.config/workflow/config.toml`，权限 **0600**。
- 顶层只有一个键：`current_profile = "<profile 名>"`。
- 每个 profile 一节：`[profiles.<名>]`，节内**只允许** `base_url` 与 `token` 两个键。
- 所有值必须**双引号**包裹；`base_url` 是站点根（如 `https://<前缀>.workflow.games`），**不带** `/api/v1` 后缀。
- **禁止添加任何私有/额外字段**（注释行 `#` 可以有）。
- 文件已存在时**合并**：保留已有 profile，只新增/更新目标 profile，不整文件覆盖。
- profile 名默认用子域前缀。

**写完 config.toml，接着写 `.workflow` 绑定**：问用户「要不要把绑定写进当前项目（`.workflow` 文件）」，默认写——在项目仓库根写入一行 `profile = "<profile 名>"`（规范见「项目绑定与多项目」），然后进入验证。

## 验证与分诊

写盘后立刻探测 `GET <base_url>/api/v1/me`，按结果分诊：

- **401** → token 失效或粘贴不完整：检查是否有 `wfp_` 前缀、是否粘进了换行/空格。让用户重发或重建 token 后重配。
- **403 但 `/me` 是通的** → 权限问题，先问两件事：① token 是不是 `read_only`？② 用户角色是否最近被管理员调小？给一段找管理员的话术；**不建议**借他人 token 绕权限。
- **`/me` 返回的项目 ≠ 目标项目** → token 绑错项目：token 只认自己的项目，去目标项目的设置页另建一枚 token，配成新 profile。
- **`/me` 返回的项目 ≠ 当前目录 `.workflow` 绑定指向的项目** → 凭证与目录绑定打架：先问用户要在哪个项目干活；改 `.workflow` 指向正确 profile，或为该项目走分支 B/C 补一枚 token，绝不带着错绑定继续写数据。
- **config 里多个 profile、当前目录又没有 `.workflow`** → 歧义，不得静默挑一个：问用户「这个目录绑哪个项目」，答后写 `.workflow` 再继续。
- **域名解析失败** → 回显 `base_url` 让用户核对子域前缀拼写。

多项目 = 每项目一枚 token + 一节 `[profiles.<名>]` + 一个 `.workflow` 标记（见「项目绑定与多项目」）；切换项目靠所在目录的 `.workflow` 指向，不靠改全局 `current_profile`。

## 纪律

- 写盘之后，一切输出（汇报、日志、报错）只用 **`wfp_` + 前 8 位**指代 token，绝不回显完整值。
- curl 用环境变量携带 token，不把 token 明文拼进命令行参数。
