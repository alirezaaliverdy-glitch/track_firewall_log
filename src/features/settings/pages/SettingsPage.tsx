import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { Bot, Boxes, Check, Clock3, Crosshair, Eye, Gauge, KeyRound, Laptop, LayoutDashboard, LogOut, Pencil, Plus, RefreshCw, Save, Search, ShieldAlert, ShieldCheck, UserRound, UsersRound, Wrench, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { PageHeader } from "@/components/ui/PageHeader";
import { useAuth } from "@/context/AuthContext";
import { AuthApiError, createManagedUser, listManagedUsers, listSessions, resetManagedUserPassword, revokeSession, updateManagedUser, type ApplicationSection, type AuthSession, type AuthUser, type ManagedUser, type UserAccessCatalog } from "@/lib/auth";
import { CredentialManager } from "@/features/settings/components/CredentialManager";
import "./SettingsPage.css";

const sectionMeta: Record<ApplicationSection, { fa: string; en: string; hintFa: string; hintEn: string; icon: typeof LayoutDashboard; tone: string }> = {
  dashboard: { fa: "داشبورد", en: "Dashboard", hintFa: "نمای کلی و شاخص‌ها", hintEn: "Overview and indicators", icon: LayoutDashboard, tone: "cyan" },
  assets: { fa: "دارایی‌ها", en: "Assets", hintFa: "دستگاه‌ها و وندورها", hintEn: "Devices and vendors", icon: Boxes, tone: "violet" },
  security: { fa: "امنیت", en: "Security", hintFa: "یافته‌ها و قوانین تشخیص", hintEn: "Findings and detection", icon: ShieldAlert, tone: "rose" },
  monitoring: { fa: "پایش", en: "Monitoring", hintFa: "سلامت و تله‌متری", hintEn: "Health and telemetry", icon: Gauge, tone: "emerald" },
  actions: { fa: "اقدامات", en: "Actions", hintFa: "اجرای کنترل‌شده", hintEn: "Controlled execution", icon: Wrench, tone: "amber" },
  assistant: { fa: "دستیار هوشمند", en: "AI assistant", hintFa: "گفت‌وگو و پیشنهاد", hintEn: "Chat and proposals", icon: Bot, tone: "fuchsia" },
  attackers: { fa: "مهاجمان", en: "Attackers", hintFa: "شاخص‌ها و مهاجمان", hintEn: "Indicators and attackers", icon: Crosshair, tone: "red" }
};

const allSections = Object.keys(sectionMeta) as ApplicationSection[];
const defaultSections: Record<AuthUser["role"], ApplicationSection[]> = {
  admin: allSections,
  operator: ["dashboard", "assets", "security", "monitoring", "actions"],
  viewer: ["dashboard", "assets", "monitoring"]
};

type UserEditor = { id?: string; username: string; displayName: string; password: string; role: AuthUser["role"]; isActive: boolean; allowedSections: ApplicationSection[] };
const emptyEditor = (): UserEditor => ({ username: "", displayName: "", password: "", role: "viewer", isActive: true, allowedSections: [...defaultSections.viewer] });

function clientLabel(userAgent: string | null, fallback: string) {
  if (!userAgent) return fallback;
  const browser = /Edg\//.test(userAgent) ? "Microsoft Edge" : /Firefox\//.test(userAgent) ? "Firefox" : /Chrome\//.test(userAgent) ? "Chrome" : /Safari\//.test(userAgent) ? "Safari" : "Browser";
  const system = /Windows/.test(userAgent) ? "Windows" : /Android/.test(userAgent) ? "Android" : /iPhone|iPad/.test(userAgent) ? "iOS" : /Mac OS/.test(userAgent) ? "macOS" : /Linux/.test(userAgent) ? "Linux" : "Device";
  return `${browser} · ${system}`;
}

export default function SettingsPage() {
  const { t, i18n } = useTranslation();
  const { user, logout, logoutAll, changePassword } = useAuth();
  const isFa = i18n.resolvedLanguage?.startsWith("fa") ?? true;
  const locale = isFa ? "fa-IR" : "en-US";
  const isAdmin = user?.role === "admin";
  const [tab, setTab] = useState<"users" | "credentials" | "account">(() => isAdmin && new URLSearchParams(window.location.search).get("tab") === "credentials" ? "credentials" : isAdmin ? "users" : "account");

  const [managedUsers, setManagedUsers] = useState<ManagedUser[]>([]);
  const [catalog, setCatalog] = useState<UserAccessCatalog | null>(null);
  const [usersLoading, setUsersLoading] = useState(false);
  const [usersError, setUsersError] = useState("");
  const [query, setQuery] = useState("");
  const [editor, setEditor] = useState<UserEditor | null>(null);
  const [savingUser, setSavingUser] = useState(false);
  const [editorError, setEditorError] = useState("");
  const [resetPassword, setResetPassword] = useState("");
  const [resetting, setResetting] = useState(false);

  const [sessions, setSessions] = useState<AuthSession[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(true);
  const [sessionsError, setSessionsError] = useState("");
  const [revokingId, setRevokingId] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [changingPassword, setChangingPassword] = useState(false);

  const loadUsers = useCallback(async () => {
    if (!isAdmin) return;
    setUsersLoading(true); setUsersError("");
    try { const result = await listManagedUsers(); setManagedUsers(result.users); setCatalog(result.catalog); }
    catch { setUsersError(isFa ? "دریافت فهرست کاربران ناموفق بود." : "Could not load users."); }
    finally { setUsersLoading(false); }
  }, [isAdmin, isFa]);

  const loadSessions = useCallback(async () => {
    if (!isAdmin) { setSessions([]); setSessionsLoading(false); return; }
    setSessionsLoading(true); setSessionsError("");
    try { setSessions(await listSessions()); }
    catch { setSessionsError(t("auth.account.sessionsError")); }
    finally { setSessionsLoading(false); }
  }, [isAdmin, t]);

  useEffect(() => { void loadSessions(); }, [loadSessions]);
  useEffect(() => { void loadUsers(); }, [loadUsers]);

  const filteredUsers = useMemo(() => {
    const value = query.trim().toLocaleLowerCase();
    return value ? managedUsers.filter((item) => `${item.displayName} ${item.username} ${item.role}`.toLocaleLowerCase().includes(value)) : managedUsers;
  }, [managedUsers, query]);
  const counts = useMemo(() => ({ all: managedUsers.length, active: managedUsers.filter((item) => item.isActive).length, admins: managedUsers.filter((item) => item.role === "admin").length }), [managedUsers]);
  const passwordScore = useMemo(() => !newPassword ? 0 : Math.min(4, Number(newPassword.length >= 12) + Number(newPassword.length >= 16) + Number(/[A-Za-z\u0600-\u06ff]/.test(newPassword) && /\d/.test(newPassword)) + Number(/[^A-Za-z0-9\u0600-\u06ff]/.test(newPassword))), [newPassword]);

  function openEditor(item?: ManagedUser) {
    setEditorError(""); setResetPassword("");
    setEditor(item ? { id: item.id, username: item.username, displayName: item.displayName, password: "", role: item.role, isActive: item.isActive, allowedSections: [...item.allowedSections] } : emptyEditor());
  }
  function toggleSection(section: ApplicationSection) {
    if (!editor || editor.role === "admin") return;
    setEditor({ ...editor, allowedSections: editor.allowedSections.includes(section) ? editor.allowedSections.filter((item) => item !== section) : [...editor.allowedSections, section] });
  }
  function userErrorCopy(cause: unknown) {
    const code = cause instanceof AuthApiError ? cause.code : "";
    const messages: Record<string, string> = {
      USERNAME_ALREADY_EXISTS: isFa ? "این نام کاربری قبلاً ثبت شده است." : "This username already exists.",
      PASSWORD_POLICY_FAILED: isFa ? "رمز باید حداقل ۶ نویسه باشد." : "Use at least 6 characters.",
      LAST_ACTIVE_ADMIN_REQUIRED: isFa ? "آخرین مدیر فعال را نمی‌توان غیرفعال یا تنزل داد." : "The last active admin cannot be disabled or demoted.",
      CANNOT_DEMOTE_SELF: isFa ? "نقش حساب فعلی را از این بخش تغییر ندهید." : "You cannot change your current account's role.",
      CANNOT_DEACTIVATE_SELF: isFa ? "حساب فعلی را نمی‌توان غیرفعال کرد." : "You cannot disable your current account.",
      INVALID_USERNAME: isFa ? "نام کاربری معتبر وارد کنید (حداقل ۳ نویسه انگلیسی)." : "Enter a valid username.",
      INVALID_DISPLAY_NAME: isFa ? "نام نمایشی معتبر وارد کنید." : "Enter a valid display name."
    };
    return messages[code] ?? (isFa ? "ذخیره حساب ناموفق بود. ورودی‌ها را بررسی کنید." : "Could not save the account. Check the fields.");
  }
  async function saveUser(event: FormEvent) {
    event.preventDefault(); if (!editor) return;
    const sections = editor.role === "admin" ? [...allSections] : editor.allowedSections;
    if (editor.role !== "admin" && !sections.length) return setEditorError(isFa ? "حداقل یک بخش را انتخاب کنید." : "Select at least one section.");
    if (!editor.id && editor.password.length < 6) return setEditorError(isFa ? "رمز اولیه باید حداقل ۶ نویسه باشد." : "The initial password must be at least 6 characters.");
    setSavingUser(true); setEditorError("");
    try {
      if (editor.id) await updateManagedUser(editor.id, { displayName: editor.displayName, role: editor.role, isActive: editor.isActive, allowedSections: sections });
      else await createManagedUser({ username: editor.username, displayName: editor.displayName, password: editor.password, role: editor.role, allowedSections: sections });
      setEditor(null); await loadUsers();
    } catch (cause) { setEditorError(userErrorCopy(cause)); }
    finally { setSavingUser(false); }
  }
  async function resetManagedPasswordNow() {
    if (!editor?.id || resetPassword.length < 6) return setEditorError(isFa ? "رمز جدید باید حداقل ۶ نویسه باشد." : "The new password must be at least 6 characters.");
    if (!window.confirm(isFa ? "رمز تغییر کند و نشست‌های این کاربر بسته شوند؟" : "Reset password and revoke this user's sessions?")) return;
    setResetting(true); setEditorError("");
    try { await resetManagedUserPassword(editor.id, resetPassword); setResetPassword(""); await loadUsers(); }
    catch (cause) { setEditorError(userErrorCopy(cause)); }
    finally { setResetting(false); }
  }

  function passwordErrorCopy(cause: unknown) {
    if (!(cause instanceof AuthApiError)) return t("auth.account.passwordFailed");
    if (cause.code === "current_password_invalid") return t("auth.account.currentPasswordInvalid");
    if (cause.code === "password_reused") return t("auth.account.passwordReused");
    if (cause.code === "password_policy_failed") return t("auth.account.passwordPolicyFailed");
    return t("auth.account.passwordFailed");
  }
  async function submitPassword(event: FormEvent) {
    event.preventDefault(); setPasswordError("");
    if (newPassword.length < 12) return setPasswordError(t("auth.account.passwordTooShort"));
    if (newPassword !== confirmPassword) return setPasswordError(t("auth.account.passwordMismatch"));
    setChangingPassword(true);
    try { await changePassword(currentPassword, newPassword); }
    catch (cause) { setPasswordError(passwordErrorCopy(cause)); setChangingPassword(false); }
  }
  async function revoke(item: AuthSession) {
    if (!window.confirm(t("auth.account.confirmRevoke"))) return;
    setRevokingId(item.id);
    try { const result = await revokeSession(item.id); if (result.currentSessionRevoked) { await logout().catch(() => undefined); return; } setSessions((current) => current.filter((session) => session.id !== item.id)); }
    catch { setSessionsError(t("auth.account.revokeFailed")); }
    finally { setRevokingId(""); }
  }
  async function signOutEverywhere() { if (window.confirm(t("auth.account.confirmLogoutAll"))) await logoutAll().catch(() => setSessionsError(t("auth.account.revokeFailed"))); }
  const formatDate = (value: string) => new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));

  return <section className="page-stack settings-hub">
    <PageHeader title={isFa ? "کاربران و تنظیمات" : "Users and settings"} eyebrow={isFa ? "مدیریت امن و ساده" : "Simple, secure administration"} description={isFa ? "حساب‌ها، سطح دسترسی و امنیت حساب خود را از یک نقطه مدیریت کنید." : "Manage accounts, access scope and your account security in one place."} />
    <div className="settings-tabs" role="tablist">
      {isAdmin ? <button type="button" role="tab" aria-selected={tab === "users"} className={tab === "users" ? "is-active" : ""} onClick={() => setTab("users")}><UsersRound />{isFa ? "کاربران و دسترسی‌ها" : "Users and access"}</button> : null}
      {isAdmin ? <button type="button" role="tab" aria-selected={tab === "credentials"} className={tab === "credentials" ? "is-active" : ""} onClick={() => setTab("credentials")}><KeyRound />{isFa ? "اعتبارنامه‌های دستگاه" : "Device credentials"}</button> : null}
      <button type="button" role="tab" aria-selected={tab === "account"} className={tab === "account" ? "is-active" : ""} onClick={() => setTab("account")}><ShieldCheck />{isFa ? "امنیت حساب من" : "My account security"}</button>
    </div>

    {tab === "users" && isAdmin ? <div className="user-management-workspace">
      <section className="user-overview"><div data-tone="cyan"><UsersRound /><span>{isFa ? "کل حساب‌ها" : "All accounts"}<strong>{counts.all}</strong></span></div><div data-tone="emerald"><ShieldCheck /><span>{isFa ? "فعال" : "Active"}<strong>{counts.active}</strong></span></div><div data-tone="violet"><KeyRound /><span>{isFa ? "مدیر" : "Admins"}<strong>{counts.admins}</strong></span></div></section>
      <section className="users-panel"><header className="users-toolbar"><div><h2>{isFa ? "حساب‌های سامانه" : "Platform accounts"}</h2><p>{isFa ? "نقش، بخش‌های قابل مشاهده و وضعیت هر کاربر را تعیین کنید." : "Control each user's role, visible sections and status."}</p></div><div className="users-toolbar__actions"><label className="users-search"><Search /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={isFa ? "جست‌وجوی کاربر..." : "Search users..."} /></label><button type="button" className="primary-button" onClick={() => openEditor()}><Plus />{isFa ? "افزودن حساب" : "Add account"}</button></div></header>
        {usersError ? <p className="settings-error" role="alert">{usersError}<button type="button" onClick={() => void loadUsers()}>{isFa ? "تلاش دوباره" : "Retry"}</button></p> : null}
        {usersLoading ? <div className="settings-loading"><RefreshCw className="is-spinning" />{isFa ? "در حال دریافت کاربران..." : "Loading users..."}</div> : null}
        {!usersLoading ? <div className="users-list">{filteredUsers.map((item) => <article key={item.id} className={!item.isActive ? "is-disabled" : ""}><span className="user-avatar">{(item.displayName || item.username).slice(0, 1).toLocaleUpperCase()}</span><div className="user-primary"><strong>{item.displayName}</strong><small dir="ltr">@{item.username}</small></div><span className={`role-pill role-${item.role}`}>{item.role === "admin" ? (isFa ? "مدیر" : "Admin") : item.role === "operator" ? (isFa ? "اپراتور" : "Operator") : (isFa ? "مشاهده‌گر" : "Viewer")}</span><div className="user-access-summary"><span>{item.role === "admin" ? allSections.length : item.allowedSections.length}</span><small>{isFa ? "بخش مجاز" : "sections"}</small></div><div className="user-session-summary"><Laptop /><span>{item.activeSessionCount}</span><small>{isFa ? "نشست" : "sessions"}</small></div><span className={`user-status ${item.isActive ? "is-active" : ""}`}><i />{item.isActive ? (isFa ? "فعال" : "Active") : (isFa ? "غیرفعال" : "Disabled")}</span><button type="button" className="icon-button user-edit" onClick={() => openEditor(item)}><Pencil /></button></article>)}{!filteredUsers.length ? <div className="settings-empty"><Search />{isFa ? "کاربری پیدا نشد." : "No matching user."}</div> : null}</div> : null}
      </section>

      {editor ? <section className="user-editor"><header><div><span className="editor-icon"><UserRound /></span><h2>{editor.id ? (isFa ? "ویرایش حساب" : "Edit account") : (isFa ? "ساخت حساب جدید" : "Create account")}</h2><p>{isFa ? "نقش را انتخاب کنید و فقط بخش‌های موردنیاز را فعال کنید." : "Choose a role and enable only the required sections."}</p></div><button type="button" className="icon-button" onClick={() => setEditor(null)}><X /></button></header>
        <form onSubmit={saveUser}><div className="editor-fields"><label>{isFa ? "نام کاربری" : "Username"}<input dir="ltr" value={editor.username} disabled={Boolean(editor.id)} onChange={(event) => setEditor({ ...editor, username: event.target.value })} placeholder="sara.ops" required /></label><label>{isFa ? "نام نمایشی" : "Display name"}<input value={editor.displayName} onChange={(event) => setEditor({ ...editor, displayName: event.target.value })} placeholder={isFa ? "مثلاً سارا احمدی" : "e.g. Sara Ahmadi"} required /></label>{!editor.id ? <label>{isFa ? "رمز اولیه" : "Initial password"}<input type="password" value={editor.password} onChange={(event) => setEditor({ ...editor, password: event.target.value })} minLength={6} maxLength={128} autoComplete="new-password" required /><small>{isFa ? "حداقل ۶ نویسه" : "At least 6 characters"}</small></label> : null}</div>
          <fieldset className="role-selector"><legend>{isFa ? "نقش عملیاتی" : "Operational role"}</legend>{(["viewer", "operator", "admin"] as const).map((role) => <label key={role} className={editor.role === role ? "is-selected" : ""}><input type="radio" name="role" checked={editor.role === role} disabled={editor.id === user?.id} onChange={() => setEditor({ ...editor, role, allowedSections: role === "admin" ? [...allSections] : editor.role === "admin" ? [...defaultSections[role]] : editor.allowedSections })} />{role === "viewer" ? <Eye /> : role === "operator" ? <Wrench /> : <ShieldCheck />}<span><strong>{role === "admin" ? (isFa ? "مدیر" : "Admin") : role === "operator" ? (isFa ? "اپراتور" : "Operator") : (isFa ? "مشاهده‌گر" : "Viewer")}</strong><small>{role === "admin" ? (isFa ? "کنترل کامل" : "Full control") : role === "operator" ? (isFa ? "عملیات در بخش‌های مجاز" : "Operate in allowed sections") : (isFa ? "فقط مشاهده" : "Read only")}</small></span>{editor.role === role ? <Check className="role-check" /> : null}</label>)}</fieldset>
          <fieldset className="section-selector" disabled={editor.role === "admin"}><legend>{isFa ? "دسترسی به بخش‌ها" : "Section access"}<small>{editor.role === "admin" ? (isFa ? "مدیر به همه بخش‌ها دسترسی دارد." : "Admins access every section.") : (isFa ? `${editor.allowedSections.length} بخش انتخاب شده` : `${editor.allowedSections.length} selected`)}</small></legend><div>{(catalog?.sections ?? allSections).map((section) => { const meta = sectionMeta[section]; const Icon = meta.icon; const checked = editor.role === "admin" || editor.allowedSections.includes(section); return <label key={section} data-tone={meta.tone} className={checked ? "is-selected" : ""}><input type="checkbox" checked={checked} onChange={() => toggleSection(section)} /><span className="section-icon"><Icon /></span><span><strong>{isFa ? meta.fa : meta.en}</strong><small>{isFa ? meta.hintFa : meta.hintEn}</small></span><i>{checked ? <Check /> : null}</i></label>; })}</div></fieldset>
          {editor.id ? <div className="editor-account-state"><label className="settings-switch"><input type="checkbox" checked={editor.isActive} disabled={editor.id === user?.id} onChange={(event) => setEditor({ ...editor, isActive: event.target.checked })} /><i /><span><strong>{isFa ? "حساب فعال باشد" : "Account is active"}</strong><small>{isFa ? "غیرفعال‌سازی همه نشست‌ها را می‌بندد." : "Disabling revokes all sessions."}</small></span></label></div> : null}
          {editorError ? <p className="settings-error" role="alert">{editorError}</p> : null}<footer><button type="button" className="secondary-button" onClick={() => setEditor(null)}>{isFa ? "انصراف" : "Cancel"}</button><button type="submit" className="primary-button" disabled={savingUser}><Save />{savingUser ? (isFa ? "در حال ذخیره..." : "Saving...") : (isFa ? "ذخیره حساب" : "Save account")}</button></footer>
        </form>
        {editor.id && editor.id !== user?.id ? <div className="password-reset-row"><div><KeyRound /><span><strong>{isFa ? "بازنشانی رمز" : "Reset password"}</strong><small>{isFa ? "نشست‌های کاربر بسته می‌شوند." : "User sessions will be revoked."}</small></span></div><input type="password" value={resetPassword} onChange={(event) => setResetPassword(event.target.value)} minLength={6} maxLength={128} placeholder={isFa ? "رمز جدید" : "New password"} /><button type="button" className="secondary-button" disabled={resetting || resetPassword.length < 6} onClick={() => void resetManagedPasswordNow()}>{resetting ? (isFa ? "در حال تغییر..." : "Resetting...") : (isFa ? "تغییر رمز" : "Reset")}</button></div> : null}
      </section> : null}
    </div> : tab === "credentials" && isAdmin ? <CredentialManager isFa={isFa} /> : <div className="account-security-workspace">
      <section className="account-identity-card"><span><UserRound /></span><div><small>{t("auth.account.identity")}</small><strong>{user?.displayName || user?.username}</strong></div><dl><div><dt>{t("auth.account.username")}</dt><dd dir="ltr">{user?.username}</dd></div><div><dt>{t("auth.account.role")}</dt><dd>{user?.role}</dd></div></dl><span className="account-security-state"><ShieldCheck />Cookie session · CSRF · RBAC</span></section>
      <div className="account-security-grid"><section className="account-security-panel"><header><span><KeyRound /></span><div><h2>{t("auth.account.passwordTitle")}</h2><p>{t("auth.account.passwordHelp")}</p></div></header><form className="account-password-form" onSubmit={submitPassword}><label>{t("auth.account.currentPassword")}<input type="password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} autoComplete="current-password" maxLength={128} required /></label><label>{t("auth.account.newPassword")}<input type="password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} autoComplete="new-password" minLength={12} maxLength={128} required /></label><div className="account-password-meter"><i data-active={passwordScore >= 1} /><i data-active={passwordScore >= 2} /><i data-active={passwordScore >= 3} /><i data-active={passwordScore >= 4} /></div><label>{t("auth.account.confirmPassword")}<input type="password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} autoComplete="new-password" minLength={12} maxLength={128} required /></label>{passwordError ? <p className="settings-error" role="alert">{passwordError}</p> : null}<button className="primary-button" type="submit" disabled={changingPassword || !currentPassword || !newPassword || !confirmPassword}>{changingPassword ? t("auth.account.changingPassword") : t("auth.account.changePassword")}</button></form></section>
        {isAdmin ? <section className="account-security-panel account-sessions-panel"><header><span><Laptop /></span><div><h2>{t("auth.account.sessionsTitle")}</h2><p>{isFa ? "فقط مدیر می‌تواند نشست‌ها را مشاهده و پایان دهد." : "Only administrators can view and terminate sessions."}</p></div><button type="button" className="icon-button" onClick={() => void loadSessions()} disabled={sessionsLoading}><RefreshCw className={sessionsLoading ? "is-spinning" : ""} /></button></header>{sessionsLoading ? <div className="settings-loading">{t("auth.account.sessionsLoading")}</div> : null}{sessionsError ? <div className="settings-error">{sessionsError}</div> : null}{!sessionsLoading ? <div className="account-session-list">{sessions.map((session) => <article key={session.id} className={session.current ? "is-current" : ""}><span className="account-session-icon"><Laptop /></span><div className="account-session-main"><strong>{clientLabel(session.userAgent, t("auth.account.unknownClient"))}</strong><small><Clock3 />{t("auth.account.lastSeen")}: {formatDate(session.lastSeenAt)}</small>{session.current ? <em>{t("auth.account.currentSession")}</em> : null}</div><dl><div><dt>{t("auth.account.ipAddress")}</dt><dd dir="ltr">{session.ipAddress || "—"}</dd></div><div><dt>{t("auth.account.createdAt")}</dt><dd>{formatDate(session.createdAt)}</dd></div></dl><button type="button" className="secondary-button" disabled={revokingId === session.id} onClick={() => void revoke(session)}>{revokingId === session.id ? t("auth.account.revoking") : t("auth.account.revoke")}</button></article>)}</div> : null}<footer className="account-logout-all"><div><strong>{t("auth.account.logoutAll")}</strong><small>{t("auth.account.logoutAllHelp")}</small></div><button type="button" className="danger-button" onClick={() => void signOutEverywhere()}><LogOut />{t("auth.account.logoutAll")}</button></footer></section> : null}
      </div>
    </div>}
  </section>;
}
