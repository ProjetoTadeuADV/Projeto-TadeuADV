import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { ApiError, apiRequest } from "../lib/api";
import type { CaseRecord } from "../types";

const STATUS_LABEL: Record<CaseRecord["status"], string> = {
  recebido: "Recebido",
  em_analise: "Em análise",
  encerrado: "Encerrado"
};

const DEFENDANT_TYPE_LABEL: Record<NonNullable<CaseRecord["petitionInitial"]>["defendantType"], string> = {
  pessoa_fisica: "Pessoa física",
  pessoa_juridica: "Pessoa jurídica",
  nao_informado: "Não informado"
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

  return "Não foi possível gerar o PDF da petição inicial.";
}

function formatCurrencyBr(value: number | null | undefined): string {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return "Não informado";
  }

  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL"
  }).format(value);
}

function formatAttachmentSize(sizeBytes: number): string {
  if (!Number.isFinite(sizeBytes) || sizeBytes <= 0) {
    return "0 B";
  }

  const units = ["B", "KB", "MB", "GB"];
  let value = sizeBytes;
  let unitIndex = 0;

  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }

  const rounded = unitIndex === 0 ? `${Math.round(value)}` : value.toFixed(1);
  return `${rounded} ${units[unitIndex]}`;
}

export function CaseDetailPage() {
  const { getToken } = useAuth();
  const { id } = useParams<{ id: string }>();
  const [caseItem, setCaseItem] = useState<CaseRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [exportingPdf, setExportingPdf] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [downloadingAttachmentId, setDownloadingAttachmentId] = useState<string | null>(null);
  const [attachmentError, setAttachmentError] = useState<string | null>(null);

  useEffect(() => {
    async function loadCase() {
      if (!id) {
        setError("Caso inválido.");
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
      setExportError("Caso inválido para exportação.");
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
        nextError instanceof Error ? nextError.message : "Falha ao exportar o PDF da petição inicial.";
      setExportError(message);
    } finally {
      setExportingPdf(false);
    }
  }

  async function handleDownloadAttachment(attachmentId: string, fallbackName: string) {
    if (!id) {
      return;
    }

    setAttachmentError(null);
    setDownloadingAttachmentId(attachmentId);

    try {
      const token = await getToken();
      const response = await fetch(
        `${import.meta.env.VITE_API_URL}/v1/cases/${id}/attachments/${attachmentId}`,
        {
          method: "GET",
          headers: {
            Authorization: `Bearer ${token}`
          }
        }
      );

      if (!response.ok) {
        throw new Error("Não foi possível baixar o anexo.");
      }

      const fileName = extractFileName(response.headers.get("content-disposition")) ?? fallbackName;
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
      const message = nextError instanceof Error ? nextError.message : "Falha ao baixar anexo.";
      setAttachmentError(message);
    } finally {
      setDownloadingAttachmentId(null);
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
                {exportingPdf ? "Gerando PDF..." : "Exportar petição inicial (PDF)"}
              </button>
              <span className={`status-badge status-badge--${caseItem.status}`}>
                {STATUS_LABEL[caseItem.status]}
              </span>
              <Link to="/dashboard" className="hero-secondary">
                Voltar ao painel
              </Link>
            </div>
            {exportError && <p className="error-text">{exportError}</p>}
            {attachmentError && <p className="error-text">{attachmentError}</p>}
          </div>
        </div>
      </section>

      <div className="detail-grid">
        <article className="detail-card">
          <h2>Informações principais</h2>
          <div className="detail-list">
            <div className="detail-item">
              <span>Status</span>
              <strong>{STATUS_LABEL[caseItem.status]}</strong>
            </div>
            <div className="detail-item">
              <span>Cliente</span>
              <strong>{caseItem.clienteNome ?? caseItem.cpfConsulta?.nome ?? "Não informado"}</strong>
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
              <span>Última atualização</span>
              <strong>{new Date(caseItem.updatedAt).toLocaleString("pt-BR")}</strong>
            </div>
            {(caseItem.responsavelNome || caseItem.responsavelEmail) && (
              <div className="detail-item">
                <span>Conta responsável</span>
                <strong>{caseItem.responsavelNome ?? caseItem.responsavelEmail}</strong>
              </div>
            )}
          </div>

          {caseItem.cpfConsulta && (
            <div className="info-box">
              <strong>Consulta de CPF</strong>
              <span>Nome: {caseItem.cpfConsulta.nome}</span>
              <span>Situação: {caseItem.cpfConsulta.situacao}</span>
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
                <strong>Dados estruturados da petição</strong>
                <span>Assunto: {caseItem.petitionInitial.claimSubject}</span>
                <span>Endereço do requerente: {caseItem.petitionInitial.claimantAddress}</span>
                <span>Tipo da reclamada: {DEFENDANT_TYPE_LABEL[caseItem.petitionInitial.defendantType]}</span>
                <span>Reclamada: {caseItem.petitionInitial.defendantName}</span>
                <span>Documento da reclamada: {caseItem.petitionInitial.defendantDocument ?? "Não informado"}</span>
                <span>Endereço da reclamada: {caseItem.petitionInitial.defendantAddress ?? "Não informado"}</span>
                <span>Valor da causa: {formatCurrencyBr(caseItem.petitionInitial.claimValue)}</span>
                <span>
                  Interesse em audiência: {caseItem.petitionInitial.hearingInterest ? "Sim" : "Não"}
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

              {(caseItem.petitionInitial.attachments ?? []).length > 0 && (
                <div className="resumo-box">
                  <strong>Anexos enviados</strong>
                  <ul className="attachment-list">
                    {(caseItem.petitionInitial.attachments ?? []).map((item) => (
                      <li key={item.id}>
                        <div>
                          <strong>{item.originalName}</strong>
                          <span>{formatAttachmentSize(item.sizeBytes)}</span>
                        </div>
                        <button
                          type="button"
                          className="attachment-remove"
                          onClick={() => void handleDownloadAttachment(item.id, item.originalName)}
                          disabled={downloadingAttachmentId === item.id}
                        >
                          {downloadingAttachmentId === item.id ? "Baixando..." : "Baixar"}
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          )}
        </article>

        <aside className="detail-card">
          <h2>Próximos passos sugeridos</h2>
          <ul className="timeline-list">
            <li>Revise o resumo para confirmar se está claro e completo.</li>
            <li>Confira a situação do CPF antes de qualquer ajuste importante.</li>
            <li>Acompanhe mudanças de status para saber em que etapa o caso está.</li>
            <li>Use este painel como referência para o próximo retorno ao cliente.</li>
          </ul>
        </aside>
      </div>
    </section>
  );
}

