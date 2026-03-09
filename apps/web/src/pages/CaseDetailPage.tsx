import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { apiRequest, ApiError } from "../lib/api";
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
            Voltar para dashboard
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
      <section className="workspace-hero workspace-hero--compact">
        <div className="workspace-hero-grid">
          <div>
            <p className="hero-kicker">Detalhe do caso</p>
            <h1>{caseItem.varaNome}</h1>
            <p>ID do caso: {caseItem.id}</p>
            <div className="hero-cta">
              <span className={`status-badge status-badge--${caseItem.status}`}>
                {STATUS_LABEL[caseItem.status]}
              </span>
              <Link to="/dashboard" className="hero-secondary">
                Voltar ao painel
              </Link>
            </div>
          </div>
          <div className="workspace-hero-media">
            <img
              src="https://images.unsplash.com/photo-1528747045269-390fe33c19d3?auto=format&fit=crop&w=1200&q=80"
              alt="Profissional revisando detalhes de processo em notebook"
              loading="lazy"
            />
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
              <strong>Consulta CPF</strong>
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
          <h2>Sugestões de acompanhamento</h2>
          <ul className="timeline-list">
            <li>Registrar toda nova interação do cliente no histórico do caso.</li>
            <li>Revisar situação de CPF antes de qualquer alteração relevante.</li>
            <li>Atualizar status interno assim que houver mudança operacional.</li>
            <li>Validar próximo passo e prazo esperado com o cliente.</li>
          </ul>
        </aside>
      </div>
    </section>
  );
}
