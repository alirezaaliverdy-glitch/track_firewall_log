import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { AppUserRole, ScheduledTaskStatus } from "@prisma/client";
import { prisma } from "../src/db/prisma.js";
import { COMMAND_CATALOG } from "../src/commands/catalog/index.js";
import { PRODUCT_FEATURES, getProductNavigation, validateProductState } from "../src/product-state/product-state.registry.js";
import {
  cancelScheduledTask,
  createScheduledTask,
  ScheduledTaskError,
  setScheduledTaskPaused,
} from "../src/services/scheduled-task.service.js";
import { getActionCenterItem, listActionCenter } from "../src/services/action-center.service.js";

const root = join(process.cwd(), "..");
const read = (path: string) => readFileSync(join(root, path), "utf8");

test("scheduler is a visible implemented action feature", () => {
  assert.equal(validateProductState(), true);
  const feature = PRODUCT_FEATURES.find((entry) => entry.key === "actions.scheduled");
  assert.equal(feature?.state, "implemented");
  assert.equal(feature?.tested, true);
  assert.ok(getProductNavigation().find((group) => group.key === "actions")?.items.some((item) => item.route === "/actions/scheduled"));
});

test("scheduled mutations are permission-gated and execution stays catalog-controlled", () => {
  const authorization = read("backend/src/security/authorization.ts");
  const routes = read("backend/src/routes/scheduled-tasks.ts");
  const service = read("backend/src/services/scheduled-task.service.ts");
  assert.match(authorization, /scheduled-tasks[^\n]+actions\.execute\.write/);
  assert.match(routes, /RUN_CONFIRMATION_REQUIRED/);
  assert.match(routes, /CANCEL_CONFIRMATION_REQUIRED/);
  assert.match(service, /isEffectfulScheduledCommand/);
  assert.match(service, /item\.mutating/);
  assert.match(service, /!item\.readOnly/);
  assert.match(service, /getExecutionTemplate/);
  assert.match(service, /quickExecuteActionPlan/);
  assert.match(service, /connectorInvoked === true/);
  assert.match(service, /executionKey/);
  assert.doesNotMatch(service, /exec\(|spawn\(|rawCommand/);
});

test("scheduler UI uses Persian 24-hour time and hides observation commands", () => {
  const page = read("src/features/actions/pages/ScheduledTasksPage.tsx");
  const styles = read("src/features/actions/pages/ScheduledTasksPage.css");
  const navigationStyles = read("src/components/layout/AppShellNavigation.css");
  const scrollbarStyles = read("src/design-system/scrollbars.css");
  const client = read("src/lib/scheduledTasks.ts");
  assert.match(page, /PersianTimePicker/);
  assert.match(page, /readOnly: "false"/);
  assert.match(page, /item\.readOnly === false/);
  assert.doesNotMatch(page, /type="time"/);
  assert.doesNotMatch(page, /className="schedule-confirm"/);
  assert.match(page, /inputMode="numeric"/);
  assert.match(page, /initializedSelectionRef/);
  assert.match(page, /className="persian-time-picker" dir="ltr"/);
  assert.doesNotMatch(page, /const displayTime/);
  assert.match(styles, /\.schedule-board__content\{[^}]*overflow-y:auto/);
  assert.match(navigationStyles, /\.platform-sidebar\.platform-sidebar \{ overflow: hidden; \}/);
  assert.match(scrollbarStyles, /\*::-webkit-scrollbar-thumb/);
  assert.match(client, /hourCycle: "h23"/);
});

test("each supported vendor offers only verified effectful scheduled operations", () => {
  for (const vendor of ["linux", "mikrotik", "fortigate", "cisco"]) {
    const commands = COMMAND_CATALOG.filter((item) => item.vendor === vendor
      && item.implementationState === "implemented"
      && item.supportState === "verified"
      && item.executionSupport === "connector"
      && item.mutating
      && !item.readOnly);
    assert.ok(commands.length > 0, `${vendor} must expose an effectful scheduled operation`);
    assert.ok(commands.every((item) => !item.titleFa.startsWith("بررسی") && !item.titleFa.startsWith("نمایش")));
  }
});

test("worker is bounded, single-flight, and stops with the app", () => {
  const worker = read("backend/src/services/scheduled-task-worker.service.ts");
  const server = read("backend/src/server.ts");
  const app = read("backend/src/app.ts");
  assert.match(worker, /let cycle: Promise<void> \| null/);
  assert.match(worker, /if \(cycle\) return cycle/);
  assert.match(worker, /setInterval/);
  assert.match(worker, /\.unref\(\)/);
  assert.match(server, /startScheduledTaskWorker/);
  assert.match(app, /stopScheduledTaskWorker/);
});

test("a verified vendor operation can be scheduled, paused, resumed, and cancelled", async (t) => {
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const user = await prisma.appUser.create({
    data: {
      username: `schedule-admin-${suffix}`,
      passwordHash: "not-a-real-login-hash",
      displayName: "Schedule Test",
      role: AppUserRole.admin,
      allowedSections: ["actions"],
    },
  });
  const device = await prisma.device.create({
    data: {
      name: `schedule-linux-${suffix}`,
      vendor: "Linux",
      type: "linux_edge",
      host: "192.0.2.244",
      managementPort: 22,
      protocol: "ssh",
      environment: "lab",
    },
  });
  t.after(async () => {
    await prisma.scheduledTask.deleteMany({ where: { deviceId: device.id } });
    await prisma.device.delete({ where: { id: device.id } });
    await prisma.appUser.delete({ where: { id: user.id } });
  });

  const runAt = new Date(Date.now() + 120_000);
  const actor = { id: user.id, username: user.username, role: "admin" as const, allowedSections: ["actions"] };
  await assert.rejects(() => createScheduledTask({
    name: "بررسی مشاهده‌ای فایروال",
    deviceId: device.id,
    catalogCommandId: "linux.firewall-status",
    parametersJson: {},
    calendarType: "gregorian",
    localDate: runAt.toISOString().slice(0, 10),
    localTime: runAt.toISOString().slice(11, 16),
    timeZone: "UTC",
    runAt: runAt.toISOString(),
    confirmed: true,
  }, actor), (error: unknown) => {
    assert.ok(error instanceof ScheduledTaskError);
    assert.equal(error.code, "COMMAND_NOT_EFFECTFUL");
    return true;
  });
  const task = await createScheduledTask({
    name: "بستن پورت آزمایشی",
    deviceId: device.id,
    catalogCommandId: "linux.close-port",
    parametersJson: { port: 65000, protocol: "tcp" },
    calendarType: "gregorian",
    localDate: runAt.toISOString().slice(0, 10),
    localTime: runAt.toISOString().slice(11, 16),
    timeZone: "UTC",
    runAt: runAt.toISOString(),
    confirmed: true,
  }, actor);
  assert.equal(task.status, ScheduledTaskStatus.scheduled);
  assert.equal(task.catalogCommandId, "linux.close-port");
  assert.deepEqual(task.parametersJson, { port: 65000, protocol: "tcp" });
  const center = await listActionCenter({ status: "queued" });
  const queued = center.items.find((item) => item.id === `scheduled:${task.id}`);
  assert.equal(queued?.lifecycleState, "queued");
  assert.equal(queued?.status, ScheduledTaskStatus.scheduled);
  assert.equal(queued?.controls.canExecute, false);
  const queuedDetail = await getActionCenterItem(`scheduled:${task.id}`);
  assert.equal(queuedDetail?.lifecycleState, "queued");

  const paused = await setScheduledTaskPaused(task.id, true, actor);
  assert.equal(paused.status, ScheduledTaskStatus.paused);
  assert.equal(paused.enabled, false);
  const resumed = await setScheduledTaskPaused(task.id, false, actor);
  assert.equal(resumed.status, ScheduledTaskStatus.scheduled);
  const cancelled = await cancelScheduledTask(task.id, actor);
  assert.equal(cancelled.status, ScheduledTaskStatus.cancelled);
  assert.equal(cancelled.enabled, false);
});

test("scheduler rejects missing confirmation and insufficient role", async (t) => {
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const user = await prisma.appUser.create({
    data: { username: `schedule-viewer-${suffix}`, passwordHash: "test-only", displayName: "Viewer", role: AppUserRole.viewer },
  });
  const device = await prisma.device.create({
    data: { name: `schedule-viewer-device-${suffix}`, vendor: "Linux", type: "linux_edge", host: "192.0.2.245", managementPort: 22, protocol: "ssh", environment: "lab" },
  });
  t.after(async () => {
    await prisma.scheduledTask.deleteMany({ where: { deviceId: device.id } });
    await prisma.device.delete({ where: { id: device.id } });
    await prisma.appUser.delete({ where: { id: user.id } });
  });
  const viewerRunAt = new Date(Date.now() + 180_000);
  const payload = {
    name: "تسک بدون مجوز",
    deviceId: device.id,
    catalogCommandId: "linux.close-port",
    parametersJson: { port: 65001 },
    calendarType: "gregorian",
    localDate: viewerRunAt.toISOString().slice(0, 10),
    localTime: viewerRunAt.toISOString().slice(11, 16),
    timeZone: "UTC",
    runAt: viewerRunAt.toISOString(),
  };
  await assert.rejects(() => createScheduledTask(payload, { id: user.id, username: user.username, role: "viewer", allowedSections: [] }), (error: unknown) => {
    assert.ok(error instanceof ScheduledTaskError);
    assert.equal(error.code, "SCHEDULE_CONFIRMATION_REQUIRED");
    return true;
  });
  await assert.rejects(() => createScheduledTask({ ...payload, confirmed: true }, { id: user.id, username: user.username, role: "viewer", allowedSections: [] }), (error: unknown) => {
    assert.ok(error instanceof ScheduledTaskError);
    assert.equal(error.code, "SCHEDULE_PERMISSION_REVOKED");
    return true;
  });
});
