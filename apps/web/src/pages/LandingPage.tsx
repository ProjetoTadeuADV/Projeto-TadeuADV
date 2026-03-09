import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export function LandingPage() {
  const { user, loading } = useAuth();

  return (
    <div className="landing-shell">
      <header className="landing-header">
        <div className="landing-brand">
          <div className="brand-dot" />
          <span>Doutor<span className="brand-eu">Eu</span></span>
        </div>

        <nav className="landing-nav">
          <a href="#como-funciona">Como funciona</a>
          <a href="#vantagens">Vantagens</a>
          <a href="#escopo">Escopo inicial</a>
        </nav>

        <div className="landing-actions">
          {loading ? null : user ? (
            <Link to="/dashboard" className="hero-secondary">
              Ir para dashboard
            </Link>
          ) : (
            <>
              <Link to="/login" className="hero-secondary">
                Entrar
              </Link>
              <Link to="/register" className="hero-primary">
                Criar conta
              </Link>
            </>
          )}
        </div>
      </header>

      <main className="landing-main">
        <section className="hero-panel">
          <p className="hero-kicker">MVP beta para Juizados Especiais Civeis</p>
          <h1>
            O Doutor da sua causa e <span className="hero-highlight">voce</span>.
          </h1>
          <p>
            Assistente juridico para pessoas fisicas abrirem e acompanharem casos com clareza,
            seguranca e linguagem acessivel.
          </p>

          <div className="hero-cta">
            {user ? (
              <Link to="/cases/new" className="hero-primary">
                Abrir novo caso
              </Link>
            ) : (
              <>
                <Link to="/register" className="hero-primary">
                  Comecar agora
                </Link>
                <Link to="/login" className="hero-secondary">
                  Ja tenho conta
                </Link>
              </>
            )}
          </div>

          <ul className="hero-stats">
            <li>
              <strong>Cadastro seguro</strong>
              <span>Autenticacao por e-mail e senha com Firebase</span>
            </li>
            <li>
              <strong>Fluxo objetivo</strong>
              <span>Vara, CPF, resumo e acompanhamento no dashboard</span>
            </li>
            <li>
              <strong>Empoderamento do usuario</strong>
              <span>Voce entende cada etapa e controla o andamento do caso</span>
            </li>
          </ul>
        </section>

        <section id="como-funciona" className="landing-section">
          <h2>Como funciona</h2>
          <div className="feature-grid">
            <article className="feature-card">
              <span className="step-badge">01</span>
              <h3>Crie sua conta</h3>
              <p>Usuario se cadastra por e-mail e senha para acessar seu painel.</p>
            </article>
            <article className="feature-card">
              <span className="step-badge">02</span>
              <h3>Abra seu caso</h3>
              <p>Informe vara, CPF e um resumo do problema para gerar o protocolo interno.</p>
            </article>
            <article className="feature-card">
              <span className="step-badge">03</span>
              <h3>Acompanhe status</h3>
              <p>Visualize seus casos em andamento e consulte cada detalhe no dashboard.</p>
            </article>
          </div>
        </section>

        <section id="vantagens" className="landing-section">
          <h2>Vantagens desta versao</h2>
          <div className="value-list">
            <div>
              <h3>Interface clara</h3>
              <p>Design limpo para orientar usuarios sem conhecimento tecnico-juridico.</p>
            </div>
            <div>
              <h3>Seguranca e privacidade</h3>
              <p>Autenticacao com Firebase e base preparada para boas praticas de dados.</p>
            </div>
            <div>
              <h3>MVP orientado ao real</h3>
              <p>Entrega enxuta para validar operacao antes de ampliar automacoes.</p>
            </div>
          </div>
        </section>

        <section id="escopo" className="landing-section closing-panel">
          <h2>Escopo inicial no ar hoje</h2>
          <ul>
            <li>Cadastro e login de usuario.</li>
            <li>Criacao de caso com lista de varas JEC TJSP.</li>
            <li>Consulta de CPF mock integrada ao fluxo.</li>
            <li>Painel de acompanhamento de casos do proprio usuario.</li>
          </ul>
        </section>
      </main>
    </div>
  );
}
