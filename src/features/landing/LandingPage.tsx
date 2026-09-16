import {
  Activity,
  ArrowDownLeft,
  Bot,
  Check,
  ChevronLeft,
  CircleCheck,
  Clock3,
  Command,
  Database,
  Network,
  Radar,
  Server,
  ShieldCheck,
  Sparkles,
  TerminalSquare,
} from "lucide-react";
import { useEffect, useRef, type CSSProperties, type PointerEvent } from "react";
import "./LandingPage.css";

const baseUrl = import.meta.env.BASE_URL;

const productViews = [
  {
    index: "01",
    eyebrow: "دید عملیاتی",
    title: "تصمیم‌های مهم، قبل از جزئیات",
    description:
      "داشبورد، سلامت دارایی‌ها، یافته‌های فوری و اقدام‌های منتظر تأیید را از داده واقعی Backend کنار هم می‌گذارد تا وضعیت شبکه در یک نگاه روشن باشد.",
    visual: "dashboard",
  },
  {
    index: "02",
    eyebrow: "فرمان و اقدام",
    title: "از درخواست فارسی تا ActionPlan قابل بازبینی",
    description:
      "فرمان مناسب ابتدا از کاتالوگ انتخاب می‌شود؛ سپس پیش‌نمایش، پارامترها و دستگاه مقصد را می‌بینید. اجرا فقط پس از تأیید شما و عبور از PolicyGuard انجام می‌شود.",
    visual: "action",
  },
  {
    index: "03",
    eyebrow: "هوشمندی دارایی",
    title: "یک فضای کاری برای شبکه و امنیت",
    description:
      "Linux، MikroTik، Cisco، FortiGate، pfSense و Sophos در یک مدل دارایی مشترک دیده می‌شوند؛ از وضعیت اتصال و پایش تا پورت‌ها، یافته‌ها و تاریخچه عملیات.",
    visual: "assets",
  },
] as const;

function BrandMark() {
  return (
    <span className="landing-brand-mark" aria-hidden="true">
      <ShieldCheck />
      <i />
    </span>
  );
}

function DashboardVisual() {
  return (
    <div className="product-ui product-ui--dashboard" aria-label="نمای پاک‌سازی‌شده داشبورد عملیاتی">
      <div className="product-ui__topline">
        <span><i /> داده زنده</span>
        <small>نمای محصول · داده نمایشی</small>
      </div>
      <div className="product-ui__hero">
        <div>
          <small>وضعیت عملیات</small>
          <strong>مرکز فرمان شبکه و امنیت</strong>
          <span>اولویت‌ها، سلامت تجهیزات و نتیجه اقدام‌ها</span>
        </div>
        <div className="defense-orbit" aria-hidden="true">
          <i className="defense-orbit__ring defense-orbit__ring--one" />
          <i className="defense-orbit__ring defense-orbit__ring--two" />
          <ShieldCheck />
          <b /><b /><b />
        </div>
      </div>
      <div className="product-metrics">
        <div><span><ShieldCheck /> سلامت کلی</span><strong>پایدار</strong><small>کنترل پیوسته</small></div>
        <div><span><Server /> دارایی فعال</span><strong>۱۲</strong><small>چند وندور</small></div>
        <div><span><Clock3 /> منتظر تأیید</span><strong>۲</strong><small>نیازمند تصمیم شما</small></div>
      </div>
      <div className="product-chart-row">
        <div className="health-ring"><span>۹۲</span><small>امتیاز سلامت</small></div>
        <div className="mini-activity">
          <span><i className="is-cyan" /> CPU <b>۳۸٪</b></span>
          <span><i className="is-purple" /> Memory <b>۵۶٪</b></span>
          <span><i className="is-amber" /> Disk <b>۴۱٪</b></span>
        </div>
      </div>
    </div>
  );
}

function ActionVisual() {
  return (
    <div className="product-ui product-ui--action" aria-label="نمای پاک‌سازی‌شده چرخه اقدام کنترل‌شده">
      <div className="command-prompt">
        <span><Sparkles /> درخواست اپراتور</span>
        <p>وضعیت سرویس را بررسی کن و اقدام امن پیشنهاد بده.</p>
      </div>
      <div className="action-plan-card">
        <header><span><Command /> ActionPlan</span><em>آماده بازبینی</em></header>
        <div className="action-target"><Server /><div><small>دستگاه مقصد</small><strong>Linux Gateway</strong></div><CircleCheck /></div>
        <code dir="ltr">systemctl status nginx</code>
        <div className="plan-checks">
          <span><Check /> قالب ثبت‌شده</span>
          <span><Check /> PolicyGuard</span>
          <span><Check /> ثبت رویداد</span>
        </div>
        <footer><span>پیش‌نمایش، اجرا نیست</span><button type="button" tabIndex={-1}>تأیید اپراتور</button></footer>
      </div>
      <div className="flow-dots" aria-hidden="true"><i /><i /><i /><i /></div>
    </div>
  );
}

