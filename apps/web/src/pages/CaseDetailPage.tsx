import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { ApiError, apiRequest } from "../lib/api";
import type { CaseRecord } from "../types";

const STATUS_LABEL: Record<CaseRecord["status"], string> = {
  recebido: "Recebido",
  em_analise: "Em analise",
  encerrado: "Encerrado"
};

const DEFENDANT_TYPE_LABEL: Record<NonNullable<CaseRecord["petitionInitial"]>["defendantType"], string> = {
  pessoa_fisica: "Pessoa fisica",
  pessoa_juridica: "Pessoa juridica",
  nao_informado: "Nao informado"
};

function extractFileName(contentDisposition: string | null): string | null {
  if (!contentDisposition) {
    return null;
  }

  const match = contentDisposition.match(/filename="?([^\";]+)"?/i);
  return match?.[1] ?? null;
}

async function extractApiErrorMessage(response: Response): Promise<string> {
  try {
    const parsed = (await response.json()) as { message?: unknown };
    if (typeof parsed.message === "string" && parsed.message.trim()) {
      return parsed.message;
    }
  } catch {
    // Ignora parse para usar fallback.
  }

  return "Nao foi possivel gerar o PDF da peticao inicial.";
}

function formatCurrencyBr(value: number | null | undefined): string {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return "Nao informado";
  }

  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL"
  }).format(value);
}

