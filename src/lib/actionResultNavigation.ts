export function actionResultUrl(actionPlanId: string) {
  return `/actions/${encodeURIComponent(actionPlanId)}/result`;
}

export function openActionResultInNewTab(actionPlanId: string) {
  const opened = window.open(actionResultUrl(actionPlanId), "_blank", "noopener,noreferrer");
  return Boolean(opened);
}
