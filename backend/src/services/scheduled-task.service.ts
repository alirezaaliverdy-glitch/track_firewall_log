import { randomUUID } from "node:crypto";
import {
  ActionType,
  ActionPlanStatus,
  AiRiskLevel,
  Prisma,
  ScheduledTaskCalendar,
  ScheduledTaskRunStatus,
  ScheduledTaskStatus,
  ScheduledTaskTrigger,
  type AppUserRole,
} from "@prisma/client";
import { prisma } from "../db/prisma.js";
import { findCatalogItem, COMMAND_CATALOG_VERSION } from "../commands/catalog/index.js";
import { getExecutionTemplate } from "../commands/execution/execution-template-registry.js";
import { proposeActionPlan, quickExecuteActionPlan } from "./action-plan.service.js";
import { requiredExecutionPermissionForRisk } from "../security/authorization.js";
import { hasPermission, type Role } from "../security/permissions.js";

const ALLOWED_TIME_ZONES = new Set(["Asia/Tehran", "UTC"]);
const MAX_FUTURE_MS = 366 * 24 * 60 * 60 * 1000;
const MISSED_WINDOW_MS = 24 * 60 * 60 * 1000;
const STALE_RUNNING_MS = 15 * 60 * 1000;

type SchedulerActor = {
  id: string;
  username: string;
  role: Role;
  allowedSections: string[];
};

export class ScheduledTaskError extends Error {
  constructor(public code: string, message: string, public statusCode = 400) {
    super(message);
    this.name = "ScheduledTaskError";
  }
}

const asObject = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};

const toJson = (value: unknown) => value as Prisma.InputJsonValue;

function isEffectfulScheduledCommand(item: NonNullable<ReturnType<typeof findCatalogItem>>) {
  return item.implementationState === "implemented"
    && item.supportState === "verified"
    && item.executionSupport === "connector"
    && item.mutating
    && !item.readOnly;
}

function normalizedVendor(device: { type: string; vendor: string }) {
  const vendor = device.vendor.toLowerCase();
  if (device.type === "fortigate" || vendor.includes("forti")) return "fortigate";
  if (device.type === "mikrotik" || vendor.includes("mikrotik") || vendor.includes("routeros")) return "mikrotik";
  if (device.type === "linux_edge" || vendor.includes("linux")) return "linux";
  if (vendor.includes("cisco")) return "cisco";
  return device.type;
}

function validateParam(type: string, value: unknown) {
  if (value === undefined || value === null || value === "") return false;
  if (type === "number") return Number.isFinite(Number(value));
  if (type === "boolean") return typeof value === "boolean" || value === "true" || value === "false";
  if (type === "ip") return typeof value === "string" && /^(?:\d{1,3}\.){3}\d{1,3}$/.test(value);
  if (type === "cidr") return typeof value === "string" && /^(?:\d{1,3}\.){3}\d{1,3}\/\d{1,2}$/.test(value);
  return typeof value === "string" && value.trim().length > 0 && value.length <= 500;
}

function safeError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  const code = error instanceof ScheduledTaskError
    ? error.code
    : typeof error === "object" && error && "code" in error
      ? String((error as { code?: unknown }).code ?? "SCHEDULED_EXECUTION_FAILED")
      : /AUTH/i.test(message) ? "AUTHENTICATION_FAILED"
        : /TIMEOUT|TIMED.OUT/i.test(message) ? "CONNECTION_TIMEOUT"
          : /CONNECT|ECONN/i.test(message) ? "CONNECTION_FAILED"
            : "SCHEDULED_EXECUTION_FAILED";
  const publicMessage = code === "SCHEDULE_OWNER_INACTIVE"
    ? "کاربر سازنده دیگر اجازه اجرای این عملیات را ندارد."
    : code === "SCHEDULE_PERMISSION_REVOKED"
      ? "مجوز اجرای این عملیات از کاربر سازنده گرفته شده است."
      : code === "SCHEDULE_COMMAND_CHANGED"
        ? "عملیات انتخاب‌شده دیگر در کاتالوگ اجرایی فعال نیست."
        : code === "SCHEDULE_MISSED_WINDOW"
          ? "زمان اجرا بیش از ۲۴ ساعت گذشته بود و برای جلوگیری از اجرای ناخواسته رد شد."
          : "اجرای زمان‌بندی‌شده ناموفق بود؛ جزئیات کنترل‌شده در ActionPlan ثبت شده است.";
  return { code: code.slice(0, 100), message: publicMessage };
}

