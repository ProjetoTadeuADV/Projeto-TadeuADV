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
    return <p>Carregando caso...</p>;
  }

  if (error) {
    return (
      <section className="page-stack">
        <p className="error-text">{error}</p>
        <Link to="/dashboard" className="primary-link">
          Voltar para dashboard
        </Link>
      </section>
    );
  }

  if (!caseItem) {
    return null;
  }

  return (
    <section className="page-stack">
      <header className="page-header">
        <div>
          <h1>Detalhes do Caso</h1>
          <p>ID: {caseItem.id}</p>
        </div>
        <Link to="/dashboard" className="primary-link">
          Voltar
        </Link>
      </header>

      <div className="detail-card">
        <h2>{caseItem.varaNome}</h2>
        <p>
          <strong>Status:</strong> {STATUS_LABEL[caseItem.status]}
        </p>
        <p>
          <strong>CPF:</strong> {caseItem.cpf}
        </p>
        <p>
          <strong>Abertura:</strong> {new Date(caseItem.createdAt).toLocaleString("pt-BR")}
        </p>
        <p>
          <strong>Última atualização:</strong>{" "}
          {new Date(caseItem.updatedAt).toLocaleString("pt-BR")}
        </p>

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
      </div>
    </section>
  );
}

