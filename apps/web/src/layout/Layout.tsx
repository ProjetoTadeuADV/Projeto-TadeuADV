import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { SidebarProvider } from "../context/SidebarContext";
import { Sidebar } from "../components/Sidebar";
import { useAuth } from "../context/AuthContext";

export function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

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
              <NavLink to="/dashboard" className="brand brand-link">
                <span className="logo-emblem" aria-hidden="true">
                  {"\u2696"}
                </span>
                <span className="brand-stack">
                  <span className="brand-name">
                    Doutor<span className="brand-eu">Eu</span>
                  </span>
                  <span className="brand-tagline">O Doutor da Sua Causa é Você.</span>
                </span>
              </NavLink>

              <div className="topbar-user">
                <span title={user?.email ?? ""}>{user?.displayName || user?.email}</span>
                <button type="button" className="ghost-button" onClick={handleLogout}>
                  Sair
                </button>
              </div>
            </div>
          </header>

          <section className="private-identity-strip" aria-label="Atributos da marca">
            <span>Confiança</span>
            <span>Empoderamento</span>
            <span>Inovação</span>
            <span>Acessibilidade</span>
          </section>

          <main className="private-main">
            <Outlet />
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}
