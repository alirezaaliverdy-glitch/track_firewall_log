import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const read = (file) => readFileSync(resolve(root, file), "utf8");
const failures = [];

const app = read("src/App.tsx");
const routes = read("src/routes/appRoutes.tsx");
const shell = read("src/components/layout/AppShell.tsx");
const productState = read("backend/src/product-state/product-state.registry.ts");
const lab = read("src/features/tools/pages/WorkflowLabPage.tsx");

if (!app.includes('path="/tools/workflow-lab"')) failures.push("Workflow Lab route is missing from App.tsx.");
if (!app.includes("import.meta.env.DEV ? <Route path=\"/tools/workflow-lab\"")) failures.push("Workflow Lab route is not gated by import.meta.env.DEV.");
if (routes.includes("/tools/workflow-lab")) failures.push("Workflow Lab route must not be registered in appRoutes navigation metadata.");
if (shell.includes("/tools/workflow-lab")) failures.push("Workflow Lab must not be linked from AppShell navigation.");
if (productState.includes("workflow_lab") || productState.includes("/tools/workflow-lab")) failures.push("Workflow Lab must not be exposed through Product State navigation.");
for (const forbidden of ["fetch(", "API_BASE_URL", "runDiagnostic", "runNmapScan", "quickExecute", "createActionPlan"]) {
  if (lab.includes(forbidden)) failures.push(`Workflow Lab fixture page contains forbidden runtime token: ${forbidden}`);
}

if (failures.length) {
  console.error("Workflow Lab dev-only contract failed:");
  for (const failure of failures) console.error(`  ${failure}`);
  process.exit(1);
}

console.log("Workflow Lab dev-only contract OK.");