import { Menu, Search, Bell, LogOut } from "lucide-react";
import { useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/context/AuthContext";
import { appRoutes, navGroups } from "@/routes/appRoutes";

export function AppShell({ children, currentPath }: { children: ReactNode; currentPath: string }) {
  const { user, logout } = useAuth();
  const { i18n } = useTranslation();
  const [collapsed, setCollapsed] = useState(false);
  const isFa = i18n.language?.startsWith("fa");
  const direction = isFa ? "rtl" : "ltr";
  const activeGroup = appRoutes.find((route) => currentPath === route.path || currentPath.startsWith(`${route.path}/`))?.group ?? "dashboard";
  const mobileGroups = ["dashboard", "assets", "security", "actions"];

  return (
    <div className="platform-shell" dir={direction}>
      <aside className={`platform-sidebar ${collapsed ? "is-collapsed" : ""}`} aria-label="Primary navigation">
        <button type="button" className="platform-sidebar__toggle" onClick={() => setCollapsed((value) => !value)} aria-label="Toggle navigation">
          <Menu className="h-4 w-4" aria-hidden="true" />
        </button>
        <nav className="platform-sidebar__nav">
          {navGroups.map((group) => {
            const Icon = group.icon;
            const groupRoutes = appRoutes.filter((route) => route.group === group.id && route.nav);
            const landing = groupRoutes.find((route) => route.implemented)?.path ?? groupRoutes[0]?.path ?? "/dashboard";
            return (
              <section key={group.id} className={`platform-nav-group ${activeGroup === group.id ? "is-active" : ""}`}>
                <a href={landing} className="platform-nav-group__label">
                  <Icon className="h-4 w-4" aria-hidden="true" />
                  <span>{isFa ? group.labelFa : group.labelEn}</span>
                </a>
                {!collapsed && groupRoutes.length > 1 ? (
                  <div className="platform-nav-group__children">
                    {groupRoutes.map((route) => (
                      <a key={route.path} href={route.path} className={currentPath === route.path ? "is-current" : ""}>
                        <span>{isFa ? route.labelFa : route.labelEn}</span>
                        {!route.implemented ? <small>planned</small> : null}
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
            <input placeholder={isFa ? "جست‌وجو در دارایی، یافته، اقدام..." : "Search assets, findings, actions..."} />
          </div>
          <div className="platform-topbar__actions">
            <button type="button" className="icon-button" aria-label="Notifications"><Bell className="h-4 w-4" /></button>
            <select value={i18n.language} onChange={(event) => void i18n.changeLanguage(event.target.value)} className="platform-language">
              <option value="fa">فارسی</option>
              <option value="en">English</option>
            </select>
            <div className="platform-user">
              <strong>{user?.displayName || user?.username}</strong>
              <span>{user?.role}</span>
            </div>
            <button type="button" onClick={() => void logout()} className="icon-button" aria-label="Logout"><LogOut className="h-4 w-4" /></button>
          </div>
        </header>
        <main className="platform-content">{children}</main>
      </div>
      <nav className="platform-bottom-nav" aria-label="Mobile navigation">
        {mobileGroups.map((groupId) => {
          const group = navGroups.find((item) => item.id === groupId);
          const route = appRoutes.find((item) => item.group === groupId && item.mobilePrimary);
          if (!group || !route) return null;
          return <a key={groupId} href={route.path} className={activeGroup === groupId ? "is-current" : ""}>{isFa ? group.labelFa : group.labelEn}</a>;
        })}
      </nav>
    </div>
  );
}

