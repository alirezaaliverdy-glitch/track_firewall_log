import { writeFile } from "node:fs/promises";
import puppeteer from "puppeteer-core";

const browser = await puppeteer.launch({
  executablePath: process.env.CHROMIUM_PATH ?? "/usr/bin/chromium-browser",
  headless: true,
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});

const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 1100, deviceScaleFactor: 1 });
await page.setRequestInterception(true);

const consoleErrors = [];
const pageErrors = [];
const apiRequests = [];
const actionCenterItem = {
  id: "demo",
  source: "ai",
  requestedBy: "qa-admin",
  deviceId: "linux-114",
  actionType: "custom_vendor_action",
  status: "dry_run_ready",
  lifecycleState: "ready_for_confirmation",
  riskLevel: "medium",
  createdAt: "2026-10-10T09:00:00.000Z",
  updatedAt: "2026-10-10T09:00:00.000Z",
  device: { id: "linux-114", name: "linux-114", host: "192.0.2.114", vendor: "Linux", type: "linux_edge", protocol: "ssh", credentialConfigured: true },
  support: { state: "verified", execution: "connector", executable: true, reason: null },
  controls: { canReview: true, canEditParameters: true, canPreview: false, canConfirm: true, canExecute: true, canRetry: false, canCancel: true, canViewEvidence: true, canViewConnectorResult: false, relatedDevicePath: "/assets/devices/linux-114" },
  parametersJson: { metadata: { executionTemplateRef: "linux.custom-command.v1", connectorType: "ssh" } },
  validationJson: { valid: true },
  commandPreview: { plannedCommands: ["systemctl is-active nginx"] },
  approval: {},
  connectorResult: {},
  rollback: {},
  evidence: { connectorInvoked: false, integrityError: null, approvals: [] },
  audit: [],
};
page.on("console", (message) => {
  if (message.type() === "error") consoleErrors.push(message.text());
});
page.on("pageerror", (error) => pageErrors.push(error.stack ?? error.message));

