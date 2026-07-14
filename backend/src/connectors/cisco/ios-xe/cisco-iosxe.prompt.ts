export type CiscoPromptState = { mode: "user" | "privileged" | "config" | "unknown"; prompt: string | null; paging: boolean };

export function detectCiscoPrompt(output: string): CiscoPromptState {
  const lines = output.trimEnd().split(/\r?\n/).filter(Boolean);
  const prompt = lines.at(-1) ?? null;
  if (!prompt) return { mode: "unknown", prompt: null, paging: false };
  if (/--More--/.test(output)) return { mode: "unknown", prompt, paging: true };
  if (/\(config[^)]*\)#\s*$/.test(prompt)) return { mode: "config", prompt, paging: false };
  if (/#\s*$/.test(prompt)) return { mode: "privileged", prompt, paging: false };
  if (/>\s*$/.test(prompt)) return { mode: "user", prompt, paging: false };
  return { mode: "unknown", prompt, paging: false };
}

export function stripCiscoEchoAndPrompt(output: string, command: string) {
  const lines = output.replace(/\r/g, "").split("\n");
  const filtered = lines.filter((line, index) => !(index === 0 && line.trim() === command.trim())).filter((line) => !/^[\w.-]+(?:\(config[^)]*\))?[#>]\s*$/.test(line.trim()));
  return filtered.join("\n").replace(/--More--/g, "").trim();
}
