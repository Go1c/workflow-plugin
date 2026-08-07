import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, extname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const pluginRoot = join(repoRoot, "plugins/workflow");
const planningRoot = join(pluginRoot, "skills/workflow-planning");

function read(relativePath) {
  const absolutePath = join(repoRoot, relativePath);
  assert.ok(existsSync(absolutePath), `缺少 ${relativePath}`);
  return readFileSync(absolutePath, "utf8");
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function assertHeadingsInOrder(content, labels) {
  const headings = content
    .split("\n")
    .filter((line) => /^## /.test(line))
    .map((line) => line.slice(3));
  let previous = -1;
  for (const label of labels) {
    const index = headings.findIndex((heading, candidate) => candidate > previous && heading.includes(label));
    assert.ok(index >= 0, `缺少或错序阶段「${label}」`);
    previous = index;
  }
}

function listFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const absolutePath = join(directory, entry.name);
    return entry.isDirectory() ? listFiles(absolutePath) : [absolutePath];
  });
}

test("v0.3.0 正确路由规划、单次操作与独立写入授权", () => {
  const skill = read("plugins/workflow/skills/workflow-planning/SKILL.md");
  assert.match(skill, /^---\nname: workflow-planning\ndescription: [^\n]+\n---/);
  assert.match(skill, /规划、梳理或拆解/);
  assert.match(skill, /独立写入确认/);
  assert.match(skill, /不用于字段已明确的单次建单/);
  assert.match(skill, /蓝图内容确认不等于线上写入授权/);
  assert.match(skill, /用户只要求方案、PRD、拆解或提示词时.*停止/);

  const command = read("plugins/workflow/commands/plan.md");
  assert.match(command, /蓝图内容确认不等于线上写入授权/);
  assert.match(command, /目标 Workflow 项目/);
  assert.match(command, /不流转需求状态/);

  const ops = read("plugins/workflow/skills/workflow-ops/SKILL.md");
  assert.match(ops, /^---\nname: workflow-ops\ndescription: [^\n]*字段与内容已经明确[^\n]*workflow-planning[^\n]*\n---/);
  assert.match(ops, /\/me.*验证身份/);
  assert.match(ops, /\/projects\/current.*项目.*角色\/权限/);
  assert.doesNotMatch(ops, /`\/me` 返回的项目/);

  const setup = read("plugins/workflow/skills/workflow-setup/SKILL.md");
  assert.match(setup, /\/me` 返回 200/);
  assert.match(setup, /\/projects\/current` 返回 200/);
  assert.match(setup, /project\.subdomainPrefix/);
  assert.doesNotMatch(setup, /`\/me` 返回的项目/);

  const callTemplates = read("plugins/workflow/skills/workflow-ops/references/call-templates.md");
  assert.match(callTemplates, /\/me` 只验证用户身份/);
  assert.match(callTemplates, /\/projects\/current/);
  assert.doesNotMatch(callTemplates, /grep -c[^\n]+\|\| echo 0/);

  const manifest = JSON.parse(read("plugins/workflow/.claude-plugin/plugin.json"));
  assert.equal(manifest.version, "0.3.0");
  assert.match(manifest.description, /规划需求与需求室/);
  assert.equal(read("plugins/workflow/skills/workflow-update/VERSION").trim(), manifest.version);

  const marketplace = JSON.parse(read(".claude-plugin/marketplace.json"));
  assert.match(marketplace.plugins[0].description, /规划需求与需求室/);

  const readme = read("README.md");
  assert.match(readme, /workflow-planning/);
  assert.match(readme, /\/workflow:plan/);
  assert.match(readme, /蓝图内容确认与线上写入是两个闸门/);
});

test("按独立交付拓扑拆单，并按变更类型选择质量路径", () => {
  const skill = read("plugins/workflow/skills/workflow-planning/SKILL.md");
  assert.match(skill, /可独立交付、独立验证/);
  assert.match(skill, /客户端、服务端、工具链或构建发布/);
  assert.match(skill, /不得把超出单 Agent 上下文或验证边界的大任务压成“简单需求”/);
  assert.match(skill, /纯美术、文案或配置交付不得.*Code Review/);
  assert.match(skill, /预研.*Requirement/);
  assert.match(skill, /下游此时只生成条件化提纲.*不得落单/);
  assert.match(skill, /预研结束.*递增蓝图修订号.*重新取得写入授权/);

  const process = read("plugins/workflow/skills/workflow-planning/references/planning-process.md");
  assertHeadingsInOrder(process, [
    "需求定义与可选预研",
    "体验、内容与资产设计",
    "测试与验证设计",
    "共享合同与公共底座",
    "程序实现与内容生产",
    "集成候选与整体 Review",
    "最终 QA 与领域验收",
  ]);
  assert.match(process, /最终合入受保护分支、发布或状态完成前/);
  assert.match(process, /场景、Prefab、关卡、二进制资产.*唯一所有者/);
  assert.match(process, /不得制造无关失败或伪造测试输出/);
  assert.match(process, /没有可自动化测试缝/);
  assert.match(process, /没有代码就不创建空的 TDD 或 Code Review 卡/);
});

test("执行提示词具备 Agent 权限边界、验证证据与游戏研发覆盖层", () => {
  const template = read("plugins/workflow/skills/workflow-planning/references/requirement-template.md");
  assertHeadingsInOrder(template, [
    "任务元数据",
    "你的身份",
    "指令与真值优先级",
    "来源真值",
    "产品背景与已锁决策",
    "本需求目标",
    "执行前置",
    "决策权限与升级条件",
    "范围与协作边界",
    "详细要求",
    "验证计划与证据",
    "必须交付",
    "验收标准",
    "明确不做与禁止事项",
    "阻塞与升级",
    "交回格式",
  ]);
  assert.match(template, /不得撤销其他 Agent\/成员的改动/);
  assert.match(template, /不得声称未实际执行的验证通过/);
  assert.match(template, /与 Workflow 结构化验收项一一对应/);

  const overlays = read("plugins/workflow/skills/workflow-planning/references/discipline-overlays.md");
  for (const discipline of [
    "预研",
    "策划·系统/玩法",
    "策划·关卡/内容",
    "叙事/本地化",
    "UX/UI",
    "美术",
    "技术美术",
    "动画/VFX/音频",
    "测试·用例",
    "程序·协议/公共",
    "程序·服务端",
    "程序·客户端",
    "程序·工具/构建",
    "数据/运营/发布",
    "集成",
    "Review",
    "测试·收尾",
  ]) {
    assert.match(overlays, new RegExp(`^## .+${escapeRegExp(discipline)}.+$`, "m"));
  }
  for (const concern of ["目标平台", "存档", "在引擎", "性能预算", "本地化", "回滚"]) {
    assert.match(overlays, new RegExp(concern));
  }
  assert.match(overlays, /\[原始需求\].*来源记录/);
  assert.match(overlays, /不是等待某个 Agent“实现”的任务/);
});

