import { InternalShowcasePage } from "../components/InternalShowcasePage";

export function Subpagina3Page() {
  return (
    <InternalShowcasePage
      kicker="Subpágina 3"
      title="Roteiro de relacionamento com cliente"
      description="Estruture contatos, retornos e checkpoints para manter comunicação transparente durante todo o fluxo."
      highlights={["Contato", "Retorno", "Satisfação"]}
      cards={[
        {
          tag: "Sugestão",
          title: "Primeiro retorno",
          text: "Mensagem padrão para confirmar recebimento e próximo passo."
        },
        {
          tag: "Sugestão",
          title: "Atualização semanal",
          text: "Resumo objetivo com status e pendências."
        },
        {
          tag: "Sugestão",
          title: "Fechamento de caso",
          text: "Comunicação final com orientação sobre próximas ações."
        }
      ]}
    />
  );
}
