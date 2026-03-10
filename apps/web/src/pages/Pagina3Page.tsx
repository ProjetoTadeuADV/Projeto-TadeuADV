import { InternalShowcasePage } from "../components/InternalShowcasePage";

export function Pagina3Page() {
  return (
    <InternalShowcasePage
      kicker="Página 3"
      title="Estrutura para recursos avançados"
      description="Espaço para futuras funcionalidades estratégicas, com visual alinhado ao padrão profissional da plataforma."
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
