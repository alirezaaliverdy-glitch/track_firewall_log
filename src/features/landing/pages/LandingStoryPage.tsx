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
    icon: Command,
    title: "درخواست را فارسی بنویسید",
    summary: "به‌جای حفظ‌کردن سینتکس هر تجهیز، هدف عملیاتی را همان‌طور که در ذهن دارید بیان کنید.",
    detail: "سامانه ابتدا کاتالوگ فرمان‌های تاییدشده را بررسی می‌کند و فقط در صورت نبود مسیر آماده، از هوش مصنوعی برای پیشنهاد استفاده می‌کند.",
    example: "«وضعیت فایروال سرور اصلی را بررسی کن»",
  },
  {
    number: "۰۲",
    icon: Eye,
    title: "قبل از اجرا، همه‌چیز را ببینید",
    summary: "ActionPlan مقصد، پارامترها و مراحل واقعی را به یک پیش‌نمایش روشن تبدیل می‌کند.",
    detail: "هیچ خروجی خام هوش مصنوعی اجرا نمی‌شود. دستگاه انتخاب‌شده، قالب ثبت‌شده و ورودی‌های معتبر باید کنار هم قرار بگیرند.",
    example: "Preview · Target · Parameters · Steps",
  },
  {
    number: "۰۳",
    icon: Fingerprint,
    title: "تایید نهایی همیشه با اپراتور است",
    summary: "هوش مصنوعی پیشنهاد می‌دهد؛ تصمیم برای عبور از نقطه‌ی کنترل متعلق به شماست.",
    detail: "پس از تایید، PolicyGuard برنامه را دوباره با سیاست‌های اجرا، سطح دسترسی و وضعیت مقصد تطبیق می‌دهد.",
    example: "User confirm → PolicyGuard",
  },
  {
    number: "۰۴",
    icon: Zap,
    title: "نتیجه‌ی واقعی، نه یک پیام خوش‌بینانه",
    summary: "موفقیت فقط وقتی ثبت می‌شود که Connector واقعاً اجرا شده و شواهد نتیجه را برگردانده باشد.",
    detail: "خروجی، وضعیت، زمان و رویدادهای ممیزی کنار همان ActionPlan می‌مانند تا مسیر تصمیم قابل پیگیری باشد.",
    example: "Connector → Evidence → Audit",
  },
];

const capabilities = [
  { icon: Bot, title: "دستیار فارسی", text: "گفت‌وگو، پرسش درباره‌ی تجهیز و درخواست اقدام در یک تجربه‌ی یکپارچه، اما با مرزهای اجرایی روشن." },
  { icon: Gauge, title: "پایش زنده", text: "سلامت تجهیزات، وضعیت Connectorها و رخدادهای عملیاتی بدون جابه‌جایی میان چند ابزار پراکنده." },
  { icon: Network, title: "چندفروشنده", text: "یک زبان عملیاتی مشترک برای Linux، MikroTik، Cisco و FortiGate، متناسب با سطح پشتیبانی واقعی هر پلتفرم." },
  { icon: ScrollText, title: "ممیزی کامل", text: "پیشنهاد، پیش‌نمایش، تایید، اجرا و نتیجه در یک زنجیره‌ی قابل بازبینی باقی می‌مانند." },
];

