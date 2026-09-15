export function logRuntimeError(message: string, error?: unknown, context?: unknown) {
  if (import.meta.env.PROD) return;

  if (context === undefined) {
    console.error(message, error);
    return;
  }

  console.error(message, error, context);
}

export function logRuntimeWarning(message: string, context?: unknown) {
  if (import.meta.env.PROD) return;

  if (context === undefined) {
    console.warn(message);
    return;
  }

  console.warn(message, context);
}
