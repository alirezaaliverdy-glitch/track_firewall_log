import type { SecurityFinding } from "@/lib/platform";

type Guidance = { problem: string; steps: string[]; verification: string };
type Copy = { fa: Guidance; en: Guidance };

const guidance: Record<string, Copy> = {
  authentication: {
    fa: {
      problem: "چند تلاش ناموفق ورود ثبت شده است؛ این شواهد به‌تنهایی نفوذ موفق را ثابت نمی‌کنند.",
      steps: [
        "زمان، حساب و نشانی مبدأ را در شواهد همین یافته با دسترسی‌های مجاز مقایسه کنید.",
        "اگر تلاش‌ها غیرمجازند، اعتبارنامهٔ درگیر را امن کنید و محدودیت دسترسی به سرویس مدیریت را از مسیر تغییر تأییدشده اعمال کنید."
      ],
      verification: "لاگ‌های تازه را برای تکرار تلاش‌ها و ورود موفق همان مبدأ بررسی کنید؛ فقط سکوت لاگ را رفع قطعی مشکل ندانید."
    },
    en: {
      problem: "Repeated failed logins were recorded; this does not by itself prove a successful compromise.",
      steps: ["Compare the event times, account and source address with authorized access.", "If unauthorized, secure the affected credential and restrict management access through a reviewed change."],
      verification: "Check fresh logs for repeated attempts and successful logins from the same source; silence alone is not proof of remediation."
    }
  },
  account: {
    fa: {
      problem: "فعالیت حساس به یک حساب نسبت داده شده، اما مجاز بودن آن هنوز مشخص نیست.",
      steps: ["نام حساب، زمان، دستور یا تغییر و مجوز ثبت‌شده را با شواهد تطبیق دهید.", "اگر غیرمجاز بود، نشست و دسترسی حساب را طبق فرایند تأییدشده محدود کنید و تغییر را پس از بررسی اثر آن برگردانید."],
      verification: "وضعیت فعلی حساب و مجوزها را دوباره از تجهیز بخوانید و فعالیت تازهٔ همان حساب را بررسی کنید."
    },
    en: {
      problem: "Sensitive activity is attributed to an account, but authorization is not established.",
      steps: ["Match the account, time, command or change against the approved change record and evidence.", "If unauthorized, restrict the account through the reviewed process and revert the change only after impact review."],
      verification: "Read back the current account and permissions, then check for new activity by the same account."
    }
  },
  configuration: {
    fa: {
      problem: "تغییر پیکربندی ثبت شده است؛ خطرناک یا غیرمجاز بودن آن باید با وضعیت واقعی سنجیده شود.",
      steps: ["عامل و زمان تغییر را با برنامهٔ تغییرات و آخرین نسخهٔ پشتیبان مقایسه کنید.", "در صورت غیرمجاز بودن، اختلاف دقیق را بازبینی کنید و بازگردانی را فقط با پیش‌نمایش و تأیید اجرا کنید."],
      verification: "پیکربندی فعلی را دوباره جمع‌آوری کنید و مطمئن شوید مقدار مورد انتظار و اتصال سرویس‌ها برقرار است."
    },
    en: {
      problem: "A configuration change was recorded; its safety and authorization need confirmation.",
      steps: ["Compare the actor and time with the change record and latest backup.", "If unauthorized, review the exact difference and restore it only through preview and confirmation."],
      verification: "Collect the current configuration again and verify the expected setting and service connectivity."
    }
  },
  defense: {
    fa: {
      problem: "شواهد نشان می‌دهند یکی از کنترل‌های دفاعی تغییر کرده یا غیرفعال شده است.",
      steps: ["در صفحهٔ شواهد مشخص کنید کدام سرویس یا قانون دفاعی و توسط چه حسابی تغییر کرده است.", "وضعیت فعلی کنترل را از تجهیز بخوانید؛ اگر هنوز غیرفعال است، بازگردانی را با بررسی اثر و تأیید انجام دهید."],
      verification: "پس از اقدام، وضعیت کنترل و لاگ‌های تازه را دوباره بررسی کنید؛ صرف بسته‌شدن هشدار کافی نیست."
    },
    en: {
      problem: "Evidence indicates a defensive control was changed or disabled.",
      steps: ["Identify the exact service or rule and actor in the evidence.", "Read its current device state; if still disabled, restore it only after impact review and confirmation."],
      verification: "Read back the control state and fresh logs after the change; closing the alert alone is insufficient."
    }
  },
  exposure: {
    fa: {
      problem: "دسترسی مدیریتی یا یک سرویس حساس ممکن است بیش از حد در دسترس باشد.",
      steps: ["آدرس، پورت، سرویس و مبدأهای مجاز را در شواهد و تنظیمات فعلی بررسی کنید.", "دسترسی را به مسیرهای مدیریتی مجاز محدود کنید؛ پیش از تغییر، دسترسی جایگزین خود را تأیید کنید تا اتصال قطع نشود."],
      verification: "از مسیر مجاز اتصال را دوباره آزمایش کنید و از مسیر غیرمجاز، بسته بودن دسترسی را تأیید کنید."
    },
    en: {
      problem: "Management access or a sensitive service may be more exposed than intended.",
      steps: ["Review the address, port, service and authorized sources against current settings.", "Restrict access to approved management paths, confirming alternate access before changing policy."],
      verification: "Retest from an approved path and verify that an unapproved path is blocked."
    }
  },
  generic: {
    fa: {
      problem: "یک نشانه در داده‌های ثبت‌شده دیده شده، اما علت ریشه‌ای از همین یافته به‌تنهایی ثابت نمی‌شود.",
      steps: ["شواهد خام، زمان و تجهیز مرتبط را بررسی و با وضعیت فعلی مقایسه کنید.", "فقط پس از مشخص شدن علت، یک تغییر مشخص را از مسیر برنامهٔ اقدام دارای پیش‌نمایش اجرا کنید."],
      verification: "دادهٔ تازه از همان منبع بگیرید و نتیجهٔ اقدام را با آن بسنجید؛ در نبود پوشش کافی وضعیت را نامشخص نگه دارید."
    },
    en: {
      problem: "A signal was observed, but this finding alone does not establish root cause.",
      steps: ["Review raw evidence, time and device, then compare with current state.", "After identifying the cause, use a specific reviewed action plan with preview."],
      verification: "Collect fresh evidence from the same source and compare the result; keep status unknown when coverage is insufficient."
    }
  }
};

export function findingRemediation(finding: Pick<SecurityFinding, "category" | "title" | "source">, language: string): Guidance {
  const text = `${finding.category} ${finding.title}`.toLowerCase();
  const key = /account-|privileg|sudo|administrator|identity-change/.test(text) ? "account"
    : /firewall.disabled|audit.tamper|defense-evasion|log-integrity/.test(text) ? "defense"
      : /management.exposure|management-plane|sensitive.port|ssh.public|exposure/.test(text) ? "exposure"
        : /configuration.change|configuration-change|policy.changed|nat.change/.test(text) ? "configuration"
          : /authentication|login.failure|auth.failure|brute.force|vpn.failure/.test(text) ? "authentication"
            : "generic";
  return guidance[key][language.startsWith("fa") ? "fa" : "en"];
}
