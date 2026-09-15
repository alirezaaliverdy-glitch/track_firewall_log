import { Bot, Boxes, ChevronDown, Crosshair, Gauge, LayoutDashboard, LogOut, Menu, MoreHorizontal, PanelLeftClose, PanelLeftOpen, PanelRightClose, PanelRightOpen, Plus, Server, Settings, ShieldAlert, ShieldCheck, WifiOff, Wrench, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Link, useLocation } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import type { Device } from "@/lib/devices";
import type { ProductNavigationGroup } from "@/lib/productState";
import { useOnlineStatus } from "@/lib/useOnlineStatus";
import { getMobilePreference, setMobilePreference } from "@/lib/mobileStorage";
import { clearNativeServerUrl, isNativeAndroidApp } from "@/mobile/nativeServerConfig";
import { clearNativeSessionToken } from "@/mobile/nativeSession";
import "./MobileShell.css";
import "./AppShellNavigation.css";
import "./AppShellTopbar.css";

const navigationIcons = {
  dashboard: LayoutDashboard,
  assets: Boxes,
  security: ShieldAlert,
  monitoring: Gauge,
  actions: Wrench,
  assistant: Bot,
  attackers: Crosshair,
  settings: Settings
} as const;

const navigationTones: Record<string, string> = {
  dashboard: "cyan", assets: "violet", security: "rose", monitoring: "emerald",
  actions: "amber", assistant: "fuchsia", attackers: "red", settings: "sky"
};

const fallbackNavigation: ProductNavigationGroup[] = [
  { key: "dashboard", titleFa: "داشبورد", titleEn: "Dashboard", iconKey: "dashboard", route: "/dashboard", mobilePrimary: true, items: [] },
  { key: "assets", titleFa: "دارایی‌ها", titleEn: "Assets", iconKey: "assets", route: "/assets", mobilePrimary: true, items: [] },
  { key: "security", titleFa: "امنیت", titleEn: "Security", iconKey: "security", route: "/security", mobilePrimary: false, items: [] },
  { key: "monitoring", titleFa: "پایش", titleEn: "Monitoring", iconKey: "monitoring", route: "/monitoring", mobilePrimary: true, items: [] },
  { key: "actions", titleFa: "اقدامات", titleEn: "Actions", iconKey: "actions", route: "/actions", mobilePrimary: true, items: [] },
  { key: "assistant", titleFa: "دستیار هوشمند", titleEn: "Assistant", iconKey: "assistant", route: "/assistant", mobilePrimary: false, items: [] },
  { key: "attackers", titleFa: "مهاجمان", titleEn: "Attackers", iconKey: "attackers", route: "/attackers", mobilePrimary: false, items: [] },
  { key: "settings", titleFa: "تنظیمات", titleEn: "Settings", iconKey: "settings", route: "/settings", mobilePrimary: false, items: [] },
];

function deviceIdFromLocation(pathname: string, search: string) {
  const queryDeviceId = new URLSearchParams(search).get("deviceId");
  if (queryDeviceId) return queryDeviceId;
  const match = pathname.match(/^\/assets\/devices\/([^/]+)/);
  return match && !["new", "onboarding"].includes(match[1]) ? decodeURIComponent(match[1]) : "";
}

function deferAfterFirstPaint(callback: () => void) {
  let timeoutId: number | undefined;
  const frameId = window.requestAnimationFrame(() => {
    timeoutId = window.setTimeout(callback, 0);
  });
  return () => {
    window.cancelAnimationFrame(frameId);
    if (timeoutId !== undefined) window.clearTimeout(timeoutId);
  };
}

