import { createHash } from "node:crypto";
import type { Prisma } from "@prisma/client";
import type { PublicUser } from "./auth.service.js";

export const FILE_LIMIT = 50 * 1024 * 1024;
export const WORKSPACE_FILE_LIMIT = 512 * 1024 * 1024;
export const GLOBAL_FILE_LIMIT = 1536 * 1024 * 1024;
export const DAILY_FILE_LIMIT = 200 * 1024 * 1024;
export const author = { select: { id: true, displayName: true } } as const;
export const fileMetadata = { id: true, fileName: true, mimeType: true, size: true } as const;
export const messageInclude = { author, attachments: { select: fileMetadata }, replyTo: {
  select: { id: true, sequence: true, author, body: true, deletedAt: true }
} } as const;
export type RichMessage = Prisma.CommunityMessageGetPayload<{ include: typeof messageInclude }>;
export function safeMessage({ clientKey: _key, requestHash: _hash, ...message }: RichMessage) {
  return { ...message, body: message.deletedAt ? "" : message.body,
    attachments: message.deletedAt ? [] : message.attachments,
    replyTo: message.replyTo ? { ...message.replyTo, body: message.replyTo.deletedAt ? "" : message.replyTo.body.slice(0, 240) } : null };
}
export const workspaceId = (user: PublicUser) => user.scopeOwnerId ?? user.id;
export function memberScope(user: PublicUser): Prisma.AppUserWhereInput {
  return { isActive: true, OR: [{ id: workspaceId(user) }, { workspaceOwnerId: workspaceId(user), role: { not: "admin" } }] };
}
export const communityError = (code: string, statusCode = 400) => Object.assign(new Error(code), { statusCode });
// Never return/log database messages: they may contain serialized attachment bytes.
export function communityUploadFailure(error:unknown){
  const e=(error??{}) as {code?:string;message?:string;statusCode?:number};
  if(["FST_REQ_FILE_TOO_LARGE","FST_FILES_LIMIT","FST_FIELDS_LIMIT","FST_PARTS_LIMIT","FST_ERR_CTP_BODY_TOO_LARGE"].includes(e.code??""))return {status:413,code:"COMMUNITY_FILE_SIZE"};
  if(e.code?.startsWith("FST_")||["ERR_STREAM_PREMATURE_CLOSE","ECONNRESET"].includes(e.code??""))return {status:400,code:"COMMUNITY_UPLOAD_INCOMPLETE"};
  if(e.statusCode&&e.statusCode>=400&&e.statusCode<500&&/^(COMMUNITY_[A-Z_]+|not_found|forbidden)$/.test(e.message??""))return {status:e.statusCode,code:e.message!};
  if(["P1001","P1002","P1017","P2021","P2022","P2028"].includes(e.code??""))return {status:503,code:"COMMUNITY_STORAGE_UNAVAILABLE"};
  return {status:500,code:"COMMUNITY_FILE_STORE_FAILED"};
}
export type ValidatedFile = { fileName: string; mimeType: string; size: number; checksum: string; content: Buffer };

// Arbitrary formats are opaque, untrusted bytes: never execute, extract, render,
// or pass uploads to a document/media parser. All downloads force octet-stream.
// Recognition is metadata only, NOT proof of safety or an antivirus guarantee.
export function validateCommunityFile(fileName: string, content: Buffer): ValidatedFile {
  const name = fileName.normalize("NFC");
  if (name.length > 100 || !/^[\p{L}\p{N} _().-]+$/u.test(name) || name.startsWith(".") || name.includes("..") || name.trim() !== name)
    throw communityError("COMMUNITY_FILE_NAME", 415);
  if (!content.length || content.length > FILE_LIMIT) throw communityError("COMMUNITY_FILE_SIZE", 413);
  const ext = name.split(".").at(-1)?.toLowerCase();
  let mimeType = "application/octet-stream";
  if (ext === "png" && content.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) mimeType = "image/png";
  if ((ext === "jpg" || ext === "jpeg") && content[0] === 255 && content[1] === 216 && content[2] === 255) mimeType = "image/jpeg";
  if (ext === "webp" && content.subarray(0, 4).toString() === "RIFF" && content.subarray(8, 12).toString() === "WEBP") mimeType = "image/webp";
  if (ext === "pdf" && content.subarray(0, 5).toString() === "%PDF-" && content.subarray(-1024).includes(Buffer.from("%%EOF"))) mimeType = "application/pdf";
  if (["txt", "log", "csv"].includes(ext ?? "")) {
    try {
      const text = new TextDecoder("utf-8", { fatal: true }).decode(content);
      if (/[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(text)) throw new Error();
      mimeType = "text/plain";
    } catch { /* Binary/unknown data remains an opaque download, not plain text. */ }
  }
  return { fileName: name, mimeType, size: content.length, content, checksum: createHash("sha256").update(content).digest("hex") };
}
export function messageHash(body: string, replyToId: string | undefined, files: ValidatedFile[]) {
  return createHash("sha256").update(JSON.stringify([body, replyToId ?? null, files.map(f => [f.fileName, f.checksum])])).digest("hex");
}
export async function nextChange(tx: Prisma.TransactionClient) {
  const rows = await tx.$queryRaw<{ value: number }[]>`SELECT nextval('"CommunityMessage_changeSequence_seq"')::int AS value`;
  return rows[0].value;
}
