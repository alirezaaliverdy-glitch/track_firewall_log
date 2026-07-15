import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { buildApp } from "../src/app.js";

const actionsRoute = readFileSync(new URL("../src/routes/actions.ts", import.meta.url), "utf8");
const actionService = readFileSync(new URL("../src/services/action-center.service.ts", import.meta.url), "utf8");
const actionUi = readFileSync(new URL("../../src/components/actions/ActionCenterWorkspace.tsx", import.meta.url), "utf8");
const deviceUi = readFileSync(new URL("../../src/features/assets/pages/AssetDetailPage.tsx", import.meta.url), "utf8");
const assetTable = readFileSync(new URL("../../src/features/assets/components/AssetTable.tsx", import.meta.url), "utf8");

test("device and vendor navigation expose overview, edit, and guarded delete controls", () => {
  assert.match(assetTable, /vendor-summary-link/);
  assert.match(assetTable, /\/assets\/vendors\/fortigate/);
  assert.match(deviceUi, /ویرایش تجهیز/);
  assert.match(deviceUi, /ذخیره تغییرات/);
  assert.match(deviceUi, /deleteDevice\(workspace\.device\.id\)/);
  assert.match(deviceUi, /deleteName\.trim\(\) !== workspace\.device\.name/);
});

test("ActionPlan history clearing is admin-only, explicitly confirmed, and preserves active plans", async () => {
  assert.match(actionsRoute, /delete<\{ Body: \{ confirmation\?: string \} \}>\("\/api\/action-center\/history"/);
  assert.match(actionsRoute, /DELETE ACTION HISTORY/);
  assert.match(actionService, /ActionPlanStatus\.succeeded/);
  assert.match(actionService, /ActionPlanStatus\.failed/);
  assert.match(actionService, /notIn: terminalStatuses/);
  assert.match(actionUi, /پاک‌کردن تاریخچه/);
  assert.match(actionUi, /بله، تاریخچه نهایی پاک شود/);

  const app = await buildApp({ authRequired: false });
  try {
    const response = await app.inject({ method: "DELETE", url: "/api/action-center/history", payload: { confirmation: "DELETE ACTION HISTORY" } });
    assert.equal(response.statusCode, 403);
    assert.equal(response.json().error.code, "ADMIN_REQUIRED");
  } finally { await app.close(); }
});

test("a temporary device can be edited and deleted through the real API", async () => {
  const app = await buildApp({ authRequired: false });
  let id = "";
  try {
    const created = await app.inject({ method: "POST", url: "/api/devices", payload: { name: `Temporary management ${Date.now()}`, vendor: "Linux", type: "linux_edge", host: "192.0.2.240", managementPort: 22, protocol: "ssh", environment: "lab", tags: ["temporary"], capabilities: {} } });
    assert.equal(created.statusCode, 201);
    id = created.json().id;
    const updated = await app.inject({ method: "PATCH", url: `/api/devices/${id}`, payload: { name: "Temporary management edited", managementPort: 22022 } });
    assert.equal(updated.statusCode, 200);
    assert.equal(updated.json().name, "Temporary management edited");
    assert.equal(updated.json().managementPort, 22022);
    const removed = await app.inject({ method: "DELETE", url: `/api/devices/${id}` });
    assert.equal(removed.statusCode, 204);
    id = "";
  } finally {
    if (id) await app.inject({ method: "DELETE", url: `/api/devices/${id}` });
    await app.close();
  }
});
