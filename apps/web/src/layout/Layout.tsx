import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { BrandWordmark } from "../components/BrandWordmark";
import { Sidebar } from "../components/Sidebar";
import { useAuth } from "../context/AuthContext";
import { SidebarProvider } from "../context/SidebarContext";

export function Layout() {
  const { user, logout, isMasterUser } = useAuth();
  const navigate = useNavigate();
  const homePath = isMasterUser ? "/master/dashboard" : "/dashboard";

  async function handleLogout() {
    await logout();
    navigate("/", { replace: true });
  }

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
                {isMasterUser && <span className="topbar-badge">Master</span>}
                {isMasterUser && (
                  <NavLink to="/administrador" className="topbar-admin-link">
                    ADMINISTRADOR
                  </NavLink>
                )}
                <span title={user?.email ?? ""}>{user?.displayName || user?.email}</span>
                <button type="button" className="ghost-button" onClick={handleLogout}>
                  Sair
                </button>
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
