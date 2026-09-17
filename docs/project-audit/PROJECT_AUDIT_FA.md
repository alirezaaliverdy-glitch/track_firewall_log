# ممیزی جامع پروژه Track Firewall Log

**دامنه ممیزی:** فایل `track_firewall_log_review(3).zip`
**نوع ممیزی انجام‌شده:** بررسی کامل ایستا و قراردادی سورس فرانت، بک‌اند، Prisma، migrationها، Routeها، state registry، جریان ثبت دستگاه، تنظیمات runtime و فایل‌های مستندات.
**هشدار مهم:** این ZIP با کدی که در آخرین اسکرین‌شات روی لپ‌تاپ باز بود کاملاً یکسان نیست. در ZIP، فایل `backend/src/config/database-url.ts` فقط `localhost` را به `127.0.0.1` تبدیل می‌کند؛ اما در اسکرین‌شات جدید، همین فایل دارای `ACTIVE_LOCAL_PORT` بود. بنابراین این گزارش معماری و snapshot ارسالی را دقیق بررسی می‌کند، ولی قبل از اعمال تغییر روی checkout فعلی باید اختلاف آن با ZIP مشخص شود.

---

## نتیجه نهایی

پروژه نابود نشده، اما از حالت «یک محصول با قرارداد مشخص» به مجموعه‌ای از milestoneها، placeholderها، alias routeها و stateهای متناقض تبدیل شده است. خرابی‌های زیاد یک علت منفرد ندارند؛ هشت مشکل هم‌زمان روی هم افتاده‌اند:

1. **هویت runtime و دیتابیس چند بار عوض شده است.**
2. **سه منبع جدا برای حقیقت مسیرها و قابلیت‌ها وجود دارد.**
3. **Router دستی و غیرواکنشی است.**
4. **بسیاری از Routeها فقط اسم جدا دارند و همان صفحه مشترک را نشان می‌دهند.**
5. **مدل `Device` و `Asset` دو خوانش متفاوت از یک تجهیز ساخته‌اند.**
6. **جریان ثبت دستگاه، «ذخیره اطلاعات» را با «ثبت نهایی دستگاه» اشتباه‌پذیر کرده است.**
7. **Migrationهای مشاهده‌پذیری با دیتابیس فعال همگرا نشده‌اند.**
8. **تست مرورگر به‌صورت شواهد دستی MCP انجام شده، نه تست تکرارپذیر داخل مخزن.**

اعداد خود پروژه هم این وضعیت را تأیید می‌کنند:

- **53 Route فرانت‌اند**
- **137 مسیر API یکتای قابل تشخیص در بک‌اند**
- **17 قابلیت implemented**
- **20 قابلیت partial**
- **13 قابلیت planned**
- **2 قابلیت not_configured**
- **1 قابلیت unverified**
- فقط **13 قابلیت** در ناوبری اصلی نمایش داده می‌شوند
- **34 migration**
- **31 فایل تست بک‌اند**
- **هیچ تست E2E تکرارپذیر فرانت در package.json وجود ندارد**

یعنی فقط حدود یک‌سوم Feature Registry واقعاً `implemented` علامت خورده و بقیه عمداً یا عملاً ناقص‌اند. پس نصفه‌نیمه دیده‌شدن صفحات فقط یک باگ ظاهری نیست؛ بخشی از آن مستقیماً در کد تعریف شده است.

---

# یافته‌های بحرانی

## P0-1. هویت دیتابیس و Runtime متناقض است

### شواهد

در `CODEX_HANDOFF.md` چند روایت ناسازگار هم‌زمان وجود دارد:

- `127.0.0.1:5432/firewall_log_analyzer`
- `127.0.0.1:55432/firewall_log_auth`
- یک PostgreSQL موقت در `.runtime/postgres-task20-auth`
- process-only `DATABASE_URL` override
- سپس ادعای اجرای عادی بدون override

در snapshot ارسالی:

- `backend/.env` به `localhost:5432/firewall_log_analyzer` اشاره می‌کند.
- PostgreSQL واقعی ویندوز طبق تست شما روی `5432` گوش می‌دهد.
- مستندات پروژه هنوز چندین بار پورت و دیتابیس موقت را به‌عنوان runtime سالم معرفی می‌کنند.

