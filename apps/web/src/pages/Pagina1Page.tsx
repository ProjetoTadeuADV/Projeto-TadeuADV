import { InternalShowcasePage } from "../components/InternalShowcasePage";

export function Pagina1Page() {
  return (
    <InternalShowcasePage
      kicker="Página 1"
      title="Painel de operações comerciais"
      description="Área para consolidar visão de atendimento, distribuição inicial de demandas e indicadores de entrada."
      imageUrl="https://images.unsplash.com/photo-1551434678-e076c223a692?auto=format&fit=crop&w=1200&q=80"
      imageAlt="Equipe acompanhando indicadores em telas de monitoramento"
      highlights={["Visão executiva", "Priorização rápida", "Escalável"]}
      cards={[
        {
          tag: "Exemplo",
          title: "Fila de novos contatos",
          text: "Bloco para acompanhar entradas por dia e priorizar atendimento inicial."
        },
        {
          tag: "Exemplo",
          title: "Conversão por canal",
          text: "Comparativo entre origens para identificar maior retorno."
        },
        {
          tag: "Exemplo",
          title: "Checklist operacional",
          text: "Padrão de validação de dados antes da abertura de caso."
        }
      ]}
    />
  );
}
