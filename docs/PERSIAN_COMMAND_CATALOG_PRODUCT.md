# محصول کاتالوگ دستورات فارسی

## جهت محصول

در حالت `PRODUCT_MODE=persian_command_catalog` مسیر اصلی محصول از دستگاه و دستور آماده آغاز می‌شود. هوش مصنوعی دستیار جایگزین است، نه نقطه شروع عملیات.

`Device -> Command Catalog -> parameter validation -> ActionPlan -> review/confirmation -> PolicyGuard -> Connector -> verification/audit`

هیچ endpoint کاتالوگ یا AI عملیات را خودکار اجرا نمی‌کند. رفتار آزمایشگاه `quick_controlled` و `ACTION_ALLOW_LAB_UNRESTRICTED_MANAGEMENT=true` حفظ شده است.

## معماری backend-first

- قرارداد: `backend/src/commands/catalog/types.ts`
- داده‌های curated و جست‌وجو: `backend/src/commands/catalog/index.ts`
- API: `backend/src/routes/command-catalog.ts`
- اعتبارسنج قرارداد: `backend/src/commands/catalog/command-catalog-validator.ts`
- registry اجرای واقعی: `backend/src/commands/execution/execution-template-registry.ts`
- UI: `src/components/commands/CommandCatalogPanel.tsx`

`CommandCatalogItem` شامل شناسه، vendor، عنوان فارسی/انگلیسی، شرح فارسی، دسته، intent، ریسک، سطح دسترسی، read-only/mutating، نیاز به تأیید، پارامترها، کلیدواژه‌های فارسی، connectorها، precheck، template ref، verification، rollback، evidence و راهنمای UI است.

## وضعیت‌های پیاده‌سازی

- `implemented`: action type، planner، connector و template واقعی دارد و پس از تکمیل ورودی می‌تواند ActionPlan بسازد.
- `manualOnly`: فقط یک `generic_security_action` برای بازبینی دستی می‌سازد؛ اجرای connector ندارد.
- `planned`: در جست‌وجوی عادی پنهان است و endpoint اجازه ساخت ActionPlan نمی‌دهد.
- `unsupported`: برای دستگاه/vendor مربوط پنهان یا غیرفعال است و ActionPlan نمی‌سازد.

قاعده محصول: هیچ کارت نمایشی حق ندارد badge یا دکمه اجراپذیر داشته باشد. startup برنامه و `npm run validate:command-catalog` تطابق action type، template، planner و connector را بررسی می‌کنند.

## ورودی و دستگاه

defaultها قبل از اعتبارسنجی اعمال می‌شوند. فیلدهای ناقص یا نامعتبر با `422 NEEDS_INPUT` و label/help فارسی برمی‌گردند و هیچ رکورد ActionPlan ساخته نمی‌شود. جست‌وجو با `deviceId` vendor و transport دستگاه را اعمال می‌کند؛ planned/unsupported فقط با حالت debug قابل مشاهده‌اند.

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
3. فقط وقتی action type در Prisma، execution registry، planner و connector واقعی وجود دارد state را `implemented` و `executionTemplateRef` را تنظیم کنید.
4. precheck، verification و rollback را متناسب با ریسک بنویسید.
5. تست جست‌وجوی فارسی، فیلتر vendor و ساخت ActionPlan را اضافه کنید.
6. `npm run validate:command-catalog`، build و کل test suite را اجرا کنید.

## ماتریس پشتیبانی فعلی

| Vendor | اجراپذیر واقعی | دستی/برنامه‌ریزی‌شده |
| --- | --- | --- |
| Linux | پورت‌های باز، SSH، ورود ناموفق، sudo، firewall، fail2ban، block IP، وضعیت سرویس | محدودسازی SSH و فعال‌سازی fail2ban دستی |
| MikroTik | سرویس‌های مدیریتی، filter، NAT، لاگ ورود، block IP، backup | محدودسازی مدیریت دستی؛ تغییر پورت SSH planned |
| FortiGate | — در کاتالوگ محصول این فاز | بررسی‌ها و تغییرات manualOnly |
| Cisco | — | manualOnly |
| pfSense | — | manualOnly |
| Generic | — | بررسی دستی |

## اصول تجربه فارسی

متن کاربر فارسی و راست‌به‌چپ است؛ شناسه‌های کد انگلیسی می‌مانند. وضعیت ریسک، فقط‌خواندنی بودن، قابلیت اجرا و نیاز به تأیید باید پیش از ساخت برنامه روشن باشند. اگر نتیجه مناسب نبود، UI مسیر «ساخت با هوش مصنوعی» را نشان می‌دهد و خروجی آن همچنان نیازمند بازبینی است.
