const baseUrl = (process.env.OPENAI_BASE_URL || "https://openrouter.ai/api/v1").replace(/\/$/, "");
const modelArgumentIndex = process.argv.indexOf("--model");
const requestedModel = modelArgumentIndex >= 0 ? process.argv[modelArgumentIndex + 1] : null;
const model = requestedModel || process.env.OPENAI_MODEL || "openrouter/free";
const key = process.env.OPENAI_API_KEY;

if (process.argv.includes("--application-provider")) {
  try {
    const providerInput = {
      message: "سلام، فقط کوتاه پاسخ بده.",
      context: {
        events: { recentCount: 0 },
        incidents: { countByStatus: [], countBySeverity: [] },
        evidencePack: { availableActionHints: [], recentHighCriticalEvents: [] },
        availableCatalogActions: [],
        targetScopedCatalogActions: [],
        targetDeviceContext: null
      }
    };
    const result = requestedModel
      ? await (await import("/app/dist/services/providers/openai-compatible.provider.js")).runOpenAiCompatibleProvider(providerInput, requestedModel)
      : await (await import("/app/dist/services/ai-provider.service.js")).runAiProvider(providerInput);
    console.log(JSON.stringify({
      ok: true,
      status: 200,
      model,
      provider: typeof result?.provider === "string" ? result.provider : "openai_compatible",
      fallbackUsed: Boolean(result?.fallbackUsed),
      hasAssistantMessage: typeof result?.assistantMessage === "string" && result.assistantMessage.trim().length > 0
    }));
  } catch (error) {
    console.log(JSON.stringify({
      ok: false,
      status: Number(error?.statusCode) || 0,
      model,
      errorName: error instanceof Error ? error.name : "UnknownError",
      errorMessage: error instanceof Error ? error.message.slice(0, 180) : "Provider request failed"
    }));
    process.exitCode = 5;
  }
  process.exit();
}

if (!key) {
  console.log(JSON.stringify({ ok: false, status: 0, reason: "key-not-configured" }));
  process.exitCode = 2;
} else {
  try {
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      signal: AbortSignal.timeout(30_000),
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`,
        "HTTP-Referer": "http://localhost/firewall/",
        "X-Title": "Firewall Log Analyzer"
      },
      body: JSON.stringify({
        model,
        max_tokens: 40,
        response_format: { type: "json_object" },
        messages: [{ role: "user", content: "Return a JSON object with the field ok set to true." }]
      })
    });
    let payload = {};
    try { payload = await response.json(); } catch { /* response shape is reported below */ }
    console.log(JSON.stringify({
      ok: response.ok,
      status: response.status,
      model,
      hasChoice: Array.isArray(payload.choices) && payload.choices.length > 0,
      errorCode: payload?.error?.code ?? null,
      errorMessage: typeof payload?.error?.message === "string" ? payload.error.message.slice(0, 180) : null
    }));
    if (!response.ok) process.exitCode = 3;
  } catch (error) {
    console.log(JSON.stringify({
      ok: false,
      status: 0,
      model,
      errorName: error instanceof Error ? error.name : "UnknownError",
      errorMessage: error instanceof Error ? error.message.slice(0, 180) : "Provider request failed"
    }));
    process.exitCode = 4;
  }
}
