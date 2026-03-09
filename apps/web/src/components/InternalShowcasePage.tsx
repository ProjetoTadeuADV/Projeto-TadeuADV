interface ShowcaseCard {
  tag: string;
  title: string;
  text: string;
}

interface InternalShowcasePageProps {
  kicker: string;
  title: string;
  description: string;
  imageUrl: string;
  imageAlt: string;
  highlights: string[];
  cards: ShowcaseCard[];
}

export function InternalShowcasePage({
  kicker,
  title,
  description,
  imageUrl,
  imageAlt,
  highlights,
  cards
}: InternalShowcasePageProps) {
  return (
    <section className="page-stack">
      <section className="workspace-hero workspace-hero--compact workspace-hero--module">
        <div className="workspace-hero-grid">
          <div>
            <p className="hero-kicker">{kicker}</p>
            <h1>{title}</h1>
            <p>{description}</p>
            <div className="workspace-chip-row">
              {highlights.map((item) => (
                <span key={item}>{item}</span>
              ))}
            </div>
          </div>
          <div className="workspace-hero-media">
            <img src={imageUrl} alt={imageAlt} loading="lazy" />
          </div>
        </div>
      </section>

      <section className="workspace-panel">
        <div className="module-card-grid">
          {cards.map((item) => (
            <article className="feature-card feature-card-elevated" key={`${item.tag}-${item.title}`}>
              <span className="step-badge">{item.tag}</span>
              <h3>{item.title}</h3>
              <p>{item.text}</p>
            </article>
          ))}
        </div>
      </section>
    </section>
  );
}
