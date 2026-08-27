// workflow-execute 与共享纪律（搜索/读单/建单规范/编排）的提示词契约。
//
// 存在的理由：拿单执行是多 Agent 编排下最容易走样的旅程——不流转就开工、做完不回写、
// 无凭证时靠全局 profile 兜底把数据写错项目、读半张单就下结论。下面每条断言都对应
// 一个实战里出现过的走样，不是风格检查。

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

const skill = read("skills/workflow-execute/SKILL.md");
const flow = read("skills/workflow-execute/references/execute-flow.md");
const handoff = read("skills/workflow-execute/references/handoff.md");
const searchRef = read("skills/workflow-ops/references/search.md");
const readCard = read("skills/workflow-ops/references/read-card.md");
const cardSpec = read("skills/workflow-ops/references/card-spec.md");
const orchestration = read("skills/workflow-ops/references/orchestration.md");
const opsSkill = read("skills/workflow-ops/SKILL.md");
const callTemplates = read("skills/workflow-ops/references/call-templates.md");

describe("workflow-execute 边界与闸门", () => {
  test("G5 例外范围写死：只覆盖本卡流转与证据回写，禁改描述/验收项/别人的卡", () => {
    // 不写死例外范围，「可以流转」会被扩大解释成「可以顺手落单、顺手验收自己」。
    assert.match(skill, /G5[\s\S]{0,80}授权例外/);
    assert.match(skill, /承接的这张卡自己的状态流转/);
    assert.match(skill, /证据回写/);
    assert.match(skill, /替未承接的卡流转/);
    assert.match(skill, /改单据 description/);
    assert.match(skill, /动验收项状态/);
    assert.match(skill, /验收自己的交付/);
  });

  test("拿单不是落单：发现该建新单时转出，不自建", () => {
    assert.match(skill, /拿单不是落单/);
    assert.match(skill, /不擅自建单/);
  });

  test("description 与 planning/ops/qa 三向分流，避免抢触发", () => {
    const fm = /^---\nname: workflow-execute\ndescription: ([^\n]+)\n---/.exec(skill);
    assert.ok(fm, "frontmatter 缺失或格式不对");
    for (const token of ["workflow-planning", "workflow-ops", "workflow-qa", "拿单", "开工", "回写"]) {
      assert.ok(fm[1].includes(token), `description 缺少「${token}」`);
    }
  });
});

describe("两种执行模式", () => {
  test("模式判定先于一切 API 调用，两种模式都有明确交回物", () => {
    assert.match(skill, /自持凭证直连/);
    assert.match(skill, /无凭证[\s\S]{0,20}调度方代写/);
    assert.match(skill, /不调任何 Workflow API/);
    assert.match(skill, /不要求用户或调度方把 token 贴进会话/);
  });

  test("硬规则：无 .workflow 绑定时禁止全局 current_profile 兜底写数据", () => {
    // 执行 Agent 常被派到临时目录；全局兜底写进去的是「碰巧配过的项目」。
    assert.match(skill, /没有 `\.workflow` 绑定/);
    assert.match(skill, /禁止[\s\S]{0,30}current_profile[\s\S]{0,60}写操作/);
    assert.match(skill, /即使 config 里只有一个 profile/);
  });

  test("无凭证交回报告五段齐全，状态 key 不猜", () => {
    for (const token of ["目标单", "建议流转", "证据评论正文", "附件清单", "Known gaps"]) {
      assert.ok(handoff.includes(token), `无凭证交回缺少「${token}」`);
    }
    assert.match(handoff, /不猜状态 key/);
  });
});

describe("执行流程纪律", () => {
  test("找单三条路：单号精确定位 / workbench / ownerId·activeUserId 过滤", () => {
    assert.match(flow, /\/search/);
    assert.match(flow, /\/me\/workbench/);
    assert.match(flow, /ownerId=/);
    assert.match(flow, /activeUserId=/);
    // workbench 有截断标志，不能拿一页当全量。
    assert.match(flow, /workItemsTruncated/);
  });

  test("开工必先流转：现查 transitions，被 guard 挡住转述不硬闯", () => {
    assert.match(skill, /不流转就开工/);
    assert.match(flow, /\/transitions/);
    assert.match(flow, /blockedReason/);
    assert.match(flow, /不硬闯/);
    // 待认领态先认领。
    assert.match(flow, /slots\/<slotKey>\/claim/);
  });

  test("回写固定顺序：附件 → 证据评论 → 流转待验收，每步读回", () => {
    assert.match(flow, /先有证据、再有结论、最后才流转/);
    const attachIdx = flow.indexOf("上传证据附件");
    const commentIdx = flow.indexOf("POST 证据评论");
    const transitionIdx = flow.indexOf("流转到待验收");
    assert.ok(attachIdx > 0 && commentIdx > attachIdx && transitionIdx > commentIdx, "回写顺序段落次序不对");
    assert.match(flow, /重发前，必须先读回/);
  });

  test("执行者不越权：不改 description、不动验收项、不流转完成态", () => {
    assert.match(flow, /不改 description/);
    assert.match(flow, /不动验收项状态/);
    assert.match(flow, /完成由验收方判定/);
  });
});

describe("证据评论模板（验收方机械核对）", () => {
  test("模板小节齐全且要求写实", () => {
    for (const section of ["改动清单", "验收对照", "实际运行的验证", "Known gaps", "边界声明"]) {
      assert.ok(handoff.includes(section), `证据评论模板缺少「${section}」`);
    }
    assert.match(handoff, /没跑的写「未执行」/);
    assert.match(handoff, /分支 \+ 提交号/);
    assert.match(handoff, /没有内容的写「无」/);
  });
});

