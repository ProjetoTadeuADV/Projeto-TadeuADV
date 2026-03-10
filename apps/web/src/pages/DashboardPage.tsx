import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { ApiError, apiRequest } from "../lib/api";
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
  const totalCases = cases.length;
  const recebidos = useMemo(() => cases.filter((item) => item.status === "recebido").length, [cases]);
  const emAnalise = useMemo(
    () => cases.filter((item) => item.status === "em_analise").length,
    [cases]
  );
  const encerrados = useMemo(() => cases.filter((item) => item.status === "encerrado").length, [cases]);

  return (
    <section className="page-stack">
      <section className="workspace-hero workspace-hero--simple">
        <div className="workspace-hero-grid">
          <div>
            <p className="hero-kicker">Área do cliente</p>
            <h1>Meus casos</h1>
            <p>Veja seus atendimentos, acompanhe o andamento e abra um novo caso quando precisar.</p>
            <div className="hero-cta">
              <Link to="/cases/new" className="hero-primary">
                Abrir novo caso
              </Link>
            </div>
          </div>
        </div>

        <ul className="workspace-kpis">
          <li>
            <strong>{totalCases}</strong>
            <span>Total de casos</span>
          </li>
          <li>
            <strong>{recebidos}</strong>
            <span>Recebidos</span>
          </li>
          <li>
            <strong>{emAnalise}</strong>
            <span>Em análise</span>
          </li>
          <li>
            <strong>{encerrados}</strong>
            <span>Encerrados</span>
          </li>
        </ul>
      </section>

      <section className="workspace-panel">
        <header className="page-header">
          <div>
            <h2>Lista de casos</h2>
            <p>Entre em cada item para ver os detalhes, o CPF consultado e o resumo informado.</p>
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
                <div className="case-card-top">
                  <strong>{item.varaNome}</strong>
                  <span className={`status-badge status-badge--${item.status}`}>
                    {STATUS_LABEL[item.status]}
                  </span>
                </div>
                <div className="case-card-meta">
                  <span>
                    <small>CPF</small>
                    {item.cpf}
                  </span>
                  <span>
                    <small>Abertura</small>
                    {new Date(item.createdAt).toLocaleString("pt-BR")}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>
    </section>
  );
}
