import assert from "node:assert/strict";
import test from "node:test";
import {
  L,
  htmlLang,
  localeSetCookie,
  resolveWebLocale,
  runWithLocale,
  safeNextPath,
} from "../src/web/i18n.js";

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
  runWithLocale("en", () => {
    assert.equal(L("设置"), "Settings");
    assert.equal(L("共 {count} 个{suffix}目标", { count: 3, suffix: "" }), "3 Goals");
    assert.equal(htmlLang(), "en");
  });
  assert.equal(htmlLang(), "zh-CN");
  assert.match(localeSetCookie("en"), /goalboard_locale=en/);
});
