// Read-only collection/render verification. No action execution or device configuration changes.
import fs from "node:fs/promises";
import assert from "node:assert/strict";
import puppeteer from "puppeteer-core";
import { prisma } from "../dist/db/prisma.js";
import { closeSharedSshSessions } from "../dist/services/shared-ssh-session.service.js";
import { closeSshMonitorSessions } from "../dist/services/ssh-monitor-session.service.js";
import { buildCompanyStatusReport, renderCompanyReportHtml, renderCompanyReportPdf, renderCompanyReportXlsx } from "../dist/reports/company-status-report.service.js";

try {
  const user=await prisma.appUser.findFirst({where:{role:"admin",isActive:true},select:{id:true,username:true,displayName:true,role:true,isActive:true}});
  assert.ok(user,"An active admin is required");
  const company=await prisma.company.findFirst({where:{ownerId:user.id,deletedAt:null,code:"DEFAULT"},select:{id:true}});
  assert.ok(company,"Owned company is required");
  const report=await buildCompanyStatusReport(company.id,user,process.argv.includes("--live"));
  console.log(JSON.stringify({stage:"real-assessment",equipment:report.equipment.map(e=>({vendor:e.vendor,category:e.category,status:e.status,connection:e.connectionState,reason:e.statusReason,nextStep:e.recommendation,source:e.source,cpu:e.cpuPercent,disk:e.diskPercent})),deviceConfigurationWrite:false}));
  await fs.writeFile("/tmp/company-report-verification.json",JSON.stringify(report));
  await fs.writeFile("/tmp/company-report-new.html",await renderCompanyReportHtml(report));
  await fs.writeFile("/tmp/company-report-new.pdf",await renderCompanyReportPdf(report));
  await fs.writeFile("/tmp/company-report-new.xlsx",await renderCompanyReportXlsx(report));
  const browser=await puppeteer.launch({executablePath:process.env.CHROMIUM_PATH || "/usr/bin/chromium-browser",headless:true,args:["--no-sandbox","--disable-dev-shm-usage"]});
  try {
    const page=await browser.newPage();await page.setViewport({width:1000,height:1200,deviceScaleFactor:1});
    for(const scenario of ["real","many-assets"]){
      const input=scenario==="real"?report:{...report,equipment:Array.from({length:30},(_,i)=>({...report.equipment[0],id:`fixture-${i}`,vendor:`Test vendor ${i}`,name:"تجهیز آزمایشی برای کنترل صفحه‌بندی",status:"limited",statusReason:"هشدار نیازمند بررسی در سنسورهای ثبت‌شده ".repeat(10),recommendation:"علت هشدار را در سنسورها بررسی و سپس جمع‌آوری تازه اجرا کنید. ".repeat(10)})),futureActions:Array(8).fill("بررسی سنسورها و رفع مشکل ".repeat(10)),completedActions:Array(8).fill("بررسی تأییدشده ".repeat(10)),additionalNotes:"یادداشت مسئول ".repeat(50)};
      await page.setContent(await renderCompanyReportHtml(input));await page.evaluate(()=>document.fonts.ready);
      const layout=await page.evaluate(()=>[...document.querySelectorAll(".page")].map(e=>({height:e.clientHeight,scroll:e.scrollHeight,width:e.clientWidth,scrollWidth:e.scrollWidth,bodyFont:getComputedStyle(document.body).fontSize})));
      console.log(JSON.stringify({stage:"pdf-layout",scenario,layout}));assert.equal(layout.length,2);assert.ok(layout.every(e=>e.scroll<=e.height+1 && e.scrollWidth<=e.width+1),"Report overflow detected");
      if(scenario==="real"){const pages=await page.$$(".page");await pages[0].screenshot({path:"/tmp/company-report-page1.png"});await pages[1].screenshot({path:"/tmp/company-report-page2.png"});}
    }
  } finally {await browser.close();}
} finally {closeSshMonitorSessions();closeSharedSshSessions();await prisma.$disconnect();}
