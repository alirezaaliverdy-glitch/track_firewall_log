import { API_BASE_URL } from "@/config/frontendEnv";
export type Kind = "discussion" | "ticket";
export type ThreadStatus = "open" | "in_progress" | "resolved";
export type Person = { id: string; displayName: string };
export type Thread = { id: string; creatorId: string; creator: Person; kind: Kind; title: string; status: ThreadStatus;
  priority: "normal" | "urgent"; updatedAt: string; createdAt: string; preview?: string; unread?: boolean; messageCount?: number; prunedThroughSequence?: number };
export type Message = { id: string; sequence: number; authorId: string; author: Person; body: string; createdAt: string };
export type Attachment = { id: string; fileName: string; size: number; mimeType: string };
export type ChatMessage = Message & { changeSequence?: number; editedAt?: string | null; deletedAt?: string | null;
  replyToId?: string | null; replyTo?: { id: string; sequence?: number; body: string; author: Person; deletedAt?: string | null } | null; attachments?: Attachment[] };
export type Detail = { thread: Thread; messages: ChatMessage[]; hasMore: boolean; changeCursor?: number };
export type TaskStatus = "todo" | "in_progress" | "done";
export type Task = { id: string; title: string; description: string; status: TaskStatus; priority: "normal" | "urgent";
  assigneeId: string | null; assignee: Person | null; creatorId: string; creator: Person; dueAt: string | null; version: number;
  sourceMessage?: { id: string; threadId: string; deletedAt?: string | null } | null; updatedAt: string };
// LAN installs may use HTTP, where randomUUID is unavailable. getRandomValues
// still provides cryptographic request IDs without requiring a secure context.
export function messageKey() {
  return Array.from(crypto.getRandomValues(new Uint8Array(16)), byte => byte.toString(16).padStart(2, "0")).join("");
}
export async function collaborationApi<T>(path: string, options: { method?: string; body?: unknown; signal?: AbortSignal } = {}): Promise<T> {
  const multipart = options.body instanceof FormData;
  const response = await fetch(`${API_BASE_URL}/community${path}`, { credentials: "include", signal: options.signal,
    method: options.method ?? "GET", ...(options.body !== undefined ? multipart ? { body: options.body as FormData } : { headers: { "Content-Type": "application/json" }, body: JSON.stringify(options.body) } : {}) });
  if (!response.ok) {
    const data = await response.json().catch(() => ({})) as { error?: string };
    throw Object.assign(new Error("COMMUNITY_REQUEST_FAILED"), { status: response.status, code: data.error });
  }
  return response.json() as Promise<T>;
}
export function communityApi<T>(path: string, options: Parameters<typeof collaborationApi>[1] = {}): Promise<T> {
  return collaborationApi<T>(`/threads${path}`, options);
}
export function attachmentUrl(threadId: string, id: string) { return `${API_BASE_URL}/community/threads/${encodeURIComponent(threadId)}/attachments/${encodeURIComponent(id)}`; }
export function mergeMessages(current: ChatMessage[], next: ChatMessage[], prunedThrough = 0) {
  const items = new Map(current.map(message => [message.id, message]));
  for (const message of next) {
    const previous = items.get(message.id);
    if (!previous || (message.changeSequence ?? 0) >= (previous.changeSequence ?? 0)) items.set(message.id, message);
  }
  // A deletion/edit must also update any visible quote of the same message.
  return [...items.values()].filter(message => message.sequence > prunedThrough).map(message => {
    if (message.replyTo?.sequence && message.replyTo.sequence <= prunedThrough) return { ...message, replyTo: null, replyToId: null };
    const quoted = message.replyToId ? items.get(message.replyToId) : undefined;
    return quoted ? { ...message, replyTo: { id: quoted.id, body: quoted.deletedAt ? "" : quoted.body.slice(0, 240), author: quoted.author, deletedAt: quoted.deletedAt } } : message;
  }).sort((a, b) => a.sequence - b.sequence);
}