### چرا باعث ناپدیدشدن داده شد؟

هر بار که backend با یکی از این URLها بالا آمده، Prisma به دیتابیس دیگری وصل شده است. صفحه‌ای که روی دیتابیس خالی اجرا شده، طبیعی است صفر Device و Asset نشان دهد؛ داده پاک نشده بود، برنامه به جای دیگری نگاه می‌کرد.

### راه‌حل قطعی

- فقط **یک** `DATABASE_URL` معتبر در `backend/.env` وجود داشته باشد.
- هیچ کدی حق بازنویسی نام دیتابیس یا پورت را نداشته باشد.
- `.runtime` و دیتابیس‌های موقت از مسیر اجرای عادی حذف شوند.
- endpoint سلامت، fingerprint بدون رمز نشان دهد:
  - host
  - port
  - database
  - schema
  - current user
- startup در صورت اختلاف datasource بین Prisma و `pg.Pool` fail-fast شود.

---

## P0-2. فایل ZIP شامل Secret واقعی است

### شواهد

فایل‌های زیر داخل ZIP بودند:

- `.env.development`
- `backend/.env`

و `backend/.env` شامل کلیدهای حساس از جنس زیر است:

- AI API key
- SSH credentials
- credential encryption key
- admin password
- session secret

همچنین این کلیدها دوبار تعریف شده‌اند:

- `ADMIN_USERNAME`
- `ADMIN_PASSWORD`
- `ADMIN_DISPLAY_NAME`
- `AUTH_SESSION_SECRET`
- `AUTH_SESSION_TTL_HOURS`

در dotenv معمولاً مقدار آخر برنده می‌شود. بنابراین حتی خود برنامه هم ممکن است برخلاف چیزی که بالای فایل می‌بینی با مقدار پایین فایل اجرا شود. شاهکار کوچک دیگری از تمدن فایل‌های env.

### اقدام ضروری

- تمام Secretهای واقعی موجود در ZIP را rotate کن.
- `.env*` و `backend/.env*` در `.gitignore` و دستور ZIP ممنوع شوند.
- فقط `.env.example` با مقدارهای ساختگی نگه داشته شود.
- در startup وجود کلید تکراری env بررسی و خطا داده شود.

---

## P0-3. Router فرانت دستی، غیرواکنشی و مستعد نمایش صفحه اشتباه است

### شواهد

در `src/App.tsx`:

- `window.location.pathname` فقط هنگام render خوانده می‌شود.
- Router استانداردی وجود ندارد.

در `src/routes/appRoutes.tsx`:

- `matchRoute` دستی نوشته شده است.
- اگر Route پیدا نشود، به جای 404، **Dashboard** برگردانده می‌شود.

در چند کامپوننت:

- `window.history.pushState` استفاده شده است.
- هیچ listener سراسری برای `popstate` یا state router وجود ندارد.

در Sidebar:

- از `<a href>` استفاده می‌شود و navigation کامل مرورگر انجام می‌دهد.

### نتیجه عملی

- URL عوض می‌شود ولی صفحه عوض نمی‌شود.
- یک دکمه ظاهراً «کار نمی‌کند» چون `pushState` فقط آدرس را تغییر داده است.
- Back/Forward رفتار نامطمئن دارد.
- Route اشتباه به Dashboard می‌افتد و تست MCP ممکن است به غلط آن را موفق حساب کند.
- بعضی navigationها full reload و بعضی client-side ناقص هستند.

### راه‌حل

- مهاجرت کامل به `react-router-dom`.
- `BrowserRouter`, `Routes`, `Route`, `Navigate`, `Link`, `useNavigate`.
- حذف همه `window.history.pushState`های مستقیم.
- ساخت `NotFoundPage` واقعی.
- هر تست Route باید علاوه بر status، `pageId` یا heading مخصوص همان Route را assert کند.

---

## P0-4. ZIP ارسالی با Checkout فعلی یکسان نیست

### شواهد

