import { NavLink, Outlet } from "react-router-dom";
import { BrandWordmark } from "../components/BrandWordmark";

function topLinkClass({ isActive }: { isActive: boolean }) {
  return isActive ? "public-link active" : "public-link";
}

export function PublicLayout() {
  return (
    <div className="public-shell">
      <header className="public-topbar">
        <div className="public-topbar-inner">
          <NavLink to="/" className="brand-link brand-link--public" aria-label="DoutorEu">
            <BrandWordmark className="brand-wordmark--public" />
          </NavLink>

          <div className="public-topbar-actions">
            <nav className="public-nav" aria-label="Navegação da landing">
              <NavLink to="/como-funciona" className={topLinkClass}>
                Como Funciona
              </NavLink>
              <NavLink to="/vantagens" className={topLinkClass}>
                Sobre
              </NavLink>
            </nav>

            <div className="public-actions">
              <NavLink to="/login" className="hero-secondary">
                Entrar
              </NavLink>
              <NavLink to="/register" className="hero-primary">
                Cadastrar
              </NavLink>
            </div>
          </div>
        </div>
      </header>

      <main className="public-main">
        <Outlet />
      </main>
    </div>
  );
}
