export const ACTION_PAYLOAD_SCHEMA_VERSION = "phase_r_action_payload_v1";

export type VersionedActionPayload = {
  schemaVersion: typeof ACTION_PAYLOAD_SCHEMA_VERSION;
  parameters: Record<string, unknown>;
  metadata: Record<string, unknown> & {
    schemaVersion: typeof ACTION_PAYLOAD_SCHEMA_VERSION;
  };
};

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

export function upcastActionPayload(payload: unknown): VersionedActionPayload {
  const input = object(payload);
  const explicitParameters = object(input.parameters);
  const legacyParameters = Object.fromEntries(Object.entries(input).filter(([key]) => key !== "metadata" && key !== "schemaVersion"));
  const parameters = Object.keys(explicitParameters).length > 0 ? explicitParameters : legacyParameters;
  const metadata = object(input.metadata);
  return {
    schemaVersion: ACTION_PAYLOAD_SCHEMA_VERSION,
    parameters,
    metadata: {
      ...metadata,
      schemaVersion: ACTION_PAYLOAD_SCHEMA_VERSION
    }
  };
}
