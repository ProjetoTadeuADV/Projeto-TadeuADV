import { InternalShowcasePage } from "../components/InternalShowcasePage";

export function DadosPage() {
  return (
    <InternalShowcasePage
      kicker="Dados"
      title="Painel de inteligência do produto"
      description="Centralize métricas de uso, qualidade de preenchimento e evolução de performance para apoiar decisões."
      highlights={["Métrica de uso", "Qualidade de dados", "Insights"]}
      cards={[
        {
          tag: "Exemplo",
          title: "Taxa de conclusão",
          text: "Percentual de usuários que finalizam abertura de caso."
        },
        {
          tag: "Exemplo",
          title: "Tempo médio de preenchimento",
          text: "Monitore fricção no formulário para otimizar a experiência."
        },
        {
          tag: "Exemplo",
          title: "Status por carteira",
          text: "Distribuição de casos recebidos, em análise e encerrados."
        }
      ]}
    />
  );
}
