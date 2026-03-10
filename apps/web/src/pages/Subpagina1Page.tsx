import { InternalShowcasePage } from "../components/InternalShowcasePage";

export function Subpagina1Page() {
  return (
    <InternalShowcasePage
      kicker="Subpágina 1"
      title="Quadro de tarefas prioritárias"
      description="Modelo para organizar execução diária com foco em previsibilidade e acompanhamento dos responsáveis."
      highlights={["Backlog", "Priorização", "Execução"]}
      cards={[
        {
          tag: "Sugestão",
          title: "Fila urgente",
          text: "Casos com alta prioridade e prazo curto."
        },
        {
          tag: "Sugestão",
          title: "Alocação de equipe",
          text: "Distribuição de tarefas por perfil de atendimento."
        },
        {
          tag: "Sugestão",
          title: "Check final",
          text: "Revisão de consistência antes de conclusão da etapa."
        }
      ]}
    />
  );
}
