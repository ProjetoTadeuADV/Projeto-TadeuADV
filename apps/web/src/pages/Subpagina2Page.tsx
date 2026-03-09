import { InternalShowcasePage } from "../components/InternalShowcasePage";

export function Subpagina2Page() {
  return (
    <InternalShowcasePage
      kicker="Subpágina 2"
      title="Painel de qualidade operacional"
      description="Área para acompanhar aderência de preenchimento e padrões de atendimento do time."
      imageUrl="https://images.unsplash.com/photo-1517048676732-d65bc937f952?auto=format&fit=crop&w=1200&q=80"
      imageAlt="Equipe discutindo melhorias de processo"
      highlights={["Padrão", "Qualidade", "Auditoria"]}
      cards={[
        {
          tag: "Sugestão",
          title: "Taxa de campos completos",
          text: "Monitorar preenchimento correto dos dados obrigatórios."
        },
        {
          tag: "Sugestão",
          title: "Checklist por operador",
          text: "Conferências mínimas para reduzir retrabalho."
        },
        {
          tag: "Sugestão",
          title: "Alertas de consistência",
          text: "Registros com informação incompleta para ajuste rápido."
        }
      ]}
    />
  );
}
