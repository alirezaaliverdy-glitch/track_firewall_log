import { useEffect, useState, type CSSProperties } from "react";
import {
  ArrowDown,
  ArrowLeft,
  Bot,
  Check,
  CheckCircle2,
  CircleDot,
  Command,
  Eye,
  Fingerprint,
  Gauge,
  Menu,
  Network,
  ScrollText,
  ShieldCheck,
  Sparkles,
  Terminal,
  X,
  Zap,
} from "lucide-react";
import "./LandingStoryPage.css";

const flow = [
  {
    number: "۰۱",
    icon: Network,
    title: "ابتدا دستگاه هدف را انتخاب کنید",
    summary: "فروشنده، پلتفرم و قابلیت‌های کشف‌شده‌ی همان دستگاه، مرز واقعی عملیات را مشخص می‌کنند.",
    detail: "سامانه حدس نمی‌زند که هر تجهیز چه کاری می‌تواند انجام دهد؛ موجودی ثبت‌شده و وضعیت Connector منبع حقیقت هستند.",
    example: "Target · Vendor · Capabilities",
  },
  {
    number: "۰۲",
    icon: Command,
    title: "هدف عملیاتی را فارسی بنویسید",
    summary: "درخواست شما ابتدا با کاتالوگ فرمان‌های کنترل‌شده تطبیق داده می‌شود؛ نه با یک متن آزاد و غیرقابل پیش‌بینی.",
    detail: "اگر فرمان آماده‌ای وجود نداشته باشد، AI فقط پیشنهاد می‌سازد. پیشنهاد سفارشی تا زمان داشتن Planner، Template و Connector معتبر، قابل اجرا نیست.",
    example: "Catalog first · AI proposal fallback",
  },
  {
    number: "۰۳",
    icon: Eye,
    title: "ActionPlan را پیش از اجرا ببینید",
    summary: "مقصد، پارامترها، مراحل، ریسک و مسیر بازگشت در یک پیش‌نمایش قابل بررسی کنار هم قرار می‌گیرند.",
    detail: "Preview اجرا نیست. اپراتور برنامه‌ی نهایی را می‌بیند، یک‌بار تایید می‌کند و سپس PolicyGuard تازگی و مجازبودن آن را دوباره می‌سنجد.",
    example: "Preview → Confirm → PolicyGuard",
  },
  {
    number: "۰۴",
    icon: Zap,
    title: "Connector اجرا می‌کند؛ شواهد نتیجه را ثابت می‌کنند",
    summary: "فقط Handler ثبت‌شده‌ی همان پلتفرم اجازه دارد عملیات تاییدشده را روی تجهیز واقعی اجرا کند.",
    detail: "وضعیت succeeded تنها وقتی ثبت می‌شود که Connector واقعاً فراخوانی شده باشد؛ خروجی، زمان و Audit کنار ActionPlan باقی می‌مانند.",
    example: "Connector invoked → Evidence → Audit",
  },
];

const capabilities = [
  { icon: Network, title: "موجودی و شناخت تجهیز", text: "دستگاه‌ها، اطلاعات اتصال، قابلیت‌های کشف‌شده و وضعیت اعتبارسنجی در یک نمای عملیاتی جمع می‌شوند." },
  { icon: Bot, title: "کاتالوگ و دستیار فارسی", text: "فرمان‌های رایج از مسیرهای ازپیش‌تعریف‌شده می‌آیند و AI فقط جایی وارد می‌شود که برای فهم یا پیشنهاد به آن نیاز است." },
  { icon: Gauge, title: "Daily Check و یافته‌ها", text: "بررسی‌های دوره‌ای، تله‌متری و یافته‌های امنیتی کمک می‌کنند مشکل پیش از تبدیل‌شدن به بحران دیده شود." },
  { icon: ScrollText, title: "Action Center و ممیزی", text: "پیشنهاد، پیش‌نمایش، تایید، اجرای Connector و نتیجه در یک زنجیره‌ی قابل بازبینی باقی می‌مانند." },
];

const platforms = ["LINUX", "MIKROTIK", "FORTIGATE", "CISCO IOS-XE"];

function Brand() {
  return (
    <a className="story-brand" href="#top" aria-label="Firewall AI Security Orchestrator">
      <span><ShieldCheck /></span>
      <span><strong>Firewall</strong><small>Security Orchestrator</small></span>
    </a>
  );
}

