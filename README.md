# Workflow Agent 插件

> Agent plugin for Workflow (workflow.games) — lets AI coding agents create requirements, file bugs, query work items and drive workflows via the Workflow API.

让你的 AI Agent（Claude Code / Codex 等）直连 [Workflow](https://workflow.games)：接入配置、建需求、记 bug、查任务、状态流转、查文档——全部走 Workflow 的公开 API，写操作有读回验证，token 全程不外泄。

## 包含的技能

| 技能 | 干什么 |
| --- | --- |
| `workflow-setup` | 首次接入：注册引导、配置 API token、验证连接、401/403 分诊 |
| `workflow-ops` | 干活：建需求、记 bug（含查重）、查询、指派、流转、评论、附件 |
| `workflow-docs` | 答疑：抓线上文档回答 API / 功能问题，不凭记忆 |
| `workflow-update` | 检查并更新插件自身版本 |

使用前提：一个 workflow.games 账号和项目 API token——没有也没关系，装好后对 Agent 说「接入 Workflow」，`workflow-setup` 会一步步带你完成。

## Claude Code 安装

在 Claude Code 里执行两条命令：

```
/plugin marketplace add Go1c/workflow-plugin
/plugin install workflow@workflow-plugin
```

装好后可用 `/workflow:setup`（接入）、`/workflow:bug <描述>`（记 bug）、`/workflow:update`（更新插件）。

## Codex 安装

一条命令：

```bash
curl -fsSL https://workflow.games/plugin/install.sh | bash
```

默认装到 `~/.codex/skills`；也可以 `--target ~/.claude/skills`（Claude Code 手动安装）或 `--target .agents/skills`（项目级安装）。

不想跑脚本？把下面这段原样发给你的 AI Agent，效果等价：

```
请为我安装 Workflow（workflow.games）Agent 插件：
1. 抓取 https://workflow.games/plugin/version.json?cb=<当前时间戳>，读出 version 与 files 字段；
2. 抓取 files 指向的清单（加同样的 cb 参数），逐个下载清单中的文件并校验 sha256，不符则停止并告诉我；
3. 把 skills/ 下的技能目录写入 ~/.codex/skills/（Claude Code 手动安装则写入 ~/.claude/skills/，项目级安装写入 .agents/skills/）；技能包只应包含 Markdown 与 VERSION 文本文件，发现可执行文件立即停止；
4. 列出安装的技能与版本；
5. 然后直接开始 workflow-setup 技能的接入流程：先检测本机 ~/.config/workflow/config.toml 是否已有可用配置。
```

## 多项目

一台机器接多个项目：插件全局只装一份，不必按项目重复安装。每个项目在该项目设置页各建一枚 token，在 `~/.config/workflow/config.toml` 里各占一节 `[profiles.<名>]`；再在每个项目的仓库根放一个 `.workflow` 标记文件（一行 `profile = "<profile 名>"`），声明这个目录用哪个 profile。`.workflow` 不含 token，可提交进版本库与全队共享。Agent 取凭证按「环境变量 → `.workflow` 标记 → 全局 `current_profile` 兜底」三级解析——在哪个项目目录里干活就连哪个项目。首次在某个项目目录接入时，`workflow-setup` 会引导建 token 并写好 `.workflow`。

## 更新

- **Claude Code（marketplace 安装）**：marketplace 支持 autoUpdate 自动升级；也可以在 `/plugin` 界面手动更新。
- **Codex / 手动安装**：对 Agent 说「更新 workflow 插件」，`workflow-update` 技能会查线上版本、校验 sha256 后自更新。

## 文档

完整安装与使用指南：https://workflow.games/wiki/guides/agent-plugin
