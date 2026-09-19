import {
  Activity,
  ArrowDownLeft,
  Bot,
  Check,
  ChevronLeft,
  CircleCheck,
  Command,
  Eye,
  Gauge,
  Layers3,
  Network,
  Radar,
  ShieldCheck,
  Sparkles,
  Workflow,
} from "lucide-react";
import { useEffect, useRef, type CSSProperties, type PointerEvent } from "react";
import "./LandingPage.css";
import "./LandingRefresh.css";

const baseUrl = import.meta.env.BASE_URL;

const productViews = [
  {
    index: "01",
    eyebrow: "دید عملیاتی یکپارچه",
    title: "وضعیت شبکه را پیش از تبدیل‌شدن به بحران ببینید",
    description:
      "داشبورد، سلامت تجهیزات، هشدارها، یافته‌های امنیتی و اقدام‌های منتظر تأیید را از داده واقعی Backend کنار هم می‌گذارد؛ تا به‌جای جابه‌جایی بین ابزارها، روی مهم‌ترین تصمیم تمرکز کنید.",
    image: "product-overview.png",
    alt: "نمای یکپارچه داشبورد، پایش لینوکس و دارایی‌های Firewall SOAR",
    accent: "cyan",
    facts: ["اولویت‌بندی رخدادها", "سلامت دارایی‌ها", "آخرین اجراها"],
  },
  {
    index: "02",
    eyebrow: "مرکز اقدام کنترل‌شده",
    title: "از فرمان فارسی تا اجرای قابل ردیابی، بدون پرش از کنترل‌ها",
    description:
      "سامانه ابتدا فرمان پیاده‌سازی‌شده را از کاتالوگ انتخاب و ActionPlan شفاف می‌سازد. مقصد و پارامترها را می‌بینید، پیش‌نمایش را بررسی می‌کنید و تنها پس از تأیید شما، PolicyGuard و Connector واقعی وارد عمل می‌شوند.",
    image: "controlled-action.png",
    alt: "مرکز اقدام کنترل‌شده با پیش‌نمایش، PolicyGuard، Connector و نتیجه",
    accent: "violet",
    facts: ["ActionPlan قابل بازبینی", "تأیید اپراتور", "Audit نتیجه واقعی"],
  },
  {
    index: "03",
    eyebrow: "پایش و دستیار هوشمند",
    title: "هوش مصنوعی تحلیل می‌کند؛ اختیار اجرا دست اپراتور می‌ماند",
    description:
      "Daily Check، تله‌متری Linux و MikroTik، روند هشدارها و دستیار زمینه‌محور در یک نمای عملیاتی قرار می‌گیرند. دستیار پیشنهاد را به طرح قابل بررسی تبدیل می‌کند و هرگز متن خام AI را مستقیم اجرا نمی‌کند.",
    image: "monitoring-assistant.png",
    alt: "پایش روزانه تجهیزات و دستیار هوشمند امنیتی Firewall SOAR",
    accent: "coral",
    facts: ["Daily Check", "تحلیل زمینه‌محور", "پیشنهاد، نه اجرای خام"],
  },
] as const;

const capabilities = [
  { icon: Network, title: "دارایی چندسازنده", text: "Linux، MikroTik، Cisco، FortiGate، pfSense و Sophos در یک مدل عملیاتی مشترک." },
  { icon: Radar, title: "کشف و پایش پیوسته", text: "جمع‌آوری وضعیت، رخداد و تله‌متری با نمایش سلامت و آخرین زمان بررسی." },
  { icon: ShieldCheck, title: "تشخیص قابل توضیح", text: "قوانین تشخیص، یافته‌ها، شدت و شواهد مرتبط برای تصمیم سریع‌تر تیم امنیت." },
  { icon: Command, title: "کاتالوگ فرمان فارسی", text: "فرمان‌های آماده و پارامتریک؛ فقط عملیات دارای Planner، Template و Connector اجرا می‌شوند." },
  { icon: Bot, title: "دستیار امنیتی", text: "تحلیل وضعیت و پیشنهاد گام بعدی، با تبدیل خروجی به برنامه قابل بازبینی اپراتور." },
  { icon: Activity, title: "ثبت کامل نتیجه", text: "از پیش‌نمایش و تأیید تا فراخوانی Connector و نتیجه واقعی، همه‌چیز قابل ردیابی است." },
];

