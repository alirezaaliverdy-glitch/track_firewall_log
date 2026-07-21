export type AssistantIntentMode = "conversation" | "device_question" | "action_request";

export type AssistantIntentClassification = {
  mode: AssistantIntentMode;
  confidence: number;
  requiresClarification: boolean;
  reason: string;
};

const PERSIAN_DIGITS: Record<string, string> = {
  "۰": "0", "۱": "1", "۲": "2", "۳": "3", "۴": "4", "۵": "5", "۶": "6", "۷": "7", "۸": "8", "۹": "9",
  "٠": "0", "١": "1", "٢": "2", "٣": "3", "٤": "4", "٥": "5", "٦": "6", "٧": "7", "٨": "8", "٩": "9",
};

const CHAT_PHRASES = [
  "hello", "hi", "hey", "thanks", "thank you", "what do you think", "explain", "why", "how does this work",
  "how do i", "how should", "is this safe", "is it safe", "compare", "difference between", "tell me about",
  "سلام", "ممنون", "نظرت", "توضیح", "چرا", "چطور کار", "چگونه", "آیا امن", "مقایسه",
];

const DEVICE_QUESTION_TERMS = [
  "status", "configuration", "config", "health", "memory", "cpu", "interface", "interfaces", "risk", "risks",
  "recommendation", "recommendations", "routing", "routes", "license", "users", "logs", "ports", "services",
  "وضعیت", "کانفیگ", "پیکربندی", "سلامت", "حافظه", "مموری", "پردازنده", "اینترفیس", "رابط", "ریسک",
  "خطر", "پیشنهاد", "مسیر", "لایسنس", "کاربر", "لاگ", "پورت", "سرویس",
];

const READ_QUESTION_MARKERS = [
  "what", "which", "why", "how", "show me", "tell me", "explain", "review", "check", "list", "status", "is",
  "are", "does", "do we", "can you see", "what about",
  "چی", "چه", "کدام", "کدوم", "چرا", "چطور", "نشان", "نشون", "بگو", "توضیح", "بررسی", "چک", "آیا",
];

const ACTION_VERBS = [
  "create", "build", "setup", "change", "delete", "restart", "configure", "config", "apply", "block", "enable", "disable",
  "update", "set", "add", "remove", "start", "stop", "reload", "assign", "open", "close", "allow", "deny", "execute", "run",
  "ایجاد", "بساز", "ساخت", "تغییر", "عوض", "حذف", "پاک", "ریستارت", "تنظیم", "کانفیگ", "اعمال",
  "بلاک", "مسدود", "فعال", "غیرفعال", "آپدیت", "اضافه", "بردار", "باز کن", "ببند", "اجازه", "deny",
];

const INSTRUCTION_MARKERS = [
  "please", "can you", "could you", "do it", "go ahead", "now", "for me", "روی", "لطفا", "لطفاً", "کن", "بده", "بساز", "اجرا",
];

const ADVICE_MARKERS = [
  "should i", "should we", "can i", "could i", "would it", "what if", "is it ok", "is it safe", "how to", "how do i",
  "بهتره", "آیا بهتر", "می تونم", "می‌توانم", "میشه", "امن است", "امن هست",
];

const OPERATION_OBJECT_TERMS = [
  "ip", "port", "vlan", "user", "interface", "policy", "rule", "route", "service", "nginx", "ssh", "winbox",
  "address", "object", "vip", "nat", "vpn", "firewall", "source", "destination", "server", "device", "host",
  "آی پی", "ای پی", "پورت", "کاربر", "اینترفیس", "رابط", "سیاست", "رول", "قانون", "مسیر", "سرویس",
  "آبجکت", "فایروال", "منبع", "مقصد",
];

function normalize(value: string) {
  return value
    .replace(/[۰-۹٠-٩]/g, (digit) => PERSIAN_DIGITS[digit] ?? digit)
    .replace(/[ي]/g, "ی")
    .replace(/[ك]/g, "ک")
    .replace(/[\u200c‌]/g, " ")
    .replace(/[?؟,،;؛:.!()[\]{}"']/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function hasAny(text: string, terms: string[]) {
  return terms.some((term) => {
    const normalized = normalize(term);
    if (normalized.length <= 3 && /^[a-z0-9]+$/.test(normalized)) {
      return new RegExp(`\\b${normalized}\\b`).test(text);
    }
    return text.includes(normalized);
  });
}

function hasActionVerb(text: string) {
  return hasAny(text, ACTION_VERBS);
}

function withoutVendorPrefix(text: string) {
  return text.replace(/^(mikrotik|routeros|fortigate|fortinet|linux|cisco|ios|iosxe)\s+/, "");
}

function hasInstructionShape(text: string) {
  if (hasAny(text, ["create", "build", "setup", "configure"])) return true;
  if (hasAny(text, INSTRUCTION_MARKERS)) return true;
  const commandText = withoutVendorPrefix(text);
  return ACTION_VERBS.some((verb) => {
    const token = normalize(verb);
    return text.startsWith(`${token} `) || text === token || commandText.startsWith(`${token} `) || commandText === token;
  });
}

function isAdviceAboutAction(text: string) {
  return hasAny(text, ADVICE_MARKERS) && hasActionVerb(text);
}

function isChatPhrase(text: string) {
  return hasAny(text, CHAT_PHRASES);
}

function isDeviceQuestion(text: string, hasSelectedDevice: boolean) {
  return hasSelectedDevice && hasAny(text, DEVICE_QUESTION_TERMS) && hasAny(text, READ_QUESTION_MARKERS) && !hasInstructionShape(text);
}

function isAmbiguousAction(text: string) {
  return hasActionVerb(text) && !hasOperationObject(text);
}

function hasOperationObject(text: string) {
  if (/\b\d{1,3}(?:\.\d{1,3}){3}\b/.test(text)) return true;
  if (/\b\d+\b/.test(text)) return true;
  if (hasAny(text, OPERATION_OBJECT_TERMS)) return true;
  return false;
}

export function classifyAssistantIntent(input: { message: string; hasSelectedDevice?: boolean }): AssistantIntentClassification {
  const text = normalize(input.message);
  const hasSelectedDevice = input.hasSelectedDevice === true;
  if (!text) return { mode: "conversation", confidence: 1, requiresClarification: true, reason: "empty_message" };

  if (isAdviceAboutAction(text)) {
    return { mode: "conversation", confidence: 0.9, requiresClarification: false, reason: "advice_or_safety_question" };
  }

  if (isChatPhrase(text) && !hasInstructionShape(text)) {
    return { mode: "conversation", confidence: 0.88, requiresClarification: false, reason: "chat_phrase" };
  }

  if (isDeviceQuestion(text, hasSelectedDevice)) {
    return { mode: "device_question", confidence: 0.86, requiresClarification: false, reason: "read_only_selected_device_question" };
  }

  if (isAmbiguousAction(text)) {
    return { mode: "conversation", confidence: 0.45, requiresClarification: true, reason: "ambiguous_operation_text" };
  }

  if (hasActionVerb(text) && hasInstructionShape(text) && hasOperationObject(text) && !isAdviceAboutAction(text)) {
    return { mode: "action_request", confidence: 0.84, requiresClarification: false, reason: "explicit_operation_instruction" };
  }

  return { mode: "conversation", confidence: hasSelectedDevice ? 0.78 : 0.82, requiresClarification: false, reason: "default_conversation" };
}
