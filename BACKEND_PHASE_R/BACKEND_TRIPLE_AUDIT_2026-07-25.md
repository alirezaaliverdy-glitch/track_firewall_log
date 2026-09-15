# ممیزی سه‌مرحله‌ای Backend پروژه track_firewall_log

تاریخ: 2026-07-25
فایل بررسی‌شده: `track_firewall_backend_review.zip`
اندازه ZIP: حدود 0.69 MB
تعداد فایل‌ها: 368 ورودی ZIP / 363 فایل واقعی پس از نرمال‌سازی مسیرها

## محدودیت مهم بررسی

این ZIP سورس Backend، تست‌ها و Prisma را دارد، اما ساختار بسته‌بندی آن یک ایراد دارد:

- فایل‌های `backend/src`، `backend/test` و `backend/prisma` در ریشه ZIP قرار گرفته‌اند.
- `backend/package.json` با `package.json` ریشه پروژه جایگزین شده است.
- Package manifest موجود مربوط به Frontend/Capacitor است و dependencyهای Backend مانند Fastify، Prisma، SSH2 و bcrypt را ندارد.
- Dockerfile موجود Backend است، ولی package.json موجود Frontend است.
- `docker-compose.firewall.yml` انتظار دارد Backend در `./backend` باشد، اما ZIP چنین پوشه‌ای ندارد.

بنابراین ممیزی ایستا کامل انجام شد، اما اجرای واقعی `pnpm build` و کل تست‌های Backend از روی همین ZIP ممکن نیست. تست اجرایی باید روی Worktree واقعی پروژه انجام شود.

---

# مرور اول: یکپارچگی، ساختار و قابلیت Build

## تست‌های اجراشده

1. CRC و سلامت تمام اعضای ZIP
2. بررسی Path Traversal
3. نرمال‌سازی مسیرهای Windows
4. بررسی Secret fileها و کلیدهای خصوصی
5. بررسی Relative importها
6. مقایسه External importها با package.json
7. بررسی Migrationها
8. بررسی سازگاری Dockerfile، Compose و Package manifest

## نتایج مثبت

- CRC فایل ZIP سالم است.
- Path traversal مشاهده نشد.
- فایل‌های زیر داخل ZIP نبودند:
  - `.env`
  - دیتابیس محلی
  - کلید خصوصی
  - PEM/PFX/P12
  - Storage و Backup
- تمام Relative importهای TypeScript به فایل موجود resolve می‌شوند.
- 242 فایل TypeScript در `src` و 78 فایل تست وجود دارد.
- 36 پوشه Migration شناسایی شد.

## ایرادهای این مرحله

### S0-1: Package manifest اشتباه است

سورس Backend این Dependencyها را import می‌کند، ولی در package.json موجود نیستند:

- `fastify`
- `@fastify/cookie`
- `@fastify/cors`
- `@fastify/helmet`
- `@fastify/multipart`
- `@prisma/client`
- `@prisma/adapter-pg`
- `pg`
- `ssh2`
- `bcryptjs`

این یعنی ZIP برای Build واقعی Backend self-contained نیست.

### S0-2: Dockerfile و package.json با هم ناسازگارند

Dockerfile این Scriptها را انتظار دارد:

- `prisma:generate`
- `build`
- `start`

اما package.json موجود این Scriptهای Backend را ندارد و متعلق به Frontend است.

### S0-3: یک Migration ناقص است

پوشه زیر وجود دارد ولی `migration.sql` ندارد:

```text
prisma/migrations/20260718110000_cisco_enable_secret/
```

این وضعیت می‌تواند `prisma migrate deploy` را متوقف کند.

### S0-4: Compose کامل داخل Bundle نیست

`docker-compose.firewall.yml` به فایل‌ها و مسیرهایی ارجاع می‌دهد که در ZIP نیستند:

- `./backend`
- `Dockerfile.frontend`
- `nginx.firewall-main.conf`

این مورد برای ممیزی Backend قابل قبول است، اما Bundle فعلی برای تست Compose کامل مناسب نیست.

## نتیجه مرور اول

- سلامت Archive: PASS
- Secret file exclusion: PASS
- Relative import integrity: PASS
- Build reproducibility از روی ZIP: FAIL
- Migration completeness: FAIL

---

# مرور دوم: امنیت، ActionPlan و صحت اجرای دستور

## نقاط قوت تأییدشده

### Auth و Session

- Session token تصادفی 32 بایتی است.
- Token خام در DB ذخیره نمی‌شود؛ HMAC ذخیره می‌شود.
- Idle timeout و Absolute expiration وجود دارد.
- Password با bcrypt cost 12 ذخیره می‌شود.
- Cookie و CSRF از هم جدا هستند.

### CSRF و Authorization

- Mutationها به‌صورت deny-by-default محافظت می‌شوند.
- 86 Mutation route شناسایی شد.
- 85 مورد در Permission policy ثبت شده‌اند.
- تنها مورد خارج از Policy، `/api/auth/login` است که عمداً Public و CSRF-exempt است.
- High/Critical execution به Permission قوی‌تر نیاز دارد.

