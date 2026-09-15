# مشکلات تاییدشده

## ثبت دستگاه

صفحه فعلی بیش از حد شلوغ است و دکمه‌های `ذخیره اطلاعات`، `تست اتصال`، `تلاش دوباره`، `تشخیص پلتفرم`، `کشف موجودی`، `تایید و ذخیره` و `شروع جلسه جدید` را هم‌زمان نشان می‌دهد. این مراحل باید داخل Wizard هدایت‌شده پنهان شوند.

## Cisco

خطای واقعی مشاهده‌شده:

```text
Cisco SSH algorithm negotiation failed
```

این یعنی TCP/SSH قابل دسترس است ولی Client و Cisco روی KEX، Host Key، Cipher یا MAC توافق ندارند. Modern باید اول امتحان شود و Legacy فقط برای همان دستگاه و با opt-in فعال شود.

## حذف تجهیزات

در لاگ، `DELETE /api/devices/:id` می‌تواند `204` برگرداند ولی رکورد همچنان در جدول تجهیزات دیده شود. باید بررسی شود که فهرست از Device می‌آید یا Asset، آیا Asset یتیم باقی می‌ماند و آیا Query cache فرانت invalidate می‌شود.

## وضعیت‌ها

مدل واحد لازم است:

```text
inventoryStatus: active | archived
connectionStatus: unknown | online | offline | error
verificationStatus: pending | verified | failed
managementStatus: managed | unmanaged
lastErrorCode
lastErrorStage
lastVerifiedAt
```
