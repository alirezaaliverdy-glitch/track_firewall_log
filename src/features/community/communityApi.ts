import { API_BASE_URL } from "@/config/frontendEnv";
export type Kind = "discussion" | "ticket";
export type ThreadStatus = "open" | "in_progress" | "resolved";
export type Person = { id: string; displayName: string };
export type Thread = { id: string; creatorId: string; creator: Person; kind: Kind; title: string; status: ThreadStatus;
  priority: "normal" | "urgent"; updatedAt: string; createdAt: string; preview?: string; unread?: boolean; messageCount?: number };
export type Message = { id: string; sequence: number; authorId: string; author: Person; body: string; createdAt: string };
export type Detail = { thread: Thread; messages: Message[]; hasMore: boolean };
// LAN installs may use HTTP, where randomUUID is unavailable. getRandomValues
// still provides cryptographic request IDs without requiring a secure context.
export function messageKey() {
  return Array.from(crypto.getRandomValues(new Uint8Array(16)), byte => byte.toString(16).padStart(2, "0")).join("");
}
export async function communityApi<T>(path: string, options: { method?: string; body?: unknown; signal?: AbortSignal } = {}): Promise<T> {
  const response = await fetch(`${API_BASE_URL}/community/threads${path}`, { credentials: "include", signal: options.signal,
    method: options.method ?? "GET", ...(options.body !== undefined ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(options.body) } : {}) });
  if (!response.ok) throw Object.assign(new Error("COMMUNITY_REQUEST_FAILED"), { status: response.status });
  return response.json() as Promise<T>;
}
export function mergeMessages(current: Message[], next: Message[]) {
  return [...new Map([...current, ...next].map(message => [message.id, message])).values()].sort((a, b) => a.sequence - b.sequence);
}
