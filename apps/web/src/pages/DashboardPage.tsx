import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { ApiError, apiRequest } from "../lib/api";
import type { AdminOperatorOption, CaseMovementRecord, CaseRecord } from "../types";

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

const MOVEMENT_STAGE_LABEL: Record<CaseMovementRecord["stage"], string> = {
  triagem: "Triagem",
  conciliacao: "Conciliação",
  peticao: "Petição",
  protocolo: "Protocolo",
  andamento: "Andamento",
  solucao: "Solução",
  outro: "Outro"
};

const REVIEW_LABEL: Record<CaseRecord["reviewDecision"], string> = {
  pending: "Em triagem",
  accepted: "Aceito",
  rejected: "Rejeitado"
};

const WORKFLOW_LABEL: Record<CaseRecord["workflowStep"], string> = {
  triage: "Triagem",
  awaiting_client_data: "Aguardando dados do cliente",
  awaiting_initial_fee: "Aguardando pagamento inicial",
  in_progress: "Em andamento",
  closed: "Encerrado"
};

type StatusFilter = "todos" | CaseRecord["status"];
type SortOption = "updated_desc" | "updated_asc" | "created_desc" | "created_asc";

const CASE_TIMELINE_STEPS = [
  "Ajuizamento",
  "Audiência de conciliação",
  "Sentença",
  "Acordo",
  "Trânsito em julgado",
  "Receber a ação"
] as const;

function formatDate(dateIso: string): string {
  return new Date(dateIso).toLocaleString("pt-BR");
}

