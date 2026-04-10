import { useEffect, useMemo, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { ApiError, apiRequest } from "../lib/api";
import type { AccountProfile, CaseRecord } from "../types";

interface StatementEntry {
  id: string;
  caseId: string;
  caseCode: string;
  caseTitle: string;
  counterpartyName: string;
  amount: number;
  occurredAt: string;
  approvalAt: string;
  approvalBy: string;
  type: "credit_sale" | "withdrawal";
}

type WithdrawalBottomBarState = {
  tone: "success" | "error" | "info";
  message: string;
  profilePath?: string;
};

interface AccountProfileResponse {
  user: AccountProfile;
}

interface WithdrawalRequestResponse {
  requestedCases: number;
  alreadyPendingCases: number;
  totalEligibleCases: number;
  requestedAmount: number;
  message: string;
}

function formatCurrencyBr(value: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL"
  }).format(value);
}

function formatDateTime(value: string): string {
  return new Date(value).toLocaleString("pt-BR");
}

function resolveCounterpartyName(caseItem: CaseRecord): string {
  const byPetition = caseItem.petitionInitial?.defendantName?.trim();
  if (byPetition) {
    return byPetition;
  }

  return "Parte contrária não informada";
}

function resolveCaseTitle(caseItem: CaseRecord): string {
  const byDefendant = caseItem.petitionInitial?.defendantName?.trim();
  if (byDefendant) {
    return byDefendant;
  }

  const byClaimSubject = caseItem.petitionInitial?.claimSubject?.trim();
  if (byClaimSubject) {
    return byClaimSubject;
  }

  return "Caso sem título";
}

function hasRegisteredBankAccount(profile: AccountProfile | null): boolean {
  const bankAccount = profile?.bankAccount;
  if (!bankAccount) {
    return false;
  }

  return Boolean(
    bankAccount.bankName &&
      bankAccount.agency &&
      bankAccount.accountNumber &&
      bankAccount.holderName &&
      bankAccount.holderDocument
  );
}

