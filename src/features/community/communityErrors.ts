type Translate = (fa:string,en:string)=>string;
export type CommunityRequestError={status?:number;code?:string;requestId?:string};
export const retryableCommunityUpload=(status:number,hasIdentity:boolean,online=true)=>hasIdentity&&online&&[0,502,504].includes(status);
const record=(v:unknown):Record<string,unknown>=>v&&typeof v==="object"&&!Array.isArray(v)?v as Record<string,unknown>:{};
export function communityRequestError(status:number,payload:unknown,reference?:string|null){
  const body=record(payload),nested=record(body.error);
  const candidate=typeof body.error==="string"?body.error:nested.code??body.code??body.reasonCode;
  const code=typeof candidate==="string"&&/^[A-Z][A-Z0-9_]{0,79}$/.test(candidate)?candidate:undefined;
  const ref=body.requestId??reference;
  return Object.assign(new Error("COMMUNITY_REQUEST_FAILED"),{status,code,requestId:typeof ref==="string"&&/^[a-zA-Z0-9_-]{1,80}$/.test(ref)?ref:undefined});
}
export function communityErrorMessage(error:unknown,t:Translate){
  const e=(error??{}) as CommunityRequestError;
  let message:string;
  if(e.code==="COMMUNITY_STORAGE_QUOTA")message=t("سهمیهٔ فایل پر شده است؛ با مدیر فضای کاری هماهنگ کن.","Attachment quota reached. Contact your workspace administrator.");
  else if(e.code==="COMMUNITY_UPLOAD_INCOMPLETE"||e.code==="COMMUNITY_FIELDS")message=t("فایل یا اطلاعات ارسال کامل به سرور نرسید. پیوست و متنت حفظ شده؛ دوباره ارسال کن.","The upload was incomplete. Your attachment and draft are kept; retry sending.");
  else if(e.code==="COMMUNITY_FILE_NAME")message=t("نام فایل مجاز نیست؛ نام کوتاه و ساده بدون علامت ویژه انتخاب کن.","Use a short, simple filename without special characters.");
  else if(e.code==="COMMUNITY_FILE_TYPE")message=t("محتوای فایل با نوع مجاز سازگار نیست؛ عکس را به JPEG/PNG تبدیل کن یا PDF و متن ساده بفرست.","Unsupported file contents. Convert photos to JPEG/PNG, or send PDF or plain text.");
  else if(["COMMUNITY_FILE_STORE_FAILED","COMMUNITY_STORAGE_UNAVAILABLE"].includes(e.code??""))message=t("ثبت فایل از طرف سرور تأیید نشد؛ مشکل ذخیره‌سازی باید توسط مدیر بررسی شود. فایل و متنت حفظ شده‌اند.","The server did not confirm storage. Ask the administrator to check storage; your file and draft are kept.");
  else if(e.code==="COMMUNITY_NETWORK_FAILED"||e.code==="OFFLINE_READ_ONLY")message=t("ارتباط با سرور قطع شد؛ اینترنت یا VPN را بررسی کن و دوباره ارسال کن. فایل و متنت حفظ شده‌اند.","Server connection lost. Check your network or VPN and retry; your file and draft are kept.");
  else if(e.code==="COMMUNITY_INVALID_RESPONSE")message=t("پاسخ معتبر از سرور نرسید؛ ثبت فایل تأیید نشده است. دوباره تلاش کن؛ ارسال تکراری با همان شناسه دوباره ثبت نمی‌شود.","No valid server response; upload is not confirmed. Retry with the retained request identity to avoid duplicates.");
  else if(e.code==="COMMUNITY_UPLOAD_BUSY")message=t("یک فایل دیگر در حال ارسال است؛ کمی صبر کن و دوباره ارسال کن.","Another upload is active. Wait briefly and retry.");
  else if(e.status===401)message=t("نشست ورود منقضی شده؛ دوباره وارد حساب شو.","Your session expired. Sign in again.");
  else if(e.status===413)message=t("هر فایل حداکثر ۵۰ مگابایت و هر پیام حداکثر سه فایل.","Up to three files per message, 50 MiB per file.");
  else if(e.status===415)message=t("نوع یا نام فایل مجاز نیست. تصویر، PDF یا متن ساده انتخاب کن.","Unsupported file type or name. Choose an image, PDF or plain text.");
  else if(e.status===409)message=t("این مورد تغییر کرده است؛ تازه‌سازی کن و دوباره بررسی کن. متن تو حفظ شد.","This item changed. Refresh and review; your draft is kept.");
  else if(e.status===403)message=t("اجازهٔ این تغییر را نداری.","You do not have permission to make this change.");
  else if(e.status===404)message=t("این مورد در دسترس نیست؛ صفحه را تازه‌سازی کن.","This item is unavailable. Refresh to check.");
  else if(e.status===429||e.status===503)message=t("سرور فعلاً آماده نیست؛ کمی صبر کن و دوباره تلاش کن. فایل و متنت حفظ شده‌اند.","The server is temporarily unavailable. Wait and retry; your file and draft are kept.");
  else message=t("درخواست انجام نشد؛ دوباره تلاش کن. متن تو حفظ شد.","Request failed. Retry; your draft is kept.");
  return e.requestId?message+" "+t("کد پیگیری: ","Reference: ")+e.requestId:message;
}
