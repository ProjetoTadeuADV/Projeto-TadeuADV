import { InternalShowcasePage } from "../components/InternalShowcasePage";

export function Pagina3Page() {
  return (
    <InternalShowcasePage
      kicker="Página 3"
      title="Estrutura para recursos avançados"
      description="Espaço para futuras funcionalidades estratégicas, com visual alinhado ao padrão profissional da plataforma."
      imageUrl="https://images.unsplash.com/photo-1552664730-d307ca884978?auto=format&fit=crop&w=1200&q=80"
      imageAlt="Reunião estratégica com equipe de produto e operação"
      highlights={["Roadmap", "Governança", "Expansão"]}
      cards={[
        {
          tag: "Exemplo",
          title: "Módulos premium",
          text: "Espaço para funcionalidades de análise e automação adicional."
        },
        {
          tag: "Exemplo",
          title: "Gestão de performance",
          text: "Indicadores de produtividade e eficiência operacional."
        },
        {
          tag: "Exemplo",
          title: "Inteligência de dados",
          text: "Modelos preditivos para apoiar decisão comercial e jurídica."
        }
      ]}
    />
  );
}
