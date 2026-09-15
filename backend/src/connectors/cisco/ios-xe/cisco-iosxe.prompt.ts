export type CiscoPromptState = { mode: "user" | "privileged" | "config" | "unknown"; prompt: string | null; paging: boolean };

export function normalizeCiscoTerminalOutput(output: string) {
  const ansiSequence = new RegExp(`${String.fromCharCode(27)}\\[[0-?]*[ -/]*[@-~]`, "g");
  const characters: string[] = [];
  for (const character of output.replace(ansiSequence, "")) {
    if (character === String.fromCharCode(8)) characters.pop();
    else characters.push(character);
  }
  return characters.join("").replace(/\r/g, "");
}

export function detectCiscoPrompt(output: string): CiscoPromptState {
  const normalized = normalizeCiscoTerminalOutput(output);
  const lines = normalized.trimEnd().split(/\n/).filter(Boolean);
  const prompt = lines.at(-1) ?? null;
  if (!prompt) return { mode: "unknown", prompt: null, paging: false };
  if (/--More--|<--- More --->/i.test(normalized)) return { mode: "unknown", prompt, paging: true };
  if (/\(config[^)]*\)#\s*$/.test(prompt)) return { mode: "config", prompt, paging: false };
  if (/#\s*$/.test(prompt)) return { mode: "privileged", prompt, paging: false };
  if (/>\s*$/.test(prompt)) return { mode: "user", prompt, paging: false };
  return { mode: "unknown", prompt, paging: false };
}

export function stripCiscoEchoAndPrompt(output: string, command: string) {
  const lines = normalizeCiscoTerminalOutput(output).split("\n");
  const filtered = lines
    .filter((line, index) => !(index === 0 && line.trim() === command.trim()))
    .filter((line) => !/^[\w.()/-]+(?:\(config[^)]*\))?[#>]\s*$/.test(line.trim()));
  return filtered.join("\n").replace(/--More--|<--- More --->/gi, "").trim();
}