فایل `backend/src/config/database-url.ts` در ZIP، خط `ACTIVE_LOCAL_PORT` ندارد؛ اما در آخرین تصویر شما همین خط وجود داشت و از `55432` به `5432` تغییر کرده بود.

### پیامد

- گزارش Codex ممکن است درباره یک commit باشد.
- مرورگر ممکن است از Vite یک commit دیگر سرو شود.
- backend در process قدیمی از کد قبلی اجرا شود.
- ZIP snapshot سوم را نشان دهد.

این دقیقاً فرمول تولید «من درستش کردم ولی هنوز خرابه» است.

### راه‌حل

قبل از هر تسک جدید، ثبت شود:

```powershell
git rev-parse HEAD
git status --short
netstat -ano | findstr ":4000 :5173 :5174"
```

و backend/frontend فقط از همان checkout و همان commit اجرا شوند.

---

# یافته‌های معماری اصلی

## P1-1. سه منبع حقیقت برای Feature و Route وجود دارد

سه جای جداگانه وضعیت محصول را تعیین می‌کنند:

1. `src/routes/appRoutes.tsx`
2. `backend/src/product-state/product-state.registry.ts`
3. Routeهای واقعی Fastify در backend

این سه فایل از هم تولید نمی‌شوند و تست parity جامع ندارند.

### نمونه روشن

`tools.nmap` در Product Registry چنین ثبت شده:

- `planned`
- `backendReady=false`
- `apiReady=false`

ولی در سورس واقعی:

- route `/api/diagnostics/nmap` وجود دارد.
- worker و service مربوط به Nmap وجود دارد.
- UI اجرای Nmap دارد.

پس Navigation و Badge محصول ممکن است بگوید «planned» در حالی که implementation وجود دارد.

### راه‌حل

یک manifest مشترک TypeScript بساز:

```ts
FeatureManifest {
  key,
  route,
  component,
  apiContracts,
  navigation,
  readinessProbe,
  state
}
```

- Frontend routes، backend product-state و navigation از همین manifest تولید شوند.
- CI بررسی کند هیچ Route بدون Feature و هیچ Feature بدون Route نباشد.
- `tested` و `lastVerifiedAt` به صورت hard-code ذخیره نشوند؛ از نتیجه CI یا runtime capability probe بیایند.

---

## P1-2. Routeهای زیادی فقط Alias ظاهری‌اند

کامپوننت‌های مشترک بیش‌ازحد:

- `ToolsPage`: **13 Route**
- `DeviceOnboardingPage`: **4 Route**
- `MonitoringPage`: **4 Route**
- `ActionsPage`: **4 Route**
- `CiscoOverviewPage`: **3 Route**
- `IntegrationsPage`: **3 Route**

استفاده مشترک ذاتاً بد نیست، اما این صفحات غالباً route contract جدا ندارند.

### موارد مشخص

#### Actions

`/actions`, `/actions/pending`, `/actions/history`, `/actions/:actionId` همگی `ActionsPage` را نمایش می‌دهند. فقط `actionId` مصرف می‌شود؛ pending و history فیلتر تخصصی ندارند.

#### Monitoring

`/monitoring`, `/monitoring/devices`, `/monitoring/devices/:deviceId`, `/monitoring/daily-check` همان `MonitoringPage` را نشان می‌دهند. پارامتر Device و نوع Route عملاً مصرف نمی‌شود.

#### Cisco

`/assets/vendors/cisco` و `/assets/vendors/cisco/devices` همان overview را نشان می‌دهند. مسیر Devices صفحه inventory مستقل نیست.

#### Tools

تقریباً همه مسیرهای ابزار همان Diagnostic عمومی را اجرا می‌کنند. تنها Nmap واقعاً branch جدا دارد. بنابراین `traceroute`, `ip-info`, `subnet`, `monitors` صفحه تخصصی واقعی ندارند.

### نتیجه

Route باز می‌شود، status 200 است، console هم تمیز است، اما کاربر محتوای مرتبط با همان Route را نمی‌بیند. این همان «صفحه نصفه آمده» است.

### راه‌حل

برای هر Route یکی از این دو تصمیم لازم است:

