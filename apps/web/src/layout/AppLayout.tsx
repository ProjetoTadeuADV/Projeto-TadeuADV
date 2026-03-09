import { Link, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export function AppLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  async function handleLogout() {
    await logout();
    navigate("/");
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand">
          <div className="brand-dot" />
          <span>Doutor<span className="brand-eu">Eu</span></span>
        </div>

        <nav className="topbar-nav">
          <Link to="/dashboard">Dashboard</Link>
          <Link to="/cases/new">Novo Caso</Link>
        </nav>

        <div className="topbar-user">
          <span title={user?.email ?? ""}>{user?.displayName || user?.email}</span>
          <button type="button" className="ghost-button" onClick={handleLogout}>
            Sair
          </button>
        </div>
      </header>

      <main className="main-content">
        <Outlet />
      </main>
    </div>
  );
}
