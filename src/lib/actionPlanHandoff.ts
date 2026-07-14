export const ACTION_PLAN_CREATED_EVENT = "action-plan-created";

type HandoffTarget = Pick<Window, "addEventListener" | "removeEventListener" | "dispatchEvent">;
export function actionPlanPath(actionPlanId: string) {
  const id = actionPlanId.trim();
  if (!id) throw new Error("actionPlanId is required");
  return `/actions/${encodeURIComponent(id)}`;
}

export function actionPlanIdFromLocation(pathname = window.location.pathname, search = window.location.search) {
  const direct = pathname.match(/^\/actions\/([^/]+)\/?$/);
  if (direct) {
    try { return decodeURIComponent(direct[1]); }
    catch { return direct[1]; }
  }
  const params = new URLSearchParams(search);
  return params.get("planId") ?? params.get("selected") ?? undefined;
}

export function publishActionPlanCreated(actionPlanId: string, target: HandoffTarget = window) {
  target.dispatchEvent(new CustomEvent(ACTION_PLAN_CREATED_EVENT, { detail: { id: actionPlanId } }));
}

export function subscribeToActionPlanCreated(listener: (actionPlanId: string) => void, target: HandoffTarget = window) {
  const handler: EventListener = (event) => {
    const id = event instanceof CustomEvent && typeof event.detail?.id === "string" ? event.detail.id : "";
    if (id) listener(id);
  };
  target.addEventListener(ACTION_PLAN_CREATED_EVENT, handler);
  return () => target.removeEventListener(ACTION_PLAN_CREATED_EVENT, handler);
}

export function reviewInActionCenter(actionPlanId: string, target: EventTarget = window) {
  target.dispatchEvent(new CustomEvent("app:navigate", { detail: { to: actionPlanPath(actionPlanId) } }));
}
