import { NavLink, Outlet } from "react-router-dom";
import { BrandWordmark } from "../components/BrandWordmark";

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
              <a href="#como-funciona" className="public-link">
                Como Funciona
              </a>
              <a href="#experiencia" className="public-link">
                Avaliações
              </a>
              <a href="#atuacao" className="public-link">
                Atuação
              </a>
              <a href="#planos" className="public-link">
                Planos
              </a>
              <a href="#faq" className="public-link">
                FAQ
              </a>
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
