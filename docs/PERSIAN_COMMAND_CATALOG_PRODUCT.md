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

## قرارداد metadata در ActionPlan

هر plan ساخته‌شده از کاتالوگ در `parametersJson.metadata` این فیلدها را نگه می‌دارد: `catalogCommandId`، `catalogVersion`، `vendor`، `actionType`، `executionSupport`، `implementationState`، `executionTemplateRef`، `connectorType`، `source=command_catalog`، `normalizedParams` و `requiredParamsSatisfied`.

`actionType` دقیقاً action type آیتم است. نبود template، ورودی ناقص، vendor ناسازگار یا state غیرقابل اجرا قبل از ساخت/اجرا متوقف می‌شود.

## مسیر ساخت تا اجرا

`کارت دستور -> POST create-action-plan -> پیام موفقیت -> ?selected=<planId>#action-center -> refresh/select جزئیات -> تأیید کاربر -> quick-execute -> catalog resolver -> PolicyGuard -> dry-run -> connector -> audit`

پیش‌نمایش با متن «این فقط پیش‌نمایش اجرای دستور است. هنوز روی دستگاه اجرا نشده.» از نتیجه جدا است. metadata در این مرحله `previewGenerated=true` و `executed=false` دارد. پس از تأیید، فقط اجرای موفق واقعی connector/template می‌تواند status را `succeeded` و `executed=true` کند؛ زمان شروع/پایان، exitCode، stdout/stderr و executor ذخیره می‌شوند و UI به `/actions/:actionPlanId/result` می‌رود.

صفحه نتیجه نام دستور، دستگاه، vendor، وضعیت و زمان، خلاصه، خروجی قالب‌بندی‌شده و خروجی خام جمع‌شونده را نشان می‌دهد. خروجی `linux_list_open_ports` به جدول پروتکل، آدرس محلی، پورت و process/service تبدیل می‌شود.

## قرارداد قطعی preview و execute

درخواست دکمه «تأیید و اجرا» همیشه `intent=execute` دارد. fingerprint پیش‌نمایش فقط از `actionType`، vendor، deviceId، پارامترهای نرمال‌شده کاربر، `catalogCommandId` و `executionTemplateRef` ساخته می‌شود؛ status، زمان‌ها، audit، validation/debug و metadata تولیدی در آن نیستند. بنابراین ساخت preview آن را stale نمی‌کند.

quick-execute برای preview موجود و تازه دوباره planner را اجرا نمی‌کند. preview مفقود را یک بار می‌سازد و سپس در همان درخواست صریح به PolicyGuard و connector می‌رود. موفقیت نیازمند `connectorInvoked=true`، نتیجه واقعی connector و خروج موفق فرمان است؛ در غیر این صورت پاسخ خطای روشن می‌دهد.

trace ساخت‌یافته backend مراحل `action_execute_requested` تا `action_execution_succeeded/failed` را با شناسه plan/catalog/template/device، intent، connector، فرمان امن و کوتاه‌شده، exit code و طول stdout/stderr ثبت می‌کند؛ secretها در remote-command preview حذف می‌شوند.

## حالت آزمایشگاه unrestricted

با `quick_controlled` و `ACTION_ALLOW_LAB_UNRESTRICTED_MANAGEMENT=true` همان یک کلیک «تأیید و اجرا» برای template ثبت‌شده کافی است. ریسک بالا، destructive بودن یا rollback دستی باعث تبدیل action پشتیبانی‌شده به manual نمی‌شود. device، credential، پارامتر معتبر، template، connector، audit و نتیجه واقعی همچنان الزامی‌اند و متن shell آزاد AI هرگز اجرا نمی‌شود.

AI ابتدا intent را به catalog نگاشت می‌کند. عملیات Linux برای حذف/افزودن کاربر sudo، بررسی گروه‌ها، قفل و بازکردن قفل با username معتبر connector-backed هستند. ActionPlan حاصل metadata کامل catalog دارد و از همان preview → quick-execute → connector → result مسیر دستور آماده استفاده می‌کند.

ساخت plan هیچ اجرایی انجام نمی‌دهد. Action Center شناسه query یا event داخلی را می‌خواند و plan جدید را خودکار باز می‌کند.

## resolution در quick-execute

1. ابتدا `metadata.catalogCommandId` بررسی می‌شود.
2. برای plan قدیمی فقط نگاشت یکتای امن `actionType` به implemented item مجاز است.
3. state باید `implemented`، support باید `connector` و template باید در registry باشد.
4. action type، vendor، device connector و required params دوباره بررسی می‌شوند.
5. سپس PolicyGuard، dry-run، confirmation، connector و audit موجود اجرا می‌شوند.

manualOnly/planned/unsupported دکمه اجرای خودکار ندارند و backend نیز اجرای مستقیم آن‌ها را با دلیل فارسی رد می‌کند.

## افزودن دستور یا vendor

1. vendor را در `CommandVendor` ثبت کنید.
2. آیتم را با شناسه پایدار انگلیسی، متن فارسی، intent و پارامترهای صریح اضافه کنید.
3. فقط وقتی action type در Prisma، execution registry، planner و connector واقعی وجود دارد state را `implemented` و `executionTemplateRef` را تنظیم کنید.
4. precheck، verification و rollback را متناسب با ریسک بنویسید.
5. تست جست‌وجوی فارسی، فیلتر vendor و ساخت ActionPlan را اضافه کنید.
6. `npm run validate:command-catalog`، build و کل test suite را اجرا کنید.
7. integration test بسازید که create metadata، quick-execute resolution، device compatibility و Action Center handoff را پوشش دهد؛ هیچ executable item نباید `ACTION_NOT_IN_CATALOG` بگیرد.

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