function AssetVisual() {
  return (
    <div className="product-ui product-ui--assets" aria-label="نمای پاک‌سازی‌شده فضای کاری دارایی‌ها">
      <div className="asset-map">
        <span className="asset-map__hub"><Network /></span>
        <span className="asset-node asset-node--one"><Server /><small>Linux</small></span>
        <span className="asset-node asset-node--two"><Radar /><small>Cisco</small></span>
        <span className="asset-node asset-node--three"><ShieldCheck /><small>Firewall</small></span>
        <i className="asset-link asset-link--one" />
        <i className="asset-link asset-link--two" />
        <i className="asset-link asset-link--three" />
      </div>
      <div className="asset-summary">
        <header><div><span>فضای کاری تجهیز</span><strong>Edge Gateway</strong></div><em><i /> متصل</em></header>
        <div className="asset-tabs"><span className="is-active">نمای کلی</span><span>پورت‌ها</span><span>امنیت</span></div>
        <div className="asset-services">
          <span><TerminalSquare /><b>SSH</b><small>کنترل‌شده</small></span>
          <span><Database /><b>Telemetry</b><small>فعال</small></span>
          <span><Activity /><b>Daily check</b><small>تازه</small></span>
        </div>
      </div>
    </div>
  );
}

function ProductVisual({ type }: { type: (typeof productViews)[number]["visual"] }) {
  if (type === "action") return <ActionVisual />;
  if (type === "assets") return <AssetVisual />;
  return <DashboardVisual />;
}

