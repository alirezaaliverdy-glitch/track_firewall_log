import { useState } from "react";
import type { AiMessage } from "@/lib/ai";
import { formatDateTime } from "../assistantUiHelpers";

export function ChatMessageBubble({ message }: { message: AiMessage }) {
  const [expanded, setExpanded] = useState(false);
  const long = message.content.length > 360;
  const content = long && !expanded ? `${message.content.slice(0, 360)}...` : message.content;
  return (
    <div
      className={`rounded-lg border px-3 py-2 text-left ${
        message.role === "user"
          ? "ml-auto max-w-[82%] border-blue-800/70 bg-blue-950/30"
          : "mr-auto max-w-[88%] border-zinc-800 bg-zinc-900/70"
      }`}
    >
      <div className="mb-1 flex items-center justify-between gap-2">
        <span className="text-[10px] font-medium uppercase text-zinc-500">{message.role}</span>
        <span className="text-[10px] text-zinc-600">{formatDateTime(message.createdAt)}</span>
      </div>
      <p className="whitespace-pre-wrap text-xs leading-5 text-zinc-200">{content}</p>
      {long && (
        <button type="button" onClick={() => setExpanded((value) => !value)} className="mt-1 text-xs text-blue-300">
          {expanded ? "Show less" : "Show more"}
        </button>
      )}
    </div>
  );
}