describe("共享纪律：搜索先行（search.md）", () => {
  test("三个必搜场景 + 已核实的能力口径", () => {
    assert.match(searchRef, /建单前查重/);
    assert.match(searchRef, /回答历史类问题之前/);
    assert.match(searchRef, /拿单开工之前/);
    // 能力口径与合同一致：正文可搜、cursor 分页、limit 上限 50。
    assert.match(searchRef, /正文可搜/);
    assert.match(searchRef, /nextCursor/);
    assert.match(searchRef, /indexVersion/);
    assert.match(searchRef, /上限 50/);
  });

  test("「不存在证明」只认列表翻页，search 未命中不算数", () => {
    assert.match(searchRef, /「搜不到」≠「不存在」/);
    assert.match(searchRef, /不得以 search 未命中作为未落库的唯一依据/);
  });

  test("旧的「只搜标题」口径已从全部技能里清除", () => {
    // /search 已升级为标题+正文召回；过时声明会让 Agent 放弃可用的查重手段。
    for (const rel of [
      "skills/workflow-ops/SKILL.md",
      "skills/workflow-ops/references/call-templates.md",
      "skills/workflow-planning/references/api-delivery.md",
    ]) {
      const text = read(rel);
      assert.ok(!/只对标题做 ILIKE|只匹配标题|不做全文检索/.test(text), `${rel} 仍残留过时的 search 能力声明`);
    }
  });
});

describe("共享纪律：读单完整性（read-card.md）", () => {
  test("四路缺一不算读过：正文 + 评论 + 附件 + 验收项", () => {
    assert.match(readCard, /缺任何一路都不算「读过这张单」/);
    assert.match(readCard, /\/comments\?targetType=/);
    assert.match(readCard, /\/attachments\?targetType=/);
    assert.match(readCard, /acceptance-items/);
    // 图片附件必须看内容——附件元数据 JSON 不是图片本体。
    assert.match(readCard, /\/content/);
    assert.match(readCard, /不可信数据/);
  });

  test("qa 与 execute 都指回同一份读单口径", () => {
    assert.match(read("skills/workflow-qa/SKILL.md"), /read-card\.md/);
    assert.match(skill, /read-card\.md/);
    assert.match(opsSkill, /read-card\.md/);
  });
});

describe("共享纪律：建单最小正文（card-spec.md）", () => {
  test("裸标题不落库，四节结构固定，验收缺失必须先问", () => {
    assert.match(cardSpec, /裸标题不落库/);
    for (const section of ["## 背景", "## 目标", "## 验收", "## 边界"]) {
      assert.ok(cardSpec.includes(section), `最小正文缺少「${section}」节`);
    }
    assert.match(cardSpec, /先问一句拿验收口径再建单/);
    assert.match(cardSpec, /不替用户发明需求内容/);
  });

  test("ops 建单动词绑定 card-spec 为硬性口径", () => {
    assert.match(opsSkill, /card-spec\.md/);
    assert.match(opsSkill, /裸标题不落库/);
  });
});

describe("共享纪律：编排元数据与 Room 盘点（orchestration.md）", () => {
  test("编码优先级：真字段 > 标题前缀 > 正文约定", () => {
    assert.match(orchestration, /真字段 > 标题前缀 > 正文约定/);
    // 已核实的真字段过滤维度。
    assert.match(orchestration, /roomId/);
    assert.match(orchestration, /ownerId/);
    assert.match(orchestration, /activeUserId/);
  });

  test("平台不支持的能力列成建议、不臆造：需求级依赖、object-links 只读", () => {
    assert.match(orchestration, /需求级依赖关系没有写 API/);
    assert.match(orchestration, /object-links[\s\S]{0,20}只读/);
    assert.match(orchestration, /平台需求建议/);
    // module 列表不可过滤——不许臆造查询参数。
    assert.match(orchestration, /不要臆造 module 查询参数/);
  });

  test("Room 盘点：overview 总账 + 三路明细 + cursor 翻到空为止", () => {
    assert.match(orchestration, /\/rooms\/<uuid>\/overview/);
    assert.match(orchestration, /acceptance-items/);
    assert.match(orchestration, /includeTransitions=true/);
    assert.match(orchestration, /nextCursor/);
  });
});

describe("ops 扩充：重开与层级", () => {
  test("重开路径完整：现查逆向边 + reason 写波及来源 + 评论关联来源单", () => {
    assert.match(opsSkill, /重开 \/ 变更波及/);
    assert.match(opsSkill, /波及来源/);
    assert.match(callTemplates, /变更波及/);
    assert.match(callTemplates, /变更重开/);
    // 被 guard 挡住时转述，不 PATCH status 绕道。
    assert.match(opsSkill, /不硬闯、不 PATCH status 绕道/);
  });

  test("对象层级含里程碑与 Room，里程碑状态派生不手改", () => {
    assert.match(opsSkill, /里程碑/);
    assert.match(opsSkill, /自动派生/);
    assert.match(callTemplates, /schedule\/milestones/);
    assert.match(callTemplates, /schedule\/requirements\/<uuid>\/milestone/);
  });
});

describe("上下文预算", () => {
  test("execute 主线（SKILL + 流程 + 交回 + 读单 + 搜索）不超过 26KB", () => {
    const total = [skill, flow, handoff, readCard, searchRef].reduce((sum, text) => sum + Buffer.byteLength(text, "utf8"), 0);
    assert.ok(total < 26000, `执行主线上下文 ${total} 字节，超出 26KB 预算`);
  });
});
