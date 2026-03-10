import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { ApiError, apiRequest } from "../lib/api";
import type { MasterOverview, MasterUserOverview } from "../types";

const STATUS_LABELS: Record<string, string> = {
  recebido: "Recebido",
  em_analise: "Em análise",
  encerrado: "Encerrado"
};

export function MasterDashboardPage() {
  const { getToken, user } = useAuth();
  const [overview, setOverview] = useState<MasterOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [pendingUserId, setPendingUserId] = useState<string | null>(null);

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

  const summaryItems = useMemo(() => {
    if (!overview) {
      return [];
    }

    return [
      { label: "Usuários totais", value: overview.summary.totalUsers },
      { label: "Contas master", value: overview.summary.totalMasterUsers },
      { label: "E-mails verificados", value: overview.summary.verifiedUsers },
      { label: "Usuários ativos em 30 dias", value: overview.summary.activeUsersLast30Days },
      { label: "Novos usuários em 7 dias", value: overview.summary.newUsersLast7Days },
      { label: "Casos totais", value: overview.summary.totalCases },
      { label: "Casos ativos", value: overview.summary.activeCases },
      { label: "Casos encerrados", value: overview.summary.closedCases }
    ];
  }, [overview]);

  async function handleToggleMaster(targetUser: MasterUserOverview) {
    setFeedback(null);
    setPendingUserId(targetUser.id);

    try {
      const token = await getToken();
      await apiRequest(`/v1/admin/users/${targetUser.id}/master`, {
        method: "PATCH",
        token,
        body: {
          isMaster: !targetUser.isMaster
        }
      });
      setFeedback(
        targetUser.isMaster
          ? "Acesso master removido com sucesso."
          : "Acesso master concedido com sucesso."
      );
      await loadOverview();
    } catch (err) {
      const message =
        err instanceof ApiError ? err.message : "Não foi possível atualizar o acesso master.";
      setError(message);
    } finally {
      setPendingUserId(null);
    }
  }

  return (
    <section className="page-stack">
      <section className="workspace-hero workspace-hero--simple">
        <div className="workspace-hero-grid">
          <div>
            <p className="hero-kicker">Painel master</p>
            <h1>Visão geral da plataforma</h1>
            <p>Analise a base de usuários e conceda acesso master para outras contas quando precisar.</p>
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
            <p>Veja todas as contas e promova outras pessoas ao perfil master em poucos cliques.</p>
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
                  <th>Último acesso</th>
                  <th>Último caso</th>
                  <th>Ação</th>
                </tr>
              </thead>
              <tbody>
                {overview.users.map((item) => {
                  const isCurrentUser = item.id === user?.uid;
                  const actionDisabled = isCurrentUser || item.isBootstrapMaster || pendingUserId === item.id;

                  return (
                    <tr key={item.id}>
                      <td>
                        <div className="table-primary">
                          <strong>{item.name || "Usuário sem nome"}</strong>
                          <span>{item.email || "Sem e-mail cadastrado"}</span>
                        </div>
                      </td>
                      <td>
                        <div className="table-badge-stack">
                          {item.isMaster ? (
                            <span className="info-pill info-pill--master">Master</span>
                          ) : (
                            <span className="info-pill">Padrão</span>
                          )}
                          {item.isBootstrapMaster && (
                            <span className="info-pill info-pill--neutral">Principal</span>
                          )}
                        </div>
                      </td>
                      <td>{item.cpf || "Não informado"}</td>
                      <td>
                        <span
                          className={
                            item.emailVerified
                              ? "info-pill info-pill--success"
                              : "info-pill info-pill--warning"
                          }
                        >
                          {item.emailVerified ? "Verificado" : "Pendente"}
                        </span>
                      </td>
                      <td>{item.totalCases}</td>
                      <td>{item.activeCases}</td>
                      <td>{new Date(item.lastSeenAt).toLocaleString("pt-BR")}</td>
                      <td>{item.lastCaseAt ? new Date(item.lastCaseAt).toLocaleString("pt-BR") : "Sem casos"}</td>
                      <td>
                        <div className="table-actions">
                          <button
                            type="button"
                            className="secondary-button secondary-button--small"
                            disabled={actionDisabled}
                            onClick={() => void handleToggleMaster(item)}
                          >
                            {pendingUserId === item.id
                              ? "Salvando..."
                              : item.isBootstrapMaster
                                ? "Master fixo"
                                : isCurrentUser
                                  ? "Sua conta"
                                  : item.isMaster
                                    ? "Remover master"
                                    : "Tornar master"}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="workspace-panel">
        <header className="page-header">
          <div>
            <h2>Movimentação recente</h2>
            <p>Últimos casos atualizados para acompanhar rapidamente onde a operação está concentrada.</p>
          </div>
        </header>

        {!loading && !error && overview && overview.recentCases.length === 0 && (
          <div className="empty-state">
            <h2>Sem movimentações recentes</h2>
            <p>Quando os usuários começarem a abrir casos, essa lista será preenchida.</p>
          </div>
        )}

        {!loading && !error && overview && overview.recentCases.length > 0 && (
          <div className="card-grid">
            {overview.recentCases.map((item) => (
              <article key={item.id} className="case-card">
                <div className="case-card-top">
                  <strong>{item.varaNome}</strong>
                  <span className={`status-badge status-badge--${item.status}`}>
                    {STATUS_LABELS[item.status]}
                  </span>
                </div>
                <div className="table-primary">
                  <strong>{item.userName || "Usuário sem nome"}</strong>
                  <span>{item.userEmail || "Sem e-mail cadastrado"}</span>
                </div>
                <div className="case-card-meta">
                  <span>
                    <small>Criado em</small>
                    {new Date(item.createdAt).toLocaleString("pt-BR")}
                  </span>
                  <span>
                    <small>Atualizado em</small>
                    {new Date(item.updatedAt).toLocaleString("pt-BR")}
                  </span>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </section>
  );
}
