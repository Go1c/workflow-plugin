---
name: workflow-execute
description: 以执行者身份承接并交付一张已存在的 Workflow（workflow.games）单据时使用——查找指派给自己的需求或工作项、开工前读单核对前置与验收项、流转到进行中、完成后回写证据评论与附件并流转到待验收、按统一格式交回。用户说拿单、领任务、认领、开工、按单执行、做完了回写交单时使用；不做需求规划与落单（workflow-planning）、不做字段已明确的单次增删改（workflow-ops）、不做线上验收判定（workflow-qa）。
---

# workflow-execute — 拿单、执行、交回

以执行者身份消费一张已存在的单：找到它 → 读全它 → 核对前置 → 流转开工 → 干活（插件外）→ 回写证据 → 流转待验收 → 交回。**拿单不是落单**：本技能不创建需求/Room，发现该建新单时报给用户转 workflow-ops 或 workflow-planning。

## 硬闸门（命中即停）

以下 7 条是停止条件，不是风格建议；与正文其他要求冲突时以这里为准（出处 [workflow-ops/references/gates.md](../workflow-ops/references/gates.md)）。

<!-- gates:start -->
| # | 触发条件 | 动作 |
| :-: | --- | --- |
| **G1** | `project.subdomainPrefix`、实际 API Host、`.workflow` 所选 profile 的子域三者任一不一致；或 `publicDemo=true`；或 `.workflow` 存在却解析不出 profile | **停止**，转 workflow-setup 重新绑定。绝不把数据写进错误项目 |
| **G2** | 用户尚未针对**确切的项目 + 对象清单 + 数量**给出明确肯定答复 | **不得** POST/PATCH。内容认可、说"不错"、说"继续"都不是写入授权；范围一变授权即失效 |
| **G3** | 写操作之后没有 `GET` 读回，或读回未核对字段与子资源数量 | **不得**声称「已创建 / 已修改」。部分成功如实报部分成功 |
| **G4** | 需要在命令、日志、报告、蓝图里出现 token | **只**走环境变量携带；任何输出里只以 `wfp_` + 前 8 位指代，绝不回显完整值 |
| **G5** | 出现拆 WorkItem、流转状态、建分支/Worktree、跑目标仓库测试、改代码或资产的冲动 | **停止**。落单不等于开工，本插件只负责 PM 对象 |
| **G6** | 需要填工作流状态、验收类型/状态、成员 ID、缺陷自定义字段等**项目自定义**的值 | **必须现查**。查不到或不唯一就留空并告诉用户，绝不猜一个值填进去 |
| **G7** | 要在报告里写某项验证「通过」 | 只写**实际执行过**的命令与其真实输出；没跑的写「未执行」，不得用计划中的验证冒充结果 |
<!-- gates:end -->

G1、G3、G4、G6、G7 全程适用。G2 的写入授权由**用户明确指派这张单**给出（点名单号或确认承接即是本卡范围内的授权，范围一变重新确认）。**G5 在本技能是授权例外**——它管的是落单场景，而执行恰恰要开工，但例外只覆盖两件事：**承接的这张卡自己的状态流转** + **完成后的证据回写（评论/附件）**。改代码、建分支、跑测试发生在目标仓库、由派遣任务本身授权，不归本插件管辖；仍然禁止：替未承接的卡流转、把拿单扩写成落单或拆卡、改单据 description、动验收项状态（那是验收方的 `run_acceptance`）、验收自己的交付（转 workflow-qa 或人工验收）。

## 第一步：判定执行模式（先于一切 API 调用）

按 [connection.md](../workflow-ops/references/connection.md) 解析凭证，然后分流：

- **模式一 · 自持凭证直连**：环境变量或 `.workflow` 两级解析成功且 `/me`、`/projects/current` 验证通过 → 读写全程自己做。
- **模式二 · 无凭证，调度方代写**：派遣 prompt 明示「凭证在调度方 / 由调度方回写」，或本机解析不出凭证 → **不调任何 Workflow API**。卡内容以派遣 prompt 附带的为准；交回物是 [references/handoff.md](references/handoff.md) 第二节的结构化报告，由调度方代做全部回写。**不要求用户或调度方把 token 贴进会话**（要配凭证转 workflow-setup）。

**硬规则（两种模式之外没有第三条路）**：当前目录**没有 `.workflow` 绑定**时，禁止靠全局 `current_profile` 兜底解析凭证执行任何**写操作**——即使 config 里只有一个 profile。执行 Agent 常被派到临时目录/工作树干活，全局兜底写进去的是「碰巧配过的项目」，这是把数据写错项目之外的另一种越权写入。要写：先补绑定（转 workflow-setup 写 `.workflow`），或走模式二交回。

## 流程（模式一全程自做；模式二做 2、3、5，其余写进交回报告）

1. **找单**：用户点名单号 → `/search` 精确定位拿 UUID；没点名 → `GET /me/workbench`（view=owned）或按 `ownerId` / `activeUserId` 过滤工作项列表。多张候选列给用户选，不自作主张。
2. **读单**：按 [read-card.md](../workflow-ops/references/read-card.md) 四路拉全（正文 + 评论 + 附件 + 验收项）；关联单与历史同类单按 [search.md](../workflow-ops/references/search.md) 先搜。
3. **核对前置与验收**：按 [orchestration.md](../workflow-ops/references/orchestration.md) 第三节逐张 GET 前置卡；前置未满足 → **停止报告，不偷跑**。验收项开工前读一遍，知道交付要证明什么。
4. **开工流转**：现查 transitions 选「进行中」语义的边，POST 带 reason，读回。**不流转就开工是本技能要消灭的头号走样。**
5. **干活**：目标仓库内的开发/制作按卡内容与所在环境规则执行，本插件不管辖。期间发现的新问题**报给用户**，不擅自建单。
6. **回写与交回**：按 [references/execute-flow.md](references/execute-flow.md) 第六节的固定顺序（附件 → 证据评论 → 流转待验收，每步读回），评论用 [references/handoff.md](references/handoff.md) 的统一模板；最后按交回格式向用户/调度方汇报。**做完不回写等于没做完。**

流程细节与全部 curl 模板见 [references/execute-flow.md](references/execute-flow.md)。

## 失败处置

按 [connection.md](../workflow-ops/references/connection.md) 失败处置表；流转被 guard 挡住（`allowed:false`）→ 转述 `blockedReason` / `guardCode`，不硬闯、不 PATCH status 绕道。
