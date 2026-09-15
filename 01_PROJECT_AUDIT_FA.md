# گزارش جامع بررسی پروژه

## جمع‌بندی مدیریتی

پروژه از نظر قابلیت‌ها غنی است، اما تجربه کاربر به‌خاطر چند جریان موازی، داده‌های ناقص، وضعیت‌های مصنوعی و پیوند ضعیف بین صفحات، حس «محصول یکپارچه» نمی‌دهد. مشکل اصلی کمبود Feature نیست؛ مشکل این است که Featureها مانند جزیره‌های جدا از هم کار می‌کنند.

سه ریشه اصلی مشکل:

1. **Connector سیسکو برای دستگاه واقعی شکننده است.** اجرای دستور با `ssh2.exec()` انجام می‌شود، درحالی‌که بسیاری از Cisco IOS/IOS-XEها به Shell تعاملی، PTY، همگام‌سازی Prompt و خاموش‌کردن Paging نیاز دارند.
2. **Onboarding به‌جای یک Wizard هدایت‌شده، مجموعه‌ای از دکمه‌های مستقل است.** کاربر مجبور است چند مرحله را دستی و با آگاهی از State داخلی انجام دهد.
3. **بعد از ثبت دستگاه، Workspace داده واقعی کافی ندارد.** دستگاه به‌شکل مصنوعی `online` می‌شود، اما Snapshot، Health، Capability Cache و Inventory کامل ذخیره نمی‌شود.

---

## 1. مشکل اتصال و ثبت Cisco

### 1.1 Connector فعلی Exec-based است، نه Shell-based

فایل اصلی:

- `backend/src/connectors/cisco/ios-xe/cisco-iosxe.ssh.connector.ts`

مشکل‌ها:

- برای هر Command از `client.exec(command)` استفاده می‌شود.
- `client.shell()` و PTY استفاده نمی‌شود.
- `terminal length 0` ارسال نمی‌شود.
- Paging مانند `--More--` مدیریت نمی‌شود.
- Promptهای `>` و `#` همگام‌سازی نمی‌شوند.
- فایل `cisco-iosxe.prompt.ts` شامل ابزارهای Prompt است، اما در Connector استفاده نمی‌شود.
- Enable mode/enable secret پشتیبانی نمی‌شود.
- Keyboard-interactive، keepalive و پروفایل سازگاری الگوریتم‌های قدیمی وجود ندارد.
- خطاها فقط به Auth، Timeout یا Generic تقلیل پیدا می‌کنند و مرحله واقعی شکست مشخص نمی‌شود.

نتیجه: ممکن است IP، Port و Credential درست باشند، اما کانال Command روی دستگاه واقعی شکست بخورد. کاربر همه این حالت‌ها را فقط «اتصال ناموفق» می‌بیند.

### 1.2 IOS Classic و NX-OS به اشتباه شبیه خطای اتصال دیده می‌شوند

- Parser می‌تواند `cisco-ios-classic` و `cisco-nx-os` را تشخیص دهد.
- اما Onboarding فقط `cisco-ios-xe` را Supported می‌داند.
- اگر اتصال موفق باشد ولی Platform کلاسیک یا NX-OS باشد، جریان به `platform_unsupported` می‌رود.

این حالت باید با پیام روشن نمایش داده شود:

> اتصال SSH موفق است، ولی این Platform فعلاً توسط مسیر IOS-XE پشتیبانی نمی‌شود.

نه اینکه کاربر تصور کند Credential یا Connector خراب است.

### 1.3 Evidence اتصال در Catch خراب می‌شود

در `device-onboarding.service.ts` هنگام شکست:

- `connectorInvoked` به `false` بازنویسی می‌شود، حتی اگر Connector واقعاً اجرا شده باشد.
- Stage، Error code، retryability و remediation از بین می‌روند.
- Frontend فقط یک رشته خطا دریافت می‌کند.

### 1.4 Connection success به‌درستی اعتبارسنجی نمی‌شود

اتصال موفق با وجود یک Result object تشخیص داده می‌شود، نه با بررسی دقیق:

- exit code
- stdout معتبر
- stderr
- Prompt completion
- Platform evidence

### 1.5 Sessionهای Onboarding فقط در RAM هستند

`const sessions = new Map(...)`

پیامدها:

- با Restart سرور همه Sessionها از بین می‌روند.
- در چند Instance ناسازگار است.
- Resume واقعی وجود ندارد.
- Audit trail ناقص می‌شود.

---

## 2. مشکل تجربه کاربری Onboarding

فایل اصلی:

- `src/features/assets/pages/DeviceOnboardingPage.tsx`

مشکل‌ها:

- Stepper چهارده مرحله نشان می‌دهد، اما صفحه عملاً یک فرم و چند دکمه مستقل است.
- کاربر باید دستی این مراحل را اجرا کند:
  - Save
  - Test
  - Detect
  - Discover
  - Preview
  - Commit
- دکمه‌ها بر اساس State سرور فعال می‌شوند، نه Dirty state فرم.
- اگر کاربر Host، Port یا Credential را ویرایش کند و بدون Save دوباره Test بزند، ممکن است Backend مقادیر قدیمی را تست کند.
- بعد از ساخت Credential جدید فقط فرم محلی تغییر می‌کند؛ Session سرور Sync نمی‌شود.
- Frontend status type حالت‌های `credential_missing` و `credential_invalid` را ندارد، ولی Backend آن‌ها را تولید می‌کند.
- متن‌ها مخلوط فارسی، انگلیسی و Debug هستند.
- نتیجه خطا Progressive و قابل‌اقدام نیست.
- بعد از Commit از `window.location.assign` استفاده می‌شود و Success experience ضعیف است.
- `DeviceRegistryPanel.tsx` ظاهراً استفاده نمی‌شود و نشانه وجود جریان‌های قدیمی/موازی است.

