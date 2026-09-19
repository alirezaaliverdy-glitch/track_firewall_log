import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { getProductNavigation, PRODUCT_FEATURES, validateProductState } from "../src/product-state/product-state.registry.js";

const root = join(process.cwd(), "..");
const read = (path: string) => readFileSync(join(root, path), "utf8");

test("email alerts are a dedicated implemented security navigation item", () => {
  assert.equal(validateProductState(), true);
  const feature = PRODUCT_FEATURES.find((item) => item.key === "security.email_alerts");
  assert.ok(feature);
  assert.equal(feature.route, "/security/email-alerts");
  assert.equal(feature.navigationVisible, true);
  const security = getProductNavigation().find((group) => group.key === "security");
  assert.ok(security?.items.some((item) => item.route === "/security/email-alerts"));
  assert.match(read("src/routes/appRoutes.tsx"), /path: "\/security\/email-alerts"[\s\S]*component: EmailAlertsPage/);
});

test("detection rules no longer render Gmail registration or alert settings", () => {
  const rules = read("src/features/security/pages/DetectionRulesPage.tsx");
  assert.doesNotMatch(rules, /gmail-connection|security-alert-email|App Password|connectGmailSecuritySender/);
  assert.match(rules, /security-rule-library/);
});

test("collapsed desktop sidebar changes the shell column and hides labels", () => {
  const shell = read("src/components/layout/AppShell.tsx");
  const css = read("src/App.css");
  assert.match(shell, /platform-shell \$\{collapsed \? "is-sidebar-collapsed"/);
  assert.match(shell, /getMobilePreference\("sidebarCollapsed"\)/);
  assert.match(css, /\.platform-shell\.is-sidebar-collapsed\s*\{\s*grid-template-columns:\s*76px minmax\(0, 1fr\)/);
  assert.match(css, /\.platform-sidebar\.is-collapsed \.platform-nav-group__label span\s*\{\s*display:\s*none/);
});

test("connected email page shows a compact identity instead of a disabled password form", () => {
  const page = read("src/features/security/pages/EmailAlertsPage.tsx");
  assert.match(page, /gmail-connection__connected/);
  assert.match(page, /email-alerts-summary/);
  assert.match(page, /email\?\.sender\.connected \? <div className="gmail-connection__connected"/);
  assert.match(page, /تست هر ۵ وندور/);
  assert.match(page, /recipientEmails: recipients/);
  assert.match(page, /افزودن ایمیل جدید/);
  assert.match(page, /delivery\.recipientEmail/);
  assert.match(page, /دلیل ارسال/);
  assert.match(page, /delivery\.reason\.titleFa/);
});
