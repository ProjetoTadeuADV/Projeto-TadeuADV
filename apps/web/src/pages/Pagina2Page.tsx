import { InternalShowcasePage } from "../components/InternalShowcasePage";

export function Pagina2Page() {
  return (
    <InternalShowcasePage
      kicker="Página 2"
      title="Controle de acompanhamento"
      description="Estruture aqui painéis de progresso, prazos e desempenho operacional por etapa da jornada."
      imageUrl="https://images.unsplash.com/photo-1460925895917-afdab827c52f?auto=format&fit=crop&w=1200&q=80"
      imageAlt="Painel de gráficos com indicadores de desempenho"
      highlights={["Prazos", "Status", "Próximas ações"]}
      cards={[
        {
          tag: "Exemplo",
          title: "SLA por etapa",
          text: "Tempo médio entre abertura, análise e encerramento."
        },
        {
          tag: "Exemplo",
          title: "Mapa de bloqueios",
          text: "Identifique pontos de atrito que atrasam o fluxo de atendimento."
        },
        {
          tag: "Exemplo",
          title: "Fila de revisão",
          text: "Lista de casos que exigem retorno imediato ao cliente."
        }
      ]}
    />
  );
}