function CommandArtifact() {
  return (
    <div className="story-artifact" aria-label="نمایش مسیر تبدیل فرمان فارسی به اقدام کنترل‌شده">
      <div className="story-artifact__halo" />
      <div className="story-artifact__window">
        <header>
          <span className="story-window-dots"><i /><i /><i /></span>
          <span>SECURITY ORCHESTRATOR / LIVE</span>
          <CircleDot />
        </header>
        <div className="story-artifact__body">
          <div className="story-prompt">
            <span><Sparkles /></span>
            <p>وضعیت فایروال سرور اصلی را بررسی کن</p>
          </div>
          <div className="story-trace">
            <span className="is-complete"><i><Check /></i><b>Catalog match</b><small>linux_check_firewall_status</small></span>
            <span className="is-complete"><i><Check /></i><b>ActionPlan</b><small>target + verified inputs</small></span>
            <span className="is-current"><i><Fingerprint /></i><b>Human checkpoint</b><small>waiting for confirmation</small></span>
            <span><i><Terminal /></i><b>Connector</b><small>not invoked yet</small></span>
          </div>
          <div className="story-plan">
            <div><small>ACTION PLAN</small><strong>بررسی وضعیت فایروال</strong></div>
            <dl>
              <div><dt>مقصد</dt><dd>linux-gateway-01</dd></div>
              <div><dt>نوع</dt><dd>Read only</dd></div>
              <div><dt>وضعیت</dt><dd><span /> آماده‌ی بازبینی</dd></div>
            </dl>
            <div className="story-plan__action"><ShieldCheck /> پیش‌نمایش تاییدشده، آماده‌ی تصمیم اپراتور <ArrowLeft /></div>
          </div>
        </div>
      </div>
      <div className="story-artifact__note story-artifact__note--top"><span><ShieldCheck /></span><b>Raw AI execution</b><small>مسدود است</small></div>
      <div className="story-artifact__note story-artifact__note--bottom"><span><CheckCircle2 /></span><b>Audit trail</b><small>برای هر مرحله</small></div>
    </div>
  );
}

