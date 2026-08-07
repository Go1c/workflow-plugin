import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, extname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const pluginRoot = join(repoRoot, "plugins/workflow");

function read(relativePath) {
  const absolutePath = join(repoRoot, relativePath);
  assert.ok(existsSync(absolutePath), `缺少 ${relativePath}`);
  return readFileSync(absolutePath, "utf8");
}

function assertInOrder(content, labels) {
  let previous = -1;
  for (const label of labels) {
    const index = content.indexOf(label);
    assert.ok(index >= 0, `缺少阶段「${label}」`);
    assert.ok(index > previous, `阶段顺序错误：「${label}」出现在前置阶段之前`);
    previous = index;
  }
}

function listFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const absolutePath = join(directory, entry.name);
    return entry.isDirectory() ? listFiles(absolutePath) : [absolutePath];
  });
}

test("v0.3.0 公开需求规划 Skill、命令与说明", () => {
  const skill = read("plugins/workflow/skills/workflow-planning/SKILL.md");
  assert.match(skill, /^---\nname: workflow-planning\ndescription: .+\n---/);
  assert.match(skill, /简单需求/);
  assert.match(skill, /跨工种/);
  assert.match(skill, /整体确认/);
  assert.match(skill, /不创建 WorkItem/);
  assert.match(skill, /简单需求始终保持一张 Requirement/);

  const command = read("plugins/workflow/commands/plan.md");
  assert.match(command, /workflow-planning/);
  assert.match(command, /整体确认/);

  const ops = read("plugins/workflow/skills/workflow-ops/SKILL.md");
  assert.match(ops, /workflow-planning/);

  const manifest = JSON.parse(read("plugins/workflow/.claude-plugin/plugin.json"));
  assert.equal(manifest.version, "0.3.0");
  assert.match(manifest.description, /规划需求室/);
  assert.equal(read("plugins/workflow/skills/workflow-update/VERSION").trim(), "0.3.0");

  const marketplace = JSON.parse(read(".claude-plugin/marketplace.json"));
  assert.match(marketplace.plugins[0].description, /规划需求室/);

  const readme = read("README.md");
  assert.match(readme, /workflow-planning/);
  assert.match(readme, /\/workflow:plan/);
});

test("模板固定 QA 先行、TDD、整体 Review 与最终 QA 顺序", () => {
  const process = read("plugins/workflow/skills/workflow-planning/references/planning-process.md");
  assertInOrder(process, [
    "需求定义",
    "UX/UI",
    "测试·用例",
    "程序·协议/公共",
    "程序·功能",
    "整体 Code Review",
    "测试·收尾",
  ]);
  assert.match(process, /失败测试/);
  assert.match(process, /不逐卡派 reviewer/);

  const template = read("plugins/workflow/skills/workflow-planning/references/requirement-template.md");
  for (const heading of [
    "你的身份",
    "来源真值",
    "产品背景与已锁决策",
    "本需求目标",
    "前置需求",
    "详细要求",
    "必须交付",
    "验收标准",
    "明确不做与禁止事项",
    "交回格式",
  ]) {
    assert.match(template, new RegExp(`## ${heading}`));
  }

  const overlays = read("plugins/workflow/skills/workflow-planning/references/discipline-overlays.md");
  for (const discipline of [
    "原始需求",
    "策划",
    "UX/UI",
    "美术",
    "测试·用例",
    "程序·协议/公共",
    "程序·服务端",
    "程序·客户端",
    "程序·功能",
    "Review",
    "测试·收尾",
  ]) {
    assert.match(overlays, new RegExp(`## .+${discipline.replace("/", "\\/")}`));
  }

  const delivery = read("plugins/workflow/skills/workflow-planning/references/api-delivery.md");
  for (const token of ["/me", "/rooms", "/requirements", "/attachments", "读回", "断点续建"]) {
    assert.match(delivery, new RegExp(token.replace("/", "\\/")));
  }
  assert.match(delivery, /规划阶段不创建 WorkItem/);
});

test("需求规划 Skill 只包含公开 Markdown 且不泄露内部路径或凭据", () => {
  const planningRoot = join(pluginRoot, "skills/workflow-planning");
  assert.ok(existsSync(planningRoot), "缺少 workflow-planning 技能目录");

  const files = listFiles(planningRoot);
  assert.ok(files.length >= 5, "需求规划技能缺少模板或参考文件");
  for (const absolutePath of files) {
    const displayPath = relative(repoRoot, absolutePath);
    assert.equal(extname(absolutePath), ".md", `${displayPath} 不是 Markdown`);
    const content = readFileSync(absolutePath, "utf8");
    assert.doesNotMatch(content, /\.spec\/|LumioGameWorkFlow|localhost|wfp_[0-9a-f]{12,}/i, `${displayPath} 含内部路径或疑似凭据`);
    assert.doesNotMatch(content, /TBD|TODO|适当处理/, `${displayPath} 含未决占位`);
  }
});
