export const ACTION_PLAN_CREATED_EVENT = "action-plan-created";

type HandoffTarget = Pick<Window, "addEventListener" | "removeEventListener" | "dispatchEvent">;

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

export function reviewInActionCenter() {
  document.getElementById("action-center")?.scrollIntoView({ behavior: "smooth", block: "start" });
}
