import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  EN,
  L,
  htmlLang,
  localeSetCookie,
  resolveWebLocale,
  runWithLocale,
  safeNextPath,
} from "../src/web/i18n.js";
import {
  explainDecision,
  explainWorkState,
  type GoalPresentationState,
} from "../src/web/human-language.js";

test("locale defaults to Chinese, then cookie, then Accept-Language", () => {
  assert.equal(resolveWebLocale(undefined, undefined), "zh");
  assert.equal(resolveWebLocale("goalboard_locale=en", "zh-CN"), "en");
  assert.equal(resolveWebLocale("theme=light; goalboard_locale=zh", "en-US"), "zh");
  assert.equal(resolveWebLocale(undefined, "en-US,en;q=0.9"), "en");
  assert.equal(resolveWebLocale(undefined, "zh-CN,zh;q=0.9,en;q=0.8"), "zh");
  assert.equal(resolveWebLocale("goalboard_locale=de", "fr-FR"), "zh");
});

test("safe next path only allows same-origin relative locations", () => {
  assert.equal(safeNextPath("/settings/runtimes"), "/settings/runtimes");
  assert.equal(safeNextPath("%2Fprojects%2Fdemo%2F"), "/projects/demo/");
  assert.equal(safeNextPath("//evil.example"), "/");
  assert.equal(safeNextPath("https://evil.example"), "/");
  assert.equal(safeNextPath("/ok\nLocation: https://evil.example"), "/");
  assert.equal(safeNextPath(undefined), "/");
});

test("L translates chrome in an English request and keeps Chinese as source", () => {
  assert.equal(L("设置"), "设置");
  assert.equal(L("目标导航"), "目标导航");
  assert.equal(L("绑定到 Goal"), "绑定到 Goal");
  runWithLocale("en", () => {
    assert.equal(L("设置"), "Settings");
    assert.equal(L("目标导航"), "Goal Navigator");
    assert.equal(L("目标关系图"), "Goal Graph");
    assert.equal(L("目标聚焦"), "Goal Focus");
    assert.equal(L("绑定到 Goal"), "Bound to Goal");
    assert.equal(L("共 {count} 个{suffix}目标", { count: 3, suffix: "" }), "3 Goals");
    assert.equal(htmlLang(), "en");
  });
  assert.equal(htmlLang(), "zh-CN");
  assert.match(localeSetCookie("en"), /goalboard_locale=en/);
});

test("every static renderer label has an English translation", () => {
  const source = readFileSync(new URL("../src/web/render.ts", import.meta.url), "utf8");
  const labels = [...source.matchAll(/\bL\("((?:[^"\\]|\\.)*)"/g)]
    .map((match) => JSON.parse(`"${match[1]}"`) as string);
  const missing = [...new Set(labels.filter((label) => EN[label] == null))];
  assert.deepEqual(missing, []);
});

test("every work state explains what it means, what to do, and how to continue in both languages", () => {
  const states: GoalPresentationState[] = [
    "clarification_pending", "clarification_decision_pending", "compound_closure_pending", "handoff_pending", "clarifying", "clarification_blocked", "waiting_children",
    "execution_pending", "executing", "execution_blocked", "completion_pending", "completion_blocked", "review_pending", "reviewing",
    "review_blocked", "revalidation_pending", "revalidating", "revalidation_blocked",
    "invalidated", "satisfied", "trashed", "archived",
  ];
  for (const state of states) {
    const zh = explainWorkState(state);
    assert.ok(zh.label && zh.meaning && zh.nextAction && zh.howToContinue, state);
    runWithLocale("en", () => {
      const en = explainWorkState(state);
      assert.ok(en.label && en.meaning && en.nextAction && en.howToContinue, state);
      assert.notEqual(en.meaning, zh.meaning, `${state} should have an English explanation`);
    });
  }
});

test("work state labels stay concise and professional", () => {
  assert.equal(explainWorkState("clarifying").label, "目标澄清中");
  assert.equal(explainWorkState("clarification_decision_pending").label, "待你确认");
  assert.equal(explainWorkState("compound_closure_pending").label, "待确认父目标");
  assert.equal(explainWorkState("handoff_pending").label, "正在收尾");
  assert.equal(explainWorkState("execution_blocked").label, "执行受阻");
  assert.equal(explainWorkState("completion_pending").label, "待完成");
  assert.equal(explainWorkState("completion_blocked").label, "完成受阻");
  assert.equal(explainWorkState("review_pending").label, "待复核");
  assert.equal(explainWorkState("satisfied").label, "已完成");
});

test("all five decision types start with the user's question and explain missing evidence", () => {
  const kinds = ["contract", "candidate", "rewire", "review", "risk"] as const;
  for (const kind of kinds) {
    const zh = explainDecision(kind);
    assert.match(zh.question, /[？?]$/);
    assert.match(zh.insufficientEvidence, /不能可靠|不能可靠判断/);
    runWithLocale("en", () => {
      const en = explainDecision(kind);
      assert.match(en.question, /\?$/);
      assert.match(en.insufficientEvidence, /not enough evidence/i);
    });
  }
});
