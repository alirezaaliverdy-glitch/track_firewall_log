export const APPLICATION_SECTIONS = [
  "dashboard",
  "assets",
  "security",
  "monitoring",
  "actions",
  "assistant",
  "attackers"
] as const;

export type ApplicationSection = (typeof APPLICATION_SECTIONS)[number];

const SECTION_PATHS: Array<{ section: ApplicationSection; patterns: RegExp[] }> = [
  { section: "attackers", patterns: [/^\/api\/security\/attackers(?:\/|$)/] },
  { section: "monitoring", patterns: [/^\/api\/devices\/[^/]+\/telemetry(?:\/|$)/] },
  { section: "security", patterns: [/^\/api\/devices\/[^/]+\/findings(?:\/|$)/] },
  { section: "dashboard", patterns: [/^\/api\/dashboard(?:\/|$)/] },
  { section: "assets", patterns: [/^\/api\/(?:assets|devices|device-onboarding|device-workspaces|vendors|credentials|collectors|sites|vlans|prefixes)(?:\/|$)/, /^\/api\/integrations\/netbox(?:\/|$)/] },
  { section: "security", patterns: [/^\/api\/(?:security|findings|detection|detections|detection-rules|incidents|events|event-batches|assessments|recommendations|analysis|analysis-runs|uploads)(?:\/|$)/, /^\/api\/integrations\/wazuh(?:\/|$)/] },
  { section: "monitoring", patterns: [/^\/api\/(?:monitoring|daily-check|linux-health|telemetry)(?:\/|$)/] },
  { section: "actions", patterns: [/^\/api\/(?:actions|action-center|action-sessions|commands|connector-plans|connectors|diagnostics|scheduled-tasks)(?:\/|$)/] },
  { section: "assistant", patterns: [/^\/api\/ai(?:\/|$)/] }
];

export function normalizeApplicationSections(input: unknown, options: { allowEmpty?: boolean } = {}) {
  const raw = Array.isArray(input) ? input : [];
  const values = raw.map(String);
  if (values.some((value) => !APPLICATION_SECTIONS.includes(value as ApplicationSection))) throw new Error("INVALID_SECTION_ACCESS");
  const sections = [...new Set(values)] as ApplicationSection[];
  if (!options.allowEmpty && !sections.length) throw new Error("SECTION_ACCESS_REQUIRED");
  return sections;
}

export function sectionForApiPath(pathname: string): ApplicationSection | null {
  return SECTION_PATHS.find(({ patterns }) => patterns.some((pattern) => pattern.test(pathname)))?.section ?? null;
}

export function hasSectionAccess(user: { role: string; allowedSections?: readonly string[] }, section: ApplicationSection) {
  return user.role === "admin" || Boolean(user.allowedSections?.includes(section));
}
