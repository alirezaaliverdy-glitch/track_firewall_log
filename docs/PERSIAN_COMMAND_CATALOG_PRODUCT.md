# محصول کاتالوگ دستورات فارسی

## جهت محصول

در حالت `PRODUCT_MODE=persian_command_catalog` مسیر اصلی محصول از دستگاه و دستور آماده آغاز می‌شود. هوش مصنوعی دستیار جایگزین است، نه نقطه شروع عملیات.

`Device -> Command Catalog -> parameter validation -> ActionPlan -> review/confirmation -> PolicyGuard -> Connector -> verification/audit`

هیچ endpoint کاتالوگ یا AI عملیات را خودکار اجرا نمی‌کند. رفتار آزمایشگاه `quick_controlled` و `ACTION_ALLOW_LAB_UNRESTRICTED_MANAGEMENT=true` حفظ شده است.

## معماری backend-first

- قرارداد: `backend/src/commands/catalog/types.ts`
- داده‌های curated و جست‌وجو: `backend/src/commands/catalog/index.ts`
- API: `backend/src/routes/command-catalog.ts`
- UI: `src/components/commands/CommandCatalogPanel.tsx`

`CommandCatalogItem` شامل شناسه، vendor، عنوان فارسی/انگلیسی، شرح فارسی، دسته، intent، ریسک، سطح دسترسی، read-only/mutating، نیاز به تأیید، پارامترها، کلیدواژه‌های فارسی، connectorها، precheck، template ref، verification، rollback، evidence و راهنمای UI است.

## API

- `GET /api/commands/catalog`
- `GET /api/commands/catalog/search?q=&vendor=&category=&riskLevel=&readOnly=&executable=`
- `GET /api/commands/catalog/:id`
- `POST /api/commands/catalog/:id/create-action-plan`
- `POST /api/commands/ai-propose`

شناسه دستور در `parametersJson.metadata.catalogCommandId` ذخیره می‌شود. آیتم فاقد اجرای connector نیز ActionPlan پیشنهادی می‌سازد و `executionSupport=manual_or_not_implemented` دارد.

## افزودن دستور یا vendor

1. vendor را در `CommandVendor` ثبت کنید.
2. آیتم را با شناسه پایدار انگلیسی، متن فارسی، intent و پارامترهای صریح اضافه کنید.
3. فقط وقتی connector واقعی وجود دارد `executionTemplateRef` و `uiHints.executable=true` قرار دهید.
4. precheck، verification و rollback را متناسب با ریسک بنویسید.
5. تست جست‌وجوی فارسی، فیلتر vendor و ساخت ActionPlan را اضافه کنید.

## اصول تجربه فارسی

متن کاربر فارسی و راست‌به‌چپ است؛ شناسه‌های کد انگلیسی می‌مانند. وضعیت ریسک، فقط‌خواندنی بودن، قابلیت اجرا و نیاز به تأیید باید پیش از ساخت برنامه روشن باشند. اگر نتیجه مناسب نبود، UI مسیر «ساخت با هوش مصنوعی» را نشان می‌دهد و خروجی آن همچنان نیازمند بازبینی است.
