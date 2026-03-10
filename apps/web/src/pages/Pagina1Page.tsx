import { InternalShowcasePage } from "../components/InternalShowcasePage";

export function Pagina1Page() {
  return (
    <InternalShowcasePage
      kicker="Página 1"
      title="Painel de operações comerciais"
      description="Área para consolidar visão de atendimento, distribuição inicial de demandas e indicadores de entrada."
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
