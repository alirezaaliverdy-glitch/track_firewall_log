# نقشه واقعی پروژه و نقاط اتصال

## Frontend

### Routing
- `src/routes/appRoutes.tsx`
- مسیرهای مهم:
  - `/dashboard`
  - `/assets/devices`
  - `/assets/devices/new`
  - `/assets/devices/:deviceId`
  - `/actions`
  - `/actions/:actionId`
  - `/assistant`
  - `/assets/vendors/cisco`

### Device workflows
- `src/features/assets/pages/DeviceOnboardingPage.tsx`
  - اکنون سه Step دارد.
  - بخش زیادی از Copy انگلیسی Hardcoded است.
  - از APIهای `src/lib/deviceOnboarding.ts` استفاده می‌کند.
- `src/features/assets/pages/AssetDetailPage.tsx`
  - Workspace و Tabهای Device را نمایش می‌دهد.
- `src/features/assets/pages/AssetListPage.tsx`
  - Wrapper لیست تجهیزات.
- `src/features/assets/components/DeviceVerificationPanel.tsx`

### Action workflows
- `src/features/actions/pages/ActionsPage.tsx`
- `src/components/actions/ActionCenterWorkspace.tsx`
- `src/components/actions/ActionCenterPanel.tsx`
  - حدود 1100 خط؛ Refactor باید تدریجی باشد.
- `src/components/actions/ActionResultView.tsx`
- `src/lib/actionCenter.ts`
- `src/lib/actionResultNavigation.ts`
- `src/lib/actionPlanHandoff.ts`

### Dashboard
- `src/features/dashboard/pages/DashboardPage.tsx`
- `src/lib/dashboard.ts`
- Backend واقعی دارد، ولی UI Copy انگلیسی Hardcoded است.

### Cisco
- `src/features/vendors/cisco/pages/CiscoOverviewPage.tsx`
- UI فارسی دارد و Capabilityها را از Backend می‌گیرد.

### i18n
- `src/i18n/locales/fa/common.json`
- `src/i18n/locales/en/common.json`
- Snapshot فعلی: 97/97 کلید و parity صحیح.

## Backend

### Onboarding
- `backend/src/routes/device-onboarding.ts`
- `backend/src/services/device-onboarding.service.ts`
- Session state machine، Test، Detect، Discover، Preview، Commit و Register-unverified موجود است.

### Device workspace/inventory
- `backend/src/routes/devices.ts`
- `backend/src/services/device.service.ts`
- `backend/src/routes/device-workspaces.ts`
- `backend/src/services/device-workspace.service.ts`
- `backend/src/inventory/device-asset-inventory.contract.ts`

### Action Center
- `backend/src/routes/actions.ts`
- `backend/src/services/action-center.service.ts`
- `backend/src/services/action-plan.service.ts`
- `backend/src/services/action-preflight.service.ts`
- `backend/src/services/policy-guard.service.ts`

### Cisco
- `backend/src/cisco/cisco-operation-registry.ts`
- `backend/src/actions/catalog/cisco.catalog.ts`
- `backend/src/connectors/cisco/ios-xe/*`
- `backend/src/connectors/vendors/cisco-ios-xe.planner.ts`

Registry فعلی چندین Read-only operation فعال و تعداد زیادی Write operation برنامه‌ریزی‌شده دارد. هیچ Catalog دوم نساز.

### Dashboard
- `backend/src/routes/dashboard.ts`
- `backend/src/services/dashboard-activity.service.ts`
- داده واقعی ActionPlan، Audit و Device را Aggregate می‌کند.

## تست‌های موجود با ارزش بالا

- `backend/test/onboarding-final-repair.test.ts`
- `backend/test/cisco-interactive-connector.test.ts`
- `backend/test/action-center-contract.test.ts`
- `backend/test/device-actioncenter-final-contract.test.ts`
- `backend/test/task19-1-action-center-ux.test.ts`
- `backend/test/task19-1-actionplan-navigation.test.ts`
- `backend/test/task19-1-onboarding-workspace.test.ts`
- `backend/test/device-removal-regression.contract.test.ts`
- `scripts/check-locale-parity.mjs`
- `scripts/check-persian-primary-copy.mjs`
- `scripts/check-utf8-mojibake.mjs`