export function AppShell({ children, currentGroup = "dashboard" }: { children: ReactNode; currentGroup?: string }) {
  const { user, logout } = useAuth();
  const { t, i18n } = useTranslation();
  const location = useLocation();
  const [collapsed, setCollapsed] = useState(() => {
    if (isNativeAndroidApp() || window.matchMedia("(max-width: 900px)").matches) return false;
    try { return getMobilePreference("sidebarCollapsed") === "true"; }
    catch { return false; }
  });
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const accountMenuRef = useRef<HTMLDetailsElement>(null);
  const [navigation, setNavigation] = useState<ProductNavigationGroup[]>([]);
  const [navigationError, setNavigationError] = useState(false);
  const [devices, setDevices] = useState<Device[]>([]);
  const online = useOnlineStatus();
  const isFa = i18n.language?.startsWith("fa");
  const direction = isFa ? "rtl" : "ltr";
  const activeGroup = currentGroup;
  const selectedDeviceId = useMemo(() => deviceIdFromLocation(location.pathname, location.search), [location.pathname, location.search]);
  const selectedDevice = devices.find((device) => device.id === selectedDeviceId) ?? null;
  const localNavigation = useMemo(() => fallbackNavigation.filter((group) => (
    group.key === "settings" || user?.role === "admin" || (user?.allowedSections ?? []).includes(group.key)
  )), [user?.allowedSections, user?.role]);
  const visibleNavigation = navigation.length ? navigation : localNavigation;
  const connectionHealthy = online && navigation.length > 0 && !navigationError;
  const mobileNavigation = ["dashboard", "assets", "monitoring", "actions"]
    .map((key) => visibleNavigation.find((group) => group.key === key))
    .filter((group): group is ProductNavigationGroup => Boolean(group));
  const moreNavigationActive = !mobileNavigation.some((group) => group.key === activeGroup);
  const SidebarToggleIcon = direction === "rtl" ? (collapsed ? PanelRightOpen : PanelRightClose) : (collapsed ? PanelLeftOpen : PanelLeftClose);
  const activeNavigation = visibleNavigation.find((group) => group.key === activeGroup);
  const ActiveGroupIcon = navigationIcons[activeNavigation?.iconKey as keyof typeof navigationIcons] ?? LayoutDashboard;
  const activeTitle = activeNavigation ? (isFa ? activeNavigation.titleFa : activeNavigation.titleEn) : (isFa ? "مرکز عملیات" : "Operations");

  function toggleSidebar() {
    setCollapsed((value) => {
      const next = !value;
      try { setMobilePreference("sidebarCollapsed", String(next)); } catch { /* navigation still works without storage */ }
      return next;
    });
  }

  function openMobileNavigation() {
    accountMenuRef.current?.removeAttribute("open");
    setMobileNavOpen(true);
  }

  useEffect(() => {
    let active = true;
    let retryId: number | undefined;
    const loadNavigation = () => {
      void import("@/lib/productState")
        .then(({ getProductNavigation }) => getProductNavigation())
        .then((items) => {
          if (active) {
            setNavigation(items);
            setNavigationError(false);
          }
        })
        .catch(() => {
          if (active) {
            setNavigation([]);
            setNavigationError(true);
            retryId = window.setTimeout(loadNavigation, 10_000);
          }
        });
    };
    const cancelDeferred = deferAfterFirstPaint(loadNavigation);
    return () => {
      active = false;
      cancelDeferred();
      if (retryId !== undefined) window.clearTimeout(retryId);
    };
  }, []);

  useEffect(() => {
    if (!selectedDeviceId) {
      setDevices([]);
      return;
    }
    let active = true;
    const cancelDeferred = deferAfterFirstPaint(() => {
      void import("@/lib/devices")
        .then(({ listDevices }) => listDevices())
        .then((items) => { if (active) setDevices(items); })
        .catch(() => { if (active) setDevices([]); });
    });
    return () => {
      active = false;
      cancelDeferred();
    };
  }, [selectedDeviceId]);

  useEffect(() => {
    setMobileNavOpen(false);
    accountMenuRef.current?.removeAttribute("open");
  }, [location.pathname, location.search]);

  useEffect(() => {
    document.body.classList.toggle("platform-drawer-open", mobileNavOpen);
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMobileNavOpen(false);
    };
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.classList.remove("platform-drawer-open");
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [mobileNavOpen]);

  return (
    <div className={`platform-shell ${collapsed ? "is-sidebar-collapsed" : ""}`} dir={direction}>
      <button type="button" className={`platform-drawer-scrim ${mobileNavOpen ? "is-open" : ""}`} onClick={() => setMobileNavOpen(false)} aria-label={t("shell.toggleNavigation")} />
      <aside id="platform-primary-navigation" className={`platform-sidebar ${collapsed && !mobileNavOpen ? "is-collapsed" : ""} ${mobileNavOpen ? "is-mobile-open" : ""}`} aria-label={t("shell.primaryNavigation")}>
        <span className="platform-sidebar__aurora" aria-hidden="true" />
        <div className="platform-sidebar__controls">
          <Link to="/dashboard" className="platform-sidebar__brand" aria-label={isFa ? "مرکز فرمان فایروال" : "Firewall SOAR home"}>
            <span className="platform-sidebar__brand-mark"><ShieldCheck aria-hidden="true" /><i /><i /></span>
            <span className="platform-sidebar__brand-copy"><strong>Firewall SOAR</strong><small>{isFa ? "مرکز فرمان امنیت" : "Security command"}</small></span>
          </Link>
          <button type="button" className="platform-sidebar__toggle" onClick={toggleSidebar} aria-label={t("shell.toggleNavigation")} aria-expanded={!collapsed} title={isFa ? (collapsed ? "بازکردن منو" : "جمع‌کردن منو") : (collapsed ? "Expand navigation" : "Collapse navigation")}>
            <SidebarToggleIcon className="h-4 w-4" aria-hidden="true" />
          </button>
          <button type="button" className="platform-sidebar__close" onClick={() => setMobileNavOpen(false)} aria-label={t("shell.toggleNavigation")}>
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
        <nav className="platform-sidebar__nav">
          {navigationError ? <span className="platform-navigation-status" role="status">{isFa ? "نمای پایه؛ ارتباط برای جزئیات دوباره بررسی می‌شود" : "Core navigation; reconnecting for details"}</span> : null}
          {visibleNavigation.map((group) => {
            const Icon = navigationIcons[group.iconKey as keyof typeof navigationIcons] ?? LayoutDashboard;
            return (
              <section key={group.key} data-tone={navigationTones[group.key] ?? "cyan"} className={`platform-nav-group ${activeGroup === group.key ? "is-active" : ""}`}>
                <Link to={group.route} className="platform-nav-group__label" title={collapsed && !mobileNavOpen ? (isFa ? group.titleFa : group.titleEn) : undefined} aria-current={activeGroup === group.key ? "page" : undefined}>
                  <Icon className="h-4 w-4" aria-hidden="true" />
                  <span>{isFa ? group.titleFa : group.titleEn}</span>
                  <i className="platform-nav-group__signal" aria-hidden="true" />
                </Link>
                {(!collapsed || mobileNavOpen) && group.items.length > 1 ? (
                  <div className="platform-nav-group__children">
                    {group.items.map((item) => (
                      <Link key={item.key} to={item.route} className={location.pathname === item.route ? "is-current" : ""}>
                        <span>{isFa ? item.titleFa : item.titleEn}</span>
                      </Link>
                    ))}
                  </div>
                ) : null}
              </section>
            );
          })}
        </nav>
        <footer className="platform-sidebar__profile">
          <span className="platform-sidebar__avatar">{(user?.displayName || user?.username || "U").slice(0, 1).toLocaleUpperCase()}<i aria-hidden="true" /></span>
          <span className="platform-sidebar__profile-copy"><strong>{user?.displayName || user?.username}</strong><small>{user?.role === "admin" ? (isFa ? "مدیر سامانه" : "Administrator") : user?.role}</small></span>
          <button type="button" onClick={() => void logout()} aria-label={t("auth.logout")} title={t("auth.logout")}><LogOut aria-hidden="true" /></button>
        </footer>
      </aside>
      <div className="platform-main">
        <header className="platform-topbar">
          <button
            type="button"
            className="platform-mobile-menu"
            onClick={openMobileNavigation}
            aria-controls="platform-primary-navigation"
            aria-expanded={mobileNavOpen}
            aria-label={t("shell.toggleNavigation")}
          >
            <Menu className="h-4 w-4" aria-hidden="true" />
          </button>
          <div className="topbar-current">
            <span className="topbar-current__icon" data-tone={navigationTones[activeGroup] ?? "cyan"}><ActiveGroupIcon aria-hidden="true" /></span>
            <span><small>{isFa ? "فضای کاری" : "Workspace"}</small><strong>{activeTitle}</strong></span>
            <i className={`topbar-health-dot ${connectionHealthy ? "is-online" : "is-offline"}`} title={connectionHealthy ? t("shell.backendConnected") : t("shell.backendUnavailable")} />
          </div>
          <nav className="topbar-tools" aria-label={t("shell.operationContext")}>
            <Link to={selectedDevice ? `/assets/devices/${selectedDevice.id}` : "/assets/devices"} className="topbar-device">
              <Server aria-hidden="true" /><span><small>{t("shell.selectedDevice")}</small><strong dir={selectedDevice ? "ltr" : direction}>{selectedDevice ? `${selectedDevice.name} · ${selectedDevice.vendor}` : t("shell.noDeviceSelected")}</strong></span>
            </Link>
            <Link to="/actions" className="topbar-create"><Plus aria-hidden="true" /><span>{isFa ? "اقدام جدید" : "New action"}</span></Link>
            <details ref={accountMenuRef} className="topbar-account">
              <summary aria-label={isFa ? "منوی حساب" : "Account menu"}><span>{(user?.displayName || user?.username || "U").slice(0, 1).toLocaleUpperCase()}</span><strong>{user?.displayName || user?.username}</strong><ChevronDown aria-hidden="true" /></summary>
              <div className="topbar-account__menu">
                <header><span>{(user?.displayName || user?.username || "U").slice(0, 1).toLocaleUpperCase()}</span><div><strong>{user?.displayName || user?.username}</strong><small>{user?.role === "admin" ? (isFa ? "مدیر سامانه" : "Administrator") : user?.role}</small></div></header>
                <div className="topbar-language" aria-label={isFa ? "زبان" : "Language"}><button type="button" aria-pressed={isFa} onClick={() => void i18n.changeLanguage("fa")}>فارسی</button><button type="button" aria-pressed={!isFa} onClick={() => void i18n.changeLanguage("en")}>English</button></div>
                <Link to="/settings"><Settings aria-hidden="true" />{isFa ? "حساب و تنظیمات" : "Account & settings"}</Link>
                {isNativeAndroidApp() ? <button type="button" className="topbar-native-server" onClick={() => void clearNativeSessionToken().finally(() => { clearNativeServerUrl(); window.location.reload(); })}><Server aria-hidden="true" />{isFa ? "تغییر سرور" : "Change server"}</button> : null}
                <button type="button" className="topbar-logout" onClick={() => void logout()}><LogOut aria-hidden="true" />{t("auth.logout")}</button>
              </div>
            </details>
          </nav>
        </header>
        {!online ? (
          <div className="platform-offline-banner" role="status">
            <WifiOff className="h-4 w-4" aria-hidden="true" />
            <span>{t("shell.offlineBanner")}</span>
          </div>
        ) : null}
        <main className="platform-content">
          {children}
        </main>
      </div>
      <nav className="platform-bottom-nav" aria-label={t("shell.mobileNavigation")}>
        {mobileNavigation.map((group) => {
          const Icon = navigationIcons[group.iconKey as keyof typeof navigationIcons] ?? LayoutDashboard;
          return <Link key={group.key} to={group.route} className={activeGroup === group.key ? "is-current" : ""} aria-current={activeGroup === group.key ? "page" : undefined}><Icon aria-hidden="true" /><span>{isFa ? group.titleFa : group.titleEn}</span></Link>;
        })}
        <button type="button" className={moreNavigationActive ? "is-current" : ""} onClick={openMobileNavigation} aria-expanded={mobileNavOpen} aria-controls="platform-primary-navigation" aria-label={isFa ? "نمایش همه بخش‌ها" : "Show all sections"}><MoreHorizontal aria-hidden="true" /><span>{isFa ? "بیشتر" : "More"}</span></button>
      </nav>
    </div>
  );
}