- قرارداد صفحه مستقل و واقعی بساز.
- یا Route را حذف/redirect کن و در UI ادعا نکن قابلیت مستقلی است.

---

## P1-3. Placeholderهای Planned عمداً داخل کد هستند

هفت Route مستقیماً با `PlannedState` ساخته شده‌اند:

- Sites
- Networks/VLAN
- Topology
- Security Events
- Rule Detail
- Connector Health
- Guided Actions

Settings نیز فقط Placeholder است.

پس دیدن `planned` باگ CSS نیست. کد صراحتاً محصول ناقص را به کاربر نشان می‌دهد.

### راه‌حل

در نسخه قابل ارائه:

- Route planned از navigation و dashboard حذف شود.
- اگر لازم است roadmap دیده شود، در صفحه جدا با عنوان «نقشه راه» نمایش داده شود.
- هیچ دکمه عملیاتی نباید به PlannedState برسد.

---

## P1-4. Navigation کاملاً به Backend وابسته است

`AppShell` در startup از `/api/product-state/navigation` داده می‌گیرد. در صورت خطا:

- navigation خالی می‌شود.
- فقط fallback Dashboard نشان داده می‌شود.

این دلیل گم‌شدن «ثبت دستگاه» هنگام CORS، Auth یا Database failure بوده است.

### راه‌حل

- یک navigation پایه static داخل frontend داشته باش.
- backend فقط قابلیت‌های dynamic را enrich کند.
- شکست product-state نباید کل منو را ناپدید کند.
- خطا به صورت banner نشان داده شود، نه حذف silent منو.

---

## P1-5. Frontend API و CORS برای Development بی‌جهت Cross-Origin شده‌اند

در `.env.development`:

```env
VITE_API_BASE_URL=http://localhost:4000/api
```

در حالی که `vite.config.ts` از قبل proxy دارد.

### نتیجه

هر بار که Vite از 5173 به 5174 می‌رود، CORS origin باید تغییر کند. این همان علت شکست‌های login/preflight قبلی است.

### راه‌حل

- در local development از relative path استفاده شود:

```env
VITE_API_BASE_URL=/firewall-api
```

- Vite proxy آن را به `127.0.0.1:4000` بفرستد.
- Vite با `--port 5173 --strictPort` اجرا شود.
- هم‌زمان فقط یک frontend process مجاز باشد.

---

# علت ناقص‌بودن داده‌ها

## P1-6. دو مدل `Device` و `Asset` باعث Split-Brain داده شده‌اند

Prisma هم `Device` دارد و هم `Asset`، با یک رابطه optional یک‌به‌یک:

- صفحات اتصال، connector و onboarding بیشتر `Device` را می‌خوانند.
- صفحات inventory و asset بیشتر `Asset` را می‌خوانند.
- monitoring به Device و جداول observability وابسته است.
- onboarding بعد از ساخت Device، جداگانه `syncDeviceToAsset` را اجرا می‌کند.

### سناریوهای خرابی

- Device ساخته شده ولی Asset sync شکست خورده است.
- Asset قدیمی وجود دارد ولی Device link ندارد.
- Device نوع Linux دارد ولی HealthSnapshot migration یا داده اولیه ندارد.
- `/api/assets` رکورد نشان می‌دهد ولی `/api/monitoring/linux/summary` صفر است.

### راه‌حل

- `Device` منبع اصلی Connection/Control باشد.
- `Asset` projection موجودی آن باشد.
- ایجاد یا ویرایش Device و Asset در یک transaction انجام شود.
- invariant دیتابیس:
  - هر Device دقیقاً یک Asset مرتبط داشته باشد.
- یک repair command idempotent ساخته شود:
  - orphan Device → create/link Asset
  - orphan Asset قابل تطبیق → link Device
  - گزارش موردهای ambiguous بدون تغییر خودکار

---

## P1-7. Migrationهای Observability با Runtime همگرا نشده‌اند

آخرین migration جداول زیر را اضافه می‌کند:

- HealthSnapshot
- CollectionRun
- DeviceCapabilityCache
- سایر داده‌های observability

