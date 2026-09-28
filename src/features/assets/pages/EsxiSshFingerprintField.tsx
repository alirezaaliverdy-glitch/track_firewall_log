import { useRef, useState } from "react";
import { Check, Copy, HelpCircle } from "lucide-react";
import { copyToClipboard } from "@/lib/findingUtils";

export const ESXI_FINGERPRINT_COMMAND = "/usr/lib/vmware/openssh/bin/ssh-keygen -l -f /etc/ssh/ssh_host_rsa_key.pub -E sha256";

type Props = { value: string; onChange: (value: string) => void; isFa: boolean; requiredLabel: string };

export function EsxiSshFingerprintField({ value, onChange, isFa, requiredLabel }: Props) {
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">("idle");
  const command = useRef<HTMLElement>(null);
  async function copyCommand() {
    const copied = await copyToClipboard(ESXI_FINGERPRINT_COMMAND);
    setCopyState(copied ? "copied" : "failed");
    if (!copied && command.current) {
      const selection = window.getSelection();
      const range = document.createRange();
      range.selectNodeContents(command.current);
      selection?.removeAllRanges();
      selection?.addRange(range);
    }
  }

  return <div className="onboarding-field--wide esxi-ssh-fingerprint" data-testid="esxi-ssh-fingerprint">
    <label className="onboarding-field" htmlFor="esxi-ssh-fingerprint-input">
      <span>{isFa ? "اثر انگشت کلید SSH هاست" : "SSH host key fingerprint"}<b>{requiredLabel}</b></span>
      <input id="esxi-ssh-fingerprint-input" dir="ltr" value={value} onChange={event => onChange(event.target.value.trim())} placeholder="SHA256:…" autoComplete="off" spellCheck={false} required aria-describedby="esxi-ssh-fingerprint-help" />
    </label>
    <p id="esxi-ssh-fingerprint-help" className="esxi-ssh-fingerprint__hint">{isFa ? "فقط مقدار SHA256:… را وارد کنید. این شناسهٔ کلید سرور است، نه رمز عبور؛ برنامه با آن هویت هاست را بررسی می‌کند." : "Enter only SHA256:…. This identifies the server key, not your password; the application uses it to verify the host."}</p>
    <details className="esxi-ssh-fingerprint__guide" data-testid="esxi-fingerprint-guide">
      <summary><HelpCircle size={18} aria-hidden="true" />{isFa ? "چطور اثر انگشت را بگیرم؟" : "How do I get the fingerprint?"}</summary>
      <div className="esxi-ssh-fingerprint__body">
        <ol>
          <li>{isFa ? <>اگر SSH خاموش است، در پنل ESXi مسیر <bdi dir="ltr">Manage → Services → TSM-SSH → Start</bdi> را باز کنید.</> : <>If SSH is disabled, open <bdi dir="ltr">Manage → Services → TSM-SSH → Start</bdi> in the ESXi Host Client.</>}</li>
          <li>{isFa ? "در کنسول مستقیم هاست یا یک نشست SSH با هویت تأییدشده (MobaXterm / PuTTY) وارد شوید و دستور زیر را داخل ESXi اجرا کنید، نه در PowerShell ویندوز." : "Use the direct host console or an identity-verified SSH session (MobaXterm / PuTTY). Run this command inside ESXi, not in Windows PowerShell."}</li>
          <li>{isFa ? "از خروجی فقط قسمت مشخص‌شده را کپی و در فیلد بالا وارد کنید. عدد اول، نام هاست و (RSA) لازم نیست." : "Copy only the highlighted part of the output into the field above. Omit the leading number, hostname and (RSA)."}</li>
        </ol>
        <div className="esxi-ssh-fingerprint__command">
          <div><span>{isFa ? "دستور دریافت اثر انگشت" : "Fingerprint command"}</span><button type="button" onClick={() => void copyCommand()} data-testid="esxi-copy-fingerprint-command">{copyState === "copied" ? <Check size={16} aria-hidden="true" /> : <Copy size={16} aria-hidden="true" />}{isFa ? "کپی دستور" : "Copy command"}</button></div>
          <code ref={command} dir="ltr">{ESXI_FINGERPRINT_COMMAND}</code>
          <p className="esxi-ssh-fingerprint__copy-status" role="status">{copyState === "copied" ? (isFa ? "دستور کپی شد." : "Command copied.") : copyState === "failed" ? (isFa ? "کپی خودکار ممکن نشد؛ متن دستور انتخاب شد. آن را دستی کپی کنید." : "Automatic copying is unavailable; the command is selected. Copy it manually.") : (isFa ? "این دستور فقط کلید موجود را می‌خواند؛ تغییری در هاست ایجاد نمی‌کند." : "This only reads the existing key; it makes no changes to the host.")}</p>
        </div>
        <div className="esxi-ssh-fingerprint__example"><span>{isFa ? "نمونهٔ خروجی — مقدار واقعی هاست خودتان را وارد کنید" : "Example output — use your own host's actual value"}</span><code dir="ltr"><span>3072 </span><mark>SHA256:…</mark><span> root@esxi (RSA)</span></code></div>
        <p className="esxi-ssh-fingerprint__note">{isFa ? "اگر دسترسی ندارید، این مقدار را از مدیر هاست بگیرید. بخش Certificates پنل مربوط به HTTPS است، نه SSH. با تغییر کلید، اتصال متوقف می‌شود تا هویت جدید بررسی شود." : "If you cannot access the console, ask the host administrator. The Host Client Certificates section is for HTTPS, not SSH. A changed key blocks the connection until the new identity is verified."}</p>
      </div>
    </details>
  </div>;
}
