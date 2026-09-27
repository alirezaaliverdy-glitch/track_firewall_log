// Read-only UI test with a real collected projection. Never changes a device or deletes history.
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { randomBytes } from "node:crypto";
import puppeteer from "puppeteer-core";
import { prisma } from "../dist/db/prisma.js";
import { hashSessionToken } from "../dist/services/auth.service.js";
const report=JSON.parse(await fs.readFile("/tmp/company-report-verification.json","utf8"));
const user=await prisma.appUser.findFirst({where:{role:"admin",isActive:true},select:{id:true}});
assert.ok(user);
const token=randomBytes(32).toString("base64url");
const session=await prisma.authSession.create({data:{userId:user.id,tokenHash:hashSessionToken(token),expiresAt:new Date(Date.now()+300000),userAgent:"report-ui-smoke"}});
let browser;
try {
  browser=await puppeteer.launch({executablePath:process.env.CHROMIUM_PATH || "/usr/bin/chromium-browser",headless:true,args:["--no-sandbox","--disable-dev-shm-usage"]});
  const page=await browser.newPage();const errors=[];page.on("pageerror",error=>errors.push(error.name));
  await page.browserContext().setCookie({name:"firewall_session",value:token,domain:"main-nginx",path:"/"});
  await page.setRequestInterception(true);
  page.on("request",request=>{
    if(request.url().endsWith("/reports/company-status")&&request.method()==="POST")void request.respond({status:200,contentType:"application/json",body:JSON.stringify({report})});
    else void request.continue();
  });
  for(const width of [1440,390]){
    await page.setViewport({width,height:1000,isMobile:width<600});
    await page.goto("http://main-nginx/firewall/reports",{waitUntil:"networkidle2"});
    await page.waitForSelector(".reports-toolbar select option");await page.select(".reports-toolbar select",report.company.id);
    await page.click(".reports-generate");await page.waitForSelector(".report-followups");
    const ready=await page.evaluate(()=>({width:document.documentElement.scrollWidth,links:[...document.querySelectorAll(".report-followups a")].map(e=>e.getAttribute("href")),font:getComputedStyle(document.querySelector(".report-followups p")).fontSize}));
    assert.ok(ready.width<=width+1);assert.equal(ready.font,"16px");assert.ok(ready.links.some(h=>h.includes("/overview")));
    await page.click(".report-preview-button");await page.waitForSelector(".equipment-editor__assessment textarea");
    const modal=await page.evaluate(()=>({width:document.documentElement.scrollWidth,editors:document.querySelectorAll(".equipment-editor__assessment").length,readable:[...document.querySelectorAll(".equipment-editor__assessment textarea")].every(e=>parseFloat(getComputedStyle(e).fontSize)>=16)}));
    assert.equal(modal.editors,report.equipment.length);assert.ok(modal.readable);assert.ok(modal.width<=width+1);
    const first=await page.$(".equipment-editor__assessment textarea");await first.click();await page.keyboard.down("Control");await page.keyboard.press("A");await page.keyboard.up("Control");await page.keyboard.type("یادداشت آزمایشی قابل ویرایش");
    await page.keyboard.press("Escape");await page.waitForFunction(()=>!document.querySelector(".report-modal"));
    assert.ok(await page.$eval(".report-followups",e=>e.textContent.includes("یادداشت آزمایشی قابل ویرایش")));
    await page.click(".report-dismiss");await page.waitForFunction(()=>!document.querySelector(".report-followups"));
    console.log(JSON.stringify({stage:"report-ui",width,editors:modal.editors,readable:true,editableReason:true,dismissible:true,actionLinks:true,vendorWrite:false}));
  }
  assert.deepEqual(errors,[]);
} finally {
  await browser?.close();await prisma.authSession.deleteMany({where:{id:session.id}});await prisma.$disconnect();
}
