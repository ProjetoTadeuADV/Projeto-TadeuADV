import { InternalShowcasePage } from "../components/InternalShowcasePage";

export function DadosPage() {
  return (
    <InternalShowcasePage
      kicker="Dados"
      title="Painel de inteligência do produto"
      description="Centralize métricas de uso, qualidade de preenchimento e evolução de performance para apoiar decisões."
      imageUrl="https://images.unsplash.com/photo-1518186285589-2f7649de83e0?auto=format&fit=crop&w=1200&q=80"
      imageAlt="Tela com gráficos e métricas de performance"
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
