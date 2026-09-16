import { useEffect, useState, type CSSProperties } from "react";
import { Link } from "react-router-dom";
import {
  Activity,
  ArrowLeft,
  Bot,
  Check,
  CheckCircle2,
  ChevronDown,
  CircleDot,
  Clock3,
  Command,
  Fingerprint,
  Gauge,
  Layers3,
  LockKeyhole,
  Menu,
  Network,
  Play,
  Radar,
  ScrollText,
  Server,
  ShieldCheck,
  Sparkles,
  TerminalSquare,
  X,
  Zap,
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import "./LandingPage.css";

const featureCards = [
  {
    icon: Bot,
    eyebrow: "دستیار هوشمند",
    title: "عملیات امنیتی، به زبان فارسی",
    description: "درخواست خود را طبیعی بنویسید؛ سامانه ابتدا فرمان‌های تاییدشده‌ی کاتالوگ را پیدا می‌کند و یک برنامه‌ی اقدام قابل بررسی می‌سازد.",
    accent: "cyan",
  },
  {
    icon: ShieldCheck,
    eyebrow: "اجرای کنترل‌شده",
    title: "هر اقدام، قبل از اجرا روشن است",
    description: "پارامترها، دستگاه مقصد و مراحل اجرا را در پیش‌نمایش ببینید. اجرا فقط پس از تایید شما و عبور از PolicyGuard انجام می‌شود.",
    accent: "violet",
  },
  {
    icon: Radar,
    eyebrow: "دید یکپارچه",
    title: "از تله‌متری تا تصمیم عملیاتی",
    description: "سلامت تجهیزات، یافته‌های امنیتی و وضعیت اکشن‌ها را در یک نمای منسجم برای Linux، MikroTik، Cisco و FortiGate دنبال کنید.",
    accent: "green",
  },
  {
    icon: ScrollText,
    eyebrow: "ردپای قابل اتکا",
    title: "نتیجه‌ی واقعی، با شواهد واقعی",
    description: "خروجی Connector، وضعیت اجرا و رویدادهای ممیزی کنار هر ActionPlan ثبت می‌شوند تا تصمیم‌ها قابل پیگیری باقی بمانند.",
    accent: "amber",
  },
];

const ecosystem = [
  { name: "MikroTik", detail: "RouterOS", mark: "MT" },
  { name: "Cisco", detail: "IOS / IOS-XE", mark: "CS" },
  { name: "Fortinet", detail: "FortiGate", mark: "FG" },
  { name: "Linux", detail: "SSH Telemetry", mark: "LX" },
  { name: "NetBox", detail: "Asset Sync", mark: "NB" },
  { name: "Wazuh", detail: "Security Events", mark: "WZ" },
];

const workflow = [
  { icon: Command, title: "درخواست فارسی", copy: "هدف عملیاتی را با زبان طبیعی مشخص کنید." },
  { icon: Layers3, title: "برنامه‌ی اقدام", copy: "کاتالوگ و Planner ورودی‌ها را به ActionPlan تبدیل می‌کنند." },
  { icon: Fingerprint, title: "پیش‌نمایش و تایید", copy: "مقصد، پارامترها و اثر اقدام را قبل از اجرا ببینید." },
  { icon: Zap, title: "اجرای امن و ممیزی", copy: "PolicyGuard و Connector نتیجه‌ی واقعی را ثبت می‌کنند." },
];

function ProductMark() {
  return (
    <span className="landing-brand" aria-label="Firewall Log Analyzer">
      <span className="landing-brand__mark"><ShieldCheck aria-hidden="true" /></span>
      <span><strong>Firewall</strong><small>AI Security Orchestrator</small></span>
    </span>
  );
}

function HeroConsole() {
  return (
    <div className="hero-console" aria-label="پیش‌نمایش رابط سامانه">
      <div className="hero-console__glow" />
      <div className="hero-console__shell">
        <aside className="console-rail" aria-hidden="true">
          <ShieldCheck />
          <span className="is-active"><Gauge /></span>
          <span><Activity /></span>
          <span><Server /></span>
          <span><TerminalSquare /></span>
        </aside>
        <div className="console-main">
          <header className="console-topbar">
            <span><i /> مرکز عملیات</span>
            <div><small>زنده</small><span className="console-avatar">OP</span></div>
          </header>
          <div className="console-grid">
            <section className="console-chart-card">
              <div className="console-card-heading">
                <span><small>سلامت شبکه</small><strong>پایدار و تحت پایش</strong></span>
                <span className="status-safe"><CircleDot /> امن</span>
              </div>
              <div className="console-chart" aria-hidden="true">
                <svg viewBox="0 0 460 150" preserveAspectRatio="none">
                  <defs>
                    <linearGradient id="lineGradient" x1="0" y1="0" x2="1" y2="0">
                      <stop offset="0" stopColor="#1aa7ba" />
                      <stop offset="1" stopColor="#4ee7ca" />
                    </linearGradient>
                    <linearGradient id="areaGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0" stopColor="#20c7cc" stopOpacity=".3" />
                      <stop offset="1" stopColor="#20c7cc" stopOpacity="0" />
                    </linearGradient>
                  </defs>
                  <path className="chart-grid" d="M0 30H460M0 75H460M0 120H460" />
                  <path className="chart-area" d="M0 118 C35 105 55 122 90 94 S145 56 181 78 S235 102 270 68 S326 38 360 54 S416 23 460 35 V150 H0Z" />
                  <path className="chart-line" d="M0 118 C35 105 55 122 90 94 S145 56 181 78 S235 102 270 68 S326 38 360 54 S416 23 460 35" />
                  <circle cx="360" cy="54" r="5" />
                </svg>
              </div>
              <div className="console-metrics">
                <span><strong>۲۴</strong><small>تجهیز متصل</small></span>
                <span><strong>۹۸٪</strong><small>سلامت Connector</small></span>
                <span><strong>۷</strong><small>اکشن امروز</small></span>
              </div>
            </section>
            <section className="console-feed-card">
              <div className="console-card-heading">
                <span><small>رویدادهای اخیر</small><strong>صف عملیات</strong></span>
                <Activity />
              </div>
              <ul>
                <li><span className="event-icon is-danger"><Network /></span><span><strong>تلاش ورود مشکوک</strong><small>Linux Gateway · همین حالا</small></span></li>
                <li><span className="event-icon is-success"><Check /></span><span><strong>Daily Check تکمیل شد</strong><small>MikroTik Core · ۲ دقیقه قبل</small></span></li>
                <li><span className="event-icon is-info"><Clock3 /></span><span><strong>در انتظار تایید اپراتور</strong><small>ActionPlan #۴۲۱</small></span></li>
              </ul>
            </section>
          </div>
          <section className="command-composer">
            <div className="command-composer__head"><Sparkles /><span>دستیار عملیات امنیتی</span><em>Catalog first</em></div>
            <div className="command-bubble">وضعیت فایروال سرور اصلی را بررسی کن</div>
            <div className="plan-preview">
              <span className="plan-preview__icon"><ShieldCheck /></span>
              <span><small>ActionPlan آماده‌ی پیش‌نمایش</small><strong>بررسی وضعیت Firewall · Linux</strong></span>
              <button type="button" tabIndex={-1}>بررسی <ArrowLeft /></button>
            </div>
          </section>
        </div>
      </div>
      <div className="hero-alert-card">
        <span className="hero-alert-card__icon"><ShieldCheck /></span>
        <span><small>PolicyGuard</small><strong>کنترل‌ها با موفقیت بررسی شدند</strong></span>
        <CheckCircle2 />
      </div>
    </div>
  );
}

function LandingPage() {
  const { user } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const elements = Array.from(document.querySelectorAll<HTMLElement>("[data-reveal]"));
    const observer = new IntersectionObserver(
      (entries) => entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-visible");
          observer.unobserve(entry.target);
        }
      }),
      { threshold: 0.16, rootMargin: "0px 0px -50px" },
    );
    elements.forEach((element) => observer.observe(element));
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    document.body.classList.add("landing-active");
    return () => document.body.classList.remove("landing-active");
  }, []);

  return (
    <div className="landing-page" dir="rtl">
      <div className="landing-ambient" aria-hidden="true"><span /><span /><span /></div>
      <header className={`landing-header ${scrolled ? "is-scrolled" : ""}`}>
        <div className="landing-container landing-header__inner">
          <Link to="/" className="landing-logo"><ProductMark /></Link>
          <nav className={`landing-nav ${menuOpen ? "is-open" : ""}`} aria-label="ناوبری اصلی">
            <a href="#features" onClick={() => setMenuOpen(false)}>قابلیت‌ها</a>
            <a href="#workflow" onClick={() => setMenuOpen(false)}>نحوه کار</a>
            <a href="#ecosystem" onClick={() => setMenuOpen(false)}>سازگاری‌ها</a>
            <a href="#security" onClick={() => setMenuOpen(false)}>امنیت اجرا</a>
          </nav>
          <div className="landing-header__actions">
            <Link to="/dashboard" className="landing-login-link">{user ? "بازگشت به پنل" : "ورود"}</Link>
            <Link to="/dashboard" className="landing-button landing-button--small">شروع عملیات <ArrowLeft /></Link>
            <button className="landing-menu-button" type="button" onClick={() => setMenuOpen((value) => !value)} aria-expanded={menuOpen} aria-label="نمایش منو">
              {menuOpen ? <X /> : <Menu />}
            </button>
          </div>
        </div>
      </header>

      <main>
        <section className="landing-hero">
          <div className="landing-container landing-hero__grid">
            <div className="landing-hero__copy">
              <div className="landing-eyebrow"><span><Sparkles /></span> Mini-SOAR فارسی برای تیم‌های شبکه و امنیت</div>
              <h1>از هشدار تا اقدام امن،<br /><span>با یک فرمان فارسی.</span></h1>
              <p>Firewall Log Analyzer تحلیل، تصمیم و اجرای کنترل‌شده را در یک مسیر شفاف کنار هم می‌آورد؛ بدون اجرای متن خام هوش مصنوعی و بدون دور زدن تایید اپراتور.</p>
              <div className="landing-hero__actions">
                <Link to="/dashboard" className="landing-button">ورود به مرکز عملیات <ArrowLeft /></Link>
                <a href="#workflow" className="landing-button landing-button--ghost"><span className="play-icon"><Play /></span> ببینید چگونه کار می‌کند</a>
              </div>
              <div className="landing-trust-row">
                <span><CheckCircle2 /> پیش‌نمایش پیش از اجرا</span>
                <span><CheckCircle2 /> ثبت کامل ممیزی</span>
                <span><CheckCircle2 /> نتیجه‌ی واقعی Connector</span>
              </div>
            </div>
            <div className="landing-hero__visual"><HeroConsole /></div>
          </div>
          <a className="scroll-cue" href="#features" aria-label="رفتن به بخش قابلیت‌ها"><span>اسکرول برای کشف بیشتر</span><ChevronDown /></a>
        </section>

        <section className="ecosystem-strip" aria-label="فناوری‌های قابل مدیریت">
          <div className="landing-container">
            <p>یک مرکز فرمان برای زیرساخت ناهمگون شما</p>
            <div className="ecosystem-strip__items">
              {ecosystem.slice(0, 4).map((item) => <span key={item.name}><b>{item.mark}</b>{item.name}</span>)}
            </div>
          </div>
        </section>

        <section className="landing-section landing-features" id="features">
          <div className="landing-container">
            <div className="section-heading" data-reveal>
              <span className="section-kicker">همه‌چیز در یک دید عملیاتی</span>
              <h2>امنیت پیچیده است؛<br /><em>کار با آن نباید پیچیده باشد.</em></h2>
              <p>از فهم رخداد تا اجرای اقدام اصلاحی، هر مرحله برای اپراتور روشن، قابل بازبینی و قابل پیگیری طراحی شده است.</p>
            </div>
            <div className="features-grid">
              {featureCards.map((feature, index) => {
                const Icon = feature.icon;
                return (
                  <article className={`feature-card feature-card--${feature.accent}`} data-reveal key={feature.title} style={{ "--reveal-delay": `${index * 90}ms` } as CSSProperties}>
                    <div className="feature-card__icon"><Icon /></div>
                    <span>{feature.eyebrow}</span>
                    <h3>{feature.title}</h3>
                    <p>{feature.description}</p>
                    <a href="#workflow">جزئیات جریان <ArrowLeft /></a>
                  </article>
                );
              })}
            </div>
          </div>
        </section>

        <section className="landing-section landing-workflow" id="workflow">
          <div className="landing-container landing-workflow__layout">
            <div className="workflow-copy" data-reveal>
              <span className="section-kicker">یک مسیر شفاف، از نیت تا نتیجه</span>
              <h2>هوش مصنوعی پیشنهاد می‌دهد؛<br /><em>کنترل همیشه دست شماست.</em></h2>
              <p>سامانه درخواست را به عملیات تعریف‌شده نگاشت می‌کند، پیش‌نمایش قابل اتکا می‌سازد و فقط بعد از تایید شما به Connector ثبت‌شده اجازه‌ی اجرا می‌دهد.</p>
              <Link to="/dashboard" className="landing-text-link">مشاهده محیط عملیاتی <ArrowLeft /></Link>
            </div>
            <ol className="workflow-list">
              {workflow.map((item, index) => {
                const Icon = item.icon;
                return (
                  <li data-reveal key={item.title} style={{ "--reveal-delay": `${index * 100}ms` } as CSSProperties}>
                    <span className="workflow-list__number">۰{index + 1}</span>
                    <span className="workflow-list__icon"><Icon /></span>
                    <span><strong>{item.title}</strong><small>{item.copy}</small></span>
                  </li>
                );
              })}
            </ol>
          </div>
        </section>

        <section className="landing-section security-proof" id="security">
          <div className="landing-container security-proof__card" data-reveal>
            <div className="security-proof__visual" aria-hidden="true">
              <span className="orbit orbit--one"><i /></span>
              <span className="orbit orbit--two"><i /></span>
              <span className="security-core"><LockKeyhole /></span>
              <em className="proof-tag proof-tag--top"><Check /> PolicyGuard</em>
              <em className="proof-tag proof-tag--bottom"><ScrollText /> Audit trail</em>
            </div>
            <div className="security-proof__copy">
              <span className="section-kicker">امنیت در خودِ معماری اجرا</span>
              <h2>اتوماسیون سریع،<br /><em>بدون حذف مرزهای اعتماد.</em></h2>
              <p>هر عملیات به دستگاه انتخاب‌شده، پارامترهای اعتبارسنجی‌شده و قالب اجرایی ثبت‌شده متصل است. موفقیت فقط زمانی ثبت می‌شود که Connector واقعاً اجرا شده و نتیجه را بازگردانده باشد.</p>
              <ul>
                <li><CheckCircle2 /> عدم اجرای مستقیم خروجی خام AI</li>
                <li><CheckCircle2 /> تایید صریح کاربر پیش از اقدام</li>
                <li><CheckCircle2 /> شواهد، نتیجه و ممیزی در یک رکورد</li>
              </ul>
            </div>
          </div>
        </section>

        <section className="landing-section landing-ecosystem" id="ecosystem">
          <div className="landing-container">
            <div className="section-heading section-heading--compact" data-reveal>
              <span className="section-kicker">اکوسیستم زیرساخت</span>
              <h2>یک تجربه‌ی یکپارچه برای<br /><em>فناوری‌های متفاوت.</em></h2>
              <p>قابلیت‌ها متناسب با پلتفرم و سطح پشتیبانی هر Connector نمایش داده می‌شوند؛ بدون وعده‌ی غیرواقعی برای عملیات پشتیبانی‌نشده.</p>
            </div>
            <div className="ecosystem-grid">
              {ecosystem.map((item, index) => (
                <article data-reveal key={item.name} style={{ "--reveal-delay": `${index * 70}ms` } as CSSProperties}>
                  <span>{item.mark}</span><strong>{item.name}</strong><small>{item.detail}</small>
                </article>
              ))}
            </div>
            <p className="ecosystem-note">نام‌های تجاری صرفاً بیانگر فناوری‌های قابل شناسایی یا مسیرهای اتصال سامانه‌اند و به معنی همکاری تجاری نیستند.</p>
          </div>
        </section>

        <section className="landing-section landing-cta">
          <div className="landing-container" data-reveal>
            <div className="landing-cta__card">
              <div className="landing-cta__grid" aria-hidden="true" />
              <span className="landing-cta__icon"><ShieldCheck /></span>
              <h2>مرکز عملیات امنیتی‌تان را<br /><em>شفاف‌تر و سریع‌تر کنید.</em></h2>
              <p>از اولین فرمان فارسی تا ثبت نتیجه‌ی واقعی، همه‌چیز در یک مسیر کنترل‌شده و قابل ممیزی.</p>
              <Link to="/dashboard" className="landing-button">{user ? "بازگشت به داشبورد" : "ورود و شروع کار"} <ArrowLeft /></Link>
            </div>
          </div>
        </section>
      </main>

      <footer className="landing-footer">
        <div className="landing-container landing-footer__top">
          <div><ProductMark /><p>تحلیل هوشمند، اقدام کنترل‌شده و دید یکپارچه برای عملیات امنیت شبکه.</p></div>
          <div><strong>محصول</strong><a href="#features">قابلیت‌ها</a><a href="#workflow">نحوه کار</a><a href="#security">امنیت اجرا</a></div>
          <div><strong>سامانه</strong><Link to="/dashboard">داشبورد</Link><Link to="/assistant">دستیار هوشمند</Link><Link to="/actions">مرکز اقدام</Link></div>
          <div><strong>وضعیت</strong><span className="footer-status"><i /> سامانه آماده‌ی عملیات</span><small>Persian-first Mini-SOAR</small></div>
        </div>
        <div className="landing-container landing-footer__bottom"><span>© ۲۰۲۶ Firewall Log Analyzer</span><span>ساخته‌شده برای عملیات امن و قابل اعتماد</span></div>
      </footer>
    </div>
  );
}

export default LandingPage;
