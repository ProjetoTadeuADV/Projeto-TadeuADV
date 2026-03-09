import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { apiRequest, ApiError } from "../lib/api";
import type { CaseRecord } from "../types";

const STATUS_LABEL: Record<CaseRecord["status"], string> = {
  recebido: "Recebido",
  em_analise: "Em análise",
  encerrado: "Encerrado"
};

export function DashboardPage() {
  const { getToken } = useAuth();
  const [cases, setCases] = useState<CaseRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadCases() {
      setLoading(true);
      setError(null);
      try {
        const token = await getToken();
        const data = await apiRequest<CaseRecord[]>("/v1/cases", { token });
        setCases(data);
      } catch (err) {
        const message = err instanceof ApiError ? err.message : "Erro ao carregar casos.";
        setError(message);
      } finally {
        setLoading(false);
      }
    }

    void loadCases();
  }, [getToken]);

  const hasCases = useMemo(() => cases.length > 0, [cases]);

  return (
    <section className="page-stack">
      <header className="page-header">
        <div>
          <h1>Meus Casos</h1>
          <p>Acompanhe status, data de abertura e detalhes do atendimento.</p>
        </div>
        <Link to="/cases/new" className="primary-link">
          Abrir novo caso
        </Link>
      </header>

      {loading && <p>Carregando casos...</p>}
      {error && <p className="error-text">{error}</p>}

      {!loading && !hasCases && (
        <div className="empty-state">
          <h2>Nenhum caso cadastrado</h2>
          <p>Crie seu primeiro caso para iniciar o acompanhamento.</p>
          <Link to="/cases/new" className="primary-link">
            Criar caso
          </Link>
        </div>
      )}

      {hasCases && (
        <div className="card-grid">
          {cases.map((item) => (
            <Link key={item.id} to={`/cases/${item.id}`} className="case-card">
              <strong>{item.varaNome}</strong>
              <span>CPF: {item.cpf}</span>
              <span>Status: {STATUS_LABEL[item.status]}</span>
              <span>Abertura: {new Date(item.createdAt).toLocaleString("pt-BR")}</span>
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}

