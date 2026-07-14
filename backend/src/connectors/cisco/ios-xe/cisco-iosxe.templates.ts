export const CISCO_IOSXE_READ_COMMANDS = Object.freeze({
  platform: "show version",
  inventory: "show inventory",
  interfacesStatus: "show interfaces status",
  interfacesErrors: "show interfaces counters errors",
  ipInterfaceBrief: "show ip interface brief",
  vlanBrief: "show vlan brief",
  trunk: "show interfaces trunk",
  etherchannel: "show etherchannel summary",
  spanningTree: "show spanning-tree summary",
  route: "show ip route",
  acl: "show access-lists",
  cpu: "show processes cpu platform",
  memory: "show processes memory"
} as const);

export type CiscoReadCommandId = keyof typeof CISCO_IOSXE_READ_COMMANDS;

export function ciscoReadCommand(id: CiscoReadCommandId) { return CISCO_IOSXE_READ_COMMANDS[id]; }