راه‌حل محصولی: یک Primary CTA با عنوان «ادامه» که بر اساس State، مرحله بعدی را انجام دهد و فقط در نقاط حساس تأیید بگیرد.

---

## 3. مشکل Workspace بعد از ثبت دستگاه

فایل اصلی:

- `backend/src/services/device-workspace.service.ts`

### 3.1 تشخیص Vendor برای Cisco اشتباه است

`vendorKey` ابتدا `device.type` را می‌خواند. Cisco هنگام ثبت به‌عنوان `generic_firewall` ذخیره می‌شود؛ بنابراین Workspace هرگز وارد شاخه `vendorKey === "cisco"` نمی‌شود.

نتیجه: بخش‌های اختصاصی Cisco نمایش داده نمی‌شوند.

### 3.2 داده‌های Workspace ذخیره نمی‌شوند

Onboarding بعد از Commit این موارد را به‌صورت واقعی و کامل Persist نمی‌کند:

- DeviceStatusCheck
- HealthSnapshot
- CollectionRun
- DeviceCapabilityCache
- DeviceSnapshot/Inventory
- Interface/VLAN/Route summaries

در عوض `initialHealth: online` ساخته می‌شود. این وضعیت نباید بدون Evidence واقعی تولید شود.

### 3.3 Platform در Asset اشتباه ثبت می‌شود

`asset-intelligence.service.ts` Platform را از `device.type` می‌گیرد؛ برای Cisco نتیجه `generic_firewall` می‌شود، نه `cisco-ios-xe`.

### 3.4 وضعیت Pending Actionها ناسازگار است

Workspace از Statusهای قدیمی استفاده می‌کند:

- `pending_approval`
- `rollback_pending`

درحالی‌که Statusهای فعلی سیستم عبارت‌اند از:

- `awaiting_approval`
- `rollback_needed`

پس شمارش Actionهای در انتظار ممکن است غلط باشد.

---

## 4. مشکل گردش‌کار AI و Action Center

فایل‌های اصلی:

- `src/components/ai/AiSecurityAssistantPanel.tsx`
- `src/components/actions/ActionCenterPanel.tsx`
- `src/components/actions/ActionResultView.tsx`
- `src/lib/actionPlanHandoff.ts`
- `src/lib/actionResultNavigation.ts`

مشکل‌ها:

- AI اطلاعات Debug زیادی مانند `intentType`، `deviceId` و JSON پارامترها را مستقیماً به کاربر نشان می‌دهد.
- کلیک روی Action کاربر را به Action Center می‌برد، ولی Review به‌شکل Modal بسیار بزرگ و شلوغ باز می‌شود.
- در لیست Action Center دکمه Execute مستقیم وجود دارد و Review را دور می‌زند.
- پس از Execute، نتیجه با `window.open` در تب جدید باز می‌شود؛ Popup blocker می‌تواند آن را مسدود کند.
- چند مسیر متفاوت برای یک کار وجود دارد:
  - AI → Action Center
  - List → Execute مستقیم
  - Modal → Execute → New tab
- Result page وجود دارد، اما Polling و Timeline اجرای زنده ندارد.

راه‌حل: یک State machine واحد و قابل پیش‌بینی:

`Proposed → Review dialog → Confirm → Executing → Result page`

تمام ورودی‌ها، شامل AI، Guided Actions و Action Center، باید از همین مسیر استفاده کنند.

---

## 5. مشکل تست‌ها

- تست Onboarding، Cisco Connector را Mock می‌کند و خطاهای واقعی SSH را نمی‌بیند.
- تست Action Center بیشتر String assertion است، نه رفتار واقعی کاربر.
- یک Import شکسته وجود دارد:
  - `backend/test/task19-1-actionplan-revision.test.ts`
  - به `../src/connectors/device-connector.js` اشاره می‌کند، ولی Type اصلی در `connectors/types.ts` است.
- تستی برای Shell تعاملی، Paging، Prompt، Enable mode و Algorithm negotiation وجود ندارد.

---

## 6. مشکلات معماری و نگهداری

- چند فایل بسیار بزرگ و چندمسئولیتی وجود دارد:
  - `ActionCenterPanel.tsx` بیش از 1100 خط
  - `AiSecurityAssistantPanel.tsx` حدود 900 خط
  - `action-plan.service.ts` بیش از 1500 خط
- بیش از 250 نشانه TODO/Mock/Placeholder در پروژه دیده می‌شود.
- جریان‌های قدیمی و جدید هم‌زمان باقی مانده‌اند.
- Commit ثبت Device/Asset/Site/Location/Health به‌صورت یک Transaction اتمیک انجام نمی‌شود و امکان Partial state وجود دارد.

---

## اولویت اصلاح

1. Connector و Error contract سیسکو
2. Persistence و Transaction در Onboarding
3. UX Wizard با CTA واحد
4. Workspace واقعی بعد از ثبت
5. Action workflow واحد
6. تست‌های واقعی و E2E
7. پاک‌سازی کدهای Legacy و Refactor فایل‌های بزرگ
