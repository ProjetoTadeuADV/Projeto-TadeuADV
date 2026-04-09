import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export function LandingPage() {
  const { user } = useAuth();

  return (
    <div className="landing-pro landing-pro--light">
      <section className="landing-hero landing-hero--compact landing-hero--home-light">
        <div className="landing-hero-surface" />
        <div className="landing-container landing-hero-grid">
          <div className="landing-hero-copy">
            <p className="hero-kicker">Acesso rápido à Justiça</p>
            <h1>
              A plataforma digital que coloca a <span className="hero-highlight">justiça nas suas mãos</span> com
              segurança e praticidade.
            </h1>
            <p>Você tem um problema jurídico e não sabe por onde começar?</p>
            <p>
              Nós descomplicamos tudo para você com uma plataforma rápida, intuitiva, segura e 100% on-line.
            </p>
            <p>
              Entre na justiça com causas de até R$ 32.000, sem a necessidade de contratar advogado e sem sair de casa.
            </p>
            <p>Não quer esperar até o fim do processo judicial, ceda seus direitos e ganhe dinheiro rápido*.</p>
            <p className="section-footnote section-footnote--hero">*Sujeito à análise.</p>

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
              <span>Acompanhe seu caso em tempo real</span>
              <span>Ceda direitos e receba antecipação financeira</span>
              <span>100% on-line, sem sair de casa</span>
            </div>
          </div>

          <div className="landing-hero-media landing-hero-media--principal">
            <img src="/images/Langing.png" alt="Ilustração principal da plataforma DrEu" loading="lazy" />
          </div>
        </div>

        <div className="landing-hero-highlights">
          <div className="landing-container highlight-grid">
            <article>
              <h3>Abertura sem burocracia</h3>
              <p>Você organiza os dados essenciais do caso em poucos passos, com orientação simples.</p>
            </article>
            <article>
              <h3>Acompanhamento transparente</h3>
              <p>Painel claro para acompanhar andamento, histórico e próximos passos em tempo real.</p>
            </article>
            <article>
              <h3>Solução com agilidade</h3>
              <p>Concilie, acompanhe sua ação ou ceda direitos conforme a estratégia mais adequada ao seu momento.</p>
            </article>
          </div>
        </div>
      </section>

      <section id="sobre-nos" className="landing-block">
        <div className="landing-container">
          <div className="landing-section-head">
            <p className="hero-kicker">Sobre nós</p>
            <h2>Democratizando o acesso à justiça</h2>
          </div>

          <article className="about-overview-card about-overview-card--full">
            <h3>Sobre Nós: Democratizando o Acesso à Justiça</h3>
            <p>
              Nossa plataforma nasceu de um propósito claro e fundamental: transformar a maneira como o cidadão busca e
              alcança os seus direitos. Compreendemos que lidar com questões legais muitas vezes é sinônimo de
              burocracia, custos elevados e longos períodos de espera. Por isso, desenvolvemos uma solução digital que
              coloca a justiça ao seu alcance, de forma simples, transparente e acessível.
            </p>
            <p>
              O nosso principal objetivo é ampliar e facilitar o acesso das pessoas ao Poder Judiciário. Acreditamos que
              todos devem ter a capacidade de reivindicar o que é justo sem enfrentar barreiras intransponíveis. Para
              causas de menor complexidade, que não dependam especialmente de provas mais técnicas, e com valor de até 20
              salários mínimos, oferecemos a tecnologia necessária para que você mesmo possa criar sua petição, organizar
              suas provas, ajuizar a sua ação e acompanhá-la até a sentença (decisão em primeira instância), com total
              autonomia e sem a obrigatoriedade de contratar um advogado.
            </p>
            <p>
              Além de abrir as portas do Judiciário, trabalhamos ativamente para promover a cultura do diálogo. A
              plataforma prioriza e oferece meios alternativos de solução amigável, incentivando a conciliação e o acordo
              antes que o litígio se torne um desgaste emocional e financeiro. Entendemos que a melhor resolução é aquela
              construída em conjunto, de forma pacífica e eficiente.
            </p>
            <p>
              No entanto, sabemos que nem todo problema pode esperar. Quando a conciliação não é possível ou quando o
              tempo é um fator crítico, nosso compromisso é garantir uma solução justa e rápida para o seu problema. Para
              isso, inovamos ao oferecer o serviço de compra de direitos de ação. Nós avaliamos o seu caso e antecipamos
              o valor que você tem a receber, assumindo o risco e o tempo de espera do processo judicial. Assim, você
              resolve a sua questão no presente, com a segurança e a agilidade que a sua vida exige.
            </p>
            <p>
              Em resumo, somos mais do que uma ferramenta tecnológica; somos um parceiro na busca pelos seus direitos.
              Seja através de um acordo amigável, do ajuizamento simplificado ou da antecipação financeira do seu caso,
              estamos aqui para garantir que a justiça não seja um privilégio, mas sim uma realidade acessível e rápida
              para todos.
            </p>
          </article>
        </div>
      </section>

      <section id="como-funciona" className="landing-block landing-block-soft">
        <div className="landing-container">
          <div className="landing-section-head">
            <p className="hero-kicker">Como funciona</p>
            <h2>Fluxo simples para o usuário e estrutura de tecnologia profissional para a operação</h2>
          </div>

          <div className="feature-grid feature-grid-large">
            <article className="feature-card feature-card-elevated">
              <h3>Cadastro e acesso</h3>
              <p>Conta por e-mail e senha com validação de identidade e sessão protegida.</p>
            </article>
            <article className="feature-card feature-card-elevated">
              <h3>Abertura da ação</h3>
              <p>Formulário guiado com CPF, descrição do pedido e organização das provas em linguagem simples.</p>
            </article>
            <article className="feature-card feature-card-elevated">
              <h3>Acompanhamento do caso</h3>
              <p>Status e histórico atualizados no painel com visualização rápida dos detalhes.</p>
            </article>
            <article className="feature-card feature-card-elevated">
              <h3>Venda dos seus direitos</h3>
              <p>
                Caso não queira aguardar o longo trâmite de um processo judicial, ceda seus direitos* e receba dinheiro
                na hora.
              </p>
            </article>
          </div>
          <p className="section-footnote">*Sujeito à análise.</p>
        </div>
      </section>

      <section id="planos" className="landing-block">
        <div className="landing-container">
          <div className="landing-section-head">
            <p className="hero-kicker">Investimento</p>
            <h2>Acesso único com assinatura mensal e negociação de causa a partir de R$ 1.000,00</h2>
          </div>

          <article className="pricing-card pricing-card--featured pricing-card--standalone">
            <p className="hero-kicker">Assinatura mensal</p>
            <h3>Acesso completo à plataforma</h3>
            <p className="pricing-price">
              R$ 97,00<span>/mês</span>
            </p>
            <ul className="pricing-list">
              <li>Acesso à jornada de criação, envio e acompanhamento de casos em um só painel</li>
              <li>Organização de documentos, atualizações e comunicação centralizada</li>
              <li>Fluxo pensado para causas menos complexas, com autonomia do usuário</li>
              <li>Negociação de causa disponível para valores a partir de R$ 1.000,00*</li>
            </ul>
            <Link to={user ? "/dashboard" : "/register"} className="hero-primary">
              {user ? "Acessar plataforma" : "Assinar por R$ 97,00/mês"}
            </Link>
            <p className="section-footnote">*Sujeito à análise.</p>
          </article>
        </div>
      </section>

      <footer className="landing-legal">
        <div className="landing-container landing-legal-grid">
          <p className="landing-legal-title">Todos os direitos reservados.</p>
          <p className="landing-legal-text">
            Essa plataforma e todos os direitos a ela relacionados pertencem exclusivamente à DrEu, empresa brasileira,
            com sede à Av. Prochet, 777 Sala 01 - Londrina PR.
          </p>
          <p className="landing-legal-note">*Sujeito à análise.</p>
        </div>
      </footer>
    </div>
  );
}
