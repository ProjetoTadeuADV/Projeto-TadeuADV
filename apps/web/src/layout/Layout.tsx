import { NavLink, Outlet } from "react-router-dom";
import { BrandWordmark } from "../components/BrandWordmark";
import { Sidebar } from "../components/Sidebar";
import { useAuth } from "../context/AuthContext";
import { SidebarProvider } from "../context/SidebarContext";

function resolveAvatarInitials(value: string): string {
  const sanitized = value.trim();
  if (!sanitized) {
    return "P";
  }

  const tokens = sanitized
    .replace(/[@._-]/g, " ")
    .split(" ")
    .map((item) => item.trim())
    .filter(Boolean);

  if (tokens.length === 0) {
    return "P";
  }

  if (tokens.length === 1) {
    return tokens[0].slice(0, 2).toUpperCase();
  }

  return `${tokens[0][0] ?? ""}${tokens[1][0] ?? ""}`.toUpperCase();
}

export function Layout() {
  const { user, accessProfile, isMasterUser, isOperatorUser, canAccessAdmin } = useAuth();
  const homePath = canAccessAdmin ? "/master/dashboard" : "/dashboard";
  const profileName = accessProfile?.name?.trim() || user?.displayName?.trim() || null;
  const profileEmail = accessProfile?.email?.trim() || user?.email?.trim() || null;
  const profileLabel = profileName || profileEmail || "Perfil";
  const avatarUrl = accessProfile?.avatarUrl ?? user?.photoURL ?? null;
  const avatarInitials = resolveAvatarInitials(profileLabel);

  return (
    <SidebarProvider>
      <div className="private-layout">
        <Sidebar />

        <div className="private-layout-content">
          <header className="private-header">
            <div className="private-header-inner">
              <NavLink to={homePath} className="brand-link" aria-label="DoutorEu">
                <BrandWordmark className="brand-wordmark--public" />
              </NavLink>

              <div className="topbar-user">
                {canAccessAdmin && (
                  <NavLink
                    to="/administrador"
                    className={({ isActive }) => (isActive ? "topbar-badge topbar-badge--active" : "topbar-badge")}
                  >
                    {isMasterUser ? "Master" : isOperatorUser ? "Operador" : "Administrador"}
                  </NavLink>
                )}
                <NavLink to="/settings/profile" className="topbar-avatar-link" title={profileLabel} aria-label="Perfil">
                  {avatarUrl ? (
                    <img src={avatarUrl} alt="" className="topbar-avatar-image" />
                  ) : (
                    <span className="topbar-avatar-fallback">{avatarInitials}</span>
                  )}
                </NavLink>
              </div>
            </div>
          </header>

          <main className="private-main">
            <Outlet />
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}
