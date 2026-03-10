import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export function LandingVantagensPage() {
  const { user } = useAuth();

  return (
    <div className="landing-pro landing-pro--light">
      <section className="landing-hero landing-hero--compact landing-hero--home-light">
        <div className="landing-hero-surface" />
        <div className="landing-container landing-hero-grid">
          <div className="landing-hero-copy">
            <p className="hero-kicker">Sobre</p>
            <h1>Experiência profissional com clareza para o cliente final</h1>
            <p>
              A plataforma equilibra autoridade visual, praticidade operacional e segurança para
              transformar a abertura de casos em uma jornada fluida.
            </p>
            <div className="hero-cta">
              <Link to={user ? "/dashboard" : "/register"} className="hero-primary">
                {user ? "Ir para dashboard" : "Criar conta"}
              </Link>
              {!user && (
                <Link to="/login" className="hero-secondary">
                  Entrar
                </Link>
              )}
            </div>
          </div>

          <div className="landing-hero-media landing-hero-media--principal">
            <img
              src="/images/Langing.png"
              alt="Ilustração institucional da plataforma DoutorEu"
              loading="lazy"
            />
          </div>
        </div>

        <div className="landing-hero-highlights">
          <div className="landing-container highlight-grid">
            <article>
              <h3>Confiança de marca</h3>
              <p>Paleta jurídica e tipografia forte reforçam credibilidade.</p>
            </article>
            <article>
              <h3>UX orientada ao cliente</h3>
              <p>Fluxo direto para reduzir abandono no preenchimento.</p>
            </article>
            <article>
              <h3>Base para escalar</h3>
              <p>Estrutura preparada para novas regras e automações.</p>
            </article>
          </div>
        </div>
      </section>

      <section className="landing-block">
        <div className="landing-container">
          <div className="landing-section-head">
            <p className="hero-kicker">Diferenciais do produto</p>
            <h2>Um produto com posicionamento jurídico e usabilidade clara para o cliente</h2>
            <p>
              A plataforma combina autoridade visual com simplicidade de operação para reduzir
              dúvidas e acelerar o início da demanda.
            </p>
          </div>

          <div className="value-grid">
            <article className="value-card">
              <h3>Visual profissional</h3>
              <p>Paleta jurídica com leitura clara e componentes consistentes na experiência.</p>
            </article>
            <article className="value-card">
              <h3>Navegação objetiva</h3>
              <p>Hierarquia de informações focada em orientar sem sobrecarregar o usuário.</p>
            </article>
            <article className="value-card">
              <h3>Segurança de acesso</h3>
              <p>Autenticação no Firebase e isolamento de dados por usuário autenticado.</p>
            </article>
            <article className="value-card">
              <h3>Escopo validável</h3>
              <p>MVP enxuto para aprender rápido com uso real e evoluir com baixo risco.</p>
            </article>
          </div>
        </div>
      </section>

      <section className="landing-block landing-block-soft">
        <div className="landing-container">
          <div className="landing-section-head">
            <p className="hero-kicker">Exemplos</p>
            <h2>Aplicações práticas para a fase atual do MVP</h2>
          </div>
          <div className="feature-grid feature-grid-large">
            <article className="feature-card feature-card-elevated">
              <span className="step-badge">Técnico</span>
              <h3>Arquitetura modular</h3>
              <p>Frontend e API desacoplados, prontos para evolução progressiva.</p>
            </article>
            <article className="feature-card feature-card-elevated">
              <span className="step-badge">Produto</span>
              <h3>Foco no essencial</h3>
              <p>Cadastro, abertura e acompanhamento entregam valor logo no primeiro uso.</p>
            </article>
            <article className="feature-card feature-card-elevated">
              <span className="step-badge">Marca</span>
              <h3>Identidade consistente</h3>
              <p>Cores e tipografia reforçam confiança em cada etapa da jornada.</p>
            </article>
          </div>
        </div>
      </section>

      <section className="landing-block landing-block-dark">
        <div className="landing-container cta-band">
          <div>
            <p className="hero-kicker">Acesso rápido</p>
            <h2>Quer experimentar agora?</h2>
            <p>Entre no ambiente e veja o fluxo completo em funcionamento.</p>
          </div>
          <div className="hero-cta">
            <Link to={user ? "/dashboard" : "/register"} className="hero-primary">
              {user ? "Ir para dashboard" : "Criar conta"}
            </Link>
            {!user && (
              <Link to="/login" className="hero-secondary">
                Entrar
              </Link>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