export default function LandingPage() {
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    document.body.classList.add("landing-body");
    const root = rootRef.current;
    if (!root) return () => document.body.classList.remove("landing-body");
    const targets = Array.from(root.querySelectorAll<HTMLElement>("[data-reveal]"));
    const observer = new IntersectionObserver(
      (entries) => entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-visible");
          observer.unobserve(entry.target);
        }
      }),
      { threshold: 0.16, rootMargin: "0px 0px -8%" },
    );
    targets.forEach((target) => observer.observe(target));
    return () => {
      observer.disconnect();
      document.body.classList.remove("landing-body");
    };
  }, []);

  const moveGlow = (event: PointerEvent<HTMLDivElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    event.currentTarget.style.setProperty("--pointer-x", `${event.clientX - bounds.left}px`);
    event.currentTarget.style.setProperty("--pointer-y", `${event.clientY - bounds.top}px`);
  };

  return (
    <div ref={rootRef} className="landing" dir="rtl" onPointerMove={moveGlow}>
      <div className="landing-grid" aria-hidden="true" />
      <header className="landing-header">
        <a className="landing-brand" href="#top" aria-label="Firewall SOAR">
          <BrandMark />
          <span><strong>Firewall SOAR</strong><small>مرکز فرمان امنیت</small></span>
        </a>
        <nav aria-label="ناوبری لندینگ">
          <a href="#product">محصول</a>
          <a href="#workflow">چرخه اقدام</a>
          <a href="#team">تیم</a>
        </nav>
        <a className="landing-header__anchor" href="#product">مشاهده محصول <ArrowDownLeft /></a>
      </header>

      <main>
        <section id="top" className="landing-hero">
          <div className="landing-hero__copy" data-reveal>
            <span className="landing-kicker"><i /> Mini‑SOAR فارسی برای عملیات واقعی</span>
            <h1>از سیگنال امنیتی تا<br /><em>اقدام کنترل‌شده.</em></h1>
            <p>
              Firewall SOAR لاگ‌ها، دارایی‌ها و وضعیت شبکه را به یک دید عملیاتی تبدیل می‌کند؛
              سپس با کاتالوگ فرمان و دستیار هوشمند، مسیر تحلیل تا اجرای قابل‌ردیابی را کوتاه می‌کند.
            </p>
            <div className="landing-hero__actions">
              <a href="#product">داخل محصول را ببینید <ChevronLeft /></a>
              <span><ShieldCheck /> بدون اجرای مستقیم فرمان AI</span>
            </div>
          </div>

          <div className="landing-hero__visual" data-reveal style={{ "--reveal-delay": "120ms" } as CSSProperties}>
            <div className="hero-window">
              <div className="hero-window__bar"><span /><span /><span /><small>firewall / dashboard</small></div>
              <DashboardVisual />
            </div>
            <div className="hero-float hero-float--one"><Bot /><span><strong>طرح اقدام آماده است</strong><small>نیازمند بازبینی اپراتور</small></span></div>
            <div className="hero-float hero-float--two"><CircleCheck /><span><strong>Connector اجرا شد</strong><small>نتیجه در Audit ثبت شد</small></span></div>
          </div>

          <div className="landing-proof" data-reveal>
            <span>Linux</span><span>MikroTik</span><span>Cisco</span><span>FortiGate</span><span>pfSense</span><span>Sophos</span>
          </div>
        </section>

        <section id="product" className="landing-product landing-section">
          <div className="landing-section__intro" data-reveal>
            <span>داخل نسخه اصلی</span>
            <h2>کمتر بین صفحه‌ها بگردید.<br />بیشتر تصمیم بگیرید.</h2>
            <p>سه نمای اصلی محصول، با همان منطق و زبان بصری نسخه عملیاتی و بدون نمایش داده‌های حساس.</p>
          </div>

          <div className="product-stories">
            {productViews.map((item, index) => (
              <article className={`product-story product-story--${item.visual}`} key={item.index} data-reveal style={{ "--reveal-delay": `${index * 70}ms` } as CSSProperties}>
                <div className="product-story__copy">
                  <span><b>{item.index}</b>{item.eyebrow}</span>
                  <h3>{item.title}</h3>
                  <p>{item.description}</p>
                </div>
                <ProductVisual type={item.visual} />
              </article>
            ))}
          </div>
        </section>

        <section id="workflow" className="landing-workflow landing-section" data-reveal>
          <div className="workflow-copy">
            <span>مرز ایمنی محصول</span>
            <h2>هوش مصنوعی پیشنهاد می‌دهد؛<br />کنترل دست اپراتور می‌ماند.</h2>
            <p>اجرای واقعی فقط برای فرمان پیاده‌سازی‌شده، دستگاه انتخاب‌شده و پارامترهای معتبر ممکن است. تأیید شما، PolicyGuard، Connector و Audit هیچ‌وقت حذف نمی‌شوند.</p>
          </div>
          <ol className="workflow-steps">
            <li><span>01</span><div><Bot /><strong>پیشنهاد</strong><small>کاتالوگ یا AI</small></div></li>
            <li><span>02</span><div><Command /><strong>پیش‌نمایش</strong><small>ActionPlan شفاف</small></div></li>
            <li><span>03</span><div><ShieldCheck /><strong>تأیید و محافظت</strong><small>کاربر + PolicyGuard</small></div></li>
            <li><span>04</span><div><CircleCheck /><strong>اجرا و ثبت</strong><small>Connector + Audit</small></div></li>
          </ol>
        </section>

        <section id="team" className="landing-team landing-section">
          <div className="team-portrait" data-reveal>
            <img src={`${baseUrl}landing/alireza.jpeg`} alt="پرتره علیرضا، متخصص شبکه و امنیت و طراح محصول" />
            <span><i /> شبکه · امنیت · طراحی محصول</span>
          </div>
          <div className="team-copy" data-reveal style={{ "--reveal-delay": "90ms" } as CSSProperties}>
            <span>تیم محصول</span>
            <h2>علیرضا</h2>
            <h3>متخصص شبکه و امنیت، طراح تجربه محصول</h3>
            <p>طراحی Firewall SOAR از دل نیازهای واقعی عملیات شبکه شکل گرفته است: دید واضح، کنترل قبل از اجرا و مسیری که تحلیل امنیتی را به اقدام قابل‌اعتماد تبدیل کند.</p>
            <div className="team-values">
              <span><Network /> معماری شبکه</span>
              <span><ShieldCheck /> عملیات امنیت</span>
              <span><Sparkles /> طراحی محصول</span>
            </div>
          </div>
        </section>
      </main>

      <footer className="landing-footer">
        <div className="landing-brand"><BrandMark /><span><strong>Firewall SOAR</strong><small>مرکز فرمان شبکه و امنیت</small></span></div>
        <p>تحلیل، پایش و اقدام کنترل‌شده در یک سامانه فارسی.</p>
        <a href="#top">بازگشت به بالا <ChevronLeft /></a>
      </footer>
    </div>
  );
}
