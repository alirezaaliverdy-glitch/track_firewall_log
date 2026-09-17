import { AiRiskLevel } from "@prisma/client";
import type { FortiOsDialect } from "../../services/fortigate-version.service.js";
import { normalizeFortiGateGuidedVpnParameters, validateFortiGateGuidedVpnParameters } from "../../services/fortigate-guided-vpn.schema.js";
import {
  arrayNames,
  block,
  cidrOrIp,
  cidrToSubnet,
  fail,
  ipv4OrFqdn,
  MANAGED_PREFIX,
  managedComment,
  objectName,
  port,
  quote,
  result,
  safeName,
  safeOptionalName,
  safeProposal,
  secretValue,
  spec,
  text,
  withVdom,
} from "./shared.js";

export function compileFortiGateGuidedVpnSetup(input: {
  parameters: Record<string, unknown>;
  riskLevel: AiRiskLevel;
  dialect?: FortiOsDialect;
}) {
  const p = input.parameters;
  const vdom = text(p, "vdom");    const vpn = normalizeFortiGateGuidedVpnParameters(p);
    const vpnValidation = validateFortiGateGuidedVpnParameters(vpn);
    if (vpnValidation.issues.length > 0) throw new Error(vpnValidation.issues[0]?.message ?? "FORTIGATE_GUIDED_VPN_PARAMS_INVALID");
    if (text(vpn, "vpnType", "ipsec_site_to_site") !== "ipsec_site_to_site") throw new Error("FORTIGATE_VPN_MODE_PREVIEW_ONLY");
    if (text(vpn, "authMethod", "psk") !== "psk") throw new Error("FORTIGATE_VPN_AUTH_PREVIEW_ONLY");
    if (text(vpn, "psk")) throw new Error("PSK plaintext is not allowed; use pskSecretRef.");
    const name = safeName(vpn, "vpnName");
    const phase1Name = safeName(vpn, "phase1Name", name);
    const phase2Name = safeName(vpn, "phase2Name", `${phase1Name}-p2`);
    const wanInterface = safeName(vpn, "wanInterface");
    const lanInterface = safeName(vpn, "lanInterface");
    const remoteGateway = ipv4OrFqdn(text(vpn, "remoteGateway") ?? fail("remoteGateway"), "remoteGateway");
    const localSubnet = { cidr: text(vpn, "localSubnet") ?? fail("localSubnet"), subnet: cidrToSubnet(text(vpn, "localSubnet") ?? "", "localSubnet") };
    const remoteSubnet = { cidr: text(vpn, "remoteSubnet") ?? fail("remoteSubnet"), subnet: cidrToSubnet(text(vpn, "remoteSubnet") ?? "", "remoteSubnet") };
    const pskSecretRef = text(p, "pskSecretRef") ?? fail("pskSecretRef");
    const psk = secretValue(p, "pskSecretValue");
    const proposal = safeProposal(vpn);
    const dhGroup = safeName(vpn, "dhGroup", "14");
    const ikeVersion = safeName(vpn, "ikeVersion", "2");
    const natTraversal = vpn.natTraversal !== false;
    const createFirewallPolicy = vpn.createFirewallPolicy !== false;
    const createStaticRoute = vpn.createStaticRoute !== false;
    const natEnabled = vpn.natEnabled === true;
    const logTraffic = vpn.logTraffic === true;
    const enableAfterCreate = vpn.enableAfterCreate !== false;
    const statusLines = enableAfterCreate ? [] : ["set status disable"];
    const pskLine = psk ? `set psksecret ${quote(psk)}` : "set psksecret ********";
    const phase2Names = [phase2Name];
    const phase2Lines = [
      "config vpn ipsec phase2-interface",
      `edit ${quote(phase2Name)}`,
      `set phase1name ${quote(phase1Name)}`,
      `set proposal ${proposal}`,
      `set src-subnet ${localSubnet.subnet}`,
      `set dst-subnet ${remoteSubnet.subnet}`,
      ...statusLines,
      "next",
      "end"
    ];
    const phase1Command = block([
      "config vpn ipsec phase1-interface",
      `edit ${quote(phase1Name)}`,
      `set interface ${quote(wanInterface)}`,
      `set ike-version ${ikeVersion}`,
      "set peertype any",
      "set net-device disable",
      `set proposal ${proposal}`,
      `set dhgrp ${dhGroup}`,
      `set remote-gw ${remoteGateway}`,
      pskLine,
      `set nattraversal ${natTraversal ? "enable" : "disable"}`,
      ...statusLines,
      "next",
      "end"
    ]);
    const routeCommand = block([
      "config router static",
      "edit 0",
      `set dst ${remoteSubnet.subnet}`,
      `set device ${quote(phase1Name)}`,
      ...(vpn.routeDistance !== undefined ? [`set distance ${Number(vpn.routeDistance)}`] : []),
      "next",
      "end"
    ]);
    const localAddressNames = [safeOptionalName(vpn, "localAddressObjectName") ?? objectName(`${MANAGED_PREFIX}-${name}-local`, 1)];
    const remoteAddressNames = [safeOptionalName(vpn, "remoteAddressObjectName") ?? objectName(`${MANAGED_PREFIX}-${name}-remote`, 1)];
    const policyBaseName = safeOptionalName(vpn, "policyName") ?? name;
    const addressCommand = block([
      "config firewall address",
      `edit ${quote(localAddressNames[0])}`,
      `set subnet ${localSubnet.subnet}`,
      `set comment ${quote(managedComment(`guided vpn ${name} local ${localSubnet.cidr}`))}`,
      "next",
      `edit ${quote(remoteAddressNames[0])}`,
      `set subnet ${remoteSubnet.subnet}`,
      `set comment ${quote(managedComment(`guided vpn ${name} remote ${remoteSubnet.cidr}`))}`,
      "next",
      "end"
    ]);
    const policyCommand = block([
      "config firewall policy",
      "edit 0",
      `set name ${quote(objectName(`${policyBaseName}-lan-to-vpn`, 0))}`,
      `set srcintf ${quote(lanInterface)}`,
      `set dstintf ${quote(phase1Name)}`,
      `set srcaddr ${localAddressNames.map(quote).join(" ")}`,
      `set dstaddr ${remoteAddressNames.map(quote).join(" ")}`,
      "set action accept",
      "set schedule \"always\"",
      "set service \"ALL\"",
      `set nat ${natEnabled ? "enable" : "disable"}`,
      `set logtraffic ${logTraffic ? "all" : "disable"}`,
      ...statusLines,
      "next",
      "edit 0",
      `set name ${quote(objectName(`${policyBaseName}-vpn-to-lan`, 0))}`,
      `set srcintf ${quote(phase1Name)}`,
      `set dstintf ${quote(lanInterface)}`,
      `set srcaddr ${remoteAddressNames.map(quote).join(" ")}`,
      `set dstaddr ${localAddressNames.map(quote).join(" ")}`,
      "set action accept",
      "set schedule \"always\"",
      "set service \"ALL\"",
      "set nat disable",
      `set logtraffic ${logTraffic ? "all" : "disable"}`,
      ...statusLines,
      "next",
      "end"
    ]);
    const verificationCommands = [
      `show vpn ipsec phase1-interface ${phase1Name}`,
      `show vpn ipsec phase2-interface ${phase2Name}`,
      ...(createFirewallPolicy ? [`show firewall policy | grep -f ${name}`] : []),
      ...(createStaticRoute ? [`get router info routing-table all | grep ${remoteSubnet.cidr}`] : []),
      "get vpn ipsec tunnel summary"
    ];
    const commandSpecs = [
      spec({ template: "config vpn ipsec phase1-interface/edit <phase1Name>", command: withVdom(phase1Command, vdom), target: { vpnName: name, phase1Name, wanInterface, remoteGateway, vdom }, rollbackSteps: [`delete phase1-interface ${phase1Name}`], warnings: [] }),
      spec({ template: "config vpn ipsec phase2-interface/edit <phase2Name>", command: withVdom(block(phase2Lines), vdom), target: { vpnName: name, phase1Name, phase2Name, localSubnet: localSubnet.cidr, remoteSubnet: remoteSubnet.cidr, vdom }, rollbackSteps: [`delete phase2-interface ${phase2Name}`], warnings: [] }),
      ...(createStaticRoute ? [spec({ template: "config router static/edit 0 remote VPN route", command: withVdom(routeCommand, vdom), target: { vpnName: name, phase1Name, remoteSubnet: remoteSubnet.cidr, vdom }, rollbackSteps: ["Remove created static route for the remote VPN subnet by route ID from config snapshot."], warnings: [] })] : []),
      ...(createFirewallPolicy ? [
        spec({ template: "config firewall address/edit managed VPN address objects", command: withVdom(addressCommand, vdom), target: { localAddressNames, remoteAddressNames, vdom }, rollbackSteps: [...localAddressNames, ...remoteAddressNames].map((item) => `delete firewall address ${item}`), warnings: [] }),
        spec({ template: "config firewall policy/edit 0 guided VPN policies", command: withVdom(policyCommand, vdom), target: { lanInterface, tunnelInterface: phase1Name, natEnabled, logTraffic, vdom }, rollbackSteps: ["Delete created firewall policies by name from config snapshot."], warnings: [] })
      ] : []),
      ...verificationCommands.map((command) => spec({ template: `verify ${command}`, command: withVdom(command, vdom), write: false, target: { vpnName: name, phase1Name, vdom }, rollbackSteps: [], warnings: [] }))
    ];
    return result({
      category: "vpn",
      riskLevel: AiRiskLevel.high,
      normalizedParameters: {
        vpnType: "ipsec_site_to_site",
        vpnName: name,
        phase1Name,
        phase2Name,
        wanInterface,
        lanInterface,
        remoteGateway,
        localSubnet: localSubnet.cidr,
        remoteSubnet: remoteSubnet.cidr,
        proposal,
        dhGroup,
        ikeVersion,
        natTraversal,
        pskSecretRef,
        createFirewallPolicy,
        createStaticRoute,
        natEnabled,
        logTraffic,
        enableAfterCreate,
        vdom
      },
      requiresBackup: true,
      requiresBreakGlass: false,
      lockoutSensitive: false,
      warnings: [
        "Backup is disabled for Quick Controlled execution; create a manual backup first if your change window requires it.",
        "PSK is resolved from an ephemeral secret reference at execution time and is redacted in preview."
      ],
      commandSpecs,
      rollbackJson: {
        type: "fortigate_guided_ipsec_site_to_site_manual",
        vpnName: name,
        phase1Name,
        phase2Names,
        localAddressNames: createFirewallPolicy ? localAddressNames : [],
        remoteAddressNames: createFirewallPolicy ? remoteAddressNames : [],
        routeRemoval: createStaticRoute ? "Remove created static routes for remote subnets using the pre-change snapshot to identify route IDs." : "not_created",
        policyRemoval: createFirewallPolicy ? "Delete created policies by displayed names from the pre/post snapshot." : "not_created",
        secretStored: false,
        vdom
      }
    });
}
