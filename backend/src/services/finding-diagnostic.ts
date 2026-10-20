import { searchCatalog } from "../commands/catalog/index.js";
import { normalizeDetectionVendor } from "../security/vendor-detection-rule-library.js";
/** Decision label and preview must resolve the same registered, executable command. */
export function findingDiagnostic(vendor: string, affectedObject?: string | null) {
  vendor = normalizeDetectionVendor(vendor);
  if (/esxi|vmware/.test(vendor)) vendor = "esxi";
  if (/sophos|sfos/.test(vendor)) vendor = "sophos";
  const topic = affectedObject?.startsWith("cpu.") ? /cpu|process/i : affectedObject?.startsWith("memory.") ? /memory|resource|process/i : /disk|storage|datastore/i;
  return searchCatalog({ vendor, executable: true, readOnly: true }).filter(item => !item.requiredParams.length)
    .sort((a, b) => (Number(Boolean(affectedObject) && topic.test(b.id + " " + b.titleEn)) - Number(Boolean(affectedObject) && topic.test(a.id + " " + a.titleEn))) || Number(b.category === "daily-check") - Number(a.category === "daily-check"))[0];
}
