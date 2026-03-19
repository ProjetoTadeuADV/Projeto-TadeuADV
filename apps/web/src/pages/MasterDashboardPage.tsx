import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { ApiError, apiRequest } from "../lib/api";
import type { MasterOverview, MasterUserActivity, MasterUserOverview } from "../types";

const STATUS_LABELS: Record<string, string> = {
  recebido: "Recebido",
  em_analise: "Em análise",
  encerrado: "Encerrado"
};

const ACCESS_LEVEL_LABELS: Record<MasterUserOverview["accessLevel"], string> = {
  user: "Padrão",
  operator: "Operador",
  master: "Master"
};

function getUserInitials(user: { name: string | null; email: string | null }): string {
  const source = user.name?.trim() || user.email?.trim() || "";
  if (!source) {
    return "DE";
  }

  const words = source
    .replace(/[@._-]/g, " ")
    .split(" ")
    .map((item) => item.trim())
    .filter(Boolean);

  if (words.length === 0) {
    return "DE";
  }

  if (words.length === 1) {
    return words[0].slice(0, 2).toUpperCase();
  }

  return `${words[0][0] ?? ""}${words[1][0] ?? ""}`.toUpperCase();
}

export function MasterDashboardPage() {
  const { getToken, user, isMasterUser } = useAuth();
  const [overview, setOverview] = useState<MasterOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [pendingAccessUserId, setPendingAccessUserId] = useState<string | null>(null);
  const [pendingDeleteUserId, setPendingDeleteUserId] = useState<string | null>(null);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [selectedAccessLevel, setSelectedAccessLevel] = useState<MasterUserOverview["accessLevel"]>("user");
  const [activity, setActivity] = useState<MasterUserActivity | null>(null);
  const [activityLoading, setActivityLoading] = useState(false);
  const [activityError, setActivityError] = useState<string | null>(null);

  const loadOverview = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const token = await getToken();
      const result = await apiRequest<MasterOverview>("/v1/admin/overview", { token });
      setOverview(result);
    } catch (err) {
      const message =
        err instanceof ApiError ? err.message : "Erro ao carregar a visão geral da plataforma.";
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [getToken]);

  useEffect(() => {
    void loadOverview();
  }, [loadOverview]);

  useEffect(() => {
    if (!selectedUserId) {
      return;
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        closeActivityModal();
      }
    }

    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [selectedUserId]);

  const summaryItems = useMemo(() => {
    if (!overview) {
      return [];
    }

    return [
      { label: "Usuários totais", value: overview.summary.totalUsers },
      { label: "Contas master", value: overview.summary.totalMasterUsers },
      { label: "E-mails verificados", value: overview.summary.verifiedUsers },
      { label: "Casos totais", value: overview.summary.totalCases },
      { label: "Casos ativos", value: overview.summary.activeCases },
      { label: "Casos encerrados", value: overview.summary.closedCases }
    ];
  }, [overview]);

  const selectedUser = useMemo(() => {
    if (!selectedUserId || !overview) {
      return null;
    }

    return overview.users.find((item) => item.id === selectedUserId) ?? null;
  }, [overview, selectedUserId]);

  useEffect(() => {
    if (!selectedUser) {
      setSelectedAccessLevel("user");
      return;
    }

    setSelectedAccessLevel(selectedUser.accessLevel);
  }, [selectedUser]);

  const canManageSelectedUser = useMemo(() => {
    if (!selectedUser || !isMasterUser) {
      return false;
    }

    if (selectedUser.isBootstrapMaster) {
      return false;
    }

    if (selectedUser.id === user?.uid) {
      return false;
    }

    return true;
  }, [isMasterUser, selectedUser, user?.uid]);

  const hasPendingAccessSave = useMemo(() => {
    if (!selectedUser) {
      return false;
    }

    return pendingAccessUserId === selectedUser.id;
  }, [pendingAccessUserId, selectedUser]);

  const hasPendingDelete = useMemo(() => {
    if (!selectedUser) {
      return false;
    }

    return pendingDeleteUserId === selectedUser.id;
  }, [pendingDeleteUserId, selectedUser]);

  const hasAccessChanged = useMemo(() => {
    if (!selectedUser) {
      return false;
    }

    return selectedAccessLevel !== selectedUser.accessLevel;
  }, [selectedAccessLevel, selectedUser]);

  const loadUserActivity = useCallback(
    async (userId: string) => {
      setSelectedUserId(userId);
      setActivityLoading(true);
      setActivityError(null);
      setActivity(null);

      try {
        const token = await getToken();
        const result = await apiRequest<MasterUserActivity>(`/v1/admin/users/${userId}/activity`, {
          token
        });
        setActivity(result);
      } catch (err) {
        const message =
          err instanceof ApiError ? err.message : "Não foi possível carregar os detalhes deste usuário.";
        setActivityError(message);
      } finally {
        setActivityLoading(false);
      }
    },
    [getToken]
  );

  async function handleUpdateAccess(targetUser: MasterUserOverview, accessLevel: MasterUserOverview["accessLevel"]) {
    setFeedback(null);
    setError(null);
    setPendingAccessUserId(targetUser.id);

    try {
      const token = await getToken();
      await apiRequest(`/v1/admin/users/${targetUser.id}/access`, {
        method: "PATCH",
        token,
        body: {
          accessLevel
        }
      });

      setFeedback(`Acesso atualizado para ${ACCESS_LEVEL_LABELS[accessLevel]}.`);
      await loadOverview();
      await loadUserActivity(targetUser.id);
    } catch (err) {
      const message =
        err instanceof ApiError ? err.message : "Não foi possível atualizar o nível de acesso.";
      setError(message);
    } finally {
      setPendingAccessUserId(null);
    }
  }

  async function handleDeleteUser(targetUser: MasterUserOverview) {
    setFeedback(null);
    setError(null);

    const label = targetUser.name || targetUser.email || "esta conta";
    const confirmed = window.confirm(
      `Deseja excluir ${label}? Esta ação remove o usuário e todos os casos vinculados.`
    );

    if (!confirmed) {
      return;
    }

    setPendingDeleteUserId(targetUser.id);
    try {
      const token = await getToken();
      await apiRequest(`/v1/admin/users/${targetUser.id}`, {
        method: "DELETE",
        token
      });
      setFeedback("Conta excluída com sucesso.");
      closeActivityModal();
      await loadOverview();
    } catch (err) {
      const message = err instanceof ApiError ? err.message : "Não foi possível excluir a conta.";
      setError(message);
    } finally {
      setPendingDeleteUserId(null);
    }
  }

  function closeActivityModal() {
    setSelectedUserId(null);
    setActivity(null);
    setActivityError(null);
  }

  return (
    <section className="page-stack">
      <section className="workspace-hero workspace-hero--simple">
        <div className="workspace-hero-grid">
          <div>
            <p className="hero-kicker">Painel administrativo</p>
            <h1>Visão geral da plataforma</h1>
            <p>Lista central de contas cadastradas com acesso aos detalhes por usuário em modal.</p>
          </div>
        </div>

        {overview && (
          <ul className="workspace-kpis workspace-kpis--wide">
            {summaryItems.map((item) => (
              <li key={item.label}>
                <strong>{item.value}</strong>
                <span>{item.label}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="workspace-panel">
        <header className="page-header">
          <div>
            <h2>Contas cadastradas</h2>
            <p>Use o botão Editar perfil para abrir os detalhes e a sessão individual de cada cliente.</p>
          </div>
        </header>

        {loading && <p>Carregando visão geral...</p>}
        {error && <p className="error-text">{error}</p>}
        {feedback && <p className="success-text">{feedback}</p>}

        {!loading && !error && overview && overview.users.length === 0 && (
          <div className="empty-state">
            <h2>Nenhum usuário encontrado</h2>
            <p>Assim que novas contas começarem a usar o sistema, elas aparecerão aqui.</p>
          </div>
        )}

        {!loading && !error && overview && overview.users.length > 0 && (
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Usuário</th>
                  <th>Perfil</th>
                  <th>CPF</th>
                  <th>Verificação</th>
                  <th>Casos</th>
                  <th>Ativos</th>
                  <th>Ações</th>
                </tr>
              </thead>
              <tbody>
                {overview.users.map((item) => (
                  <tr key={item.id}>
                    <td data-label="Usuário">
                      <div className="table-primary">
                        <strong>{item.name || "Usuário sem nome"}</strong>
                        <span>{item.email || "Sem e-mail cadastrado"}</span>
                      </div>
                    </td>
                    <td data-label="Perfil">
                      <div className="table-badge-stack">
                        {item.accessLevel === "master" ? (
                          <span className="info-pill info-pill--master">Master</span>
                        ) : item.accessLevel === "operator" ? (
                          <span className="info-pill info-pill--operator">Operador</span>
                        ) : (
                          <span className="info-pill">Padrão</span>
                        )}
                      </div>
                    </td>
                    <td data-label="CPF">{item.cpf || "Não informado"}</td>
                    <td data-label="Verificação">
                      <span
                        className={
                          item.emailVerified ? "info-pill info-pill--success" : "info-pill info-pill--warning"
                        }
                      >
                        {item.emailVerified ? "Verificado" : "Pendente"}
                      </span>
                    </td>
                    <td data-label="Casos">{item.totalCases}</td>
                    <td data-label="Ativos">{item.activeCases}</td>
                    <td data-label="Ações">
                      <div className="table-actions">
                        <button
                          type="button"
                          className="secondary-button secondary-button--small"
                          onClick={() => void loadUserActivity(item.id)}
                        >
                          Editar perfil
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {selectedUserId && (
        <div className="modal-backdrop" role="presentation" onClick={closeActivityModal}>
          <section
            className="modal-card modal-card--wide"
            role="dialog"
            aria-modal="true"
            aria-label="Detalhes do usuário"
            onClick={(event) => event.stopPropagation()}
          >
            <header className="modal-header">
              <div className="modal-user-hero">
                <div className="modal-user-avatar" aria-hidden="true">
                  {selectedUser?.avatarUrl ? (
                    <img src={selectedUser.avatarUrl} alt="" />
                  ) : (
                    <span>{getUserInitials(selectedUser ?? { name: null, email: null })}</span>
                  )}
                </div>
                <div>
                  <h2>Informações do cliente</h2>
                  <p>Casos e requisições da conta selecionada.</p>
                </div>
              </div>
              <button type="button" className="ghost-button" onClick={closeActivityModal}>
                Fechar
              </button>
            </header>

            {selectedUser && (
              <section className="admin-access-editor">
                <label>
                  Tipo de acesso
                  <select
                    value={selectedAccessLevel}
                    onChange={(event) =>
                      setSelectedAccessLevel(event.target.value as MasterUserOverview["accessLevel"])
                    }
                    disabled={!canManageSelectedUser || hasPendingAccessSave}
                  >
                    <option value="user">Padrão</option>
                    <option value="operator">Operador (somente leitura)</option>
                    <option value="master">Master</option>
                  </select>
                </label>

                {isMasterUser ? (
                  <button
                    type="button"
                    className="secondary-button secondary-button--small"
                    disabled={!canManageSelectedUser || !hasAccessChanged || hasPendingAccessSave}
                    onClick={() => void handleUpdateAccess(selectedUser, selectedAccessLevel)}
                  >
                    {hasPendingAccessSave ? "Salvando..." : "Salvar tipo de acesso"}
                  </button>
                ) : (
                  <p className="helper-text">Perfil operador possui acesso somente leitura neste painel.</p>
                )}

                {isMasterUser && (
                  <button
                    type="button"
                    className="danger-button danger-button--small"
                    disabled={!canManageSelectedUser || hasPendingDelete}
                    onClick={() => void handleDeleteUser(selectedUser)}
                  >
                    {hasPendingDelete ? "Excluindo..." : "Excluir conta"}
                  </button>
                )}
              </section>
            )}

            {selectedUser?.isBootstrapMaster && (
              <p className="helper-text">A conta master principal não pode ser alterada por este painel.</p>
            )}
            {selectedUser?.id === user?.uid && isMasterUser && (
              <p className="helper-text">Para segurança, altere seu acesso usando outra conta master.</p>
            )}

            {activityLoading && <p>Carregando detalhes...</p>}
            {activityError && <p className="error-text">{activityError}</p>}

            {!activityLoading && !activityError && activity && (
              <>
                <div className="detail-list">
                  <div className="detail-item">
                    <span>Usuário</span>
                    <strong>{activity.user.name || "Usuário sem nome"}</strong>
                  </div>
                  <div className="detail-item">
                    <span>E-mail</span>
                    <strong>{activity.user.email || "Sem e-mail cadastrado"}</strong>
                  </div>
                  <div className="detail-item">
                    <span>Tipo de acesso</span>
                    <strong>{ACCESS_LEVEL_LABELS[activity.user.accessLevel]}</strong>
                  </div>
                  <div className="detail-item">
                    <span>Total de casos</span>
                    <strong>{activity.user.totalCases}</strong>
                  </div>
                  <div className="detail-item">
                    <span>Casos ativos</span>
                    <strong>{activity.user.activeCases}</strong>
                  </div>
                </div>

                {activity.requests.length === 0 ? (
                  <div className="empty-state">
                    <h2>Sem requisições para este usuário</h2>
                    <p>Quando a conta abrir casos, os registros aparecerão aqui.</p>
                  </div>
                ) : (
                  <div className="card-grid">
                    {activity.requests.map((request) => (
                      <article key={request.id} className="case-card">
                        <div className="case-card-top">
                          <strong>{request.varaNome}</strong>
                          <span className={`status-badge status-badge--${request.status}`}>
                            {STATUS_LABELS[request.status]}
                          </span>
                        </div>
                        <div className="case-card-meta">
                          <span>
                            <small>CPF</small>
                            {request.cpf}
                          </span>
                          <span>
                            <small>Abertura</small>
                            {new Date(request.createdAt).toLocaleString("pt-BR")}
                          </span>
                        </div>
                        <p>{request.resumo}</p>
                      </article>
                    ))}
                  </div>
                )}
              </>
            )}
          </section>
        </div>
      )}
    </section>
  );
}