### Credential encryption

- AES-256-GCM
- IV تصادفی
- Authentication tag
- عدم بازگرداندن Secret خام از API

### Command execution

- `eval` یا `new Function` وجود ندارد.
- Nmap با `spawn(..., { shell:false })` اجرا می‌شود.
- Command timeout و برخی Output limitها وجود دارند.
- Raw AI مستقیماً Connector را اجرا نمی‌کند.

## ایرادهای بحرانی

### R0-1: SSH Host Key Verification وجود ندارد

در Connectorهای زیر `hostVerifier` یا Fingerprint pinning وجود ندارد:

- Cisco
- MikroTik
- FortiGate
- Linux
- Linux log collector

اثر: حمله MITM و جعل تجهیزات شبکه.

اصلاح لازم:

```text
unknown host key
→ نمایش SHA-256 fingerprint
→ تأیید صریح
→ ذخیره Pin
→ اتصال بعدی فقط با همان Pin
→ mismatch = hard failure
→ replacement = workflow جدا + audit
```

### R0-2: Audit قبل از Persist شدن Redact نمی‌شود

در:

```text
src/actions/action-plan/action-plan.shared.ts
```

تابع `audit()` مقدار Metadata را مستقیماً با `toJson(metadata)` ذخیره می‌کند.

در پایان Execution نیز `resultPayload` شامل stdout و stderr داخل Audit ثبت می‌شود.

Action Center هنگام نمایش Sanitization انجام می‌دهد، اما این کار بعد از ذخیره شدن داده در DB است.

### R0-3: Logger redaction محدود است

فقط این Headerها حذف می‌شوند:

- Authorization
- Cookie

Body، Query، Command output، PSK، Private key و Vendor secretها پوشش عمومی ندارند.

## ایرادهای ActionPlan

### R1-1: Provider-first normalization ناقص است

در:

```text
src/ai/custom-action-plan.ts
```

وقتی Provider Command آماده می‌دهد، Commands از Provider گرفته می‌شوند؛ اما این موارد از Fallback ساده می‌آیند:

- `missingFields`
- `riskLevel`
- بخش‌هایی از `typedParameters`
- fallback verification
- fallback rollback

این Merge می‌تواند Plan معتبر ACL/OSPF/BGP را با Missing Field نامربوط Non-executable کند.

### R1-2: Custom policyها هنوز allowlist محدود هستند

- Cisco: محدود به چند Command پایه و VLAN
- Linux: تقریباً فقط systemctl و ufw
- MikroTik: چند Root محدود
- FortiGate: بر اساس شروع خط، بدون Context state machine کامل

نبودن Action در Catalog نباید دلیل رد شدن Command معتبر باشد.

### R1-3: Vendor permission فقط Metadata است

Policyها Permissionهایی مانند موارد زیر تولید می‌کنند:

- `actions.custom.cisco`
- `actions.custom.linux`
- `actions.custom.mikrotik`
- `actions.custom.fortigate`

اما این‌ها عضو Type رسمی Permission نیستند و Route اجرا آن‌ها را Enforce نمی‌کند.

### R1-4: Maker-checker وجود ندارد

Operator می‌تواند:

- پیشنهاد بدهد
- تأیید کند
- اجرا کند

برای Write Actionهای Medium/High/Critical باید Self-approval در Backend ممنوع شود.

### R1-5: Backup عملاً غیرفعال است

در چندین مسیر:

```text
backupEnabled: false
requiresBackup = false
```

ثبت شده است.

این با Risk model و Rollback/Backup metadata پروژه ناسازگار است.

### R1-6: Verification evidence واقعی شمارش نمی‌شود

`verificationEvidenceCount` بر اساس وجود یک Object در `rollbackJson.verification` به صفر یا یک تبدیل می‌شود؛ نه بر اساس Evidenceهای واقعی و Typed.

### R1-7: Production validation ناقص است

Hardening فقط وقتی فعال می‌شود که:

```text
NODE_ENV=production
```

باشد.

اگر `APP_PROFILE=production` و `NODE_ENV` اشتباه باشد، Secret validation اجرا نمی‌شود.

### R1-8: CORS در Production هم Originهای Development را Merge می‌کند

Originهای زیر همیشه اضافه می‌شوند:

- localhost
- 127.0.0.1
- یک IP داخلی ثابت

در Production باید فقط Originهای صریح پذیرفته شوند.

## نتیجه مرور دوم

- Auth/CSRF base: PASS
- Mutation permission coverage: PASS
- SSH trust security: FAIL
- Audit secret safety: FAIL
- Custom Action correctness: FAIL
- Approval separation: FAIL
- Backup enforcement: FAIL

---

# مرور سوم: Reliability، Performance، Data و Test Confidence

## یافته‌های Reliability

### R2-1: Rate limit و Execution lock فقط In-memory هستند

در:

```text
src/security/rate-limit.ts
```

از Map و Set محلی استفاده شده است.

اثر:

