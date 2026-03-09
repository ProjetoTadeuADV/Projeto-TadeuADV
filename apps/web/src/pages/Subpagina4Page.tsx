import { InternalShowcasePage } from "../components/InternalShowcasePage";

export function Subpagina4Page() {
  return (
    <InternalShowcasePage
      kicker="Subpágina 4"
      title="Análise de performance do fluxo"
      description="Visual para acompanhar metas, tempo de ciclo e pontos de ganho operacional."
      imageUrl="https://images.unsplash.com/photo-1543286386-2e659306cd6c?auto=format&fit=crop&w=1200&q=80"
      imageAlt="Gráfico de resultados em tela de análise"
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
