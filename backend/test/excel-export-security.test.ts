import assert from "node:assert/strict";
import test from "node:test";
import ExcelJS from "exceljs";

test("Excel export remains usable after the patched uuid dependency", async () => {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Security");
  sheet.addRow(["status", "safe"]);
  sheet.addConditionalFormatting({
    ref: "B1:B1",
    rules: [{ type: "expression", formulae: ['B1="safe"'], style: { font: { bold: true } } }]
  });
  const buffer = await workbook.xlsx.writeBuffer();
  assert.equal(Buffer.from(buffer).subarray(0, 2).toString(), "PK");
});
