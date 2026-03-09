import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export function LandingEscopoPage() {
  const { user } = useAuth();

  return (
    <div className="landing-pro">
      <section className="landing-hero landing-hero--compact">
        <div className="landing-hero-surface" />
        <div className="landing-container landing-hero-grid">
          <div className="landing-hero-copy">
            <p className="hero-kicker">Escopo inicial</p>
            <h1>MVP focado no essencial para publicar rápido com qualidade</h1>
            <p>
              Nesta fase, entregamos o fluxo principal de ponta a ponta com autenticação, abertura
              de caso e acompanhamento no painel do usuário.
            </p>
            <div className="hero-cta">
              <Link to={user ? "/dashboard" : "/register"} className="hero-primary">
                {user ? "Ir para painel" : "Criar conta"}
              </Link>
              {!user && (
                <Link to="/login" className="hero-secondary">
                  Entrar
                </Link>
              )}
            </div>
          </div>

          <div className="landing-hero-media">
            <img
              src="https://images.unsplash.com/photo-1454165804606-c3d57bc86b40?auto=format&fit=crop&w=1200&q=80"
              alt="Mesa executiva com documentos e planejamento de atendimento"
              loading="lazy"
            />
          </div>
        </div>

        <div className="landing-hero-highlights">
          <div className="landing-container highlight-grid">
            <article>
              <h3>Entrega hoje</h3>
              <p>Produto funcional no ar para validação real com usuários.</p>
            </article>
            <article>
              <h3>Escopo fechado</h3>
              <p>Sem backoffice complexo nesta fase para manter velocidade.</p>
            </article>
            <article>
              <h3>Evolução planejada</h3>
              <p>Estrutura pronta para integrações e operação ampliada.</p>
            </article>
          </div>
        </div>
      </section>

      <section className="landing-block landing-block-soft">
        <div className="landing-container">
          <div className="landing-section-head">
            <p className="hero-kicker">Entrega MVP</p>
            <h2>MVP orientado para validar a operação principal hoje</h2>
            <p>
              Nesta fase beta, o foco é garantir fluxo ponta a ponta para usuário final com dados
              persistidos e estrutura pronta para evolução.
            </p>
          </div>

          <div className="feature-grid feature-grid-large">
            <article className="feature-card feature-card-elevated">
              <span className="step-badge">Conta</span>
              <h3>Cadastro e login</h3>
              <p>Autenticação por e-mail e senha com sessão do usuário.</p>
            </article>
            <article className="feature-card feature-card-elevated">
              <span className="step-badge">Caso</span>
              <h3>Abertura estruturada</h3>
              <p>Formulário com vara, CPF e resumo para início da triagem.</p>
            </article>
            <article className="feature-card feature-card-elevated">
              <span className="step-badge">Painel</span>
              <h3>Acompanhamento</h3>
              <p>Listagem e detalhe dos casos do próprio usuário autenticado.</p>
            </article>
          </div>
        </div>
      </section>

      <section className="landing-block">
        <div className="landing-container">
          <div className="landing-section-head">
            <p className="hero-kicker">Itens incluídos</p>
            <h2>Componentes técnicos e de produto entregues nesta versão</h2>
          </div>
          <div className="value-grid">
            <article className="value-card">
              <h3>Consulta CPF mock</h3>
              <p>Adaptador pronto para troca por provedor real sem quebrar o frontend.</p>
            </article>
            <article className="value-card">
              <h3>Varas estáticas</h3>
              <p>Lista inicial definida para acelerar a validação com usuários reais.</p>
            </article>
            <article className="value-card">
              <h3>Deploy contínuo</h3>
              <p>Stack preparada para publicação no Vercel e API em Railway.</p>
            </article>
            <article className="value-card value-card-strong">
              <p className="hero-kicker">Próxima etapa</p>
              <h3>Evoluir integrações reais</h3>
              <p>
                Com o MVP validado, entramos em automações e regras de negócio mais avançadas.
              </p>
            </article>
          </div>
        </div>
      </section>

      <section className="landing-block landing-block-dark">
        <div className="landing-container cta-band">
          <div>
            <p className="hero-kicker">Pronto para uso</p>
            <h2>Ative seu acesso e valide o escopo no ambiente online</h2>
            <p>Use o fluxo completo hoje e ajuste com base no feedback real dos usuários.</p>
          </div>
          <div className="hero-cta">
            <Link to={user ? "/dashboard" : "/register"} className="hero-primary">
              {user ? "Ir para painel" : "Criar conta"}
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
