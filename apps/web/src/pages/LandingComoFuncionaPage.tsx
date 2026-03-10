import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export function LandingComoFuncionaPage() {
  const { user } = useAuth();

  return (
    <div className="landing-pro landing-pro--light">
      <section className="landing-hero landing-hero--compact landing-hero--home-light">
        <div className="landing-hero-surface" />
        <div className="landing-container landing-hero-grid">
          <div className="landing-hero-copy">
            <p className="hero-kicker">Como funciona</p>
            <h1>Uma jornada simples para iniciar e acompanhar sua demanda jurídica</h1>
            <p>
              Do cadastro ao acompanhamento, cada etapa é guiada para facilitar o entendimento do
              cliente e dar previsibilidade ao fluxo.
            </p>
            <div className="hero-cta">
              <Link to={user ? "/cases/new" : "/register"} className="hero-primary">
                {user ? "Abrir caso agora" : "Criar conta"}
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
              alt="Ilustração da jornada de atendimento da plataforma"
              loading="lazy"
            />
          </div>
        </div>

        <div className="landing-hero-highlights">
          <div className="landing-container highlight-grid">
            <article>
              <h3>Passos guiados</h3>
              <p>Fluxo padronizado reduz erros de preenchimento e retrabalho.</p>
            </article>
            <article>
              <h3>Linguagem objetiva</h3>
              <p>Textos diretos para facilitar decisão e envio das informações.</p>
            </article>
            <article>
              <h3>Controle no painel</h3>
              <p>O usuário acompanha o caso sem depender de atualização manual.</p>
            </article>
          </div>
        </div>
      </section>

      <section className="landing-block landing-block-soft">
        <div className="landing-container">
          <div className="landing-section-head">
            <p className="hero-kicker">Jornada</p>
            <h2>Fluxo em 3 etapas para atendimento inicial</h2>
            <p>
              O fluxo foi desenhado para ser direto: cadastro, abertura do caso e acompanhamento.
              Cada etapa usa linguagem acessível para o usuário entender exatamente o que fazer.
            </p>
          </div>

          <div className="feature-grid feature-grid-large">
            <article className="feature-card feature-card-elevated">
              <span className="step-badge">Passo 1</span>
              <span className="feature-mark">AC</span>
              <h3>Crie seu acesso</h3>
              <p>Cadastro por e-mail e senha para garantir histórico e segurança da conta.</p>
            </article>
            <article className="feature-card feature-card-elevated">
              <span className="step-badge">Passo 2</span>
              <span className="feature-mark">NC</span>
              <h3>Abra o caso</h3>
              <p>Selecione a vara, informe CPF e descreva o problema no formulário guiado.</p>
            </article>
            <article className="feature-card feature-card-elevated">
              <span className="step-badge">Passo 3</span>
              <span className="feature-mark">PA</span>
              <h3>Acompanhe no painel</h3>
              <p>Visualize status, datas e detalhes de cada caso em um único lugar.</p>
            </article>
          </div>
        </div>
      </section>

      <section className="landing-block">
        <div className="landing-container">
          <div className="landing-section-head">
            <p className="hero-kicker">Exemplos de uso</p>
            <h2>Cenários práticos que a plataforma resolve no primeiro acesso</h2>
          </div>
          <div className="value-grid">
            <article className="value-card">
              <h3>Primeiro atendimento</h3>
              <p>O cliente abre a demanda em minutos e recebe visibilidade de status.</p>
            </article>
            <article className="value-card">
              <h3>Triagem comercial</h3>
              <p>A equipe valida dados iniciais e organiza prioridades por vara.</p>
            </article>
            <article className="value-card">
              <h3>Acompanhamento contínuo</h3>
              <p>O usuário consulta detalhes sem fricção e com histórico consolidado.</p>
            </article>
            <article className="value-card value-card-strong">
              <p className="hero-kicker">Fluxo pronto</p>
              <h3>Inicie seu primeiro caso agora</h3>
              <Link to={user ? "/cases/new" : "/register"} className="hero-primary">
                {user ? "Abrir caso agora" : "Criar conta"}
              </Link>
            </article>
          </div>
        </div>
      </section>

      <section className="landing-block landing-block-dark">
        <div className="landing-container cta-band">
          <div>
            <p className="hero-kicker">Acesso imediato</p>
            <h2>Comece hoje sem fricção operacional</h2>
            <p>
              Entre na plataforma e valide o fluxo completo com cadastro, abertura e
              acompanhamento.
            </p>
          </div>
          <div className="hero-cta">
            <Link to={user ? "/cases/new" : "/register"} className="hero-primary">
              {user ? "Novo caso" : "Criar conta"}
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
