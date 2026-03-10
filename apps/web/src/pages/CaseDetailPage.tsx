import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { ApiError, apiRequest } from "../lib/api";
import type { CaseRecord } from "../types";

const STATUS_LABEL: Record<CaseRecord["status"], string> = {
  recebido: "Recebido",
  em_analise: "Em análise",
  encerrado: "Encerrado"
};

export function CaseDetailPage() {
  const { getToken } = useAuth();
  const { id } = useParams<{ id: string }>();
  const [caseItem, setCaseItem] = useState<CaseRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadCase() {
      if (!id) {
        setError("Caso inválido.");
        setLoading(false);
        return;
      }

      setLoading(true);
      setError(null);
      try {
        const token = await getToken();
        const data = await apiRequest<CaseRecord>(`/v1/cases/${id}`, { token });
        setCaseItem(data);
      } catch (err) {
        const message = err instanceof ApiError ? err.message : "Falha ao carregar o caso.";
        setError(message);
      } finally {
        setLoading(false);
      }
    }

    void loadCase();
  }, [getToken, id]);

  if (loading) {
    return (
      <section className="page-stack">
        <section className="workspace-panel">
          <p>Carregando caso...</p>
        </section>
      </section>
    );
  }

  if (error) {
    return (
      <section className="page-stack">
        <section className="workspace-panel">
          <p className="error-text">{error}</p>
          <Link to="/dashboard" className="primary-link">
            Voltar para o painel
          </Link>
        </section>
      </section>
    );
  }

  if (!caseItem) {
    return null;
  }

  return (
    <section className="page-stack">
      <section className="workspace-hero workspace-hero--compact workspace-hero--simple">
        <div className="workspace-hero-grid">
          <div>
            <p className="hero-kicker">Detalhe do caso</p>
            <h1>{caseItem.varaNome}</h1>
            <p>Consulte abaixo os dados principais, o resumo enviado e o status atual.</p>
            <div className="hero-cta">
              <span className={`status-badge status-badge--${caseItem.status}`}>
                {STATUS_LABEL[caseItem.status]}
              </span>
              <Link to="/dashboard" className="hero-secondary">
                Voltar ao painel
              </Link>
            </div>
          </div>
        </div>
      </section>

      <div className="detail-grid">
        <article className="detail-card">
          <h2>Informações principais</h2>
          <div className="detail-list">
            <div className="detail-item">
              <span>Status</span>
              <strong>{STATUS_LABEL[caseItem.status]}</strong>
            </div>
            <div className="detail-item">
              <span>CPF</span>
              <strong>{caseItem.cpf}</strong>
            </div>
            <div className="detail-item">
              <span>Abertura</span>
              <strong>{new Date(caseItem.createdAt).toLocaleString("pt-BR")}</strong>
            </div>
            <div className="detail-item">
              <span>Última atualização</span>
              <strong>{new Date(caseItem.updatedAt).toLocaleString("pt-BR")}</strong>
            </div>
          </div>

          {caseItem.cpfConsulta && (
            <div className="info-box">
              <strong>Consulta de CPF</strong>
              <span>Nome: {caseItem.cpfConsulta.nome}</span>
              <span>Situação: {caseItem.cpfConsulta.situacao}</span>
              <span>Fonte: {caseItem.cpfConsulta.source}</span>
            </div>
          )}

          <div className="resumo-box">
            <strong>Resumo</strong>
            <p>{caseItem.resumo}</p>
          </div>
        </article>

        <aside className="detail-card">
          <h2>Próximos passos sugeridos</h2>
          <ul className="timeline-list">
            <li>Revise o resumo para confirmar se está claro e completo.</li>
            <li>Confira a situação do CPF antes de qualquer ajuste importante.</li>
            <li>Acompanhe mudanças de status para saber em que etapa o caso está.</li>
            <li>Use este painel como referência para o próximo retorno ao cliente.</li>
          </ul>
        </aside>
      </div>
    </section>
  );
}
