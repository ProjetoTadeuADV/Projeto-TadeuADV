import { NavLink, Outlet } from "react-router-dom";

function topLinkClass({ isActive }: { isActive: boolean }) {
  return isActive ? "public-link active" : "public-link";
}

export function PublicLayout() {
  return (
    <div className="public-shell">
      <header className="public-topbar">
        <div className="public-topbar-inner">
          <NavLink to="/" className="brand brand-link">
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

          <nav className="public-nav" aria-label="Navegação da landing">
            <NavLink to="/como-funciona" className={topLinkClass}>
              Como funciona
            </NavLink>
            <NavLink to="/vantagens" className={topLinkClass}>
              Vantagens
            </NavLink>
            <NavLink to="/escopo-inicial" className={topLinkClass}>
              Escopo inicial
            </NavLink>
          </nav>

          <div className="public-actions">
            <NavLink to="/login" className="hero-secondary">
              Entrar
            </NavLink>
            <NavLink to="/register" className="hero-primary">
              Criar conta
            </NavLink>
          </div>
        </div>
      </header>

      <main className="public-main">
        <Outlet />
      </main>
    </div>
  );
}
