import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export function LandingPage() {
  const { user } = useAuth();

  return (
    <div className="landing-pro">
      <section className="landing-hero">
        <div className="landing-hero-surface" />
        <div className="landing-container landing-hero-grid">
          <div className="landing-hero-copy">
            <p className="hero-kicker">Plataforma digital para Juizado Especial Cível</p>
            <h1>
              O Doutor da sua causa é <span className="hero-highlight">você</span>.
            </h1>
            <p className="hero-signature">"O Doutor da Sua Causa é Você."</p>
            <p>
              Estrutura profissional para abrir sua demanda, registrar informações do caso e
              acompanhar o andamento com linguagem simples e foco em clareza.
            </p>

            <div className="hero-cta">
              {user ? (
                <Link to="/cases/new" className="hero-primary">
                  Abrir novo caso
                </Link>
              ) : (
                <>
                  <Link to="/register" className="hero-primary">
                    Começar agora
                  </Link>
                  <Link to="/login" className="hero-secondary">
                    Já tenho conta
                  </Link>
                </>
              )}
            </div>

            <div className="hero-trust">
              <span>Cadastro seguro</span>
              <span>Fluxo guiado por etapas</span>
              <span>Painel de acompanhamento</span>
            </div>
          </div>

          <div className="landing-hero-media landing-hero-media--principal">
            <img
              src="/images/hero-principal.jpg"
              alt="Advogado em posição profissional representando confiança"
              loading="lazy"
            />
          </div>
        </div>

        <div className="landing-hero-highlights">
          <div className="landing-container highlight-grid">
            <article>
              <h3>Triagem inteligente</h3>
              <p>Recebimento padronizado com vara, CPF e resumo objetivo do problema.</p>
            </article>
            <article>
              <h3>Operação clara</h3>
              <p>Painel do cliente com histórico, status e data de cada solicitação.</p>
            </article>
            <article>
              <h3>Base pronta para crescer</h3>
              <p>Arquitetura preparada para novos fluxos e integrações na próxima fase.</p>
            </article>
          </div>
        </div>
      </section>

      <section className="landing-block landing-block-soft">
        <div className="landing-container">
          <div className="landing-section-head">
            <p className="hero-kicker">Como funciona</p>
            <h2>Fluxo simples para o usuário e estrutura profissional para o escritório</h2>
          </div>

          <div className="feature-grid feature-grid-large">
            <article className="feature-card feature-card-elevated">
              <span className="step-badge">01</span>
              <span className="feature-mark">AC</span>
              <h3>Cadastro e acesso</h3>
              <p>Conta por e-mail e senha com sessão persistente e identidade protegida.</p>
            </article>
            <article className="feature-card feature-card-elevated">
              <span className="step-badge">02</span>
              <span className="feature-mark">NC</span>
              <h3>Novo caso</h3>
              <p>Formulário orientado com vara, CPF válido e resumo para triagem inicial.</p>
            </article>
            <article className="feature-card feature-card-elevated">
              <span className="step-badge">03</span>
              <span className="feature-mark">PA</span>
              <h3>Painel de acompanhamento</h3>
              <p>Status do caso em tempo real no dashboard do cliente.</p>
            </article>
          </div>
        </div>
      </section>

      <section className="landing-block">
        <div className="landing-container">
          <div className="landing-section-head">
            <p className="hero-kicker">Diferenciais</p>
            <h2>Uma experiência mais confiável desde o primeiro contato</h2>
          </div>

          <div className="value-grid">
            <article className="value-card">
              <h3>Confiança</h3>
              <p>Identidade visual jurídica, linguagem objetiva e fluxo sem excesso de etapas.</p>
            </article>
            <article className="value-card">
              <h3>Empoderamento</h3>
              <p>Usuário entende cada passo da abertura do caso sem dependência técnica.</p>
            </article>
            <article className="value-card">
              <h3>Escalabilidade</h3>
              <p>MVP preparado para integrar consulta real de CPF e novas automações.</p>
            </article>
            <article className="value-card value-card-strong">
              <p className="hero-kicker">Beta em operação</p>
              <h3>Pronto para publicar hoje</h3>
              <p>
                Fluxo ponta a ponta ativo: cadastro, login, novo caso e acompanhamento no painel.
              </p>
              <Link to={user ? "/dashboard" : "/register"} className="hero-primary">
                {user ? "Ir para dashboard" : "Criar conta agora"}
              </Link>
            </article>
          </div>
        </div>
      </section>

      <section className="landing-block landing-block-dark">
        <div className="landing-container cta-band">
          <div>
            <p className="hero-kicker">Próxima etapa</p>
            <h2>Quer usar suas próprias imagens e textos institucionais?</h2>
            <p>
              Deixamos essa landing pronta para receber os assets finais da marca e publicar no
              próximo deploy.
            </p>
          </div>
          <div className="hero-cta">
            <Link to={user ? "/cases/new" : "/register"} className="hero-primary">
              {user ? "Abrir novo caso" : "Começar teste"}
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