export function StatementPage() {
  const { getToken, canAccessAdmin, isMasterUser } = useAuth();
  const [cases, setCases] = useState<CaseRecord[]>([]);
  const [accountProfile, setAccountProfile] = useState<AccountProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [requestingWithdrawal, setRequestingWithdrawal] = useState(false);
  const [withdrawalBottomBar, setWithdrawalBottomBar] = useState<WithdrawalBottomBarState | null>(null);
  const [selectedEntry, setSelectedEntry] = useState<StatementEntry | null>(null);

  useEffect(() => {
    let active = true;

    async function loadStatement() {
      setLoading(true);
      setError(null);

      if (canAccessAdmin) {
        if (active) {
          setCases([]);
          setAccountProfile(null);
          setLoading(false);
        }
        return;
      }

      try {
        const token = await getToken();
        const result = await apiRequest<CaseRecord[]>("/v1/cases", { token });
        if (!active) {
          return;
        }
        setCases(result);

        try {
          const profileResult = await apiRequest<AccountProfileResponse>("/v1/users/me", { token });
          if (active) {
            setAccountProfile(profileResult.user);
          }
        } catch {
          if (active) {
            setAccountProfile(null);
          }
        }
      } catch (nextError) {
        if (!active) {
          return;
        }

        const message = nextError instanceof ApiError ? nextError.message : "Não foi possível carregar o extrato.";
        setError(message);
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    void loadStatement();

    return () => {
      active = false;
    };
  }, [canAccessAdmin, getToken]);

  const entries = useMemo<StatementEntry[]>(() => {
    const statementEntries: StatementEntry[] = [];

    for (const caseItem of cases) {
      if (caseItem.saleRequest.status !== "accepted") {
        continue;
      }

      const saleAmount = caseItem.saleRequest.suggestedAmount ?? 0;
      if (!Number.isFinite(saleAmount) || saleAmount <= 0) {
        continue;
      }

      const approvalAt =
        caseItem.saleRequest.clientDecisionAt ??
        caseItem.saleRequest.proposalSentAt ??
        caseItem.saleRequest.reviewedAt ??
        caseItem.updatedAt;

      statementEntries.push({
        id: `${caseItem.id}-${approvalAt}-credit`,
        caseId: caseItem.id,
        caseCode: caseItem.caseCode,
        caseTitle: resolveCaseTitle(caseItem),
        counterpartyName: resolveCounterpartyName(caseItem),
        amount: saleAmount,
        occurredAt: approvalAt,
        approvalAt,
        approvalBy: caseItem.saleRequest.clientDecisionByName ?? "Cliente",
        type: "credit_sale"
      });

      if (caseItem.saleRequest.payoutStatus === "transfer_sent") {
        const payoutAmount = caseItem.saleRequest.payoutAmount;
        const withdrawalAmount =
          typeof payoutAmount === "number" && Number.isFinite(payoutAmount) && payoutAmount > 0
            ? payoutAmount
            : saleAmount;
        const withdrawalAt =
          caseItem.saleRequest.payoutSentAt ??
          caseItem.saleRequest.payoutRequestedAt ??
          caseItem.updatedAt;

        statementEntries.push({
          id: `${caseItem.id}-${withdrawalAt}-withdrawal`,
          caseId: caseItem.id,
          caseCode: caseItem.caseCode,
          caseTitle: resolveCaseTitle(caseItem),
          counterpartyName: resolveCounterpartyName(caseItem),
          amount: withdrawalAmount,
          occurredAt: withdrawalAt,
          approvalAt: caseItem.saleRequest.payoutRequestedAt ?? withdrawalAt,
          approvalBy:
            caseItem.saleRequest.reviewedByName ??
            caseItem.saleRequest.clientDecisionByName ??
            "Equipe financeira",
          type: "withdrawal"
        });
      }
    }

    return statementEntries.sort((left, right) => (left.occurredAt < right.occurredAt ? 1 : -1));
  }, [cases]);

  const totalReceivables = useMemo(
    () =>
      Number(
        entries
          .filter((entry) => entry.type === "credit_sale")
          .reduce((sum, entry) => sum + entry.amount, 0)
          .toFixed(2)
      ),
    [entries]
  );
  const totalWithdrawals = useMemo(
    () =>
      Number(
        entries
          .filter((entry) => entry.type === "withdrawal")
          .reduce((sum, entry) => sum + entry.amount, 0)
          .toFixed(2)
      ),
    [entries]
  );
  const netBalance = useMemo(
    () => Number((totalReceivables - totalWithdrawals).toFixed(2)),
    [totalReceivables, totalWithdrawals]
  );

  function showWithdrawalBottomBar(
    tone: WithdrawalBottomBarState["tone"],
    message: string,
    profilePath?: string
  ) {
    setWithdrawalBottomBar({
      tone,
      message,
      profilePath
    });
  }

  async function handleRequestWithdrawal() {
    if (canAccessAdmin) {
      showWithdrawalBottomBar("error", "Solicitação de levantamento disponível apenas para contas de cliente.");
      return;
    }

    if (requestingWithdrawal) {
      return;
    }

    if (netBalance <= 0) {
      showWithdrawalBottomBar("info", "Não há valor disponível para levantamento no momento.");
      return;
    }

    if (!hasRegisteredBankAccount(accountProfile)) {
      showWithdrawalBottomBar(
        "error",
        "Para fazer o levantamento, é necessário cadastrar uma conta bancária na página",
        "/settings/profile?focus=bank-account"
      );
      return;
    }

    setRequestingWithdrawal(true);
    try {
      const token = await getToken();
      const result = await apiRequest<WithdrawalRequestResponse>("/v1/users/me/withdrawals/request", {
        method: "POST",
        token
      });
      showWithdrawalBottomBar("success", result.message.replace(/retirada/gi, "levantamento"));
    } catch (nextError) {
      const message =
        nextError instanceof ApiError
          ? nextError.message.replace(/retirada/gi, "levantamento")
          : "Não foi possível solicitar o levantamento.";
      showWithdrawalBottomBar("error", message);
    } finally {
      setRequestingWithdrawal(false);
    }
  }

  if (canAccessAdmin) {
    return <Navigate to={isMasterUser ? "/master/dashboard" : "/dashboard"} replace />;
  }

  return (
    <section className="page-stack">
      <section className="workspace-hero workspace-hero--simple">
        <div className="workspace-hero-grid statement-hero-grid">
          <div>
            <p className="hero-kicker">Financeiro</p>
            <h1>Meu extrato</h1>
            <p>Acompanhe os lançamentos financeiros das vendas aprovadas e levantamentos realizados.</p>
          </div>
          <aside className="statement-hero-total" aria-label="Total disponível para resgate">
            <span>Total disponível para resgate</span>
            <strong>{formatCurrencyBr(netBalance)}</strong>
            <button
              type="button"
              className="hero-primary statement-withdraw-button"
              onClick={() => void handleRequestWithdrawal()}
              disabled={requestingWithdrawal}
            >
              {requestingWithdrawal ? "Solicitando..." : "Solicitar levantamento"}
            </button>
          </aside>
        </div>
      </section>

      <section className="workspace-panel statement-panel">
        <header className="page-header">
          <div>
            <h2>Lançamentos</h2>
          </div>
        </header>

        {loading && <p>Carregando extrato...</p>}

        {!loading && error && <p className="error-text">{error}</p>}

        {!loading && !error && entries.length === 0 && (
          <div className="info-box">
            <strong>Nenhum lançamento disponível no momento.</strong>
            <span>Quando houver venda aprovada ou levantamento, o extrato será atualizado automaticamente.</span>
          </div>
        )}

        {!loading && !error && entries.length > 0 && (
          <div className="statement-table-wrapper">
            <table className="statement-table statement-table--compact" aria-label="Extrato de lançamentos">
              <thead>
                <tr>
                  <th scope="col">Caso</th>
                  <th scope="col" className="statement-table-value">Valor</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((entry) => (
                  <tr key={entry.id}>
                    <td>{entry.caseTitle}</td>
                    <td className="statement-table-value">
                      <button
                        type="button"
                        className={
                          entry.type === "withdrawal"
                            ? "statement-table-value-button statement-table-value-button--negative"
                            : "statement-table-value-button"
                        }
                        onClick={() => setSelectedEntry(entry)}
                        aria-label={`Ver detalhes do lançamento de ${entry.caseTitle}`}
                      >
                        {entry.type === "withdrawal"
                          ? `- ${formatCurrencyBr(entry.amount)}`
                          : formatCurrencyBr(entry.amount)}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {!loading && !error && (
          <section className="statement-totals statement-totals--compact" aria-label="Saldo líquido">
            <div>
              <span>Saldo líquido (a ser retirado)</span>
              <strong>{formatCurrencyBr(netBalance)}</strong>
            </div>
          </section>
        )}
      </section>

      {selectedEntry && (
        <>
          <button
            type="button"
            className="case-notice-overlay"
            aria-label="Fechar detalhes do lançamento"
            onClick={() => setSelectedEntry(null)}
          />
          <section
            className="case-notice-popup case-notice-popup--client statement-entry-popup"
            role="dialog"
            aria-modal="true"
            aria-labelledby="statement-entry-popup-title"
          >
            <div className="case-notice-header">
              <div>
                <p className="hero-kicker">Detalhes do lançamento</p>
                <h3 id="statement-entry-popup-title">Resumo financeiro do caso</h3>
              </div>
              <button
                type="button"
                className="case-notice-close"
                aria-label="Fechar detalhes"
                onClick={() => setSelectedEntry(null)}
              >
                {"\u00D7"}
              </button>
            </div>

            <div className="detail-list">
              <div className="detail-item">
                <span>Título do caso</span>
                <strong>{selectedEntry.caseTitle}</strong>
              </div>
              <div className="detail-item">
                <span>Tipo de lançamento</span>
                <strong>{selectedEntry.type === "credit_sale" ? "Venda aprovada" : "Levantamento"}</strong>
              </div>
              <div className="detail-item">
                <span>Valor</span>
                <strong>
                  {selectedEntry.type === "withdrawal"
                    ? `- ${formatCurrencyBr(selectedEntry.amount)}`
                    : formatCurrencyBr(selectedEntry.amount)}
                </strong>
              </div>
              <div className="detail-item">
                <span>Data da aprovação</span>
                <strong>{formatDateTime(selectedEntry.approvalAt)}</strong>
              </div>
              <div className="detail-item">
                <span>Quem aprovou</span>
                <strong>{selectedEntry.approvalBy}</strong>
              </div>
              <div className="detail-item">
                <span>Parte contrária</span>
                <strong>{selectedEntry.counterpartyName}</strong>
              </div>
              <div className="detail-item">
                <span>Código do caso</span>
                <strong>{selectedEntry.caseCode}</strong>
              </div>
              <div className="detail-item">
                <span>Data do lançamento</span>
                <strong>{formatDateTime(selectedEntry.occurredAt)}</strong>
              </div>
            </div>

            <div className="operator-action-buttons">
              <button type="button" className="hero-secondary" onClick={() => setSelectedEntry(null)}>
                Fechar
              </button>
            </div>
          </section>
        </>
      )}

      {withdrawalBottomBar && (
        <section
          className={`withdrawal-bottom-bar withdrawal-bottom-bar--${withdrawalBottomBar.tone}`}
          role="status"
          aria-live="polite"
        >
          <p>
            {withdrawalBottomBar.message}
            {withdrawalBottomBar.profilePath && (
              <>
                {" "}
                <Link
                  to={withdrawalBottomBar.profilePath}
                  className="withdrawal-bottom-bar-link"
                  onClick={() => setWithdrawalBottomBar(null)}
                >
                  Perfil
                </Link>
                .
              </>
            )}
          </p>
          <button
            type="button"
            className="secondary-button secondary-button--small"
            onClick={() => setWithdrawalBottomBar(null)}
          >
            OK
          </button>
        </section>
      )}
    </section>
  );
}