- Restart همه stateها را پاک می‌کند.
- چند Replica یک Lock مشترک ندارند.
- Duplicate execution ممکن است.
- Lock بر اساس user/path است، نه Device/Plan سراسری.

### R2-2: Job queue Durable نیست

در:

```text
src/services/worker.service.ts
```

Job با `setImmediate()` اجرا می‌شود.

اثر:

- Crash یا Restart باعث از دست رفتن Job می‌شود.
- Retry، Lease، Dead-letter و startup reconciliation وجود ندارد.

### R2-3: Telemetry append هزینه O(n) دارد

در هر Append:

1. کل فایل خوانده می‌شود.
2. تمام Eventها Parse می‌شوند.
3. کل فایل دوباره نوشته می‌شود.

Fallback ویندوز نیز می‌تواند Retention limit را دور بزند.

### R2-4: Action Center Audit را Hard-delete می‌کند

`clearActionCenterHistory()` رکورد ActionPlan را Delete می‌کند.

با Cascade، Approval و Audit نیز حذف می‌شوند.

برای محصول امنیتی باید Archive/Retention باشد، نه حذف کامل Evidence.

### R2-5: Migration هنگام Start سرویس اجرا می‌شود

Dockerfile:

```text
pnpm prisma migrate deploy && pnpm start
```

در چند Replica بهتر است Migration Job جدا باشد.

## Data model

### نقاط قوت

- ActionPlan، Approval و Audit مدل جدا دارند.
- Session token hash شده است.
- Indexهای متعدد وجود دارد.
- 50 مدل Prisma و 36 Migration نشان‌دهنده Domain نسبتاً کامل است.

### مشکلات

- تعداد زیاد فیلد JSON بدون Schema version و Upcaster
- خطر Drift بین `status` و JSON metadata
- Retention/partitioning برای Metric، Audit و Security Event مشخص نیست
- Empty migration folder

## Test confidence

- تعداد تست‌ها: 78
- تست‌هایی که Source file را با Regex/Includes بررسی می‌کنند: حدود 48
- تست‌هایی با نشانه رفتار Runtime/DB/API: حدود 30

Source-contract test مفید است، اما Compile، Runtime و Failure behavior را ثابت نمی‌کند.

برای مسیرهای حیاتی لازم است:

- API integration
- Prisma integration
- SSH fixture server
- Host-key mismatch
- Timeout/cancel
- Secret leakage negative test
- Crash/restart queue test
- Multi-replica idempotency
- Android native compile
- iOS compile روی macOS

## فایل‌های بزرگ و نیازمند Refactor

- Linux SSH connector: حدود 945 خط
- ActionPlan shared: حدود 869 خط
- Assistant conversation service: حدود 858 خط
- AI intent service: حدود 855 خط
- Device onboarding: حدود 803 خط
- MikroTik connector: حدود 803 خط

این فایل‌ها چند مسئولیت را هم‌زمان حمل می‌کنند و احتمال Regression را بالا می‌برند.

## چند Source of Truth برای Actionها

هم‌زمان این Registryها وجود دارند:

- Action catalog
- Vendor catalog
- Command catalog
- Guided action registry
- FortiGate/MikroTik catalogهای جدا
- Execution template registry
- Vendor compilerها

لازم است یک `ActionDefinition` Canonical منبع همه آن‌ها شود.

## نتیجه مرور سوم

- Domain richness: PASS
- Single-process lab reliability: PASS
- Multi-replica production reliability: FAIL
- Audit retention: FAIL
- Queue durability: FAIL
- Test confidence برای Critical path: PARTIAL
- Maintainability: PARTIAL

---

# جمع‌بندی نهایی

## آمادگی فعلی

- Lab/Staging: حدود 7/10
- Production: حدود 4.5/10
- Backend architecture: حدود 7.5/10
- SSH security: حدود 3.5/10
- Test confidence: حدود 5.5/10

## ترتیب صحیح ادامه

```text
R0: امنیت فوری
→ R1: صحت Action execution
→ R2: Reliability و Scale
→ R3: Refactor و یکپارچه‌سازی Catalog
→ M10 / Production release
```

تا پایان R0 و R1، Feature جدید یا Production launch توصیه نمی‌شود.

---

# سه تست اجرایی که باید روی Worktree واقعی انجام شوند

## Pass A: Baseline

از مسیر:

```text
C:\Users\SurfaceLand\Desktop\track_firewall_log
```

- Frontend build
- Backend build
- Prisma validate
- Migration status روی DB ایزوله
- Full isolated tests
- git diff --check

## Pass B: Security Negative Tests

- Unknown SSH fingerprint
- Changed SSH fingerprint
- Secret in command/output/audit
- Self approval
- APP_PROFILE production با NODE_ENV اشتباه
- Production CORS
- High/Critical without backup
- Approval replay after plan mutation

## Pass C: Reliability Tests

- Duplicate execution
- Two backend replicas
- Restart during queued job
- Restart during Action execution
- Telemetry retention under load
- Audit archive
- DB-side pagination
- Migration deployment from clean DB

این سه Pass باید بعد از هر زیرمرحله R0، R1 و R2 مجدداً اجرا شوند.
