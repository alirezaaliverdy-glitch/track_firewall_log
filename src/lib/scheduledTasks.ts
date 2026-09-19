import { apiRequest } from "./apiTransport";

export type ScheduledTaskStatus = "scheduled" | "paused" | "running" | "completed" | "cancelled";
export type ScheduledRunStatus = "running" | "succeeded" | "failed" | "skipped";
export type CalendarType = "jalali" | "gregorian";

export type ScheduledTaskRun = {
  id: string;
  scheduledTaskId: string;
  actionPlanId: string | null;
  trigger: "schedule" | "manual";
  status: ScheduledRunStatus;
  scheduledFor: string;
  startedAt: string;
  completedAt: string | null;
  errorCode: string | null;
  errorMessage: string | null;
  resultJson: Record<string, unknown> | null;
  actionPlan?: { id: string; status: string; actionType: string } | null;
  scheduledTask?: ScheduledTask;
};

export type ScheduledTask = {
  id: string;
  name: string;
  deviceId: string;
  catalogCommandId: string;
  actionType: string;
  riskLevel: string;
  parametersJson: Record<string, unknown>;
  calendarType: CalendarType;
  localDate: string;
  localTime: string;
  timeZone: string;
  runAt: string;
  status: ScheduledTaskStatus;
  enabled: boolean;
  lastRunAt: string | null;
  createdAt: string;
  updatedAt: string;
  device: { id: string; name: string; vendor: string; type: string; host: string; status: string };
  createdBy: { id: string; username: string; displayName: string; role: string } | null;
  runs: ScheduledTaskRun[];
};

export type CreateScheduledTaskInput = {
  name: string;
  deviceId: string;
  catalogCommandId: string;
  parametersJson: Record<string, unknown>;
  calendarType: CalendarType;
  localDate: string;
  localTime: string;
  timeZone: string;
  runAt: string;
  confirmed: true;
};

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await apiRequest(path, {
    ...init,
    headers: init?.body ? { "Content-Type": "application/json", ...init.headers } : init?.headers,
  });
  const body = await response.json().catch(() => ({})) as Record<string, unknown>;
  if (!response.ok) {
    const structured = body.error && typeof body.error === "object" ? body.error as Record<string, unknown> : {};
    throw new Error(String(structured.message ?? body.messageFa ?? body.detail ?? body.error ?? "ارتباط با زمان‌بند ناموفق بود."));
  }
  return body as T;
}

export async function getScheduledTasks() {
  return request<{ tasks: ScheduledTask[] }>("/scheduled-tasks").then((body) => body.tasks);
}

export async function getScheduledTaskHistory() {
  return request<{ runs: ScheduledTaskRun[] }>("/scheduled-tasks/history?limit=150").then((body) => body.runs);
}

export function createScheduledTask(input: CreateScheduledTaskInput) {
  return request<ScheduledTask>("/scheduled-tasks", { method: "POST", body: JSON.stringify(input) });
}