const platforms = ["LINUX", "MIKROTIK", "CISCO", "FORTIGATE", "NETBOX", "WAZUH"];

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
            <span className="is-complete"><i><Check /></i><b>Catalog match</b><small>linux.firewall.status</small></span>
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
            <div className="story-hero__tag"><span /> MINI–SOAR / PERSIAN FIRST</div>
            <h1>
              عملیات امنیتی،
              <span>از فهم تا اقدام</span>
              <em>در یک مسیر روشن.</em>
            </h1>
            <p>Firewall Log Analyzer یک مرکز فرمان سبک برای تیم‌های شبکه و امنیت است؛ رخداد را می‌فهمد، اقدام مناسب را پیشنهاد می‌دهد و اجرای واقعی را پشت پیش‌نمایش، تایید اپراتور و کنترل سیاست نگه می‌دارد.</p>
            <div className="story-hero__actions">
              <a href="#story" className="story-button">سامانه را بشناسید <ArrowDown /></a>
              <span><i /> بدون اجرای خام هوش مصنوعی</span>
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
              <p>وقتی یک هشدار می‌رسد، مسئله فقط دیدن آن نیست.</p>
              <h2>باید بدانید <em>چه اتفاقی افتاده،</em><br />چه کاری درست است، و اجرای آن<br /><em>واقعاً چه نتیجه‌ای داده.</em></h2>
            </div>
            <div className="story-intro__grid">
              <p data-reveal>سامانه‌ی شما تحلیل لاگ، وضعیت تجهیزات، دستیار فارسی و مرکز اقدام را از هم جدا نگه نمی‌دارد. همه‌ی آن‌ها بخشی از یک زنجیره‌اند: از مشاهده و تصمیم تا اجرای کنترل‌شده و ثبت شواهد.</p>
              <div data-reveal>
                <span><strong>دیدن</strong><small>تله‌متری و یافته‌ها</small></span>
                <span><strong>فهمیدن</strong><small>تحلیل و پیشنهاد</small></span>
                <span><strong>اقدام</strong><small>تایید و اجرای واقعی</small></span>
              </div>
            </div>
          </div>
        </section>

        <section className="story-product story-section">
          <div className="story-container">
            <div className="story-product__heading" data-reveal>
              <span>یک فرمان ساده، یک مسیر کامل</span>
              <h2>پیچیدگی زیرساخت پشت یک تجربه‌ی <em>آرام و قابل فهم</em> می‌ماند.</h2>
            </div>
            <div data-reveal><CommandArtifact /></div>
          </div>
        </section>

        <section className="story-flow story-section" id="flow">
          <div className="story-container">
            <div className="story-chapter" data-reveal><span>فصل دوم</span><b>نحوه‌ی کار</b><i>02</i></div>
            <div className="story-flow__heading" data-reveal>
              <h2>کارهای چندمرحله‌ای،<br /><em>بدون پرش از روی مرحله‌های مهم.</em></h2>
              <p>هر مرحله تنها زمانی آغاز می‌شود که مرحله‌ی قبلی وضعیت روشن و قابل اتکایی داشته باشد.</p>
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
              <h2>ابزارهای کمتر.<br /><em>تصویر عملیاتی کامل‌تر.</em></h2>
              <p>همه‌چیز برای کم‌کردن اصطکاک اپراتور طراحی شده، نه حذف قضاوت او.</p>
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
              <p>یک زبان مشترک برای زیرساخت ناهمگون</p>
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
              <span className="story-kicker">AUTOMATED WORK / HUMAN CONTROL</span>
              <h2>سرعت ماشین،<br /><em>با مسئولیت‌پذیری انسان.</em></h2>
              <p>دستیار می‌تواند مسیر را کوتاه کند، اما نقطه‌ی تصمیم را حذف نمی‌کند. پیش از هر تغییر، شما مقصد و اثر اقدام را می‌بینید و تایید می‌کنید.</p>
              <ul>
                <li><CheckCircle2 /><span><b>Preview با Execution یکی نیست</b><small>پیش‌نمایش هیچ تغییری روی تجهیز ایجاد نمی‌کند.</small></span></li>
                <li><CheckCircle2 /><span><b>PolicyGuard همیشه در مسیر است</b><small>کنترل سیاست قبل از فراخوانی Connector انجام می‌شود.</small></span></li>
                <li><CheckCircle2 /><span><b>موفقیت به شواهد واقعی وابسته است</b><small>بدون اجرای Connector، وضعیت succeeded ثبت نمی‌شود.</small></span></li>
              </ul>
            </div>
          </div>
        </section>

        <section className="story-ending story-section">
          <div className="story-container" data-reveal>
            <span><Sparkles /> ساخته‌شده برای اپراتورهایی که باید مطمئن باشند</span>
            <h2>از هشدار عبور کنید.<br /><em>به نتیجه برسید.</em></h2>
            <p>یک تجربه‌ی فارسی، شفاف و کنترل‌شده برای روزهایی که سرعت مهم است و اشتباه هزینه دارد.</p>
            <a href="#top" className="story-button">بازگشت به آغاز <ArrowDown /></a>
          </div>
        </section>
      </main>

      <footer className="story-footer">
        <div className="story-container story-footer__top">
          <Brand />
          <p>تحلیل هوشمند، اقدام کنترل‌شده و ممیزی کامل برای عملیات امنیت شبکه.</p>
          <nav><a href="#story">سامانه</a><a href="#flow">نحوه‌ی کار</a><a href="#capabilities">قابلیت‌ها</a><a href="#control">امنیت اجرا</a></nav>
        </div>
        <div className="story-container story-footer__bottom"><span>© ۲۰۲۶ Firewall Security Orchestrator</span><span><i /> Persian-first Mini-SOAR</span></div>
      </footer>
    </div>
  );
}

export default LandingStoryPage;