export function CaseDetailPage() {
  const { getToken } = useAuth();
  const { id } = useParams<{ id: string }>();
  const [caseItem, setCaseItem] = useState<CaseRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [exportingPdf, setExportingPdf] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  useEffect(() => {
    async function loadCase() {
      if (!id) {
        setError("Caso invalido.");
        setLoading(false);
        return;
      }

      setLoading(true);
      setError(null);
      try {
        const token = await getToken();
        const data = await apiRequest<CaseRecord>(`/v1/cases/${id}`, { token });
        setCaseItem(data);
      } catch (nextError) {
        const message = nextError instanceof ApiError ? nextError.message : "Falha ao carregar o caso.";
        setError(message);
      } finally {
        setLoading(false);
      }
    }

    void loadCase();
  }, [getToken, id]);

  async function handleExportPdf() {
    if (!id) {
      setExportError("Caso invalido para exportacao.");
      return;
    }

    setExportError(null);
    setExportingPdf(true);

    try {
      const token = await getToken();
      const response = await fetch(`${import.meta.env.VITE_API_URL}/v1/cases/${id}/peticao-inicial.pdf`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`
        }
      });

      if (!response.ok) {
        throw new Error(await extractApiErrorMessage(response));
      }

      const fileName = extractFileName(response.headers.get("content-disposition")) ?? `peticao-inicial-${id}.pdf`;
      const blob = await response.blob();
      const objectUrl = window.URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = objectUrl;
      anchor.download = fileName;
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      window.URL.revokeObjectURL(objectUrl);
    } catch (nextError) {
      const message =
        nextError instanceof Error ? nextError.message : "Falha ao exportar o PDF da peticao inicial.";
      setExportError(message);
    } finally {
      setExportingPdf(false);
    }
  }

  if (loading) {
    return (
      <section className="page-stack">
        <section className="workspace-panel">
          <p>Carregando caso...</p>
        </section>
      </section>
    );
  }

  if (error) {
    return (
      <section className="page-stack">
        <section className="workspace-panel">
          <p className="error-text">{error}</p>
          <Link to="/dashboard" className="primary-link">
            Voltar para o painel
          </Link>
        </section>
      </section>
    );
  }

  if (!caseItem) {
    return null;
  }

  return (
    <section className="page-stack">
      <section className="workspace-hero workspace-hero--compact workspace-hero--simple">
        <div className="workspace-hero-grid">
          <div>
            <p className="hero-kicker">Detalhe do caso</p>
            <h1>{caseItem.varaNome}</h1>
            <p>Consulte abaixo os dados principais, o resumo enviado e o status atual.</p>
            <div className="hero-cta">
              <button
                type="button"
                className="hero-primary"
                onClick={() => void handleExportPdf()}
                disabled={exportingPdf}
              >
                {exportingPdf ? "Gerando PDF..." : "Exportar peticao inicial (PDF)"}
              </button>
              <span className={`status-badge status-badge--${caseItem.status}`}>
                {STATUS_LABEL[caseItem.status]}
              </span>
              <Link to="/dashboard" className="hero-secondary">
                Voltar ao painel
              </Link>
            </div>
            {exportError && <p className="error-text">{exportError}</p>}
          </div>
        </div>
      </section>

      <div className="detail-grid">
        <article className="detail-card">
          <h2>Informacoes principais</h2>
          <div className="detail-list">
            <div className="detail-item">
              <span>Status</span>
              <strong>{STATUS_LABEL[caseItem.status]}</strong>
            </div>
            <div className="detail-item">
              <span>Cliente</span>
              <strong>{caseItem.clienteNome ?? caseItem.cpfConsulta?.nome ?? "Nao informado"}</strong>
            </div>
            <div className="detail-item">
              <span>CPF</span>
              <strong>{caseItem.cpf}</strong>
            </div>
            <div className="detail-item">
              <span>Abertura</span>
              <strong>{new Date(caseItem.createdAt).toLocaleString("pt-BR")}</strong>
            </div>
            <div className="detail-item">
              <span>Ultima atualizacao</span>
              <strong>{new Date(caseItem.updatedAt).toLocaleString("pt-BR")}</strong>
            </div>
            {(caseItem.responsavelNome || caseItem.responsavelEmail) && (
              <div className="detail-item">
                <span>Conta responsavel</span>
                <strong>{caseItem.responsavelNome ?? caseItem.responsavelEmail}</strong>
              </div>
            )}
          </div>

          {caseItem.cpfConsulta && (
            <div className="info-box">
              <strong>Consulta de CPF</strong>
              <span>Nome: {caseItem.cpfConsulta.nome}</span>
              <span>Situacao: {caseItem.cpfConsulta.situacao}</span>
              <span>Fonte: {caseItem.cpfConsulta.source}</span>
            </div>
          )}

          <div className="resumo-box">
            <strong>Resumo</strong>
            <p>{caseItem.resumo}</p>
          </div>

          {caseItem.petitionInitial && (
            <>
              <div className="info-box">
                <strong>Dados estruturados da peticao</strong>
                <span>Assunto: {caseItem.petitionInitial.claimSubject}</span>
                <span>Endereco do requerente: {caseItem.petitionInitial.claimantAddress}</span>
                <span>Tipo da reclamada: {DEFENDANT_TYPE_LABEL[caseItem.petitionInitial.defendantType]}</span>
                <span>Reclamada: {caseItem.petitionInitial.defendantName}</span>
                <span>Documento da reclamada: {caseItem.petitionInitial.defendantDocument ?? "Nao informado"}</span>
                <span>Endereco da reclamada: {caseItem.petitionInitial.defendantAddress ?? "Nao informado"}</span>
                <span>Valor da causa: {formatCurrencyBr(caseItem.petitionInitial.claimValue)}</span>
                <span>
                  Interesse em audiencia: {caseItem.petitionInitial.hearingInterest ? "Sim" : "Nao"}
                </span>
              </div>

              <div className="resumo-box">
                <strong>Fatos</strong>
                <p>{caseItem.petitionInitial.facts}</p>
              </div>

              <div className="resumo-box">
                <strong>Fundamentos</strong>
                <p>{caseItem.petitionInitial.legalGrounds}</p>
              </div>

              <div className="resumo-box">
                <strong>Pedidos</strong>
                <ul className="timeline-list">
                  {caseItem.petitionInitial.requests.map((item, index) => (
                    <li key={`${caseItem.id}-pedido-${index}`}>{item}</li>
                  ))}
                </ul>
              </div>

              {caseItem.petitionInitial.evidence && (
                <div className="resumo-box">
                  <strong>Provas informadas</strong>
                  <p>{caseItem.petitionInitial.evidence}</p>
                </div>
              )}
            </>
          )}
        </article>

        <aside className="detail-card">
          <h2>Proximos passos sugeridos</h2>
          <ul className="timeline-list">
            <li>Revise o resumo para confirmar se esta claro e completo.</li>
            <li>Confira a situacao do CPF antes de qualquer ajuste importante.</li>
            <li>Acompanhe mudancas de status para saber em que etapa o caso esta.</li>
            <li>Use este painel como referencia para o proximo retorno ao cliente.</li>
          </ul>
        </aside>
      </div>
    </section>
  );
}
