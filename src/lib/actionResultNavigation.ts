export function actionResultUrl(actionPlanId: string) {
  return `/actions/${encodeURIComponent(actionPlanId)}/result`;
}
