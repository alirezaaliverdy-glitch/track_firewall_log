import assert from "node:assert/strict";
import test from "node:test";
import ExcelJS from "exceljs";
import { assessReportDevice, reportActionTitle, reportCategory, reportPercentage } from "../src/reports/company-status-assessment.js";
import { renderCompanyReportHtml, renderCompanyReportXlsx, sanitizeCompanyStatusReport } from "../src/reports/company-status-report.service.js";
import type { LinuxServerOverview } from "../src/telemetry/linux/linux-telemetry.types.js";
import type { CompanyStatusReport } from "../src/reports/company-status-report.types.js";

test("vendor CPU percentages preserve zero and reject invalid or out-of-range readings",()=>{
  assert.equal(reportPercentage(" 12.5% "),12.5);
  assert.equal(reportPercentage(0),0);
  assert.equal(reportPercentage("0"),0);
  for(const value of [null,undefined,"","unknown","200%",NaN,-1]) assert.equal(reportPercentage(value),null);
});
const now=Date.parse("2026-09-27T10:00:00Z");
const device={vendor:"linux",type:"linux",status:"online",statusChecks:[{status:"online",message:null,checkedAt:new Date(now-3600000)}],healthSnapshots:[]};
test("completed operation labels are readable, not raw CLI titles",()=>{
  assert.equal(reportActionTitle("Show clock"),"بررسی ساعت دستگاه");
  assert.equal(reportActionTitle("Show IP interface brief"),"بررسی وضعیت اینترفیس‌ها");
});
test("report never treats stale inventory or failed collection as verified active",()=>{
  assert.equal(assessReportDevice(device,null,now).status,"limited");
  const failure=assessReportDevice(device,{collectedAt:new Date(now).toISOString(),collectionError:"SSH handshake timed out"},now);
  assert.equal(failure.status,"limited");assert.equal(failure.connectionState,"unknown");assert.match(failure.statusReason,/خاموش/);
});
test("online Linux warning or critical health is not classified as a disconnected device",()=>{
  for(const status of ["warning","critical"] as const){
    const linux={connection:{status:"online"},health:{status,reasons:["Recent security warnings found"]},warnings:[]} as unknown as LinuxServerOverview;
    const result=assessReportDevice(device,{collectedAt:new Date(now).toISOString(),linux},now);
    assert.equal(result.status,"limited");assert.equal(result.connectionState,"online");assert.match(result.statusReason,/نفوذ قطعی نیست/);assert.match(result.recommendation,/رخدادهای امنیتی/);
  }
});
test("sudo warnings have scoped permission guidance, not blanket root elevation",()=>{
  const linux={connection:{status:"partial"},health:{status:"warning",reasons:["permission denied"]},warnings:[]} as unknown as LinuxServerOverview;
  const result=assessReportDevice(device,{collectedAt:new Date(now).toISOString(),linux},now);
  assert.match(result.statusReason,/مجوز/);assert.match(result.recommendation,/فقط مجوز لازم/);assert.doesNotMatch(result.recommendation,/ALL|chmod|root/);
});
test("Cisco category is not overridden by the generic firewall transport type",()=>{
  assert.equal(reportCategory({vendor:"cisco",type:"firewall"}),"switch");
  assert.equal(reportCategory({vendor:"fortigate",type:"firewall"}),"firewall");
  assert.equal(reportCategory({vendor:"mikrotik",type:"firewall"}),"router");
});
function fixture():CompanyStatusReport{return {schemaVersion:1,generatedAt:new Date(now).toISOString(),reportDateFa:"۱۴۰۵/۰۷/۰۵",reportDateGregorian:"2026-09-27",reportTime:"۱۳:۳۰:۰۰",timezone:"Asia/Tehran",reportNumber:"TEST-REPORT",preparedBy:"مدیر",company:{id:"test-company",name:"شرکت نمونه",code:"TEST"},summary:{total:9,active:0,limited:9,inactive:0,healthScore:90},equipment:Array.from({length:9},(_,i)=>({id:`device-${i}`,name:`تجهیز ${i}`,host:"10.0.0.1",vendor:`Vendor ${i}`,model:"model",category:"server",status:"limited",description:"یادداشت",statusReason:"هشدار واقعی <script>alert(1)</script>",recommendation:"بررسی سنسورها و جمع‌آوری تازه",technicalDetails:"permission denied",connectionState:"online",physicalLocation:"",vendorFields:[],cpuPercent:null,diskPercent:null,collectedAt:new Date(now-3600000).toISOString(),source:"snapshot"})),completedActions:[],futureActions:[],additionalNotes:"",responsibleName:"مدیر"};}
test("two-page report uses full-width readable cards, explains status and flags omitted assets",async()=>{
  const html=await renderCompanyReportHtml(fixture());
  assert.equal((html.match(/<section class="page">/g)??[]).length,2);
  assert.equal((html.match(/data-device=/g)??[]).length,2);
  assert.match(html,/font:14px/);assert.match(html,/نیازمند بررسی/);assert.match(html,/قدم بعدی/);assert.match(html,/دادهٔ قدیمی/);assert.match(html,/فهرست کامل/);
  assert.match(html,/data:font\/ttf;base64,/);assert.doesNotMatch(html,/data:font\/ttf;base64:/);
  assert.match(html,/data-category="server"/);assert.match(html,/خلاصه آماری وندورها/);
  assert.match(html,/&lt;script&gt;/);assert.doesNotMatch(html,/<script>|overflow:hidden|امتیاز سلامت/);
});
test("editable assessment is bounded and score is recomputed from actual counts",()=>{
  const r=fixture();r.equipment[0].recommendation="x".repeat(1000);r.equipment[0].cpuPercent=200;
  const safe=sanitizeCompanyStatusReport(r,r.company.id);
  assert.equal(safe.equipment[0].recommendation?.length,650);assert.equal(safe.equipment[0].cpuPercent,null);assert.equal(safe.summary.healthScore,0);
});
test("Excel includes every asset, cause, next step, data source and technical detail in readable cells",async()=>{
  const book=new ExcelJS.Workbook();await book.xlsx.load(await renderCompanyReportXlsx(fixture()) as never);
  assert.equal(book.worksheets.length,2);const sheet=book.getWorksheet("تجهیزات")!;
  assert.equal(sheet.rowCount,10);assert.equal(sheet.getCell("I2").value,"بررسی سنسورها و جمع‌آوری تازه");assert.equal(sheet.getCell("Q2").value,"permission denied");assert.equal(sheet.getCell("H2").font.size,13);assert.equal(sheet.views[0].rightToLeft,true);
});