function parseRunAt(input: unknown, allowImmediate = false) {
  const runAt = new Date(String(input ?? ""));
  if (Number.isNaN(runAt.getTime())) throw new ScheduledTaskError("INVALID_RUN_AT", "زمان اجرای معتبر وارد کنید.");
  const minimum = Date.now() + (allowImmediate ? -5_000 : 20_000);
  if (runAt.getTime() < minimum) throw new ScheduledTaskError("RUN_AT_IN_PAST", "زمان اجرا باید حداقل ۲۰ ثانیه در آینده باشد.");
  if (runAt.getTime() > Date.now() + MAX_FUTURE_MS) throw new ScheduledTaskError("RUN_AT_TOO_FAR", "زمان اجرا باید حداکثر یک سال آینده باشد.");
  return runAt;
}

function validateCalendar(input: Record<string, unknown>, runAt: Date) {
  const calendarType = input.calendarType === "jalali" ? ScheduledTaskCalendar.jalali : ScheduledTaskCalendar.gregorian;
  const localDate = String(input.localDate ?? "").trim();
  const localTime = String(input.localTime ?? "").trim();
  const datePattern = calendarType === ScheduledTaskCalendar.jalali ? /^1[34]\d{2}\/\d{2}\/\d{2}$/ : /^\d{4}-\d{2}-\d{2}$/;
  if (!datePattern.test(localDate)) throw new ScheduledTaskError("INVALID_LOCAL_DATE", "تاریخ واردشده با تقویم انتخابی سازگار نیست.");
  if (!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(localTime)) throw new ScheduledTaskError("INVALID_LOCAL_TIME", "ساعت باید به‌شکل HH:mm باشد.");
  const timeZone = String(input.timeZone ?? "Asia/Tehran");
  if (!ALLOWED_TIME_ZONES.has(timeZone)) throw new ScheduledTaskError("INVALID_TIME_ZONE", "منطقه زمانی انتخاب‌شده پشتیبانی نمی‌شود.");
  const calendar = calendarType === ScheduledTaskCalendar.jalali ? "persian" : "gregory";
  const parts = Object.fromEntries(new Intl.DateTimeFormat(`en-u-ca-${calendar}`, {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(runAt).map((part) => [part.type, part.value]));
  const separator = calendarType === ScheduledTaskCalendar.jalali ? "/" : "-";
  const representedDate = [parts.year, parts.month, parts.day].join(separator);
  const representedTime = `${parts.hour}:${parts.minute}`;
  if (representedDate !== localDate || representedTime !== localTime) {
    throw new ScheduledTaskError("SCHEDULE_TIME_MISMATCH", "تاریخ، ساعت و منطقه زمانی با زمان اجرای ارسال‌شده یکسان نیست.", 422);
  }
  return { calendarType, localDate, localTime, timeZone };
}

async function resolveExecutable(input: Record<string, unknown>) {
  const deviceId = String(input.deviceId ?? "");
  const catalogCommandId = String(input.catalogCommandId ?? "");
  const [device, item] = await Promise.all([
    deviceId ? prisma.device.findUnique({ where: { id: deviceId } }) : null,
    Promise.resolve(findCatalogItem(catalogCommandId)),
  ]);
  if (!device) throw new ScheduledTaskError("DEVICE_NOT_FOUND", "دستگاه انتخاب‌شده پیدا نشد.", 404);
  if (!item) throw new ScheduledTaskError("COMMAND_NOT_FOUND", "عملیات انتخاب‌شده در کاتالوگ وجود ندارد.", 404);
  if (!isEffectfulScheduledCommand(item)) {
    throw new ScheduledTaskError("COMMAND_NOT_EFFECTFUL", "فقط عملیات اجرایی و تغییردهنده دستگاه قابل زمان‌بندی است؛ فرمان‌های مشاهده و بررسی در این بخش نمایش داده نمی‌شوند.", 409);
  }
  if (!item.executionTemplateRef || !getExecutionTemplate(item.executionTemplateRef)) {
    throw new ScheduledTaskError("COMMAND_TEMPLATE_MISSING", "قالب اجرایی ثبت‌شده برای این عملیات پیدا نشد.", 409);
  }
  if (normalizedVendor(device) !== item.vendor && item.vendor !== "generic") {
    throw new ScheduledTaskError("VENDOR_MISMATCH", "عملیات انتخاب‌شده با وندور دستگاه سازگار نیست.", 409);
  }
  const provided = asObject(input.parametersJson);
  const parameters = { ...item.defaultParams, ...provided };
  const missing = item.requiredParams.filter((field) => !validateParam(field.type, parameters[field.key]));
  if (missing.length) {
    throw new ScheduledTaskError("SCHEDULE_PARAMETERS_REQUIRED", `پارامترهای لازم کامل نیست: ${missing.map((field) => field.labelFa).join("، ")}`, 422);
  }
  return { device, item, parameters };
}

function assertActorCanExecute(actor: SchedulerActor, riskLevel: string) {
  const permission = requiredExecutionPermissionForRisk(riskLevel);
  if (!hasPermission(actor.role, permission)) {
    throw new ScheduledTaskError("SCHEDULE_PERMISSION_REVOKED", "مجوز اجرای این عملیات وجود ندارد.", 403);
  }
  if (actor.role !== "admin" && !actor.allowedSections.includes("actions")) {
    throw new ScheduledTaskError("SCHEDULE_PERMISSION_REVOKED", "دسترسی بخش اقدامات برای این حساب فعال نیست.", 403);
  }
}

const taskInclude = {
  device: { select: { id: true, name: true, vendor: true, type: true, host: true, status: true } },
  createdBy: { select: { id: true, username: true, displayName: true, role: true } },
  runs: {
    orderBy: { createdAt: "desc" as const },
    take: 5,
    include: { actionPlan: { select: { id: true, status: true, actionType: true, resultJson: true } } },
  },
} as const;

export async function listScheduledTasks(query: { status?: string; deviceId?: string } = {}) {
  return prisma.scheduledTask.findMany({
    where: {
      ...(query.deviceId ? { deviceId: query.deviceId } : {}),
      ...(query.status && Object.values(ScheduledTaskStatus).includes(query.status as ScheduledTaskStatus)
        ? { status: query.status as ScheduledTaskStatus }
        : {}),
    },
    orderBy: [{ runAt: "asc" }, { createdAt: "desc" }],
    take: 200,
    include: taskInclude,
  });
}

export async function listScheduledTaskHistory(limit = 100) {
  return prisma.scheduledTaskRun.findMany({
    orderBy: { createdAt: "desc" },
    take: Math.min(200, Math.max(1, limit)),
    include: {
      scheduledTask: { include: { device: { select: { id: true, name: true, vendor: true, type: true } } } },
      actionPlan: { select: { id: true, status: true, actionType: true } },
    },
  });
}

export async function createScheduledTask(input: Record<string, unknown>, actor: SchedulerActor) {
  if (input.confirmed !== true) throw new ScheduledTaskError("SCHEDULE_CONFIRMATION_REQUIRED", "تأیید صریح زمان‌بندی لازم است.", 428);
  const name = String(input.name ?? "").trim();
  if (name.length < 3 || name.length > 120) throw new ScheduledTaskError("INVALID_SCHEDULE_NAME", "نام تسک باید بین ۳ تا ۱۲۰ نویسه باشد.");
  const runAt = parseRunAt(input.runAt);
  const calendar = validateCalendar(input, runAt);
  const resolved = await resolveExecutable(input);
  assertActorCanExecute(actor, resolved.item.riskLevel);
  return prisma.scheduledTask.create({
    data: {
      name,
      deviceId: resolved.device.id,
      catalogCommandId: resolved.item.id,
      actionType: resolved.item.actionType as ActionType,
      riskLevel: resolved.item.riskLevel as AiRiskLevel,
      parametersJson: toJson(resolved.parameters),
      ...calendar,
      runAt,
      createdById: actor.id,
      confirmationJson: toJson({
        confirmed: true,
        confirmedAt: new Date().toISOString(),
        confirmedBy: actor.id,
        catalogVersion: COMMAND_CATALOG_VERSION,
        riskLevel: resolved.item.riskLevel,
      }),
    },
    include: taskInclude,
  });
}

async function editableTask(id: string, actor: SchedulerActor) {
  const task = await prisma.scheduledTask.findUnique({ where: { id } });
  if (!task) throw new ScheduledTaskError("SCHEDULE_NOT_FOUND", "تسک زمان‌بندی‌شده پیدا نشد.", 404);
  if (actor.role !== "admin" && task.createdById !== actor.id) {
    throw new ScheduledTaskError("SCHEDULE_OWNER_REQUIRED", "فقط سازنده یا مدیر می‌تواند این زمان‌بندی را تغییر دهد.", 403);
  }
  return task;
}

export async function updateScheduledTask(id: string, input: Record<string, unknown>, actor: SchedulerActor) {
  const current = await editableTask(id, actor);
  if (
    current.status === ScheduledTaskStatus.running
    || current.status === ScheduledTaskStatus.completed
    || current.status === ScheduledTaskStatus.cancelled
  ) {
    throw new ScheduledTaskError("SCHEDULE_NOT_EDITABLE", "این تسک دیگر قابل ویرایش نیست.", 409);
  }
  if (input.runAt !== undefined && input.confirmed !== true) {
    throw new ScheduledTaskError("SCHEDULE_CONFIRMATION_REQUIRED", "تأیید صریح زمان جدید لازم است.", 428);
  }
  const runAt = input.runAt === undefined ? current.runAt : parseRunAt(input.runAt);
  const calendar = input.runAt === undefined ? {
    calendarType: current.calendarType,
    localDate: current.localDate,
    localTime: current.localTime,
    timeZone: current.timeZone,
  } : validateCalendar(input, runAt);
  const name = input.name === undefined ? current.name : String(input.name).trim();
  if (name.length < 3 || name.length > 120) throw new ScheduledTaskError("INVALID_SCHEDULE_NAME", "نام تسک باید بین ۳ تا ۱۲۰ نویسه باشد.");
  return prisma.scheduledTask.update({
    where: { id },
    data: { name, runAt, ...calendar },
    include: taskInclude,
  });
}

export async function setScheduledTaskPaused(id: string, paused: boolean, actor: SchedulerActor) {
  const task = await editableTask(id, actor);
  if (task.status === ScheduledTaskStatus.cancelled || task.status === ScheduledTaskStatus.completed) {
    throw new ScheduledTaskError("SCHEDULE_TERMINAL", "تسک پایان‌یافته یا لغوشده قابل تغییر نیست.", 409);
  }
  if (!paused && task.runAt.getTime() < Date.now() + 20_000) {
    throw new ScheduledTaskError("RUN_AT_IN_PAST", "برای فعال‌سازی دوباره ابتدا زمان آینده را ثبت کنید.", 409);
  }
  return prisma.scheduledTask.update({
    where: { id },
    data: { enabled: !paused, status: paused ? ScheduledTaskStatus.paused : ScheduledTaskStatus.scheduled },
    include: taskInclude,
  });
}

export async function cancelScheduledTask(id: string, actor: SchedulerActor) {
  const task = await editableTask(id, actor);
  if (task.status === ScheduledTaskStatus.running) throw new ScheduledTaskError("SCHEDULE_RUNNING", "تسک در حال اجرا قابل لغو نیست.", 409);
  return prisma.scheduledTask.update({
    where: { id },
    data: { enabled: false, status: ScheduledTaskStatus.cancelled },
    include: taskInclude,
  });
}

function planParameters(task: Awaited<ReturnType<typeof prisma.scheduledTask.findUnique>>, item: NonNullable<ReturnType<typeof findCatalogItem>>) {
  if (!task) return {};
  const parameters = asObject(task.parametersJson);
  return {
    ...parameters,
    vendor: item.vendor,
    executionSupport: item.executionSupport,
    supportState: item.supportState,
    executable: true,
    requiresExplicitReview: true,
    expectedImpact: item.descriptionFa,
    suggestedPrechecks: item.prechecks,
    suggestedVerification: item.verification,
    suggestedRollback: item.rollback.available ? item.rollback.steps : [item.rollback.notAvailableReasonFa],
    metadata: {
      source: "command_catalog",
      schedulerTaskId: task.id,
      catalogCommandId: item.id,
      catalogVersion: COMMAND_CATALOG_VERSION,
      catalogTitleFa: item.titleFa,
      vendor: item.vendor,
      actionType: item.actionType,
      implementationState: item.implementationState,
      executionSupport: item.executionSupport,
      supportState: item.supportState,
      supportReasonKey: item.supportReasonKey,
      executable: true,
      executionTemplateRef: item.executionTemplateRef,
      connectorType: item.connectorType,
      normalizedParams: parameters,
      requiredParamsSatisfied: true,
      previewGenerated: false,
      executed: false,
      connectorInvoked: false,
      lastExecutionStatus: "not_started",
    },
  };
}

async function currentActor(task: { createdById: string | null; riskLevel: string }) {
  if (!task.createdById) throw new ScheduledTaskError("SCHEDULE_OWNER_INACTIVE", "کاربر سازنده در دسترس نیست.", 409);
  const user = await prisma.appUser.findUnique({ where: { id: task.createdById } });
  if (!user?.isActive) throw new ScheduledTaskError("SCHEDULE_OWNER_INACTIVE", "کاربر سازنده غیرفعال است.", 409);
  const actor: SchedulerActor = { id: user.id, username: user.username, role: user.role as AppUserRole, allowedSections: user.allowedSections };
  assertActorCanExecute(actor, task.riskLevel);
  return actor;
}

export async function executeScheduledTask(id: string, trigger: ScheduledTaskTrigger = ScheduledTaskTrigger.schedule) {
  const task = await prisma.scheduledTask.findUnique({ where: { id } });
  if (!task) throw new ScheduledTaskError("SCHEDULE_NOT_FOUND", "تسک پیدا نشد.", 404);
  if (trigger === ScheduledTaskTrigger.schedule && (!task.enabled || task.status !== ScheduledTaskStatus.scheduled)) return null;
  if (task.status === ScheduledTaskStatus.cancelled) throw new ScheduledTaskError("SCHEDULE_CANCELLED", "تسک لغو شده است.", 409);

  const scheduledFor = trigger === ScheduledTaskTrigger.schedule ? task.runAt : new Date();
  const executionKey = trigger === ScheduledTaskTrigger.schedule
    ? `${task.id}:${task.runAt.toISOString()}:schedule`
    : `${task.id}:${randomUUID()}:manual`;
  let run;
  try {
    run = await prisma.scheduledTaskRun.create({
      data: { scheduledTaskId: task.id, executionKey, trigger, scheduledFor },
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return null;
    throw error;
  }

  if (trigger === ScheduledTaskTrigger.schedule) {
    await prisma.scheduledTask.update({ where: { id: task.id }, data: { status: ScheduledTaskStatus.running } });
  }

  try {
    if (trigger === ScheduledTaskTrigger.schedule && Date.now() - task.runAt.getTime() > MISSED_WINDOW_MS) {
      throw new ScheduledTaskError("SCHEDULE_MISSED_WINDOW", "Scheduled execution window was missed.", 409);
    }
    const actor = await currentActor(task);
    const item = findCatalogItem(task.catalogCommandId);
    if (!item || !isEffectfulScheduledCommand(item) || !item.executionTemplateRef || !getExecutionTemplate(item.executionTemplateRef)) {
      throw new ScheduledTaskError("SCHEDULE_COMMAND_CHANGED", "Scheduled catalog command is no longer executable.", 409);
    }
    const plan = await proposeActionPlan({
      forceNew: true,
      source: "system",
      requestedBy: `scheduled:${actor.username}`,
      deviceId: task.deviceId,
      vendor: item.vendor,
      actionType: item.actionType,
      riskLevel: item.riskLevel,
      parametersJson: planParameters(task, item),
    });
    const executed = await quickExecuteActionPlan(plan.id, {
      intent: "execute",
      approvedBy: `scheduled:${actor.username}`,
      approvedByRole: actor.role,
      approvalConfirmation: "APPROVE",
      reason: `Scheduled task: ${task.name}`,
      breakGlass: item.riskLevel === "critical",
      actionPlanRevision: 1,
    });
    const parameters = asObject(executed?.parametersJson);
    const metadata = asObject(parameters.metadata);
    const result = asObject(executed?.resultJson);
    const succeeded = executed?.status === ActionPlanStatus.succeeded && metadata.connectorInvoked === true;
    await prisma.$transaction([
      prisma.scheduledTaskRun.update({
        where: { id: run.id },
        data: {
          actionPlanId: executed?.id ?? plan.id,
          status: succeeded ? ScheduledTaskRunStatus.succeeded : ScheduledTaskRunStatus.failed,
          completedAt: new Date(),
          errorCode: succeeded ? null : "ACTION_EXECUTION_NOT_VERIFIED",
          errorMessage: succeeded ? null : "اجرای Connector با نتیجه موفق تأیید نشد.",
          resultJson: toJson({
            actionPlanStatus: executed?.status ?? "failed",
            connectorInvoked: metadata.connectorInvoked === true,
            outcome: result.outcome ?? null,
          }),
        },
      }),
      prisma.scheduledTask.update({
        where: { id: task.id },
        data: {
          lastRunAt: new Date(),
          ...(trigger === ScheduledTaskTrigger.schedule ? { enabled: false, status: ScheduledTaskStatus.completed } : {}),
        },
      }),
    ]);
  } catch (error) {
    const safe = safeError(error);
    await prisma.$transaction([
      prisma.scheduledTaskRun.update({
        where: { id: run.id },
        data: { status: error instanceof ScheduledTaskError && error.code === "SCHEDULE_MISSED_WINDOW" ? ScheduledTaskRunStatus.skipped : ScheduledTaskRunStatus.failed, completedAt: new Date(), errorCode: safe.code, errorMessage: safe.message },
      }),
      prisma.scheduledTask.update({
        where: { id: task.id },
        data: { lastRunAt: new Date(), ...(trigger === ScheduledTaskTrigger.schedule ? { enabled: false, status: ScheduledTaskStatus.completed } : {}) },
      }),
    ]);
  }
  return prisma.scheduledTaskRun.findUnique({
    where: { id: run.id },
    include: { actionPlan: { select: { id: true, status: true, actionType: true } } },
  });
}

export async function runScheduledTaskCycle() {
  const due = await prisma.scheduledTask.findMany({
    where: { enabled: true, status: ScheduledTaskStatus.scheduled, runAt: { lte: new Date() } },
    orderBy: { runAt: "asc" },
    take: 3,
    select: { id: true },
  });
  for (const task of due) await executeScheduledTask(task.id);
  return { attempted: due.length };
}

export async function recoverInterruptedScheduledTasks() {
  const cutoff = new Date(Date.now() - STALE_RUNNING_MS);
  const staleRuns = await prisma.scheduledTaskRun.findMany({
    where: { status: ScheduledTaskRunStatus.running, startedAt: { lt: cutoff } },
    select: { id: true, scheduledTaskId: true },
    take: 100,
  });
  if (!staleRuns.length) return 0;
  await prisma.$transaction([
    prisma.scheduledTaskRun.updateMany({
      where: { id: { in: staleRuns.map((run) => run.id) } },
      data: { status: ScheduledTaskRunStatus.failed, completedAt: new Date(), errorCode: "SCHEDULER_INTERRUPTED", errorMessage: "اجرای قبلی با توقف سرویس ناتمام ماند و خودکار تکرار نشد." },
    }),
    prisma.scheduledTask.updateMany({
      where: { id: { in: staleRuns.map((run) => run.scheduledTaskId) }, status: ScheduledTaskStatus.running },
      data: { enabled: false, status: ScheduledTaskStatus.completed, lastRunAt: new Date() },
    }),
  ]);
  return staleRuns.length;
}

export async function deactivateNonEffectfulScheduledTasks() {
  const activeTasks = await prisma.scheduledTask.findMany({
    where: { status: { in: [ScheduledTaskStatus.scheduled, ScheduledTaskStatus.paused] } },
    select: { id: true, catalogCommandId: true },
    take: 500,
  });
  const obsoleteIds = activeTasks
    .filter((task) => {
      const item = findCatalogItem(task.catalogCommandId);
      return !item || !isEffectfulScheduledCommand(item);
    })
    .map((task) => task.id);
  if (!obsoleteIds.length) return 0;
  const result = await prisma.scheduledTask.updateMany({
    where: { id: { in: obsoleteIds } },
    data: { enabled: false, status: ScheduledTaskStatus.cancelled },
  });
  return result.count;
}

export async function runScheduledTaskNow(id: string, actor: SchedulerActor) {
  const task = await editableTask(id, actor);
  assertActorCanExecute(actor, task.riskLevel);
  return executeScheduledTask(id, ScheduledTaskTrigger.manual);
}