function BrandMark() {
  return <span className="landing-brand-mark" aria-hidden="true"><ShieldCheck /><i /></span>;
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
      { threshold: 0.13, rootMargin: "0px 0px -7%" },
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

  const tiltCard = (event: PointerEvent<HTMLElement>) => {
    if (window.matchMedia("(max-width: 900px), (prefers-reduced-motion: reduce)").matches) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    const x = (event.clientX - bounds.left) / bounds.width - 0.5;
    const y = (event.clientY - bounds.top) / bounds.height - 0.5;
    event.currentTarget.style.setProperty("--tilt-x", `${(-y * 5.5).toFixed(2)}deg`);
    event.currentTarget.style.setProperty("--tilt-y", `${(x * 7).toFixed(2)}deg`);
    event.currentTarget.style.setProperty("--shine-x", `${((x + 0.5) * 100).toFixed(1)}%`);
    event.currentTarget.style.setProperty("--shine-y", `${((y + 0.5) * 100).toFixed(1)}%`);
  };

  const resetTilt = (event: PointerEvent<HTMLElement>) => {
    event.currentTarget.style.setProperty("--tilt-x", "0deg");
    event.currentTarget.style.setProperty("--tilt-y", "0deg");
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
          <a href="#product">محصول</a><a href="#capabilities">قابلیت‌ها</a><a href="#workflow">چرخه اقدام</a><a href="#team">تیم</a>
        </nav>
        <a className="landing-header__anchor" href="#product">مشاهده محصول <ArrowDownLeft /></a>
      </header>

      <main>
        <section id="top" className="landing-hero landing-hero--refresh">
          <div className="landing-hero__copy" data-reveal>
            <span className="landing-kicker"><i /> Mini‑SOAR فارسی برای عملیات واقعی</span>
            <h1>امنیت را فقط نبینید؛<br /><em>برای آن اقدام کنید.</em></h1>
            <p>Firewall SOAR لاگ، دارایی و وضعیت شبکه را به یک دید عملیاتی تبدیل می‌کند و فاصله میان تشخیص تا اقدام کنترل‌شده را کوتاه می‌سازد—با کاتالوگ فرمان فارسی، دستیار هوشمند و اجرای کاملاً قابل ردیابی.</p>
            <div className="landing-hero__actions">
              <a href="#product">محصول را کشف کنید <ChevronLeft /></a>
              <span><ShieldCheck /> هیچ فرمان خام AI مستقیماً اجرا نمی‌شود</span>
            </div>
            <div className="hero-trust">
              <span><strong>۶</strong><small>خانواده تجهیز</small></span>
              <span><strong>۴</strong><small>لایه کنترل اجرا</small></span>
              <span><strong>۱</strong><small>مرکز فرمان فارسی</small></span>
            </div>
          </div>

          <div className="landing-hero__visual showcase-stage showcase-stage--hero" data-reveal style={{ "--reveal-delay": "110ms" } as CSSProperties}>
            <div className="showcase-orbit" aria-hidden="true" />
            <article className="showcase-frame showcase-frame--hero" onPointerMove={tiltCard} onPointerLeave={resetTilt}>
              <div className="showcase-frame__bar"><span /><span /><span /><small>firewall / operations</small></div>
              <div className="showcase-frame__image"><img src={`${baseUrl}landing/product-overview.png`} alt="نمای کلی محیط واقعی Firewall SOAR" /></div>
              <i className="showcase-frame__shine" aria-hidden="true" />
            </article>
            <div className="hero-float hero-float--one"><Bot /><span><strong>طرح اقدام آماده بررسی</strong><small>پیشنهاد هوشمند · کنترل انسانی</small></span></div>
            <div className="hero-float hero-float--two"><CircleCheck /><span><strong>اجرای Connector ثبت شد</strong><small>نتیجه واقعی در Audit</small></span></div>
          </div>

          <div className="landing-proof" data-reveal>
            <span>Linux</span><span>MikroTik</span><span>Cisco</span><span>FortiGate</span><span>pfSense</span><span>Sophos</span>
          </div>
        </section>

        <section id="product" className="landing-product landing-section">
          <div className="landing-section__intro" data-reveal>
            <span>داخل محصول</span>
            <h2>سه نمای واقعی.<br />یک جریان عملیاتی منسجم.</h2>
            <p>تصاویر بر پایه رابط خود سامانه ساخته و برای نمایش عمومی از داده عملیاتی پاک‌سازی شده‌اند؛ منطق محصول همان چیزی است که اپراتور در نسخه اصلی می‌بیند.</p>
          </div>

          <div className="product-stories product-stories--images">
            {productViews.map((item, index) => (
              <article className={`product-story product-story--image product-story--${item.accent}`} key={item.index} data-reveal style={{ "--reveal-delay": `${index * 70}ms` } as CSSProperties}>
                <div className="product-story__copy">
                  <span><b>{item.index}</b>{item.eyebrow}</span>
                  <h3>{item.title}</h3>
                  <p>{item.description}</p>
                  <div className="story-facts">{item.facts.map((fact) => <span key={fact}><Check />{fact}</span>)}</div>
                </div>
                <div className="showcase-stage">
                  <article className="showcase-frame" onPointerMove={tiltCard} onPointerLeave={resetTilt}>
                    <div className="showcase-frame__bar"><span /><span /><span /><small>Firewall SOAR · {item.index}</small></div>
                    <div className="showcase-frame__image"><img src={`${baseUrl}landing/${item.image}`} alt={item.alt} loading={index === 0 ? "eager" : "lazy"} /></div>
                    <i className="showcase-frame__shine" aria-hidden="true" />
                  </article>
                  <span className="showcase-depth showcase-depth--one" aria-hidden="true" />
                  <span className="showcase-depth showcase-depth--two" aria-hidden="true" />
                </div>
              </article>
            ))}
          </div>
        </section>

        <section id="capabilities" className="landing-capabilities landing-section">
          <div className="capabilities-heading" data-reveal>
            <div><span>فراتر از یک داشبورد</span><h2>ابزارهای واقعی برای عملیات روزمره شبکه و امنیت</h2></div>
            <p>از مشاهده و تشخیص تا اجرای کنترل‌شده؛ قابلیت‌ها به‌جای نمایش نمایشی، به سرویس‌ها، Connectorها و Audit واقعی سامانه متصل‌اند.</p>
          </div>
          <div className="capability-grid">
            {capabilities.map(({ icon: Icon, title, text }, index) => (
              <article key={title} data-reveal style={{ "--reveal-delay": `${index * 45}ms` } as CSSProperties}>
                <span><Icon /></span><h3>{title}</h3><p>{text}</p><i>{String(index + 1).padStart(2, "0")}</i>
              </article>
            ))}
          </div>
        </section>

        <section id="workflow" className="landing-workflow landing-section" data-reveal>
          <div className="workflow-copy">
            <span>مرز ایمنی محصول</span>
            <h2>AI پیشنهاد می‌دهد؛<br />کنترل دست اپراتور می‌ماند.</h2>
            <p>فقط آیتم پیاده‌سازی‌شده با Planner، Template و Connector ثبت‌شده قابلیت اجرا دارد. پیش‌نمایش اجرا نیست؛ نتیجه نیز تنها وقتی موفق ثبت می‌شود که Connector واقعی با موفقیت پاسخ داده باشد.</p>
          </div>
          <ol className="workflow-steps">
            <li><span>01</span><div><Sparkles /><strong>انتخاب راهکار</strong><small>کاتالوگ، سپس AI</small></div></li>
            <li><span>02</span><div><Eye /><strong>پیش‌نمایش</strong><small>ActionPlan شفاف</small></div></li>
            <li><span>03</span><div><ShieldCheck /><strong>تأیید و محافظت</strong><small>اپراتور + PolicyGuard</small></div></li>
            <li><span>04</span><div><Workflow /><strong>اجرا و ثبت</strong><small>Connector + Audit</small></div></li>
          </ol>
        </section>

        <section id="team" className="landing-team landing-section">
          <div className="team-portrait" data-reveal>
            <img src={`${baseUrl}landing/alireza.jpeg`} alt="پرتره علیرضا، متخصص شبکه و امنیت و طراح محصول" />
            <span><i /> شبکه · امنیت · طراحی محصول</span>
          </div>
          <div className="team-copy" data-reveal style={{ "--reveal-delay": "90ms" } as CSSProperties}>
            <span>پشت محصول</span><h2>علیرضا</h2>
            <h3>متخصص شبکه و امنیت، طراح تجربه محصول</h3>
            <p>Firewall SOAR از دل نیازهای واقعی عملیات شبکه شکل گرفته است: دید واضح، کنترل پیش از اجرا و مسیری که تحلیل امنیتی را به اقدام قابل اعتماد تبدیل کند. تمرکز طراحی روی کاهش شلوغی، سرعت تصمیم و حفظ اختیار اپراتور است.</p>
            <div className="team-values"><span><Network /> معماری شبکه</span><span><ShieldCheck /> عملیات امنیت</span><span><Layers3 /> طراحی محصول</span><span><Gauge /> تجربه اپراتور</span></div>
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
