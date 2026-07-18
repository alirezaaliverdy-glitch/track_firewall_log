import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const readProjectFile = (path: string) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("current removal path structurally reproduces the orphan Asset defect", async () => {
  const [route, service, schema, inventory, equipmentPage] = await Promise.all([
    readProjectFile("src/routes/devices.ts"),
    readProjectFile("src/services/device.service.ts"),
    readProjectFile("prisma/schema.prisma"),
    readProjectFile("src/assets/asset-intelligence.service.ts"),
    readFile(new URL("../../src/features/assets/pages/AssetListPage.tsx", import.meta.url), "utf8")
  ]);

  assert.match(route, /await deleteDevice\(request\.params\.id\)[\s\S]*reply\.code\(204\)/);
  assert.match(service, /export async function deleteDevice[\s\S]*prisma\.device\.delete/);
  assert.match(schema, /device\s+Device\?[\s\S]*onDelete: SetNull/);
  assert.match(inventory, /export async function listAssets[\s\S]*prisma\.asset\.findMany/);
  assert.match(equipmentPage, /useAssets\(/);
});
