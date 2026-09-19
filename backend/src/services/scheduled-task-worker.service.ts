import { deactivateNonEffectfulScheduledTasks, recoverInterruptedScheduledTasks, runScheduledTaskCycle } from "./scheduled-task.service.js";

type SchedulerLogger = {
  info(payload: unknown, message?: string): void;
  warn(payload: unknown, message?: string): void;
};

const TICK_MS = 5_000;
let timer: NodeJS.Timeout | null = null;
let cycle: Promise<void> | null = null;

function trigger(logger?: SchedulerLogger) {
  if (cycle) return cycle;
  cycle = runScheduledTaskCycle()
    .then((result) => {
      if (result.attempted > 0) logger?.info({ attempted: result.attempted }, "Scheduled task cycle completed");
    })
    .catch(() => logger?.warn({ code: "SCHEDULED_TASK_CYCLE_FAILED" }, "Scheduled task cycle failed"))
    .finally(() => { cycle = null; });
  return cycle;
}

export async function startScheduledTaskWorker(logger?: SchedulerLogger) {
  if (timer) return;
  const deactivated = await deactivateNonEffectfulScheduledTasks();
  if (deactivated > 0) logger?.info({ deactivated }, "Read-only scheduled tasks were deactivated");
  const recovered = await recoverInterruptedScheduledTasks();
  if (recovered > 0) logger?.warn({ recovered }, "Interrupted scheduled tasks were closed without automatic replay");
  void trigger(logger);
  timer = setInterval(() => { void trigger(logger); }, TICK_MS);
  timer.unref();
  logger?.info({ tickSeconds: TICK_MS / 1000 }, "Scheduled task worker started");
}

export async function stopScheduledTaskWorker() {
  if (timer) clearInterval(timer);
  timer = null;
  await cycle;
}