Product Registry خودش نوشته است Linux Monitoring برای persisted refresh به migration pending نیاز دارد.

### نتیجه

ممکن است API با status 200 جواب دهد، ولی به حالت degraded یا empty برود. پس `200` به معنای سالم‌بودن محصول نیست.

### راه‌حل

- از دیتابیس اصلی backup بگیر.
- `prisma migrate status` را با migration table و schema واقعی reconcile کن.
- migrationهای واقعاً اعمال‌شده را مشخص کن.
- فقط migration pending واقعی deploy شود.
- fallback «table موجود نیست، آرایه خالی بده» فقط برای startup اضطراری باشد، نه رفتار عادی محصول.
- readiness باید `schemaReady` جداگانه گزارش کند.

---

# ثبت دستگاه چرا کاربر را گمراه می‌کند؟

## P1-8. «ذخیره اطلاعات» فقط Answers را ذخیره می‌کند

در صفحه Onboarding دکمه اصلی فرم:

```text
ذخیره اطلاعات
```

فقط endpoint `/answers` را صدا می‌زند.

ثبت واقعی Device بعد از این مراحل رخ می‌دهد:

1. answers
2. test-connection
3. detect-platform
4. discover
5. build-preview
6. commit

این دقیقاً با لاگ‌هایی که فرستادی مطابقت دارد: `/answers` برابر 200 بود، اما Device ساخته نمی‌شد.

### مشکل دوم

Sessionهای onboarding در یک `Map` حافظه‌ای نگه‌داری می‌شوند و بعد از restart backend از بین می‌روند.

### راه‌حل UX و Backend

- نام دکمه شود: **ذخیره مرحله و ادامه**.
- یک دکمه اصلی state-aware داشته باشد که مرحله بعدی را اجرا کند.
- مراحل پیشرفته همچنان قابل مشاهده باشند، ولی جریان عادی یک‌دکمه‌ای باشد.
- Session در دیتابیس ذخیره شود.
- commit در transaction انجام شود:
  - Device
  - Asset
  - Site/Location references
  - initial health snapshot
  - audit record
- موفقیت فقط وقتی نمایش داده شود که Device row و Asset link هر دو ثبت شده باشند.
- سپس toast متحرک و redirect به `/assets/devices/:deviceId`.

---

# تست و کیفیت

## P1-9. تست‌های MCP شواهد دستی‌اند، نه Regression Suite

مخزن شامل screenshot و گزارش MCP زیادی است، اما root `package.json` هیچ تست Playwright ندارد.

### مشکل

یک Agent می‌تواند بنویسد «Route باز شد، console error صفر» ولی:

- Route ناشناخته شاید به Dashboard fallback شده باشد.
- صفحه alias باز شده ولی محتوای تخصصی ندارد.
- دیتابیس test بین فایل‌ها shared است.
- خود مستندات می‌گویند تست‌ها در حالت parallel nondeterministic هستند.

### راه‌حل

Playwright Test واقعی داخل repository اضافه شود:

- تمام 53 Route
- فارسی و انگلیسی
- Desktop و Mobile
- assert روی heading/page identity
- assert روی API contract
- assert روی empty/error/loading state
- تست click دکمه‌های dashboard
- تست کامل Onboarding با connector mock و یک integration target کنترل‌شده

Backend testها:

- برای هر test suite schema/database جدا.
- اجرای parallel بدون shared-state race.
- test migration از DB خالی تا آخرین schema.

Gate نهایی:

```text
lint
build
unit
api-contract
migration-test
playwright-e2e
route-parity
locale-parity
utf8
```

هیچ commit milestone نباید بدون این gate کامل شود.

---

# مشکل گزارش‌ها و حافظه پروژه

## P2-1. مستندات قدیمی تبدیل به دستورهای متناقض برای Codex شده‌اند

`CODEX_HANDOFF.md` بسیار طولانی است و runtimeهای متضاد را کنار هم نگه داشته است. فایل‌های Task 18، 19 و 20 نیز هم‌زمان در ریشه هستند.

### نتیجه

Codex در هر اجرا ممکن است یک بخش قدیمی را به‌عنوان وضعیت فعلی بخواند و همان خرابی را دوباره زنده کند.

