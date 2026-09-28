// Deployed UI + real serialized blueprints; intercept ALL APIs: no real vendor or DB writes.
import assert from "node:assert/strict";
import puppeteer from "puppeteer-core";
import { getGuidedActionBlueprint } from "../dist/guided-actions/registry.js";
import { activeGuidedFields, maskGuidedSecrets, validateGuidedValues } from "../dist/guided-actions/validators.js";
const browser = await puppeteer.launch({ executablePath: "/usr/bin/chromium-browser", headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage"] });
const scenarios = [
  { vendor: "sophos", id: "sophos_ipsec_site_to_site", values: { vpnName: "Branch_IPsec", localHost: "LocalLAN", remoteHost: "RemoteLAN", wanInterface: "Port2", remoteGateway: "198.51.100.20", localId: "192.0.2.20", remoteId: "198.51.100.20", profileName: "StrongProfile", profileIkev2Confirmed: true, psk: "browser-test-only-long-psk", startupMode: "RespondOnly", enableAfterCreate: false } },
  { vendor: "fortigate", id: "fortigate_guided_vpn_setup", values: { vpnType: "ipsec_site_to_site", vpnName: "BranchVPN", localSubnet: "10.1.0.0/24", remoteSubnet: "10.2.0.0/24", wanInterface: "wan1", lanInterface: "lan1", remoteGateway: "198.51.100.20", authMethod: "psk", pskMode: "manual", psk: "browser-test-only-long-psk", proposal: "aes256-sha256", dhGroup: "14", ikeVersion: "2", createFirewallPolicy: true, createStaticRoute: true, natTraversal: true, natEnabled: false, logTraffic: true, enableAfterCreate: false } },
];
scenarios[1].id = "fortigate_ipsec_site_to_site";
try {
  for (const scenario of scenarios) for (const width of [1440, 390, 320]) {
    const page = await browser.newPage(); await page.setViewport({ width, height: 950 });
    const blueprint = getGuidedActionBlueprint(scenario.id);
    const device = { id: "ui-firewall", name: "Test firewall", vendor: scenario.vendor, type: scenario.vendor === "sophos" ? "generic_firewall" : "fortigate", host: "192.0.2.20", protocol: scenario.vendor === "sophos" ? "api" : "ssh", managementPort: scenario.vendor === "sophos" ? 4444 : 22, capabilities: { fortigateStatus: { fortigate: { interfaces: ["wan1", "lan1"] } } } };
    const sophos = { interfaces: [{ hardware: "Port2", zone: "WAN", ipAddresses: ["192.0.2.20"] }], ipHosts: [{ name: "LocalLAN", ipFamily: "IPv4", hostType: "Network", address: "10.1.0.0", netmask: "255.255.255.0" }, { name: "RemoteLAN", ipFamily: "IPv4", hostType: "Network", address: "10.2.0.0", netmask: "255.255.255.0" }], vpnProfiles: [{ name: "StrongProfile", phase1Encryption: ["AES256"], phase1Authentication: ["SHA256"], ikeVersion: "IKEv2" }] };
    let index = 0, answers = {}, unexpectedWrites = 0; const errors = [];
    const shape = () => ({ sessionId: "ui-vpn", deviceId: device.id, vendor: scenario.vendor, status: index >= blueprint.steps.length ? "ready_to_build" : "collecting_inputs", currentStep: blueprint.steps[index] ?? null, answers: maskGuidedSecrets(answers, blueprint.steps.flatMap(step => step.fields)), blueprint });
    page.on("pageerror", error => errors.push(error.message));
    await page.setRequestInterception(true);
    page.on("request", async request => {
      const path = new URL(request.url()).pathname;
      if (!path.includes("/api/") && !path.startsWith("/firewall-api/")) return request.continue();
      let body = {}, status = 200;
      if (path.endsWith("/auth/csrf")) body = { csrfToken: "browser-test-csrf-only" };
      else if (path.endsWith("/auth/me") || path.endsWith("/auth/session-status")) body = { authenticated: true, ok: true, user: { id: "ui-user", username: "test", role: "admin", allowedSections: ["actions", "assets", "dashboard"] } };
      else if (path.endsWith("/devices")) body = { devices: [device] };
      else if (path.includes("/device-workspaces/")) body = { capabilities: { facts: sophos } };
      else if (path.endsWith("/action-sessions/ui-vpn/answers")) {
        const posted = JSON.parse(request.postData()); assert.equal(posted.stepId, blueprint.steps[index].id);
        const next = { ...answers, ...posted.values }, issues = validateGuidedValues(activeGuidedFields([blueprint.steps[index]], next), next);
        if (issues.length) { status = 422; body = { messageFa: issues[0].messageFa }; }
        else { answers = next; index++; body = shape(); }
      } else if (path.endsWith("/action-sessions/ui-vpn")) body = shape();
      else if (request.method() !== "GET") { unexpectedWrites++; status = 403; body = { error: "Live writes blocked by browser test" }; }
      else if (path.endsWith("/companies")) body = { companies: [] };
      else if (path.endsWith("/product-state/navigation")) body = { navigation: [] };
      await request.respond({ status, contentType: "application/json", body: JSON.stringify(body) });
    });
    await page.goto("http://main-nginx/firewall/guided-actions/ui-vpn", { waitUntil: "networkidle0" });
    await page.waitForSelector('ol[aria-label="مراحل تنظیم"]');
    for (const step of blueprint.steps) {
      const fields = activeGuidedFields([step], { ...answers, ...scenario.values });
      for (const field of fields) {
        const handle = await page.evaluateHandle(label => [...document.querySelectorAll("label")].find(node => node.textContent.trim().startsWith(label))?.querySelector("input,select"), field.labelFa);
        const element = handle.asElement(); assert.ok(element, `${scenario.vendor}: ${field.key}`);
        const value = scenario.values[field.key];
        if (field.type === "checkbox") {
          const checked = await element.evaluate(node => node.checked); if (checked !== Boolean(value)) await element.click();
        } else if (await element.evaluate(node => node.tagName) === "SELECT") assert.deepEqual(await element.select(String(value ?? "")), [String(value ?? "")], `Available option: ${field.key}`);
        else { await element.click({ clickCount: 3 }); await element.type(String(value ?? "")); }
        await handle.dispose();
      }
      const prior = index;
      await page.evaluate(() => [...document.querySelectorAll("button")].find(button => button.textContent.includes("ذخیره و ادامه"))?.click());
      try { await page.waitForFunction(title => ![...document.querySelectorAll("h3")].some(node => node.textContent.includes(title)), { timeout: 10000 }, step.titleFa); }
      catch (error) { console.log(JSON.stringify({ vendor: scenario.vendor, width, step: step.id, index, headings: await page.$$eval("h3", nodes => nodes.map(node => node.textContent)), messages: await page.$$eval("p.mb-3", nodes => nodes.map(node => node.textContent)) })); throw error; }
      assert.equal(index, prior + 1, "Step saved once");
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), "No horizontal overflow");
    }
    assert.ok(await page.evaluate(() => [...document.querySelectorAll("button")].some(button => button.textContent.includes("ساخت پیش‌نمایش") && !button.disabled)));
    assert.equal(unexpectedWrites, 0); assert.deepEqual(errors, []);
    assert.equal(answers.psk, scenario.values.psk); // Sent only to mocked session, never back in public answers.
    assert.ok(!JSON.stringify(shape()).includes(scenario.values.psk));
    console.log(JSON.stringify({ vendor: scenario.vendor, width, allSteps: true, realDeviceOptions: true, noOverflow: true, previewReady: true, noLiveWrites: true, noPublicPsk: true }));
    await page.close();
  }
} finally { await browser.close(); }
