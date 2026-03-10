import { InternalShowcasePage } from "../components/InternalShowcasePage";

export function Subpagina4Page() {
  return (
    <InternalShowcasePage
      kicker="Subpágina 4"
      title="Análise de performance do fluxo"
      description="Visual para acompanhar metas, tempo de ciclo e pontos de ganho operacional."
      highlights={["Performance", "Metas", "Eficiência"]}
      cards={[
        {
          tag: "Sugestão",
          title: "Tempo de ciclo",
          text: "Da abertura ao encerramento com comparativo por período."
        },
        {
          tag: "Sugestão",
          title: "Taxa de retrabalho",
          text: "Indicador para medir ajustes após criação inicial."
        },
        {
          tag: "Sugestão",
          title: "Capacidade da equipe",
          text: "Volume ideal por operador para manter qualidade."
        }
      ]}
    />
  );
}
