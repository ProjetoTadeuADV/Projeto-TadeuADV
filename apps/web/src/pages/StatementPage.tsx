import { useEffect, useMemo, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { ApiError, apiRequest } from "../lib/api";
import type { CaseRecord } from "../types";

interface StatementEntry {
  id: string;
  caseId: string;
  caseTitle: string;
  counterpartyName: string;
  amount: number;
  occurredAt: string;
  type: "credit_sale" | "withdrawal";
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

export function StatementPage() {
  const { getToken } = useAuth();
  const [cases, setCases] = useState<CaseRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    async function loadStatement() {
      setLoading(true);
      setError(null);

      try {
        const token = await getToken();
        const result = await apiRequest<CaseRecord[]>("/v1/cases", { token });
        if (!active) {
          return;
        }

        setCases(result);
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
  }, [getToken]);

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

      const creditedAt =
        caseItem.saleRequest.clientDecisionAt ??
        caseItem.saleRequest.proposalSentAt ??
        caseItem.saleRequest.reviewedAt ??
        caseItem.updatedAt;

      statementEntries.push({
        id: `${caseItem.id}-${creditedAt}-credit`,
        caseId: caseItem.id,
        caseTitle: resolveCaseTitle(caseItem),
        counterpartyName: resolveCounterpartyName(caseItem),
        amount: saleAmount,
        occurredAt: creditedAt,
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
          caseTitle: resolveCaseTitle(caseItem),
          counterpartyName: resolveCounterpartyName(caseItem),
          amount: withdrawalAmount,
          occurredAt: withdrawalAt,
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

  return (
    <section className="page-stack">
      <section className="workspace-hero workspace-hero--simple">
        <div className="workspace-hero-grid statement-hero-grid">
          <div>
            <p className="hero-kicker">Financeiro</p>
            <h1>Meu extrato</h1>
            <p>Acompanhe os lançamentos financeiros das vendas aprovadas e retiradas realizadas.</p>
          </div>
          <aside className="statement-hero-total" aria-label="Total disponível para resgate">
            <span>Total disponível para resgate</span>
            <strong>{formatCurrencyBr(netBalance)}</strong>
          </aside>
        </div>
      </section>

      <section className="workspace-panel">
        <header className="page-header">
          <div>
            <h2>Lançamentos</h2>
            <p>Entradas de vendas aprovadas e saídas de retiradas para cálculo do saldo.</p>
          </div>
        </header>

        {loading && <p>Carregando extrato...</p>}

        {!loading && error && <p className="error-text">{error}</p>}

        {!loading && !error && entries.length === 0 && (
          <div className="info-box">
            <strong>Nenhum lançamento disponível no momento.</strong>
            <span>Quando houver venda aprovada ou retirada, o extrato será atualizado automaticamente.</span>
          </div>
        )}

        {!loading && !error && entries.length > 0 && (
          <div className="statement-table-wrapper">
            <table className="statement-table" aria-label="Extrato de lançamentos">
              <thead>
                <tr>
                  <th scope="col">Data</th>
                  <th scope="col">Tipo</th>
                  <th scope="col">Título do caso</th>
                  <th scope="col">Parte contrária</th>
                  <th scope="col" className="statement-table-value">Valor (R$)</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((entry) => (
                  <tr key={entry.id}>
                    <td>{formatDateTime(entry.occurredAt)}</td>
                    <td>{entry.type === "credit_sale" ? "Venda aprovada" : "Retirada"}</td>
                    <td>{entry.caseTitle}</td>
                    <td>{entry.counterpartyName}</td>
                    <td
                      className={
                        entry.type === "withdrawal"
                          ? "statement-table-value statement-table-value--negative"
                          : "statement-table-value"
                      }
                    >
                      {entry.type === "withdrawal"
                        ? `- ${formatCurrencyBr(entry.amount)}`
                        : formatCurrencyBr(entry.amount)}
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
    </section>
  );
}