function LandingStoryPage() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const nodes = Array.from(document.querySelectorAll<HTMLElement>("[data-reveal]"));
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        entry.target.classList.toggle("is-revealed", entry.isIntersecting);
      });
    }, { threshold: [0.12, 0.3, 0.55], rootMargin: "0px 0px -8%" });
    nodes.forEach((node) => observer.observe(node));
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const update = () => {
      const max = document.documentElement.scrollHeight - window.innerHeight;
      setProgress(max > 0 ? Math.min(1, window.scrollY / max) : 0);
      setScrolled(window.scrollY > 28);
    };
    update();
    window.addEventListener("scroll", update, { passive: true });
    return () => window.removeEventListener("scroll", update);
  }, []);

  useEffect(() => {
    document.body.classList.add("landing-story-active");
    return () => document.body.classList.remove("landing-story-active");
  }, []);

  return (
    <div className="story-page" id="top" dir="rtl">
      <div className="story-noise" aria-hidden="true" />
      <div className="story-progress" style={{ "--page-progress": progress } as CSSProperties} aria-hidden="true" />

      <header className={`story-header ${scrolled ? "is-scrolled" : ""}`}>
        <div className="story-container story-header__inner">
          <Brand />
          <nav className={menuOpen ? "is-open" : ""} aria-label="بخش‌های صفحه">
            <a href="#story" onClick={() => setMenuOpen(false)}>سامانه چیست؟</a>
            <a href="#flow" onClick={() => setMenuOpen(false)}>نحوه‌ی کار</a>
            <a href="#capabilities" onClick={() => setMenuOpen(false)}>قابلیت‌ها</a>
            <a href="#control" onClick={() => setMenuOpen(false)}>کنترل انسانی</a>
          </nav>
          <a className="story-header__cta" href="#story">شروع روایت <ArrowDown /></a>
          <button type="button" className="story-menu" onClick={() => setMenuOpen((value) => !value)} aria-label="نمایش منو" aria-expanded={menuOpen}>
            {menuOpen ? <X /> : <Menu />}
          </button>
        </div>
      </header>

      <main>
        <section className="story-hero">
          <div className="story-hero__orb" aria-hidden="true" />
          <div className="story-container story-hero__inner">
            <div className="story-hero__tag"><span /> PERSIAN COMMAND OPERATIONS / CONTROLLED EXECUTION</div>
            <h1>
              فرمان فارسی،
              <span>تا اقدام واقعی</span>
              <em>با کنترل کامل.</em>
            </h1>
            <p>Firewall Log Analyzer یک Mini‑SOAR سبک برای تیم‌های شبکه و امنیت است. دستگاه را انتخاب می‌کنید و خواسته‌تان را فارسی می‌نویسید؛ سامانه از کاتالوگ و قابلیت واقعی همان دستگاه ActionPlan می‌سازد و اجرای نهایی را از مسیر تایید اپراتور، PolicyGuard و Connector ثبت‌شده عبور می‌دهد.</p>
            <div className="story-hero__actions">
              <a href="#story" className="story-button">سامانه را بشناسید <ArrowDown /></a>
              <span><i /> هیچ متن خام AI روی تجهیز اجرا نمی‌شود</span>
            </div>
          </div>
          <div className="story-hero__footer">
            <span>برای دیدن مسیر، آرام اسکرول کنید</span>
            <i><ArrowDown /></i>
          </div>
        </section>

        <section className="story-intro story-section" id="story">
          <div className="story-container">
            <div className="story-chapter" data-reveal><span>فصل اول</span><b>سامانه چیست؟</b><i>01</i></div>
            <div className="story-intro__statement" data-reveal>
              <p>مسئله فقط پیدا کردن یک هشدار یا اجرای یک دستور نیست.</p>
              <h2>باید زمینه را <em>از خود تجهیز بگیرید،</em><br />تصمیم را پیش از اجرا ببینید و نتیجه را<br /><em>با شواهد واقعی بسنجید.</em></h2>
            </div>
            <div className="story-intro__grid">
              <p data-reveal>این سامانه موجودی تجهیزات، تحلیل لاگ، تله‌متری، یافته‌های امنیتی، دستیار فارسی و Action Center را به یک مسیر عملیاتی متصل می‌کند؛ از شناخت دستگاه و تشخیص مسئله تا ساخت برنامه، اجرای کنترل‌شده و ثبت نتیجه.</p>
              <div data-reveal>
                <span><strong>شناخت</strong><small>موجودی و قابلیت دستگاه</small></span>
                <span><strong>تصمیم</strong><small>کاتالوگ و ActionPlan</small></span>
                <span><strong>اثبات</strong><small>Connector و Audit</small></span>
              </div>
            </div>
          </div>
        </section>

        <section className="story-product story-section">
          <div className="story-container">
            <div className="story-product__heading" data-reveal>
              <span>یک فرمان فارسی، یک زنجیره‌ی قابل بررسی</span>
              <h2>سادگی برای اپراتور؛ <em>انضباط برای اجرا.</em></h2>
            </div>
            <div data-reveal><CommandArtifact /></div>
          </div>
        </section>

        <section className="story-flow story-section" id="flow">
          <div className="story-container">
            <div className="story-chapter" data-reveal><span>فصل دوم</span><b>نحوه‌ی کار</b><i>02</i></div>
            <div className="story-flow__heading" data-reveal>
              <h2>از نیت عملیاتی تا نتیجه،<br /><em>بدون دورزدن نقطه‌های کنترل.</em></h2>
              <p>هر مرحله داده‌ی روشن خود را دارد و تا پیش‌نیاز مرحله‌ی بعد کامل نباشد، اجرا جلو نمی‌رود.</p>
            </div>
            <ol className="story-flow__list">
              {flow.map((item, index) => {
                const Icon = item.icon;
                return (
                  <li key={item.number} data-reveal style={{ "--delay": `${index * 60}ms` } as CSSProperties}>
                    <div className="story-flow__index"><span>{item.number}</span><i><Icon /></i></div>
                    <div className="story-flow__copy"><h3>{item.title}</h3><p>{item.summary}</p><small>{item.detail}</small></div>
                    <code>{item.example}</code>
                  </li>
                );
              })}
            </ol>
          </div>
        </section>

        <section className="story-capabilities story-section" id="capabilities">
          <div className="story-container">
            <div className="story-chapter" data-reveal><span>فصل سوم</span><b>قابلیت‌ها</b><i>03</i></div>
            <div className="story-capabilities__heading" data-reveal>
              <h2>از مشاهده تا اقدام،<br /><em>در یک فضای عملیاتی.</em></h2>
              <p>اجزای سامانه برای کم‌کردن رفت‌وآمد و خطای اپراتور کنار هم قرار گرفته‌اند، نه برای پنهان‌کردن واقعیت اجرا.</p>
            </div>
            <div className="story-capabilities__grid">
              {capabilities.map((item, index) => {
                const Icon = item.icon;
                return (
                  <article data-reveal key={item.title} style={{ "--delay": `${index * 80}ms` } as CSSProperties}>
                    <span><Icon /></span><small>0{index + 1}</small><h3>{item.title}</h3><p>{item.text}</p>
                  </article>
                );
              })}
            </div>
            <div className="story-platforms" data-reveal>
              <p>پشتیبانی براساس قابلیت ثبت‌شده‌ی هر تجهیز، نه صرفاً نام فروشنده</p>
              <div>{platforms.map((platform) => <span key={platform}>{platform}</span>)}</div>
            </div>
          </div>
        </section>

        <section className="story-control story-section" id="control">
          <div className="story-container story-control__grid">
            <div className="story-control__visual" data-reveal>
              <div className="story-control__rings" aria-hidden="true"><i /><i /><i /></div>
              <span className="story-control__core"><ShieldCheck /></span>
              <span className="story-control__badge story-control__badge--one"><Check /> Preview verified</span>
              <span className="story-control__badge story-control__badge--two"><Fingerprint /> Human confirmed</span>
              <span className="story-control__badge story-control__badge--three"><ScrollText /> Audit recorded</span>
            </div>
            <div className="story-control__copy" data-reveal>
              <span className="story-kicker">PROPOSAL FIRST / EXECUTION CONTROLLED</span>
              <h2>ساخت برنامه آسان‌تر؛<br /><em>اجرای تغییر سخت‌گیرانه‌تر.</em></h2>
              <p>سامانه می‌تواند برای یک درخواست ActionPlan بسازد، اما فقط آیتم implemented که Planner، Template و Handler ثبت‌شده دارد از مرز اجرا عبور می‌کند. موارد manualOnly، planned و unsupported هرگز به‌جای عملیات واقعی نمایش داده نمی‌شوند.</p>
              <ul>
                <li><CheckCircle2 /><span><b>وضعیت کاتالوگ مرز اجرا را تعیین می‌کند</b><small>implemented قابل اجراست؛ manualOnly فقط برای بازبینی می‌ماند.</small></span></li>
                <li><CheckCircle2 /><span><b>Preview با Execution یکی نیست</b><small>پیش‌نمایش هیچ تغییری روی تجهیز ایجاد نمی‌کند.</small></span></li>
                <li><CheckCircle2 /><span><b>موفقیت به اجرای واقعی وابسته است</b><small>بدون connectorInvoked و شواهد نتیجه، succeeded ثبت نمی‌شود.</small></span></li>
              </ul>
            </div>
          </div>
        </section>

        <section className="story-ending story-section">
          <div className="story-container" data-reveal>
            <span><Sparkles /> ساخته‌شده برای عملیات واقعی شبکه و امنیت</span>
            <h2>از درخواست فارسی،<br /><em>به نتیجه‌ی قابل استناد.</em></h2>
            <p>برای اپراتوری که می‌خواهد سریع‌تر عمل کند، بدون آن‌که کنترل، قابلیت واقعی تجهیز یا ردپای ممیزی را دور بزند.</p>
            <a href="#top" className="story-button">بازگشت به آغاز <ArrowDown /></a>
          </div>
        </section>
      </main>

      <footer className="story-footer">
        <div className="story-container story-footer__top">
          <Brand />
          <p>Mini‑SOAR فارسی‌محور برای شناخت تجهیز، ساخت ActionPlan، اجرای کنترل‌شده و ثبت نتیجه‌ی واقعی.</p>
          <nav><a href="#story">سامانه</a><a href="#flow">نحوه‌ی کار</a><a href="#capabilities">قابلیت‌ها</a><a href="#control">امنیت اجرا</a></nav>
        </div>
        <div className="story-container story-footer__bottom"><span>© ۲۰۲۶ Firewall Security Orchestrator</span><span><i /> Persian-first Mini-SOAR</span></div>
      </footer>
    </div>
  );
}

export default LandingStoryPage;
