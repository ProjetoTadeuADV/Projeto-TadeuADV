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
            <p className="hero-kicker">Sobre nós</p>
            <h1>Democratizando o acesso à justiça</h1>
            <p>
              Nossa plataforma nasceu para transformar a forma como o cidadão busca os seus direitos, com menos
              burocracia, mais transparência e acesso digital simples.
            </p>
            <div className="hero-cta">
              <Link to={user ? "/dashboard" : "/register"} className="hero-primary">
                {user ? "Ir para dashboard" : "Clique aqui e conheça a nossa plataforma!"}
              </Link>
              {!user && (
                <Link to="/login" className="hero-secondary">
                  Entrar
                </Link>
              )}
            </div>
          </div>

          <div className="landing-hero-media landing-hero-media--principal">
            <img src="/images/Langing.png" alt="Ilustração institucional da plataforma" loading="lazy" />
          </div>
        </div>
      </section>

      <section className="landing-block">
        <div className="landing-container">
          <div className="landing-section-head">
            <p className="hero-kicker">Sobre Nós</p>
            <h2>Uma solução para facilitar o acesso ao Poder Judiciário</h2>
          </div>

          <div className="landing-tab-panel">
            <section className="atuacao-panel">
              <p>
                Compreendemos que lidar com questões legais muitas vezes significa enfrentar custos elevados, longos
                prazos e excesso de formalidades. Por isso, criamos uma solução digital para causas de menor
                complexidade (até 20 salários mínimos), com autonomia e sem obrigatoriedade de advogado.
              </p>
              <p>
                Também priorizamos meios alternativos de solução amigável, incentivando conciliação e acordo antes do
                desgaste emocional e financeiro do litígio.
              </p>
              <p>
                Quando a conciliação não é possível, buscamos uma solução justa e rápida. Para isso, oferecemos a
                avaliação e a compra de direitos de ação, antecipando o valor que você tem a receber.
              </p>
              <p>
                Somos mais do que uma ferramenta tecnológica: somos um parceiro para que a justiça deixe de ser
                privilégio e se torne uma realidade acessível e rápida para todos.
              </p>
            </section>
          </div>
        </div>
      </section>

      <section className="landing-block landing-block-dark">
        <div className="landing-container cta-band">
          <div>
            <p className="hero-kicker">Simplifique o seu acesso à Justiça!</p>
            <h2>Resolva seu problema jurídico com poucos cliques</h2>
            <p>
              Ajuize ações de menor complexidade, acompanhe seu caso e tenha a opção de antecipar valores de direitos
              de ação.
            </p>
            <div className="cta-band-points">
              <span>Ajuizamento 100% online</span>
              <span>Conciliação e acompanhamento digital</span>
              <span>Antecipação financeira do seu caso</span>
            </div>
          </div>
          <div className="hero-cta">
            <Link to={user ? "/cases/new" : "/register"} className="hero-primary">
              {user ? "Abrir caso agora" : "Clique aqui e conheça a nossa plataforma!"}
            </Link>
            {!user && (
              <Link to="/login" className="hero-secondary">
                Já tenho conta
              </Link>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
