import { useEffect, useMemo, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { ApiError, apiRequest } from "../lib/api";
import type { CaseRecord } from "../types";

interface StatementEntry {
  caseId: string;
  caseTitle: string;
  counterpartyName: string;
  amount: number;
  creditedAt: string;
  payoutStatus: CaseRecord["saleRequest"]["payoutStatus"];
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
    return cases
      .filter((caseItem) => caseItem.saleRequest.status === "accepted")
      .map((caseItem) => {
        const amount = caseItem.saleRequest.suggestedAmount ?? 0;
        const creditedAt =
          caseItem.saleRequest.clientDecisionAt ??
          caseItem.saleRequest.proposalSentAt ??
          caseItem.saleRequest.reviewedAt ??
          caseItem.updatedAt;

        return {
          caseId: caseItem.id,
          caseTitle: resolveCaseTitle(caseItem),
          counterpartyName: resolveCounterpartyName(caseItem),
          amount,
          creditedAt,
          payoutStatus: caseItem.saleRequest.payoutStatus ?? "none"
        };
      })
      .filter((entry) => Number.isFinite(entry.amount) && entry.amount > 0)
      .sort((left, right) => (left.creditedAt < right.creditedAt ? 1 : -1));
  }, [cases]);

  const totalToSend = useMemo(
    () =>
      Number(
        entries
          .filter((entry) => entry.payoutStatus !== "transfer_sent")
          .reduce((sum, entry) => sum + entry.amount, 0)
          .toFixed(2)
      ),
    [entries]
  );
  const totalSent = useMemo(
    () =>
      Number(
        entries
          .filter((entry) => entry.payoutStatus === "transfer_sent")
          .reduce((sum, entry) => sum + entry.amount, 0)
          .toFixed(2)
      ),
    [entries]
  );
  const totalNet = useMemo(() => Number((totalToSend - totalSent).toFixed(2)), [totalSent, totalToSend]);
  const latestCreditAt = entries[0]?.creditedAt ?? null;

  return (
    <section className="page-stack">
      <section className="workspace-hero workspace-hero--simple">
        <div className="workspace-hero-grid">
          <div>
            <p className="hero-kicker">Financeiro</p>
            <h1>Meu extrato</h1>
            <p>Acompanhe os créditos de venda de caso e o valor total a ser enviado.</p>
          </div>
        </div>

        <ul className="workspace-kpis">
          <li>
            <strong>{formatCurrencyBr(totalToSend)}</strong>
            <span>Valor a ser enviado</span>
          </li>
          <li>
            <strong>{entries.length}</strong>
            <span>Créditos confirmados</span>
          </li>
          <li>
            <strong>{formatCurrencyBr(totalSent)}</strong>
            <span>Total já enviado</span>
          </li>
          <li>
            <strong>{latestCreditAt ? formatDateTime(latestCreditAt) : "Sem lançamentos"}</strong>
            <span>Último crédito</span>
          </li>
        </ul>
      </section>

      <section className="workspace-panel">
        <header className="page-header">
          <div>
            <h2>Lançamentos</h2>
            <p>Registros de vendas aceitas para consulta rápida do saldo interno.</p>
          </div>
        </header>

        {loading && <p>Carregando extrato...</p>}

        {!loading && error && <p className="error-text">{error}</p>}

        {!loading && !error && entries.length === 0 && (
          <div className="info-box">
            <strong>Nenhum crédito disponível no momento.</strong>
            <span>Quando uma venda de caso for aceita, o valor aparecerá automaticamente aqui.</span>
          </div>
        )}

        {!loading && !error && entries.length > 0 && (
          <div className="statement-table-wrapper">
            <table className="statement-table" aria-label="Extrato de venda de casos">
              <thead>
                <tr>
                  <th scope="col">Título do caso</th>
                  <th scope="col">Parte contrária</th>
                  <th scope="col" className="statement-table-value">Valor de venda</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((entry) => (
                  <tr key={`${entry.caseId}-${entry.creditedAt}`}>
                    <td>{entry.caseTitle}</td>
                    <td>{entry.counterpartyName}</td>
                    <td className="statement-table-value">{formatCurrencyBr(entry.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {!loading && !error && (
          <section className="statement-totals" aria-label="Totais do extrato">
            <div>
              <span>Recebíveis</span>
              <strong>{formatCurrencyBr(totalToSend)}</strong>
            </div>
            <div>
              <span>Retiradas</span>
              <strong>{formatCurrencyBr(totalSent)}</strong>
            </div>
            <div>
              <span>Saldo líquido</span>
              <strong>{formatCurrencyBr(totalNet)}</strong>
            </div>
          </section>
        )}
      </section>
    </section>
  );
}
