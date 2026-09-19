# معماری دو Runtime

```text
React/Vite UI
      │
RuntimeFacade
 ┌────┴──────────────────────┐
 │                           │
LocalMobileRuntime     ServerRuntimeClient
 │                           │
SQLite/Vault/Policy      Existing Backend API
 │                           │
Native SSH Plugin        Server Connector
 │                           │
Vendor Device            Vendor Device
```

## چرا این مدل درست است

- Local Mode به VPS نیاز ندارد.
- Server Mode حذف یا ضعیف نمی‌شود.
- UI فقط قرارداد Runtime را می‌شناسد.
- Prisma و Fastify فقط در Server Runtime می‌مانند.
- SQLite و Native SSH فقط در Mobile Runtime می‌مانند.
- ActionPlan، Risk، Approval، Verification و Vendor Schema تا جای ممکن مشترک می‌شوند.
- هیچ SSH مستقیمی از JavaScript/WebView انجام نمی‌شود.

## AI

اپ بدون AI هم باید با Catalog و Guided Workflow قابل استفاده باشد. AI اختیاری است و فقط با BYOK ذخیره‌شده در Secure Storage یا یک Endpoint محلی کار می‌کند. هیچ کلید مشترک AI داخل اپ قرار نمی‌گیرد.
