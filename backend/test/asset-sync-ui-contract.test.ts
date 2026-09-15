import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const page = readFileSync(new URL("../../src/features/assets/pages/AssetSyncPage.tsx", import.meta.url), "utf8");

test("Asset Sync exposes preview, explicit mock confirmation, structured results, and real Device reconciliation", () => {
  assert.match(page, /\/integrations\/\$\{source\}\/sync-preview/);
  assert.match(page, /تأیید و ثبت آزمایشی/);
  assert.match(page, /\/integrations\/\$\{source\}\/sync/);
  assert.match(page, /\/assets\/sync\/devices/);
  assert.match(page, /کل رکوردها/);
  assert.match(page, /ایجاد/);
  assert.match(page, /به‌روزرسانی/);
  assert.match(page, /idempotentReplay/);
  assert.match(page, /اتصال production تنظیم نشده/);
  assert.doesNotMatch(page, /نتیجه خام نمایش داده نمی شود/);
});