test("API 落单复用共享安全规则并读回原生验收项", () => {
  const delivery = read("plugins/workflow/skills/workflow-planning/references/api-delivery.md");
  for (const token of [
    "../../workflow-ops/SKILL.md",
    "../../workflow-ops/references/call-templates.md",
    "/me",
    "/projects/current",
    "acceptance-items",
    "blueprintId",
    "sourceKind=ai",
    "读回",
    "幂等恢复",
    "部分成功",
  ]) {
    assert.match(delivery, new RegExp(escapeRegExp(token)));
  }
  assert.match(delivery, /用户对这份确切清单明确授权后才能 POST\/PATCH/);
  assert.match(delivery, /不得为了伪装原子性删除用户可见 PM 数据/);
  assert.match(delivery, /不创建 WorkItem/);
});

test("规划 Skill 只含公开 Markdown、相对链接有效且不泄露内部信息", () => {
  assert.ok(existsSync(planningRoot), "缺少 workflow-planning 技能目录");

  const files = listFiles(planningRoot);
  assert.ok(files.length >= 5, "需求规划技能缺少模板或参考文件");
  for (const absolutePath of files) {
    const displayPath = relative(repoRoot, absolutePath);
    assert.equal(extname(absolutePath), ".md", `${displayPath} 不是 Markdown`);
    const content = readFileSync(absolutePath, "utf8");
    assert.doesNotMatch(content, /\.spec\/|LumioGameWorkFlow|localhost|wfp_[0-9a-z_-]{12,}/i, `${displayPath} 含内部路径或疑似凭据`);
    assert.doesNotMatch(content, /TBD|TODO|适当处理/, `${displayPath} 含未决占位`);

    for (const match of content.matchAll(/\[[^\]]+\]\(([^)]+)\)/g)) {
      const target = match[1].split("#", 1)[0];
      if (!target || /^[a-z]+:/i.test(target)) continue;
      const linkedPath = join(dirname(absolutePath), target);
      assert.ok(existsSync(linkedPath), `${displayPath} 的相对链接不存在：${target}`);
    }
  }
});
