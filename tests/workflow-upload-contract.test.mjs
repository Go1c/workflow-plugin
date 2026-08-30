import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

function read(relativePath) {
  const absolute = join(repoRoot, relativePath);
  assert.ok(existsSync(absolute), `缺少 ${relativePath}`);
  return readFileSync(absolute, "utf8");
}

const skill = read("skills/workflow-upload/SKILL.md");
const draft = read("skills/workflow-ops/references/draft-format.md");
const calls = read("skills/workflow-ops/references/call-templates.md");
const delivery = read("skills/workflow-ops/references/delivery.md");
const command = read("commands/upload.md");

describe("Workflow bundle 上传合同", () => {
  test("默认有界并发，且可配置但不能无限扩张", () => {
    for (const text of [skill, draft, calls, delivery]) {
      assert.match(text, /concurrency/);
      assert.match(text, /4/);
      assert.match(text, /8/);
    }
    assert.match(skill, /有界 worker pool/);
    assert.match(skill, /默认为 `4`/);
    assert.match(skill, /范围 `1–8`/);
    assert.match(draft, /"strategy": "bounded-worker-pool"/);
    assert.match(draft, /不创建无限线程或无限请求/);
  });

  test("并发调度遵守 DAG、资源锁和关系 UUID 前置", () => {
    assert.match(skill, /`dependsOn` 已 `verified`/);
    assert.match(skill, /同一资源的 PATCH、附件和评论按资源锁串行/);
    assert.match(skill, /关系操作必须等待两端 UUID 都已读回/);
    assert.match(calls, /topologicalWaves/);
    assert.match(calls, /targetType \+ targetId.*资源锁/);
    assert.match(calls, /关系 Provider\n必须等待两端节点 `verified`/);
  });

  test("每个 worker 独立幂等、重试、读回和 checkpoint", () => {
    assert.match(skill, /确定性的幂等 key/);
    assert.match(skill, /429 按 `Retry-After`/);
    assert.match(skill, /每次请求完成（成功、失败或被阻塞）都原子更新 manifest checkpoint/);
    assert.match(skill, /读回必须在 worker 内完成/);
    assert.match(draft, /每个操作独立记录 `in_flight`/);
    assert.match(calls, /request -> retry with same idempotency key -> GET read-back -> checkpoint/);
    assert.match(delivery, /每个操作都必须有独立读回证据/);
  });

  test("失败 worker 不抹掉成功结果，命令保留部分成功", () => {
    assert.match(skill, /继续执行没有依赖它的操作/);
    assert.match(skill, /保留 bundle/);
    assert.match(skill, /部分成功/);
    assert.match(command, /部分成功、失败或图谱被裁剪时保留草稿/);
    assert.match(delivery, /已验证\/失败\/阻塞操作数/);
  });

  test("本地 ready 后才上传，四种权限模式入口一致", () => {
    assert.match(skill, /`plan` 模式在此停止/);
    assert.match(skill, /`auto`.*只确认一次 bundle/);
    assert.match(skill, /`manual`.*逐组确认/);
    assert.match(skill, /`full`.*草稿 ready 后自动/);
    assert.match(command, /PlanMode 禁止上传/);
    assert.match(command, /Auto 只做一次 bundle 确认/);
    assert.match(command, /全部授权自动执行/);
  });

  test("Requirement 引用使用原生无向 Provider 并校验图谱裁剪", () => {
    assert.match(skill, /bindRequirementReference/);
    assert.match(skill, /getRequirementGraph/);
    assert.match(skill, /图谱中的引用边是无向的/);
    assert.match(skill, /truncated=true/);
  });
});
