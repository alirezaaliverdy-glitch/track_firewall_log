import { useState } from "react";
import type { AiMessage } from "@/lib/ai";
import { formatDateTime } from "../assistantUiHelpers";
import "./AssistantMessageList.css";

export function ChatMessageBubble({ message, isFa = false }: { message: AiMessage; isFa?: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const long = message.content.length > 360;
  const content = long && !expanded ? `${message.content.slice(0, 360)}...` : message.content;
  const isUser = message.role === "user";
  const sender = isUser ? (isFa ? "شما" : "You") : (isFa ? "دستیار" : "Assistant");
  const sentAt = formatDateTime(message.createdAt);

  return (
    <article
      className={`assistant-chat-message assistant-chat-message--${isUser ? "user" : "assistant"}`}
      dir={isFa ? "rtl" : "ltr"}
      aria-label={`${sender} · ${sentAt}`}
      title={`${sender} · ${sentAt}`}
    >
      <span className="sr-only">{sender}</span>
      <div className="assistant-chat-message__bubble">
        <p>{content}</p>
        {long && (
          <button type="button" onClick={() => setExpanded((value) => !value)} className="assistant-chat-message__expand">
            {expanded ? (isFa ? "نمایش کمتر" : "Show less") : (isFa ? "نمایش کامل" : "Show more")}
          </button>
        )}
      </div>
    </article>
  );
}
