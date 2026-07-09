import { FORTIGATE_GUIDED_BLUEPRINTS, resolveFortiGateGuidedIntent } from "./vendors/fortigate/fortigate-blueprints.js";
import type { GuidedActionBlueprint } from "./types.js";

export const GUIDED_ACTION_BLUEPRINTS: readonly GuidedActionBlueprint[] = Object.freeze([
  ...FORTIGATE_GUIDED_BLUEPRINTS,
]);

export function getGuidedActionBlueprint(id: string) {
  return GUIDED_ACTION_BLUEPRINTS.find((blueprint) => blueprint.id === id) ?? null;
}

export function listGuidedActionBlueprints(filter?: { vendor?: string }) {
  return GUIDED_ACTION_BLUEPRINTS.filter((blueprint) => !filter?.vendor || blueprint.vendor === filter.vendor);
}

export function resolveGuidedAction(input: { text: string; vendor: string }) {
  if (input.vendor === "fortigate") return resolveFortiGateGuidedIntent(input.text);
  return null;
}
