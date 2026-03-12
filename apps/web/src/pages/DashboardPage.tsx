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

const CPF_STATUS_LABEL: Record<NonNullable<CaseRecord["cpfConsulta"]>["situacao"], string> = {
  regular: "Regular",
  pendente: "Pendente",
  indisponivel: "Indisponível"
};

type StatusFilter = "todos" | CaseRecord["status"];
type SortOption = "updated_desc" | "updated_asc" | "created_desc" | "created_asc";

function resolveClientName(item: CaseRecord): string {
  const byApiField = item.clienteNome?.trim();
  if (byApiField) {
    return byApiField;
  }

  const byCpfLookup = item.cpfConsulta?.nome?.trim();
  if (byCpfLookup) {
    return byCpfLookup;
  }

  return "Não informado";
}

function resolveCreatorName(item: CaseRecord): string {
  const byName = item.responsavelNome?.trim();
  if (byName) {
    return byName;
  }

  const byEmail = item.responsavelEmail?.trim();
  if (byEmail) {
    return byEmail;
  }

  return "Não informado";
}

export function DashboardPage() {
  const { getToken, canCreateCases, canAccessAdmin } = useAuth();
  const [cases, setCases] = useState<CaseRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("todos");
  const [sortBy, setSortBy] = useState<SortOption>("updated_desc");
  const [expandedCaseId, setExpandedCaseId] = useState<string | null>(null);

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

  const totalCases = cases.length;
  const recebidos = useMemo(() => cases.filter((item) => item.status === "recebido").length, [cases]);
  const emAnalise = useMemo(
    () => cases.filter((item) => item.status === "em_analise").length,
    [cases]
  );
  const encerrados = useMemo(() => cases.filter((item) => item.status === "encerrado").length, [cases]);
  const normalizedSearch = useMemo(() => search.trim().toLowerCase(), [search]);

  const filteredCases = useMemo(() => {
    const byStatus =
      statusFilter === "todos" ? cases : cases.filter((item) => item.status === statusFilter);

    const bySearch =
      normalizedSearch.length === 0
        ? byStatus
        : byStatus.filter((item) => {
            const content = `${item.varaNome} ${item.cpf} ${item.resumo} ${resolveClientName(item)} ${resolveCreatorName(item)}`.toLowerCase();
            return content.includes(normalizedSearch);
          });

    return [...bySearch].sort((a, b) => {
      if (sortBy === "updated_desc") {
        return a.updatedAt < b.updatedAt ? 1 : -1;
      }

      if (sortBy === "updated_asc") {
        return a.updatedAt > b.updatedAt ? 1 : -1;
      }

      if (sortBy === "created_desc") {
        return a.createdAt < b.createdAt ? 1 : -1;
      }

      return a.createdAt > b.createdAt ? 1 : -1;
    });
  }, [cases, normalizedSearch, sortBy, statusFilter]);

  const hasCases = cases.length > 0;
  const hasFilteredCases = filteredCases.length > 0;
  const hasActiveFilters = normalizedSearch.length > 0 || statusFilter !== "todos" || sortBy !== "updated_desc";

  function resetFilters() {
    setSearch("");
    setStatusFilter("todos");
    setSortBy("updated_desc");
  }

  function toggleExpanded(caseId: string) {
    setExpandedCaseId((current) => (current === caseId ? null : caseId));
  }

  return (
    <section className="page-stack">
      <section className="workspace-hero workspace-hero--simple">
        <div className="workspace-hero-grid">
          <div>
            <p className="hero-kicker">{canAccessAdmin ? "Painel administrativo" : "Área do cliente"}</p>
            <h1>{canAccessAdmin ? "Todos os casos" : "Meus casos"}</h1>
            <p>
              {canAccessAdmin
                ? "Visualize todos os casos cadastrados pelos clientes e acompanhe o andamento completo."
                : canCreateCases
                  ? "Veja seus atendimentos, acompanhe o andamento e abra um novo caso quando precisar."
                  : "Veja os atendimentos e acompanhe o andamento em modo somente leitura."}
            </p>
            {canCreateCases && (
              <div className="hero-cta">
                <Link to="/cases/new" className="hero-primary">
                  Abrir novo caso
                </Link>
              </div>
            )}
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
            <p>
              {canAccessAdmin
                ? "Expanda os blocos para ver detalhes da requisição, vara e descrição do pedido."
                : "Expanda os blocos para ver detalhes da requisição, vara e descrição do pedido."}
            </p>
          </div>
          {canCreateCases && (
            <Link to="/cases/new" className="primary-link">
              Abrir novo caso
            </Link>
          )}
        </header>

        <div className="case-filters">
          <label className="case-filters-search">
            <span>Busca</span>
            <input
              type="search"
              placeholder="Buscar por nome, CPF, vara ou resumo"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </label>

          <label>
            <span>Status</span>
            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value as StatusFilter)}
            >
              <option value="todos">Todos</option>
              <option value="recebido">Recebido</option>
              <option value="em_analise">Em análise</option>
              <option value="encerrado">Encerrado</option>
            </select>
          </label>

          <label>
            <span>Ordenar</span>
            <select
              value={sortBy}
              onChange={(event) => setSortBy(event.target.value as SortOption)}
            >
              <option value="updated_desc">Atualização mais recente</option>
              <option value="updated_asc">Atualização mais antiga</option>
              <option value="created_desc">Abertura mais recente</option>
              <option value="created_asc">Abertura mais antiga</option>
            </select>
          </label>

          {hasActiveFilters && (
            <button type="button" className="ghost-button case-filters-clear" onClick={resetFilters}>
              Limpar filtros
            </button>
          )}
        </div>

        {hasCases && (
          <p className="case-filters-count">
            Mostrando {filteredCases.length} de {cases.length} casos.
          </p>
        )}

        {loading && <p>Carregando casos...</p>}
        {error && <p className="error-text">{error}</p>}

        {!loading && !hasCases && (
          <div className="empty-state">
            <h2>Nenhum caso cadastrado</h2>
            <p>
              {canCreateCases
                ? "Crie seu primeiro caso para iniciar o acompanhamento."
                : "Este perfil está em modo somente leitura."}
            </p>
            {canCreateCases && (
              <Link to="/cases/new" className="primary-link">
                Criar caso
              </Link>
            )}
          </div>
        )}

        {!loading && hasCases && !hasFilteredCases && (
          <div className="empty-state">
            <h2>Nenhum caso encontrado</h2>
            <p>Ajuste os filtros para visualizar os casos.</p>
            {hasActiveFilters && (
              <button type="button" className="secondary-button" onClick={resetFilters}>
                Limpar filtros
              </button>
            )}
          </div>
        )}

        {hasFilteredCases && (
          <div className="card-grid">
            {filteredCases.map((item) => {
              const clientName = resolveClientName(item);
              const creatorName = resolveCreatorName(item);
              const isExpanded = expandedCaseId === item.id;

              return (
                <article key={item.id} className={`case-card ${isExpanded ? "case-card--expanded" : ""}`}>
                  <div className="case-card-top">
                    <strong>{item.varaNome}</strong>
                    <div className="case-card-top-actions">
                      <span className={`status-badge status-badge--${item.status}`}>
                        {STATUS_LABEL[item.status]}
                      </span>
                      <button
                        type="button"
                        className={isExpanded ? "case-expand-toggle case-expand-toggle--open" : "case-expand-toggle"}
                        aria-label={isExpanded ? "Recolher detalhes" : "Expandir detalhes"}
                        onClick={() => toggleExpanded(item.id)}
                      >
                        <span aria-hidden="true">▾</span>
                      </button>
                    </div>
                  </div>

                  <div className="case-card-meta case-card-meta--three">
                    <span>
                      <small>Nome</small>
                      {canAccessAdmin ? creatorName : clientName}
                    </span>
                    <span>
                      <small>CPF</small>
                      {item.cpf}
                    </span>
                    <span>
                      <small>Abertura</small>
                      {new Date(item.createdAt).toLocaleString("pt-BR")}
                    </span>
                  </div>

                  <div className="case-card-actions">
                    <Link to={`/cases/${item.id}`} className="hero-secondary case-card-link">
                      Ver página completa
                    </Link>
                  </div>

                  {isExpanded && (
                    <div className="case-card-details">
                      <div className="case-card-detail-grid">
                        <div>
                          <small>Vara</small>
                          <p>{item.varaNome}</p>
                        </div>
                        <div>
                          <small>Status do CPF</small>
                          <p>{item.cpfConsulta ? CPF_STATUS_LABEL[item.cpfConsulta.situacao] : "Não informado"}</p>
                        </div>
                        <div>
                          <small>Atualizado em</small>
                          <p>{new Date(item.updatedAt).toLocaleString("pt-BR")}</p>
                        </div>
                        {canAccessAdmin && (
                          <div>
                            <small>Conta responsável</small>
                            <p>{item.responsavelNome ?? item.responsavelEmail ?? "Não informado"}</p>
                          </div>
                        )}
                      </div>
                      <div className="case-card-description">
                        <small>Descrição do pedido</small>
                        <p>{item.resumo}</p>
                      </div>
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        )}
      </section>
    </section>
  );
}