export function updateScheduledTask(id: string, input: Pick<CreateScheduledTaskInput, "name" | "calendarType" | "localDate" | "localTime" | "timeZone" | "runAt" | "confirmed">) {
  return request<ScheduledTask>(`/scheduled-tasks/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(input) });
}

export function pauseScheduledTask(id: string, paused: boolean) {
  return request<ScheduledTask>(`/scheduled-tasks/${encodeURIComponent(id)}/${paused ? "pause" : "resume"}`, { method: "POST" });
}

export function cancelScheduledTask(id: string) {
  return request<ScheduledTask>(`/scheduled-tasks/${encodeURIComponent(id)}/cancel`, { method: "POST", body: JSON.stringify({ confirmed: true }) });
}

export function runScheduledTaskNow(id: string) {
  return request<ScheduledTaskRun>(`/scheduled-tasks/${encodeURIComponent(id)}/run-now`, { method: "POST", body: JSON.stringify({ confirmed: true }) });
}

const div = (a: number, b: number) => Math.trunc(a / b);
const mod = (a: number, b: number) => a - Math.trunc(a / b) * b;

function jalCal(jy: number) {
  const breaks = [-61, 9, 38, 199, 426, 686, 756, 818, 1111, 1181, 1210, 1635, 2060, 2097, 2192, 2262, 2324, 2394, 2456, 3178];
  const gy = jy + 621;
  let leapJ = -14;
  let jp = breaks[0];
  let jump = 0;
  if (jy < jp || jy >= breaks[breaks.length - 1]) throw new Error("سال شمسی خارج از محدوده پشتیبانی است.");
  for (let index = 1; index < breaks.length; index += 1) {
    const jm = breaks[index];
    jump = jm - jp;
    if (jy < jm) break;
    leapJ += div(jump, 33) * 8 + div(mod(jump, 33), 4);
    jp = jm;
  }
  let n = jy - jp;
  leapJ += div(n, 33) * 8 + div(mod(n, 33) + 3, 4);
  if (mod(jump, 33) === 4 && jump - n === 4) leapJ += 1;
  const leapG = div(gy, 4) - div((div(gy, 100) + 1) * 3, 4) - 150;
  const march = 20 + leapJ - leapG;
  if (jump - n < 6) n = n - jump + div(jump + 4, 33) * 33;
  let leap = mod(mod(n + 1, 33) - 1, 4);
  if (leap === -1) leap = 4;
  return { leap, gy, march };
}

function gregorianToJdn(gy: number, gm: number, gd: number) {
  let value = div((gy + div(gm - 8, 6) + 100100) * 1461, 4);
  value += div(153 * mod(gm + 9, 12) + 2, 5) + gd - 34_840_408;
  value -= div(div(gy + 100100 + div(gm - 8, 6), 100) * 3, 4) - 752;
  return value;
}

function jdnToGregorian(jdn: number) {
  let j = 4 * jdn + 139_361_631;
  j += div(div(4 * jdn + 183_187_720, 146_097) * 3, 4) * 4 - 3908;
  const i = div(mod(j, 1461), 4) * 5 + 308;
  const gd = div(mod(i, 153), 5) + 1;
  const gm = mod(div(i, 153), 12) + 1;
  const gy = div(j, 1461) - 100100 + div(8 - gm, 6);
  return { gy, gm, gd };
}

export function jalaliToGregorian(jy: number, jm: number, jd: number) {
  const calculation = jalCal(jy);
  const jdn = gregorianToJdn(calculation.gy, 3, calculation.march) + (jm - 1) * 31 - div(jm, 7) * (jm - 7) + jd - 1;
  const result = jdnToGregorian(jdn);
  if (jm < 1 || jm > 12 || jd < 1 || jd > (jm <= 6 ? 31 : jm <= 11 ? 30 : calculation.leap === 0 ? 30 : 29)) {
    throw new Error("تاریخ شمسی معتبر نیست.");
  }
  return result;
}

export function scheduleDateToIso(calendar: CalendarType, date: string, time: string, timeZone: string) {
  const [hour, minute] = time.split(":").map(Number);
  let year: number;
  let month: number;
  let day: number;
  if (calendar === "jalali") {
    const [jy, jm, jd] = date.split("/").map(Number);
    const converted = jalaliToGregorian(jy, jm, jd);
    year = converted.gy; month = converted.gm; day = converted.gd;
  } else {
    [year, month, day] = date.split("-").map(Number);
    const candidate = new Date(Date.UTC(year, month - 1, day));
    if (candidate.getUTCFullYear() !== year || candidate.getUTCMonth() !== month - 1 || candidate.getUTCDate() !== day) {
      throw new Error("تاریخ میلادی معتبر نیست.");
    }
  }
  if (![year, month, day, hour, minute].every(Number.isFinite) || hour < 0 || hour > 23 || minute < 0 || minute > 59) throw new Error("تاریخ و ساعت کامل نیست.");
  let guess = Date.UTC(year, month - 1, day, hour, minute, 0);
  if (timeZone !== "UTC") {
    const formatter = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
    for (let pass = 0; pass < 2; pass += 1) {
      const parts = Object.fromEntries(formatter.formatToParts(new Date(guess)).map((part) => [part.type, part.value]));
      const represented = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), Number(parts.hour), Number(parts.minute));
      guess -= represented - Date.UTC(year, month - 1, day, hour, minute);
    }
  }
  return new Date(guess).toISOString();
}

export function formatBothCalendars(value: string) {
  const date = new Date(value);
  return {
    jalali: new Intl.DateTimeFormat("fa-IR-u-ca-persian", { dateStyle: "medium", timeStyle: "short", hourCycle: "h23", timeZone: "Asia/Tehran" }).format(date),
    gregorian: new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short", hourCycle: "h23", timeZone: "Asia/Tehran" }).format(date),
  };
}
