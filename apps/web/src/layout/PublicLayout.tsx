import { NavLink, Outlet } from "react-router-dom";
import { BrandWordmark } from "../components/BrandWordmark";

const WHATSAPP_URL =
  "https://wa.me/5511952924309?text=Olá!%20Preciso%20de%20atendimento%20sobre%20a%20plataforma.";

function WhatsAppIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={className}>
      <path
        fill="currentColor"
        d="M19.05 4.93A9.9 9.9 0 0 0 12.02 2c-5.5 0-9.96 4.45-9.96 9.94 0 1.75.46 3.47 1.33 4.98L2 22l5.2-1.35a9.98 9.98 0 0 0 4.82 1.23h.01c5.49 0 9.95-4.46 9.95-9.95 0-2.65-1.04-5.14-2.93-7Zm-7.02 15.26h-.01a8.24 8.24 0 0 1-4.2-1.15l-.3-.18-3.08.8.82-3-.2-.31a8.24 8.24 0 0 1-1.27-4.42c0-4.58 3.74-8.31 8.33-8.31 2.22 0 4.3.86 5.87 2.43a8.24 8.24 0 0 1 2.44 5.88c0 4.59-3.74 8.33-8.4 8.33Zm4.57-6.24c-.25-.12-1.5-.74-1.73-.82-.23-.09-.4-.13-.57.12-.17.25-.65.82-.8 1-.15.17-.3.2-.56.08-.25-.13-1.07-.39-2.03-1.25a7.69 7.69 0 0 1-1.4-1.74c-.15-.25-.02-.39.1-.5.11-.1.25-.26.37-.39.12-.13.16-.22.24-.37.08-.14.04-.28-.02-.39-.07-.12-.57-1.37-.79-1.88-.21-.5-.42-.42-.57-.43h-.49c-.17 0-.44.06-.67.31-.23.25-.88.86-.88 2.1s.9 2.43 1.02 2.6c.13.16 1.78 2.73 4.31 3.82.6.25 1.07.4 1.44.5.6.2 1.15.17 1.58.1.48-.07 1.5-.61 1.71-1.2.21-.6.21-1.1.15-1.2-.06-.1-.23-.17-.48-.29Z"
      />
    </svg>
  );
}

export function PublicLayout() {
  return (
    <div className="public-shell">
      <header className="public-topbar">
        <div className="public-topbar-inner">
          <NavLink to="/" className="brand-link brand-link--public" aria-label="DrEu">
            <BrandWordmark className="brand-wordmark--public" />
          </NavLink>

          <div className="public-topbar-actions">
            <nav className="public-nav" aria-label="Navegação da landing">
              <a href="#sobre-nos" className="public-link">
                Sobre nós
              </a>
              <a href="#como-funciona" className="public-link">
                Como funciona
              </a>
              <a href="#planos" className="public-link">
                Investimento
              </a>
            </nav>

            <div className="public-actions">
              <a href={WHATSAPP_URL} className="public-whatsapp" target="_blank" rel="noreferrer">
                <WhatsAppIcon className="public-whatsapp-icon" />
                <span>Atendimento</span>
              </a>
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

      <a
        href={WHATSAPP_URL}
        className="whatsapp-float-button"
        target="_blank"
        rel="noreferrer"
        aria-label="Falar no WhatsApp"
        title="Falar no WhatsApp"
      >
        <WhatsAppIcon className="whatsapp-float-icon" />
      </a>
    </div>
  );
}
