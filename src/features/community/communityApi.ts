import { API_BASE_URL } from "@/config/frontendEnv";
import { communityRequestError, retryableCommunityUpload } from "./communityErrors";
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
  const key=multipart?(options.body as FormData).get("clientKey"):null;
  const retrySafe=options.method?.toUpperCase()==="POST"&&path.endsWith("/messages/files")&&typeof key==="string"&&/^[a-zA-Z0-9_-]{1,100}$/.test(key);
  const online=()=>typeof navigator==="undefined"||navigator.onLine!==false;
  const send=()=>fetch(`${API_BASE_URL}/community${path}`,{credentials:"include",signal:options.signal,method:options.method??"GET",...(options.body!==undefined?multipart?{body:options.body as FormData}:{headers:{"Content-Type":"application/json"},body:JSON.stringify(options.body)}:{})});
  let response:Response|undefined;
  for(let attempt=0;attempt<2;attempt++){
    try{response=await send();}
    catch(error){if(options.signal?.aborted)throw error;if(attempt===0&&retryableCommunityUpload(0,retrySafe,online())){await new Promise(resolve=>setTimeout(resolve,750));continue;}throw Object.assign(new Error("COMMUNITY_NETWORK_FAILED"),{code:"COMMUNITY_NETWORK_FAILED"});}
    // Never queue offline or retry validation/permission/quota/storage failures.
    // A short-lived gateway/network retry reuses the exact FormData and clientKey.
    if(attempt===0&&retryableCommunityUpload(response.status,retrySafe,online())){await response.body?.cancel();await new Promise(resolve=>setTimeout(resolve,750));continue;}break;
  }
  if(!response)throw Object.assign(new Error("COMMUNITY_NETWORK_FAILED"),{code:"COMMUNITY_NETWORK_FAILED"});
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw communityRequestError(response.status,data,response.headers.get("X-Request-Id"));
  }
  try{return await response.json() as T;}catch{throw communityRequestError(response.status,{error:"COMMUNITY_INVALID_RESPONSE"},response.headers.get("X-Request-Id"));}
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