### راه‌حل

فقط این سه فایل فعال بماند:

- `docs/CURRENT_STATUS.md`
- `docs/ARCHITECTURE_DECISIONS.md`
- `CODEX_HANDOFF.md` کوتاه، حداکثر 100 خط

بقیه به `docs/archive/YYYY-MM/` منتقل شوند و در AGENTS صراحتاً نوشته شود که archive منبع اجرای فعلی نیست.

---

# بررسی Routeها

ماتریس کامل هر 53 Route در فایل‌های همراه آمده است:

- `ROUTE_CONTRACT_MATRIX.md`
- `ROUTE_CONTRACT_MATRIX.csv`

### جمع‌بندی Routeها

- Routeها عموماً از نظر نام وجود دارند.
- مشکل اصلی «404 API گسترده» نیست.
- مشکل اصلی این‌هاست:
  - contract ناقص
  - alias component
  - state registry متناقض
  - navigation پنهان
  - router دستی
  - fallback اشتباه به Dashboard
  - datasource متفاوت بین صفحه‌ها

---

# ترتیب اصلاح پیشنهادی

## فاز 0: Freeze و حفاظت

1. commit فعلی و hash را ثبت کن.
2. tag بساز.
3. از PostgreSQL اصلی dump بگیر.
4. همه processهای frontend/backend را ببند.
5. فقط یک backend و یک frontend اجرا شود.
6. Secretهای موجود در ZIP rotate شوند.

## فاز 1: Runtime Convergence

- یک دیتابیس: `127.0.0.1:5432/<existing-db>`
- یک backend: 4000
- یک frontend: 5173 با strictPort
- relative API via Vite proxy
- runtime fingerprint در health endpoint
- حذف DB URL rewrite و temporary clusters

## فاز 2: Router Convergence

- React Router
- 404 واقعی
- حذف مستقیم pushState
- route identity
- route registry parity test

## فاز 3: Data Convergence

- Device/Asset invariant
- transaction sync
- orphan repair report
- migration reconciliation
- schemaReady health check

## فاز 4: Onboarding Convergence

- persistent session
- state-machine UI
- single primary continue button
- atomic commit
- success motion + redirect

## فاز 5: Page Contract Convergence

صفحه مستقل واقعی برای:

- Actions pending/history/detail
- Monitoring devices/detail/daily-check/connectors
- Cisco devices inventory
- Vendor health/workspace
- Tools traceroute/IP info/subnet/monitors
- Settings

Routeهای غیرقابل اجرا تا آن زمان از Navigation حذف شوند.

## فاز 6: Automated Acceptance

- Playwright Test داخل repo
- isolated backend test DB
- full route matrix
- CI gate

## فاز 7: Cleanup

- archive task docs
- حذف screenshots و dist از source archive
- `.env` خارج از ZIP/Git
- کوتاه‌کردن handoff

---

# چیزهایی که واقعاً در این ممیزی بررسی شد

- تمام ساختار ZIP و فایل‌های پروژه
- 148 فایل TypeScript/TSX فرانت
- 174 فایل TypeScript بک‌اند
- 53 Route فرانت
- Feature Registry با 53 Feature
- 137 مسیر API یکتای قابل تشخیص
- 34 migration
- Prisma models و رابطه Device/Asset
- Onboarding frontend/backend
- Navigation و product-state
- Vite proxy و API base
- env keyها بدون نمایش مقدار Secret
- تست‌های backend موجود
- مستندات و تضاد runtimeها

## محدودیت صادقانه ممیزی

ZIP شامل `node_modules` نبود. تلاش برای نصب dependency در محیط بررسی با خطای مکرر proxy/package registry متوقف شد؛ بنابراین در این محیط اجرای واقعی build، backend tests، PostgreSQL و Playwright ممکن نشد. نتیجه بالا یک **ممیزی کامل ایستا، قراردادی و معماری** است، نه ادعای اجرای live روی دیتابیس شما.

برای اجرای acceptance واقعی، prompt همراه باید روی همان لپ‌تاپ، همان commit و دیتابیس اصلی اجرا شود.
