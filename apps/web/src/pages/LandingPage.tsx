import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { apiRequest } from "../lib/api";
import type { VaraOption } from "../types";

interface ReviewItem {
  id: string;
  autor: string;
  perfil: string;
  texto: string;
  resultado: string;
}

const REVIEWS: ReviewItem[] = [
  {
    id: "r1",
    autor: "Camila Rocha",
    perfil: "Consumidora",
    texto: "Consegui abrir meu caso em poucos minutos e sem travar no preenchimento.",
    resultado: "Cadastro concluído em 7 minutos"
  },
  {
    id: "r2",
    autor: "Rafael Mendes",
    perfil: "Empreendedor",
    texto: "O painel deixou claro o andamento. Não precisei trocar várias mensagens para entender o status.",
    resultado: "Acompanhamento centralizado no dashboard"
  },
  {
    id: "r3",
    autor: "Juliana Prado",
    perfil: "Usuária recorrente",
    texto: "A plataforma ficou simples para explicar ao cliente final e isso reduziu retrabalho no atendimento.",
    resultado: "Triagem inicial mais organizada"
  }
];

export function LandingPage() {
  const { user } = useAuth();
  const [activeReview, setActiveReview] = useState(0);
  const [varas, setVaras] = useState<VaraOption[]>([]);
  const [loadingVaras, setLoadingVaras] = useState(true);
  const [isInlineCtaVisible, setIsInlineCtaVisible] = useState(false);
  const [isFloatingCtaDismissed, setIsFloatingCtaDismissed] = useState(false);
  const [isFloatingCtaClosing, setIsFloatingCtaClosing] = useState(false);
  const inlineCtaRef = useRef<HTMLElement | null>(null);
  const dismissTimerRef = useRef<number | null>(null);

  useEffect(() => {
    async function loadVaras() {
      setLoadingVaras(true);
      try {
        const result = await apiRequest<VaraOption[]>("/v1/varas");
        setVaras(result);
      } catch {
        setVaras([]);
      } finally {
        setLoadingVaras(false);
      }
    }

    void loadVaras();
  }, []);

  useEffect(() => {
    const interval = window.setInterval(() => {
      setActiveReview((current) => (current + 1) % REVIEWS.length);
    }, 4200);

    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    const target = inlineCtaRef.current;
    if (!target) {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        const [entry] = entries;
        if (!entry) {
          return;
        }

        const fullyVisible = entry.isIntersecting && entry.intersectionRatio >= 0.92;
        setIsInlineCtaVisible(fullyVisible);
      },
      {
        threshold: [0, 0.25, 0.5, 0.75, 0.92, 1]
      }
    );

    observer.observe(target);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!isInlineCtaVisible) {
      return;
    }

    setIsFloatingCtaDismissed(false);
    setIsFloatingCtaClosing(false);
  }, [isInlineCtaVisible]);

  useEffect(() => {
    return () => {
      if (dismissTimerRef.current !== null) {
        window.clearTimeout(dismissTimerRef.current);
      }
    };
  }, []);

  const currentReview = useMemo(() => REVIEWS[activeReview], [activeReview]);
  const showFloatingCta = !isInlineCtaVisible && (!isFloatingCtaDismissed || isFloatingCtaClosing);

  function handleDismissFloatingCta() {
    if (isFloatingCtaClosing) {
      return;
    }

    setIsFloatingCtaClosing(true);
    dismissTimerRef.current = window.setTimeout(() => {
      setIsFloatingCtaDismissed(true);
      setIsFloatingCtaClosing(false);
      dismissTimerRef.current = null;
    }, 320);
  }

  return (
    <div className="landing-pro landing-pro--light">
      <section className="landing-hero landing-hero--compact landing-hero--home-light">
        <div className="landing-hero-surface" />
        <div className="landing-container landing-hero-grid">
          <div className="landing-hero-copy">
            <p className="hero-kicker">Plataforma digital para Juizado Especial Cível</p>
            <h1>
              O Doutor da sua causa é <span className="hero-highlight">você</span>.
            </h1>
            <p className="hero-signature">"O Doutor da Sua Causa é Você."</p>
            <p>
              Estrutura profissional para abrir demandas, registrar informações com clareza e acompanhar cada caso em
              um painel simples e direto.
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
            <img src="/images/Langing.png" alt="Ilustração principal da plataforma DoutorEu" loading="lazy" />
          </div>
        </div>

        <div className="landing-hero-highlights">
          <div className="landing-container highlight-grid">
            <article>
              <h3>Triagem inteligente</h3>
              <p>Dados essenciais entram organizados para reduzir retrabalho no atendimento.</p>
            </article>
            <article>
              <h3>Operação clara</h3>
              <p>Jornada objetiva para cadastro, abertura de caso e acompanhamento.</p>
            </article>
            <article>
              <h3>Base para crescer</h3>
              <p>Arquitetura pronta para evoluir com integrações e automações futuras.</p>
            </article>
          </div>
        </div>
      </section>

      <section id="como-funciona" className="landing-block landing-block-soft">
        <div className="landing-container">
          <div className="landing-section-head">
            <p className="hero-kicker">Como funciona</p>
            <h2>Fluxo simples para o usuário e estrutura profissional para a operação</h2>
          </div>

          <div className="feature-grid feature-grid-large">
            <article className="feature-card feature-card-elevated">
              <span className="step-badge">01</span>
              <span className="feature-mark">AC</span>
              <h3>Cadastro e acesso</h3>
              <p>Conta por e-mail e senha com validação de identidade e sessão protegida.</p>
            </article>
            <article className="feature-card feature-card-elevated">
              <span className="step-badge">02</span>
              <span className="feature-mark">NC</span>
              <h3>Abertura do caso</h3>
              <p>Formulário guiado com vara, CPF e descrição do pedido em linguagem simples.</p>
            </article>
            <article className="feature-card feature-card-elevated">
              <span className="step-badge">03</span>
              <span className="feature-mark">PA</span>
              <h3>Acompanhamento</h3>
              <p>Status e histórico atualizados no painel com visualização rápida dos detalhes.</p>
            </article>
          </div>
        </div>
      </section>

      <section id="experiencia" className="landing-block">
        <div className="landing-container">
          <div className="landing-section-head">
            <p className="hero-kicker">Avaliações</p>
            <h2>Depoimentos reais de quem já validou a jornada</h2>
          </div>

          <div className="landing-tab-panel">
            <section className="review-carousel" aria-live="polite">
              <article key={currentReview.id} className="review-card review-card--animated">
                <p className="review-quote">"{currentReview.texto}"</p>
                <div className="review-meta">
                  <strong>{currentReview.autor}</strong>
                  <span>{currentReview.perfil}</span>
                  <small>{currentReview.resultado}</small>
                </div>
              </article>
              <div className="review-dots">
                {REVIEWS.map((review, index) => (
                  <button
                    key={review.id}
                    type="button"
                    className={index === activeReview ? "review-dot review-dot--active" : "review-dot"}
                    aria-label={`Mostrar avaliação ${index + 1}`}
                    onClick={() => setActiveReview(index)}
                  />
                ))}
              </div>
            </section>
          </div>
        </div>
      </section>

      <section id="atuacao" className="landing-block landing-block-soft">
        <div className="landing-container">
          <div className="landing-section-head">
            <p className="hero-kicker">Área de atuação atual</p>
            <h2>Veja as varas disponíveis para abrir caso agora</h2>
          </div>

          <div className="landing-tab-panel">
            <section className="atuacao-panel">
              <h3>Varas disponíveis no momento</h3>
              {loadingVaras ? (
                <p>Carregando lista de varas...</p>
              ) : varas.length === 0 ? (
                <p>Nenhuma vara foi encontrada agora. Tente novamente em instantes.</p>
              ) : (
                <div className="vara-grid">
                  {varas.map((vara) => (
                    <article key={vara.id} className="vara-card">
                      <strong>{vara.nome}</strong>
                      <span>ID: {vara.id}</span>
                    </article>
                  ))}
                </div>
              )}
            </section>
          </div>
        </div>
      </section>

      <section id="planos" className="landing-block">
        <div className="landing-container">
          <div className="landing-section-head">
            <p className="hero-kicker">Planos</p>
            <h2>Comece grátis e avance para operação premium quando escalar</h2>
          </div>

          <div className="landing-tab-panel">
            <section className="pricing-grid">
              <article className="pricing-card">
                <p className="hero-kicker">Free</p>
                <h3>Plano Inicial</h3>
                <p className="pricing-price">R$ 0</p>
                <ul className="pricing-list">
                  <li>Cadastro e login</li>
                  <li>Abertura de casos</li>
                  <li>Painel básico de acompanhamento</li>
                  <li>Suporte por e-mail</li>
                </ul>
                <Link to={user ? "/dashboard" : "/register"} className="hero-secondary">
                  {user ? "Ir para painel" : "Começar grátis"}
                </Link>
              </article>

              <article className="pricing-card pricing-card--featured">
                <p className="hero-kicker">Premium</p>
                <h3>Plano Profissional</h3>
                <p className="pricing-price">
                  R$ 97<span>/mês</span>
                </p>
                <ul className="pricing-list">
                  <li>Painel master e operador</li>
                  <li>Visão completa de usuários e casos</li>
                  <li>Prioridade de suporte</li>
                  <li>Evolução contínua com novas integrações</li>
                </ul>
                <Link to={user ? "/administrador" : "/register"} className="hero-primary">
                  {user ? "Ver painel admin" : "Experimentar premium"}
                </Link>
              </article>
            </section>
          </div>
        </div>
      </section>

      <section id="faq" className="landing-block landing-block-soft">
        <div className="landing-container">
          <div className="landing-section-head">
            <p className="hero-kicker">Perguntas frequentes</p>
            <h2>Dúvidas comuns antes de começar</h2>
          </div>

          <div className="feature-grid feature-grid-large">
            <article className="feature-card feature-card-elevated">
              <h3>Preciso ser advogado para usar?</h3>
              <p>Não. O fluxo foi pensado para pessoas leigas, com instruções diretas em cada etapa.</p>
            </article>
            <article className="feature-card feature-card-elevated">
              <h3>Meus dados ficam protegidos?</h3>
              <p>Sim. A plataforma usa autenticação e isolamento por conta para proteger acesso.</p>
            </article>
            <article className="feature-card feature-card-elevated">
              <h3>Posso acompanhar depois do envio?</h3>
              <p>Sim. O painel mostra os casos, seus status e os dados principais de cada abertura.</p>
            </article>
          </div>
        </div>
      </section>

      <section ref={inlineCtaRef} className="landing-block landing-block-dark landing-block-dark--inline">
        <div className="landing-container cta-band cta-band--active">
          <div>
            <p className="hero-kicker">Últimas vagas do piloto</p>
            <h2>Crie sua conta hoje e publique seu primeiro caso em minutos</h2>
            <p>Entre agora, valide o fluxo com clientes reais e ganhe tração antes dos concorrentes.</p>
            <div className="cta-band-points">
              <span>Acesso imediato</span>
              <span>Sem cartão no plano Free</span>
              <span>Upgrade para premium quando quiser</span>
            </div>
          </div>
          <div className="hero-cta">
            <Link to={user ? "/cases/new" : "/register"} className="hero-primary">
              {user ? "Abrir caso agora" : "Quero criar minha conta agora"}
            </Link>
            {!user && (
              <Link to="/login" className="hero-secondary">
                Já tenho conta, entrar
              </Link>
            )}
          </div>
        </div>
      </section>

      {showFloatingCta && (
        <section
          className={
            isFloatingCtaClosing ? "landing-floating-cta landing-floating-cta--closing" : "landing-floating-cta"
          }
        >
          <button
            type="button"
            className="cta-band-close"
            aria-label="Ocultar faixa de chamada"
            onClick={handleDismissFloatingCta}
          >
            {"\u00D7"}
          </button>
          <div className="landing-container cta-band cta-band--active">
            <div>
              <p className="hero-kicker">Últimas vagas do piloto</p>
              <h2>Crie sua conta hoje e publique seu primeiro caso em minutos</h2>
              <p>Entre agora, valide o fluxo com clientes reais e ganhe tração antes dos concorrentes.</p>
              <div className="cta-band-points">
                <span>Acesso imediato</span>
                <span>Sem cartão no plano Free</span>
                <span>Upgrade para premium quando quiser</span>
              </div>
            </div>
            <div className="hero-cta">
              <Link to={user ? "/cases/new" : "/register"} className="hero-primary">
                {user ? "Abrir caso agora" : "Quero criar minha conta agora"}
              </Link>
              {!user && (
                <Link to="/login" className="hero-secondary">
                  Já tenho conta, entrar
                </Link>
              )}
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