function resolveClientName(item: CaseRecord): string {
  const byOwnerName = item.responsavelNome?.trim();
  if (byOwnerName) {
    return byOwnerName;
  }

  const byOwnerEmail = item.responsavelEmail?.trim();
  if (byOwnerEmail) {
    return byOwnerEmail;
  }

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

function resolveCounterpartyName(item: CaseRecord): string {
  const defendantName = item.petitionInitial?.defendantName?.trim();
  if (defendantName) {
    return defendantName;
  }

  return "Parte contrária não informada";
}

function resolveAssignedOperatorIds(item: CaseRecord): string[] {
  const ids = Array.isArray(item.assignedOperatorIds) ? item.assignedOperatorIds : [];
  const normalized = ids.map((value) => value.trim()).filter(Boolean);
  if (normalized.length > 0) {
    return Array.from(new Set(normalized));
  }

  const legacy = item.assignedOperatorId?.trim();
  return legacy ? [legacy] : [];
}

function resolveAssignedOperatorNames(item: CaseRecord): string[] {
  const names = Array.isArray(item.assignedOperatorNames) ? item.assignedOperatorNames : [];
  const normalized = names.map((value) => value.trim()).filter(Boolean);
  if (normalized.length > 0) {
    return Array.from(new Set(normalized));
  }

  const legacy = item.assignedOperatorName?.trim();
  return legacy ? [legacy] : [];
}

function isUserAssignedToCase(item: CaseRecord, userId: string | undefined): boolean {
  if (!userId) {
    return false;
  }

  return resolveAssignedOperatorIds(item).includes(userId);
}

function resolveAssignedOperator(item: CaseRecord): string {
  const names = resolveAssignedOperatorNames(item);
  if (names.length > 0) {
    return names.join(", ");
  }

  const ids = resolveAssignedOperatorIds(item);
  if (ids.length > 0) {
    return ids.join(", ");
  }

  return "Sem operador";
}

function resolveTimelineProgress(item: CaseRecord): number {
  if (item.reviewDecision === "rejected") {
    return 0;
  }

  let progress = 0;

  if (item.reviewDecision === "accepted" || item.workflowStep !== "triage") {
    progress = Math.max(progress, 1);
  }

  const conciliationAttempts = item.procedureProgress?.conciliation?.attempts ?? [];
  if (item.procedureProgress?.conciliation?.contactedDefendant || conciliationAttempts.length > 0) {
    progress = Math.max(progress, 2);
  }

  const hasSentenceChecklist = Boolean(
    item.procedureProgress?.petition?.checklist?.some((check) => check.id === "sentenca" && check.done)
  );
  if (hasSentenceChecklist) {
    progress = Math.max(progress, 3);
  }

  if (item.procedureProgress?.conciliation?.agreementReached) {
    progress = Math.max(progress, 4);
  }

  const isClosed = item.workflowStep === "closed" || item.status === "encerrado";
  if (isClosed) {
    progress = Math.max(progress, 5);
  }

  const hasPaymentReceived =
    item.serviceFee?.status === "paid" ||
    (item.charges ?? []).some((charge) => charge.status === "received" || charge.status === "confirmed");
  if (isClosed && hasPaymentReceived) {
    progress = Math.max(progress, 6);
  }

  return progress;
}

function resolveLatestMovement(item: CaseRecord): CaseMovementRecord | null {
  if (!item.movements || item.movements.length === 0) {
    return null;
  }

  return item.movements.reduce((latest, current) => {
    return latest.createdAt > current.createdAt ? latest : current;
  }, item.movements[0]);
}

function countPublicUpdates(item: CaseRecord): number {
  const publicMovements = (item.movements ?? []).filter((movement) => movement.visibility === "public");
  return Math.max(0, publicMovements.length - 1);
}

function isRejectedCase(item: CaseRecord): boolean {
  return item.reviewDecision === "rejected" || item.workflowStep === "closed";
}

function isClosedCase(item: CaseRecord): boolean {
  return item.status === "encerrado" || item.workflowStep === "closed";
}

export function DashboardPage() {
  const { getToken, canCreateCases, canAccessAdmin, isMasterUser, user } = useAuth();
  const [cases, setCases] = useState<CaseRecord[]>([]);
  const [operators, setOperators] = useState<AdminOperatorOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [assignmentError, setAssignmentError] = useState<string | null>(null);
  const [assignmentFeedback, setAssignmentFeedback] = useState<string | null>(null);
  const [assigningCaseId, setAssigningCaseId] = useState<string | null>(null);
  const [selectedOperatorByCase, setSelectedOperatorByCase] = useState<Record<string, string>>({});
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("todos");
  const [sortBy, setSortBy] = useState<SortOption>("updated_desc");
  const [expandedCaseId, setExpandedCaseId] = useState<string | null>(null);

  useEffect(() => {
    async function loadCases() {
      setLoading(true);
      setError(null);
      setAssignmentError(null);

      try {
        const token = await getToken();
        const data = await apiRequest<CaseRecord[]>("/v1/cases", { token });
        setCases(data);

        if (canAccessAdmin && isMasterUser) {
          const availableOperators = await apiRequest<AdminOperatorOption[]>("/v1/admin/operators", { token });
          setOperators(availableOperators);

          setSelectedOperatorByCase((current) => {
            const next: Record<string, string> = {};
            for (const item of data) {
              const selected = current[item.id] ?? resolveAssignedOperatorIds(item)[0] ?? "";
              next[item.id] = selected;
            }
            return next;
          });
        } else {
          setOperators([]);
          setSelectedOperatorByCase({});
        }
      } catch (err) {
        const message = err instanceof ApiError ? err.message : "Erro ao carregar casos.";
        setError(message);
      } finally {
        setLoading(false);
      }
    }

    void loadCases();
  }, [canAccessAdmin, getToken, isMasterUser]);

  const totalCases = cases.length;
  const recebidos = useMemo(() => cases.filter((item) => item.status === "recebido").length, [cases]);
  const emAnalise = useMemo(() => cases.filter((item) => item.status === "em_analise").length, [cases]);
  const encerrados = useMemo(() => cases.filter((item) => item.status === "encerrado").length, [cases]);
  const publicUpdates = useMemo(
    () => cases.reduce((total, item) => total + countPublicUpdates(item), 0),
    [cases]
  );
  const normalizedSearch = useMemo(() => search.trim().toLowerCase(), [search]);

  const filteredCases = useMemo(() => {
    const byStatus = statusFilter === "todos" ? cases : cases.filter((item) => item.status === statusFilter);

    const bySearch =
      normalizedSearch.length === 0
        ? byStatus
        : byStatus.filter((item) => {
            const latestMovement = resolveLatestMovement(item);
            const content = [
              resolveCounterpartyName(item),
              item.varaNome,
              item.caseCode,
              item.cpf,
              item.resumo,
              resolveClientName(item),
              resolveCreatorName(item),
              resolveAssignedOperator(item),
              latestMovement?.description ?? ""
            ]
              .join(" ")
              .toLowerCase();
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
  const myAssignedCases = useMemo(() => {
    if (!canAccessAdmin) {
      return [];
    }

    if (!user?.uid) {
      return [];
    }

    return filteredCases.filter((item) => isUserAssignedToCase(item, user.uid) && !isClosedCase(item));
  }, [canAccessAdmin, filteredCases, user?.uid]);

  const openOtherCases = useMemo(() => {
    if (!canAccessAdmin || !isMasterUser) {
      return [];
    }

    if (!user?.uid) {
      return filteredCases.filter((item) => !isClosedCase(item));
    }

    return filteredCases.filter((item) => !isUserAssignedToCase(item, user.uid) && !isClosedCase(item));
  }, [canAccessAdmin, filteredCases, isMasterUser, user?.uid]);

  const closedCases = useMemo(() => {
    if (!canAccessAdmin) {
      return [];
    }

    if (isMasterUser) {
      return filteredCases.filter((item) => isClosedCase(item));
    }

    if (!user?.uid) {
      return [];
    }

    return filteredCases.filter((item) => isUserAssignedToCase(item, user.uid) && isClosedCase(item));
  }, [canAccessAdmin, filteredCases, isMasterUser, user?.uid]);

  const clientOpenCases = useMemo(() => {
    if (canAccessAdmin) {
      return [];
    }

    return filteredCases.filter((item) => !isClosedCase(item));
  }, [canAccessAdmin, filteredCases]);

  const clientClosedCases = useMemo(() => {
    if (canAccessAdmin) {
      return [];
    }

    return filteredCases.filter((item) => isClosedCase(item));
  }, [canAccessAdmin, filteredCases]);

  const hasFilteredCases = canAccessAdmin
    ? myAssignedCases.length > 0 || openOtherCases.length > 0 || closedCases.length > 0
    : clientOpenCases.length > 0 || clientClosedCases.length > 0;
  const displayedCasesCount = canAccessAdmin
    ? myAssignedCases.length + openOtherCases.length + closedCases.length
    : clientOpenCases.length + clientClosedCases.length;
  const hasActiveFilters = normalizedSearch.length > 0 || statusFilter !== "todos" || sortBy !== "updated_desc";
  const operatorOptions = useMemo(() => operators, [operators]);

  function resetFilters() {
    setSearch("");
    setStatusFilter("todos");
    setSortBy("updated_desc");
  }

  function toggleExpanded(caseId: string) {
    setExpandedCaseId((current) => (current === caseId ? null : caseId));
  }

  function handleOperatorSelection(caseId: string, operatorUserId: string) {
    setSelectedOperatorByCase((current) => ({
      ...current,
      [caseId]: operatorUserId
    }));
  }

  async function handleAssignOperator(caseItem: CaseRecord) {
    if (!isMasterUser) {
      return;
    }

    if (isRejectedCase(caseItem) || caseItem.status === "encerrado") {
      setAssignmentError("Casos rejeitados/encerrados nao podem receber nova alocacao no momento.");
      return;
    }

    const operatorUserId = selectedOperatorByCase[caseItem.id] ?? "";
    if (!operatorUserId) {
      setAssignmentError("Selecione um operador antes de alocar o caso.");
      return;
    }

    setAssignmentError(null);
    setAssignmentFeedback(null);
    setAssigningCaseId(caseItem.id);

    try {
      const token = await getToken();
      const updated = await apiRequest<CaseRecord>(`/v1/cases/${caseItem.id}/assign-operator`, {
        method: "POST",
        token,
        body: {
          operatorUserId
        }
      });

      setCases((current) =>
        current.map((item) => (item.id === caseItem.id ? { ...item, ...updated } : item))
      );

      const selectedOperator = operatorOptions.find((item) => item.id === operatorUserId);
      const operatorLabel = selectedOperator?.name ?? selectedOperator?.email ?? updated.assignedOperatorName;
      setAssignmentFeedback(
        operatorLabel
          ? `Responsável ${operatorLabel} adicionado ao processo ${updated.caseCode}.`
          : `Responsável adicionado ao processo ${updated.caseCode}.`
      );
    } catch (err) {
      const message = err instanceof ApiError ? err.message : "Falha ao alocar operador para este caso.";
      setAssignmentError(message);
    } finally {
      setAssigningCaseId(null);
    }
  }

  function renderCaseCards(items: CaseRecord[], layout: "grid" | "list" = "grid") {
    return (
      <div className={layout === "list" ? "card-grid card-grid--list" : "card-grid"}>
        {items.map((item) => {
          const clientName = resolveClientName(item);
          const creatorName = resolveCreatorName(item);
          const latestMovement = resolveLatestMovement(item);
          const isExpanded = expandedCaseId === item.id;
          const closeRequestStatus = item.closeRequest?.status ?? "none";

          return (
            <article key={item.id} className={`case-card ${isExpanded ? "case-card--expanded" : ""}`}>
              <div className="case-card-top">
                <div className="case-card-title-wrap">
                  <Link to={`/cases/${item.id}`} className="case-card-title-link">
                    {resolveCounterpartyName(item)}
                  </Link>
                  <small className="case-card-code">Processo: {item.caseCode}</small>
                </div>
                <div className="case-card-top-actions">
                  {closeRequestStatus === "pending" && (
                    <span className="status-badge status-badge--close-request-pending">Encerramento solicitado</span>
                  )}
                  <span className={`status-badge status-badge--review-${item.reviewDecision}`}>
                    {REVIEW_LABEL[item.reviewDecision]}
                  </span>
                  <span className={`status-badge status-badge--workflow-${item.workflowStep}`}>
                    {WORKFLOW_LABEL[item.workflowStep]}
                  </span>
                  <span className={`status-badge status-badge--${item.status}`}>{STATUS_LABEL[item.status]}</span>
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
                  <small>Abertura do caso</small>
                  {formatDate(item.createdAt)}
                </span>
              </div>

              <div className="case-card-timeline-wrap">
                <Link to={`/cases/${item.id}?tab=evolution`} className="case-card-timeline" title="Ir para evolução do caso">
                  {CASE_TIMELINE_STEPS.map((label, index) => {
                    const progress = resolveTimelineProgress(item);
                    const stepNumber = index + 1;
                    const stepClass =
                      stepNumber <= progress
                        ? "case-card-timeline-step case-card-timeline-step--done"
                        : stepNumber === Math.min(progress + 1, CASE_TIMELINE_STEPS.length)
                          ? "case-card-timeline-step case-card-timeline-step--current"
                          : "case-card-timeline-step";

                    return (
                      <span key={`${item.id}-timeline-${label}`} className={stepClass}>
                        {label}
                      </span>
                    );
                  })}
                </Link>
                <Link to={`/cases/${item.id}?tab=sale`} className="case-card-sale-link">
                  Venda seu caso
                </Link>
              </div>

              <p className="case-card-operator-inline">Responsáveis: {resolveAssignedOperator(item)}</p>

              <div className="case-card-actions">
                <button
                  type="button"
                  className="secondary-button case-card-detail-button"
                  onClick={() => toggleExpanded(item.id)}
                >
                  {isExpanded ? "Ocultar detalhes" : "Ver detalhes"}
                </button>
                {canAccessAdmin && isMasterUser && (
                  <div className="case-card-assign">
                    <select
                      value={selectedOperatorByCase[item.id] ?? ""}
                      onChange={(event) => handleOperatorSelection(item.id, event.target.value)}
                      disabled={assigningCaseId === item.id || operatorOptions.length === 0 || isRejectedCase(item)}
                      aria-label={`Selecionar operador para o caso ${item.caseCode}`}
                    >
                      <option value="">Selecionar responsável</option>
                      {operatorOptions.map((option) => (
                        <option key={option.id} value={option.id}>
                          {option.name ?? option.email ?? option.id}
                          {option.isMaster ? " (Master)" : option.isOperator ? " (Operador)" : ""}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      className="secondary-button case-card-detail-button"
                      onClick={() => void handleAssignOperator(item)}
                      disabled={
                        assigningCaseId === item.id ||
                        isRejectedCase(item) ||
                        !selectedOperatorByCase[item.id] ||
                        resolveAssignedOperatorIds(item).includes(selectedOperatorByCase[item.id])
                      }
                    >
                      {assigningCaseId === item.id ? "Adicionando..." : "Adicionar responsável"}
                    </button>
                    {selectedOperatorByCase[item.id] &&
                      resolveAssignedOperatorIds(item).includes(selectedOperatorByCase[item.id]) && (
                        <span className="field-help">Esse responsável já está vinculado ao caso.</span>
                    )}
                  </div>
                )}
              </div>

              {isExpanded && (
                <div className="case-card-details">
                  <div className="case-card-detail-grid">
                    <div>
                      <small>Código do caso</small>
                      <p>{item.caseCode}</p>
                    </div>
                    <div>
                      <small>Parte contrária</small>
                      <p>{resolveCounterpartyName(item)}</p>
                    </div>
                    <div>
                      <small>Status do CPF</small>
                      <p>{item.cpfConsulta ? CPF_STATUS_LABEL[item.cpfConsulta.situacao] : "Não informado"}</p>
                    </div>
                    <div>
                      <small>Parecer</small>
                      <p>{REVIEW_LABEL[item.reviewDecision]}</p>
                    </div>
                    <div>
                      <small>Atualizado em</small>
                      <p>{formatDate(item.updatedAt)}</p>
                    </div>
                    <div>
                      <small>Fase do fluxo</small>
                      <p>{WORKFLOW_LABEL[item.workflowStep]}</p>
                    </div>
                    <div>
                      <small>Responsáveis</small>
                      <p>{resolveAssignedOperator(item)}</p>
                    </div>
                    {canAccessAdmin && (
                      <div>
                        <small>Conta responsável</small>
                        <p>{item.responsavelNome ?? item.responsavelEmail ?? "Não informado"}</p>
                      </div>
                    )}
                    <div>
                      <small>Última movimentação</small>
                      <p>{latestMovement ? formatDate(latestMovement.createdAt) : "Sem movimentações"}</p>
                    </div>
                  </div>

                  {latestMovement && (
                    <div className="case-card-description">
                      <small>{MOVEMENT_STAGE_LABEL[latestMovement.stage]}</small>
                      <p>{latestMovement.description}</p>
                    </div>
                  )}

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
    );
  }

  return (
    <section className="page-stack">
      <section className="workspace-hero workspace-hero--simple">
        <div className="workspace-hero-grid">
          <div>
            <p className="hero-kicker">
              {canAccessAdmin ? (isMasterUser ? "Painel administrativo" : "Painel do operador") : "Área do cliente"}
            </p>
            <h1>{canAccessAdmin ? (isMasterUser ? "Todos os casos" : "Meus casos designados") : "Meus casos"}</h1>
            <p>
              {canAccessAdmin
                ? isMasterUser
                  ? "Visualize todos os casos cadastrados, faça alocações e acompanhe as movimentações."
                  : "Acompanhe os casos designados para você e registre as movimentações operacionais."
                : canCreateCases
                  ? "Acompanhe as atualizações do caso, respostas da conciliação e próximos passos."
                  : "Visualize os atendimentos em modo somente leitura."}
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

        {!canAccessAdmin && publicUpdates > 0 && (
          <p className="helper-text">Você recebeu {publicUpdates} atualização(ões) públicas em seus casos.</p>
        )}
      </section>

      <section className="workspace-panel">
        <header className="page-header">
          <div>
            <h2>Lista de casos</h2>
            <p>
              {canAccessAdmin
                ? "Expanda para consultar operador alocado, movimentações e documentos do caso."
                : "Expanda para acompanhar status, movimentações públicas e documentos anexados."}
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
              placeholder="Buscar por nome, CPF, vara, operador ou resumo"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </label>

          <label>
            <span>Status</span>
            <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as StatusFilter)}>
              <option value="todos">Todos</option>
              <option value="recebido">Recebido</option>
              <option value="em_analise">Em análise</option>
              <option value="encerrado">Encerrado</option>
            </select>
          </label>

          <label>
            <span>Ordenar</span>
            <select value={sortBy} onChange={(event) => setSortBy(event.target.value as SortOption)}>
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
            Mostrando {displayedCasesCount} de {cases.length} casos.
          </p>
        )}

        {loading && <p>Carregando casos...</p>}
        {error && <p className="error-text">{error}</p>}
        {assignmentError && <p className="error-text">{assignmentError}</p>}
        {assignmentFeedback && <p className="success-text">{assignmentFeedback}</p>}

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

        {hasFilteredCases &&
          (canAccessAdmin ? (
            <div className="page-stack page-stack--tight">
              <section className="workspace-panel workspace-panel--muted">
                <header className="page-header">
                  <div>
                    <h2>Meus Casos</h2>
                    <p>Casos atualmente designados para você.</p>
                  </div>
                </header>
                {myAssignedCases.length === 0 ? (
                  <p className="helper-text">Nenhum caso designado para você no momento.</p>
                ) : (
                  renderCaseCards(myAssignedCases, "list")
                )}
              </section>

              {isMasterUser && (
                <section className="workspace-panel workspace-panel--muted">
                  <header className="page-header">
                    <div>
                      <h2>Lista de Casos</h2>
                      <p>Demais casos em aberto não designados para você.</p>
                    </div>
                  </header>
                  {openOtherCases.length === 0 ? (
                    <p className="helper-text">Não há outros casos em aberto fora da sua fila.</p>
                  ) : (
                    renderCaseCards(openOtherCases, "list")
                  )}
                </section>
              )}

              <section className="workspace-panel workspace-panel--muted">
                <header className="page-header">
                  <div>
                    <h2>Casos Encerrados</h2>
                    <p>
                      {isMasterUser
                        ? "Casos encerrados por conclusão ou rejeição."
                        : "Casos encerrados designados para você."}
                    </p>
                  </div>
                </header>
                {closedCases.length === 0 ? (
                  <p className="helper-text">Não há casos encerrados para os filtros atuais.</p>
                ) : (
                  renderCaseCards(closedCases, "list")
                )}
              </section>
            </div>
          ) : (
            <div className="page-stack page-stack--tight">
              <section className="workspace-panel workspace-panel--muted">
                <header className="page-header">
                  <div>
                    <h2>Casos em andamento</h2>
                    <p>Casos ativos relacionados ao seu cadastro.</p>
                  </div>
                </header>
                {clientOpenCases.length === 0 ? (
                  <p className="helper-text">Não há casos em andamento para os filtros atuais.</p>
                ) : (
                  renderCaseCards(clientOpenCases, "list")
                )}
              </section>

              <section className="workspace-panel workspace-panel--muted">
                <header className="page-header">
                  <div>
                    <h2>Casos Encerrados</h2>
                    <p>Casos concluídos ou encerrados no seu histórico.</p>
                  </div>
                </header>
                {clientClosedCases.length === 0 ? (
                  <p className="helper-text">Não há casos encerrados para os filtros atuais.</p>
                ) : (
                  renderCaseCards(clientClosedCases, "list")
                )}
              </section>
            </div>
          ))}
      </section>
    </section>
  );
}