page.on("request", (request) => {
  const url = request.url();
  if (!url.includes("/firewall-api/")) {
    void request.continue();
    return;
  }
  apiRequests.push(url);
  const json = (body) => request.respond({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
  if (url.includes("/auth/session-status")) {
    void json({ ok: true, authenticated: true, user: { id: "qa-admin", username: "qa", displayName: "مدیر عملیات", role: "admin", allowedSections: ["dashboard", "assets", "security", "monitoring", "actions", "assistant", "attackers"] } });
    return;
  }
  if (url.includes("/auth/csrf")) {
    void json({ ok: true, csrfToken: "qa-csrf-token" });
    return;
  }
  if (url.includes("/action-center/demo")) {
    void json(actionCenterItem);
    return;
  }
  if (url.includes("/action-center?")) {
    void json({ items: [actionCenterItem], total: 1, offset: 0, limit: 10, summary: { ready_for_confirmation: 1 }, generatedAt: "2026-10-10T09:00:00.000Z" });
    return;
  }
  if (url.includes("/commands/catalog/search")) {
    void json({ items: [], total: 0 });
    return;
  }
  if (url.includes("/devices/linux-114/verification")) {
    void json({ deviceId: "linux-114", status: "verified", verified: true, connected: true, history: [], checkedAt: "2026-10-10T09:00:00.000Z" });
    return;
  }
  if (url.endsWith("/devices")) {
    void json({ devices: [actionCenterItem.device] });
    return;
  }
  if (url.endsWith("/credentials")) {
    void json({ credentials: [] });
    return;
  }
  if (url.includes("/actions/demo/script-editor/preview") && request.method() === "POST") {
    void json({
      actionPlan: {
        id: "edited-preview",
        source: "user",
        requestedBy: "qa-admin",
        deviceId: "linux-114",
        aiIntentId: null,
        actionType: "custom_vendor_action",
        status: "dry_run_ready",
        riskLevel: "medium",
        parametersJson: {},
        validationJson: { valid: true },
        dryRunJson: { commandSpecs: [{ command: "sudo -n systemctl restart nginx", write: true }] },
        approvalJson: {},
        resultJson: {},
        rollbackJson: {},
        createdAt: "2026-10-10T09:00:00.000Z",
        updatedAt: "2026-10-10T09:00:00.000Z",
      },
      validation: { valid: true, warnings: [], normalizedLines: 2, verificationLines: 2, rawExecution: false },
    });
    return;
  }
  if (url.includes("/actions/demo/script-editor")) {
    void json({
      sourceActionPlanId: "demo",
      sourceRevision: 3,
      actionType: "linux_check_service_status",
      riskLevel: "medium",
      vendor: "linux",
      device: { id: "linux-114", name: "linux-114", host: "185.89.223.114", vendor: "Linux", type: "linux_edge" },
      script: "sudo -n systemctl restart nginx\nsudo -n systemctl enable nginx",
      verificationScript: "systemctl is-active nginx\nsystemctl is-enabled nginx",
      limits: { maxExecutionLines: 12, maxLineLength: 320 },
      safety: { rawExecution: false, requiresPreview: true, requiresConfirmation: true, messageFa: "متن آزاد است، اما فقط خطوط معتبرِ وندور پس از پیش‌نمایش، تأیید شما، PolicyGuard و Connector اجرا می‌شوند." },
    });
    return;
  }
  if (url.includes("/product-state/navigation")) {
    void json({ contractVersion: "qa", navigation: [] });
    return;
  }
  void json({});
});

try {
  await page.goto("http://host.docker.internal/firewall/actions/demo", { waitUntil: "domcontentloaded", timeout: 30_000 });
  await page.waitForSelector(".script-editor-launch", { visible: true, timeout: 30_000 });
  const actionLink = await page.$eval(".script-editor-launch", (element) => ({
    text: element.textContent?.trim() ?? null,
    href: element instanceof HTMLAnchorElement ? element.getAttribute("href") : null,
    target: element instanceof HTMLAnchorElement ? element.target : null,
  }));

  await page.goto("http://host.docker.internal/firewall/actions/demo/script-editor", { waitUntil: "domcontentloaded", timeout: 30_000 });
  await page.waitForSelector(".script-editor-page", { timeout: 30_000 });
  await new Promise((resolve) => setTimeout(resolve, 2_000));
  await page.click('.script-editor-tabs button:nth-child(2)');
  await new Promise((resolve) => setTimeout(resolve, 250));
  await page.click(".script-editor-preview-button");
  await page.waitForFunction(() => {
    const button = document.querySelector(".script-editor-execute-button");
    return button instanceof HTMLButtonElement && !button.disabled;
  }, { timeout: 10_000 });
  await page.screenshot({ path: "/tmp/action-script-editor.png", fullPage: true });
  const interaction = await page.evaluate(() => {
    const tabs = [...document.querySelectorAll('[role="tab"]')];
    const textarea = document.querySelector(".script-editor-code textarea");
    const execute = document.querySelector(".script-editor-execute-button");
    return {
      tabs: tabs.length,
      activeTab: tabs.find((item) => item.getAttribute("aria-selected") === "true")?.textContent?.trim() ?? null,
      textareaVisible: textarea instanceof HTMLElement,
      textareaValue: textarea instanceof HTMLTextAreaElement ? textarea.value : null,
      executeDisabled: execute instanceof HTMLButtonElement ? execute.disabled : null,
    };
  });

  const documentState = await page.evaluate(() => ({ url: location.href, title: document.title, bodyText: document.body.innerText.slice(0, 500), bodyHtml: document.body.innerHTML.slice(0, 500), editorCount: document.querySelectorAll(".script-editor-page").length }));
  await writeFile("/tmp/action-script-editor-result.json", JSON.stringify({ ok: true, screenshot: "/tmp/action-script-editor.png", consoleErrors, pageErrors, apiRequests, actionLink, interaction, documentState }));
} catch (error) {
  const failureState = await page.evaluate(() => ({ bodyText: document.body.innerText.slice(0, 1200), bodyHtml: document.body.innerHTML.slice(0, 1200) })).catch(() => null);
  await writeFile("/tmp/action-script-editor-result.json", JSON.stringify({ ok: false, error: error instanceof Error ? error.message : String(error), consoleErrors, pageErrors, apiRequests, failureState }));
  process.exitCode = 1;
} finally {
  await browser.close();
}
