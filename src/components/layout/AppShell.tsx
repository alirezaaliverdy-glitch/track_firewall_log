import { Bell, Bot, Boxes, Gauge, LayoutDashboard, LogOut, Menu, Plug, Search, Server, Settings, ShieldAlert, Wifi, WifiOff, Wrench, X } from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Link, useLocation } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { appRoutes } from "@/routes/appRoutes";
import { listDevices, type Device } from "@/lib/devices";
import { getProductNavigation, type ProductNavigationGroup } from "@/lib/productState";
import { useOnlineStatus } from "@/lib/useOnlineStatus";

const navigationIcons = {
  dashboard: LayoutDashboard,
  assets: Boxes,
  security: ShieldAlert,
  monitoring: Gauge,
  actions: Wrench,
  assistant: Bot,
  integrations: Plug,
  settings: Settings
} as const;

function deviceIdFromLocation(pathname: string, search: string) {
  const queryDeviceId = new URLSearchParams(search).get("deviceId");
  if (queryDeviceId) return queryDeviceId;
  const match = pathname.match(/^\/assets\/devices\/([^/]+)/);
  return match && !["new", "onboarding"].includes(match[1]) ? decodeURIComponent(match[1]) : "";
}

export function AppShell({ children, currentPath }: { children: ReactNode; currentPath: string }) {
  const { user, logout } = useAuth();
  const { t, i18n } = useTranslation();
  const location = useLocation();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [navigation, setNavigation] = useState<ProductNavigationGroup[]>([]);
  const [navigationError, setNavigationError] = useState(false);
  const [devices, setDevices] = useState<Device[]>([]);
  const online = useOnlineStatus();
  const isFa = i18n.language?.startsWith("fa");
  const direction = isFa ? "rtl" : "ltr";
  const activeGroup = appRoutes.find((route) => currentPath === route.path || currentPath.startsWith(`${route.path}/`))?.group ?? "dashboard";
  const selectedDeviceId = useMemo(() => deviceIdFromLocation(location.pathname, location.search), [location.pathname, location.search]);
  const selectedDevice = devices.find((device) => device.id === selectedDeviceId) ?? null;
  const connectionHealthy = online && navigation.length > 0 && !navigationError;
  const mobileNavigation = navigation.filter((group) => group.mobilePrimary);

  useEffect(() => {
    let active = true;
    getProductNavigation()
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
        }
      });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    let active = true;
    listDevices()
      .then((items) => { if (active) setDevices(items); })
      .catch(() => { if (active) setDevices([]); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    setMobileNavOpen(false);
  }, [location.pathname, location.search]);

  useEffect(() => {
    document.body.classList.toggle("platform-drawer-open", mobileNavOpen);
    return () => document.body.classList.remove("platform-drawer-open");
  }, [mobileNavOpen]);

  return (
    <div className="platform-shell" dir={direction}>
      <button type="button" className={`platform-drawer-scrim ${mobileNavOpen ? "is-open" : ""}`} onClick={() => setMobileNavOpen(false)} aria-label={t("shell.toggleNavigation")} />
      <aside id="platform-primary-navigation" className={`platform-sidebar ${collapsed ? "is-collapsed" : ""} ${mobileNavOpen ? "is-mobile-open" : ""}`} aria-label={t("shell.primaryNavigation")}>
        <div className="platform-sidebar__controls">
          <button type="button" className="platform-sidebar__toggle" onClick={() => setCollapsed((value) => !value)} aria-label={t("shell.toggleNavigation")} aria-expanded={!collapsed}>
            <Menu className="h-4 w-4" aria-hidden="true" />
          </button>
          <button type="button" className="platform-sidebar__close" onClick={() => setMobileNavOpen(false)} aria-label={t("shell.toggleNavigation")}>
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
        <nav className="platform-sidebar__nav">
          {navigationError ? <Link to="/dashboard" className="platform-nav-group__label">{isFa ? "داشبورد" : "Dashboard"}</Link> : null}
          {!navigation.length && !navigationError ? <span className="platform-nav-group__label" aria-live="polite">{isFa ? "در حال بارگذاری ناوبری..." : "Loading navigation..."}</span> : null}
          {navigation.map((group) => {
            const Icon = navigationIcons[group.iconKey as keyof typeof navigationIcons] ?? LayoutDashboard;
            return (
              <section key={group.key} className={`platform-nav-group ${activeGroup === group.key ? "is-active" : ""}`}>
                <Link to={group.route} className="platform-nav-group__label">
                  <Icon className="h-4 w-4" aria-hidden="true" />
                  <span>{isFa ? group.titleFa : group.titleEn}</span>
                </Link>
                {!collapsed && group.items.length > 1 ? (
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
      </aside>
      <div className="platform-main">
        <header className="platform-topbar">
          <button
            type="button"
            className="platform-mobile-menu"
            onClick={() => setMobileNavOpen(true)}
            aria-controls="platform-primary-navigation"
            aria-expanded={mobileNavOpen}
            aria-label={t("shell.toggleNavigation")}
          >
            <Menu className="h-4 w-4" aria-hidden="true" />
          </button>
          <div className="platform-search" role="search">
            <Search className="h-4 w-4" aria-hidden="true" />
            <input disabled title={t("shell.searchUnavailable")} placeholder={t("shell.searchPlaceholder")} />
          </div>
          <div className="platform-context" aria-label={t("shell.operationContext")}>
            <Link to={selectedDevice ? `/assets/devices/${selectedDevice.id}` : "/assets/devices"} className="platform-context__item">
              <Server className="h-4 w-4" aria-hidden="true" />
              <span>
                <small>{t("shell.selectedDevice")}</small>
                <strong dir={selectedDevice ? "ltr" : direction}>{selectedDevice ? `${selectedDevice.name} · ${selectedDevice.vendor}` : t("shell.noDeviceSelected")}</strong>
              </span>
            </Link>
            <span className={`platform-context__item platform-context__health ${connectionHealthy ? "is-healthy" : "is-offline"}`}>
              {connectionHealthy ? <Wifi className="h-4 w-4" aria-hidden="true" /> : <WifiOff className="h-4 w-4" aria-hidden="true" />}
              <span>
                <small>{t("shell.connectionHealth")}</small>
                <strong>{connectionHealthy ? t("shell.backendConnected") : t("shell.backendUnavailable")}</strong>
              </span>
            </span>
          </div>
          <div className="platform-topbar__actions">
            <button type="button" className="icon-button" disabled title={t("shell.notificationsUnavailable")} aria-label={t("shell.notifications")}><Bell className="h-4 w-4" /></button>
            <select value={i18n.language} onChange={(event) => void i18n.changeLanguage(event.target.value)} className="platform-language">
              <option value="fa">فارسی</option>
              <option value="en">English</option>
            </select>
            <div className="platform-user">
              <strong>{user?.displayName || user?.username}</strong>
              <span>{user?.role}</span>
            </div>
            <button type="button" onClick={() => void logout()} className="icon-button" aria-label={t("auth.logout")}><LogOut className="h-4 w-4" /></button>
          </div>
        </header>
        {!online ? (
          <div className="platform-offline-banner" role="status">
            <WifiOff className="h-4 w-4" aria-hidden="true" />
            <span>{t("shell.offlineBanner")}</span>
          </div>
        ) : null}
        <main className="platform-content">{children}</main>
      </div>
      <nav className="platform-bottom-nav" aria-label={t("shell.mobileNavigation")}>
        {mobileNavigation.map((group) => (
          <Link key={group.key} to={group.route} className={activeGroup === group.key ? "is-current" : ""}>{isFa ? group.titleFa : group.titleEn}</Link>
        ))}
      </nav>
    </div>
  );
}
