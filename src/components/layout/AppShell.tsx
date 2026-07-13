import { Bell, Bot, Boxes, Gauge, LayoutDashboard, LogOut, Menu, Plug, Search, Settings, ShieldAlert, Wrench } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/context/AuthContext";
import { appRoutes } from "@/routes/appRoutes";
import { getProductNavigation, type ProductNavigationGroup } from "@/lib/productState";

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

export function AppShell({ children, currentPath }: { children: ReactNode; currentPath: string }) {
  const { user, logout } = useAuth();
  const { t, i18n } = useTranslation();
  const [collapsed, setCollapsed] = useState(false);
  const [navigation, setNavigation] = useState<ProductNavigationGroup[]>([]);
  const [navigationError, setNavigationError] = useState(false);
  const isFa = i18n.language?.startsWith("fa");
  const direction = isFa ? "rtl" : "ltr";
  const activeGroup = appRoutes.find((route) => currentPath === route.path || currentPath.startsWith(`${route.path}/`))?.group ?? "dashboard";

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

  return (
    <div className="platform-shell" dir={direction}>
      <aside className={`platform-sidebar ${collapsed ? "is-collapsed" : ""}`} aria-label={t("shell.primaryNavigation")}>
        <button type="button" className="platform-sidebar__toggle" onClick={() => setCollapsed((value) => !value)} aria-label={t("shell.toggleNavigation")}>
          <Menu className="h-4 w-4" aria-hidden="true" />
        </button>
        <nav className="platform-sidebar__nav">
          {navigationError ? <a href="/dashboard" className="platform-nav-group__label">{isFa ? "داشبورد" : "Dashboard"}</a> : null}
          {!navigation.length && !navigationError ? <span className="platform-nav-group__label" aria-live="polite">{isFa ? "در حال بارگذاری ناوبری..." : "Loading navigation..."}</span> : null}
          {navigation.map((group) => {
            const Icon = navigationIcons[group.iconKey as keyof typeof navigationIcons] ?? LayoutDashboard;
            return (
              <section key={group.key} className={`platform-nav-group ${activeGroup === group.key ? "is-active" : ""}`}>
                <a href={group.route} className="platform-nav-group__label">
                  <Icon className="h-4 w-4" aria-hidden="true" />
                  <span>{isFa ? group.titleFa : group.titleEn}</span>
                </a>
                {!collapsed && group.items.length > 1 ? (
                  <div className="platform-nav-group__children">
                    {group.items.map((item) => (
                      <a key={item.key} href={item.route} className={currentPath === item.route ? "is-current" : ""}>
                        <span>{isFa ? item.titleFa : item.titleEn}</span>
                      </a>
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
          <div className="platform-search" role="search">
            <Search className="h-4 w-4" aria-hidden="true" />
            <input disabled title={t("shell.searchUnavailable")} placeholder={t("shell.searchPlaceholder")} />
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
        <main className="platform-content">{children}</main>
      </div>
      <nav className="platform-bottom-nav" aria-label={t("shell.mobileNavigation")}>
        {navigation.filter((group) => group.mobilePrimary).map((group) => (
          <a key={group.key} href={group.route} className={activeGroup === group.key ? "is-current" : ""}>{isFa ? group.titleFa : group.titleEn}</a>
        ))}
      </nav>
    </div>
  );
}
