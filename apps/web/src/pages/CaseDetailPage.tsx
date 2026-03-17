import { ChangeEvent, useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { ApiError, apiRequest } from "../lib/api";
import type {
  AdminOperatorOption,
  ApiErrorResponse,
  ApiSuccessResponse,
  CaseMovementCreateResult,
  CaseMovementRecord,
  CaseRecord
} from "../types";

const MAX_ATTACHMENTS_PER_CASE = 8;
const MAX_ATTACHMENT_SIZE_BYTES = 10 * 1024 * 1024;
const ATTACHMENT_ACCEPT = ".pdf,.jpg,.jpeg,.png,.webp,.txt,.doc,.docx";

const STATUS_LABEL: Record<CaseRecord["status"], string> = {
  recebido: "Recebido",
  em_analise: "Em análise",
  encerrado: "Encerrado"
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

const SERVICE_FEE_STATUS_LABEL: Record<NonNullable<CaseRecord["serviceFee"]>["status"], string> = {
  draft: "Rascunho",
  awaiting_payment: "Aguardando pagamento",
  paid: "Pago",
  canceled: "Cancelado"
};

const DEFENDANT_TYPE_LABEL: Record<NonNullable<CaseRecord["petitionInitial"]>["defendantType"], string> = {
  pessoa_fisica: "Pessoa física",
  pessoa_juridica: "Pessoa jurídica",
  nao_informado: "Não informado"
};

const PRETENSION_LABEL: Record<NonNullable<CaseRecord["petitionInitial"]>["pretensions"][number]["type"], string> =
  {
    ressarcimento_valor: "Ressarcimento de valor",
    indenizacao_danos: "Indenização por danos morais ou materiais",
    cumprimento_compromisso: "Cumprimento de compromisso acordado",
    retratacao: "Retratação",
    devolucao_produto: "Devolução do produto com ressarcimento",
    outro: "Outro pedido"
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

const MOVEMENT_VISIBILITY_LABEL: Record<CaseMovementRecord["visibility"], string> = {
  public: "Pública",
  internal: "Interna"
};

function extractFileName(contentDisposition: string | null): string | null {
  if (!contentDisposition) {
    return null;
  }

  const match = contentDisposition.match(/filename="?([^";]+)"?/i);
  return match?.[1] ?? null;
}

function formatDate(value: string): string {
  return new Date(value).toLocaleString("pt-BR");
}

async function extractApiErrorMessage(response: Response, fallback: string): Promise<string> {
  try {
    const parsed = (await response.json()) as { message?: unknown };
    if (typeof parsed.message === "string" && parsed.message.trim()) {
      return parsed.message;
    }
  } catch {
    // Ignora parse para usar fallback.
  }

  return fallback;
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

function parseMoneyInput(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  const normalized = trimmed
    .replace(/[R$\s]/gi, "")
    .replace(/\./g, "")
    .replace(",", ".")
    .replace(/[^0-9.-]/g, "");
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null;
  }

  return parsed;
}

function formatIsoDateToBr(value: string): string {
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("pt-BR").format(parsed);
}

function describePretension(item: NonNullable<CaseRecord["petitionInitial"]>["pretensions"][number]): string {
  const label = PRETENSION_LABEL[item.type];
  const details = item.details?.trim();
  const amount =
    typeof item.amount === "number" && Number.isFinite(item.amount)
      ? ` (${formatCurrencyBr(item.amount)})`
      : "";

  if (details) {
    return `${label}: ${details}${amount}`;
  }

  return `${label}${amount}`;
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

function fingerprintFile(file: File): string {
  return `${file.name}:${file.size}:${file.lastModified}`;
}

export function CaseDetailPage() {
  const { getToken, canAccessAdmin, user } = useAuth();
  const { id } = useParams<{ id: string }>();

  const [caseItem, setCaseItem] = useState<CaseRecord | null>(null);
  const [operators, setOperators] = useState<AdminOperatorOption[]>([]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [exportingPdf, setExportingPdf] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  const [assigningOperator, setAssigningOperator] = useState(false);
  const [selectedOperatorId, setSelectedOperatorId] = useState("");
  const [assignmentFeedback, setAssignmentFeedback] = useState<string | null>(null);
  const [assignmentError, setAssignmentError] = useState<string | null>(null);

  const [savingMovement, setSavingMovement] = useState(false);
  const [movementStage, setMovementStage] = useState<CaseMovementRecord["stage"]>("andamento");
  const [movementVisibility, setMovementVisibility] = useState<CaseMovementRecord["visibility"]>("public");
  const [movementStatus, setMovementStatus] = useState<CaseRecord["status"]>("em_analise");
  const [movementDescription, setMovementDescription] = useState("");
  const [movementFiles, setMovementFiles] = useState<File[]>([]);
  const [movementFeedback, setMovementFeedback] = useState<string | null>(null);
  const [movementError, setMovementError] = useState<string | null>(null);

  const [reviewingCase, setReviewingCase] = useState(false);
  const [reviewReason, setReviewReason] = useState("");
  const [requestClientData, setRequestClientData] = useState(false);
  const [clientDataRequest, setClientDataRequest] = useState("");
  const [reviewFeedback, setReviewFeedback] = useState<string | null>(null);
  const [reviewError, setReviewError] = useState<string | null>(null);

  const [savingServiceFee, setSavingServiceFee] = useState(false);
  const [serviceFeeAmountInput, setServiceFeeAmountInput] = useState("");
  const [serviceFeeDueDate, setServiceFeeDueDate] = useState("");
  const [serviceFeeFeedback, setServiceFeeFeedback] = useState<string | null>(null);
  const [serviceFeeError, setServiceFeeError] = useState<string | null>(null);

  const [downloadingAttachmentId, setDownloadingAttachmentId] = useState<string | null>(null);
  const [attachmentError, setAttachmentError] = useState<string | null>(null);

  const sortedMovements = useMemo(() => {
    if (!caseItem?.movements) {
      return [];
    }

    return [...caseItem.movements].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  }, [caseItem?.movements]);

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
        const [caseData, operatorData] = await Promise.all([
          apiRequest<CaseRecord>(`/v1/cases/${id}`, { token }),
          canAccessAdmin
            ? apiRequest<AdminOperatorOption[]>("/v1/admin/operators", { token })
            : Promise.resolve([])
        ]);

        setCaseItem(caseData);
        setOperators(operatorData);
        setMovementStatus(caseData.status);
      } catch (nextError) {
        const message = nextError instanceof ApiError ? nextError.message : "Falha ao carregar o caso.";
        setError(message);
      } finally {
        setLoading(false);
      }
    }

    void loadCase();
  }, [canAccessAdmin, getToken, id]);

  useEffect(() => {
    if (!canAccessAdmin) {
      return;
    }

    if (caseItem?.assignedOperatorId) {
      setSelectedOperatorId(caseItem.assignedOperatorId);
      return;
    }

    if (operators.length > 0) {
      setSelectedOperatorId(operators[0].id);
    }
  }, [canAccessAdmin, caseItem?.assignedOperatorId, operators]);

  useEffect(() => {
    if (!caseItem?.serviceFee) {
      return;
    }

    setServiceFeeAmountInput(String(caseItem.serviceFee.amount));
    setServiceFeeDueDate(caseItem.serviceFee.dueDate);
  }, [caseItem?.serviceFee]);

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
        throw new Error(await extractApiErrorMessage(response, "Não foi possível gerar o PDF da petição inicial."));
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

  async function downloadFile(path: string, fallbackName: string) {
    const token = await getToken();
    const response = await fetch(`${import.meta.env.VITE_API_URL}${path}`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`
      }
    });

    if (!response.ok) {
      throw new Error(await extractApiErrorMessage(response, "Não foi possível baixar o anexo."));
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
  }

  async function handleDownloadPetitionAttachment(attachmentId: string, fallbackName: string) {
    if (!id) {
      return;
    }

    setAttachmentError(null);
    setDownloadingAttachmentId(attachmentId);

    try {
      await downloadFile(`/v1/cases/${id}/attachments/${attachmentId}`, fallbackName);
    } catch (nextError) {
      const message = nextError instanceof Error ? nextError.message : "Falha ao baixar anexo.";
      setAttachmentError(message);
    } finally {
      setDownloadingAttachmentId(null);
    }
  }

  async function handleDownloadMovementAttachment(
    movementId: string,
    attachmentId: string,
    fallbackName: string
  ) {
    if (!id) {
      return;
    }

    const key = `${movementId}:${attachmentId}`;
    setAttachmentError(null);
    setDownloadingAttachmentId(key);

    try {
      await downloadFile(`/v1/cases/${id}/movements/${movementId}/attachments/${attachmentId}`, fallbackName);
    } catch (nextError) {
      const message = nextError instanceof Error ? nextError.message : "Falha ao baixar anexo.";
      setAttachmentError(message);
    } finally {
      setDownloadingAttachmentId(null);
    }
  }

  async function handleAssignOperator(operatorUserId: string) {
    if (!id || !operatorUserId) {
      return;
    }

    setAssignmentFeedback(null);
    setAssignmentError(null);
    setAssigningOperator(true);

    try {
      const token = await getToken();
      const updated = await apiRequest<CaseRecord>(`/v1/cases/${id}/assign-operator`, {
        method: "POST",
        token,
        body: {
          operatorUserId
        }
      });

      setCaseItem(updated);
      setSelectedOperatorId(operatorUserId);
      setAssignmentFeedback("Operador alocado com sucesso.");
    } catch (nextError) {
      const message = nextError instanceof ApiError ? nextError.message : "Falha ao alocar operador.";
      setAssignmentError(message);
    } finally {
      setAssigningOperator(false);
    }
  }

  function handleMovementFilesChange(event: ChangeEvent<HTMLInputElement>) {
    const selected = Array.from(event.target.files ?? []);
    event.target.value = "";

    if (selected.length === 0) {
      return;
    }

    const oversized = selected.find((file) => file.size > MAX_ATTACHMENT_SIZE_BYTES);
    if (oversized) {
      setMovementError(
        `O arquivo ${oversized.name} excede o limite de ${formatAttachmentSize(MAX_ATTACHMENT_SIZE_BYTES)}.`
      );
      return;
    }

    setMovementError(null);
    setMovementFiles((current) => {
      const known = new Set(current.map((file) => fingerprintFile(file)));
      const merged = [...current];

      for (const file of selected) {
        const fingerprint = fingerprintFile(file);
        if (known.has(fingerprint)) {
          continue;
        }

        known.add(fingerprint);
        merged.push(file);
      }

      return merged.slice(0, MAX_ATTACHMENTS_PER_CASE);
    });
  }

  function handleRemoveMovementFile(index: number) {
    setMovementFiles((current) => current.filter((_, itemIndex) => itemIndex !== index));
  }

  async function uploadMovementAttachments(
    caseId: string,
    movementId: string,
    files: File[],
    token: string
  ): Promise<CaseRecord> {
    const formData = new FormData();
    files.forEach((item) => formData.append("attachments", item));

    const response = await fetch(`${import.meta.env.VITE_API_URL}/v1/cases/${caseId}/movements/${movementId}/attachments`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`
      },
      body: formData
    });

    if (!response.ok) {
      throw new Error(await extractApiErrorMessage(response, "Falha ao enviar anexos da movimentação."));
    }

    const payload = (await response.json()) as ApiSuccessResponse<CaseRecord> | ApiErrorResponse;
    if (payload.status !== "ok") {
      const message = "message" in payload ? payload.message : "Falha ao enviar anexos da movimentação.";
      throw new Error(message);
    }

    return payload.result;
  }

  async function handleCreateMovement() {
    if (!id || !caseItem) {
      return;
    }

    const description = movementDescription.trim();
    if (description.length < 10) {
      setMovementError("Descreva a movimentação com pelo menos 10 caracteres.");
      return;
    }

    setMovementFeedback(null);
    setMovementError(null);
    setSavingMovement(true);

    try {
      const token = await getToken();
      const created = await apiRequest<CaseMovementCreateResult>(`/v1/cases/${id}/movements`, {
        method: "POST",
        token,
        body: {
          stage: movementStage,
          description,
          visibility: movementVisibility,
          status: movementStatus
        }
      });

      let updatedCase = created.caseItem;
      if (movementFiles.length > 0) {
        updatedCase = await uploadMovementAttachments(id, created.movement.id, movementFiles, token);
      }

      setCaseItem(updatedCase);
      setMovementStatus(updatedCase.status);
      setMovementDescription("");
      setMovementFiles([]);
      setMovementFeedback("Movimentação registrada com sucesso.");
    } catch (nextError) {
      const message = nextError instanceof Error ? nextError.message : "Falha ao registrar movimentação.";
      setMovementError(message);
    } finally {
      setSavingMovement(false);
    }
  }

  async function handleSubmitCaseReview(decision: "accepted" | "rejected") {
    if (!id || !caseItem) {
      return;
    }

    const reason = reviewReason.trim();
    if (reason.length < 10) {
      setReviewError("Descreva o parecer com pelo menos 10 caracteres.");
      return;
    }

    if (decision === "accepted" && requestClientData && clientDataRequest.trim().length < 5) {
      setReviewError("Informe quais dados o cliente deve enviar para continuar.");
      return;
    }

    const confirmation = window.confirm(
      decision === "rejected"
        ? "Tem certeza que deseja rejeitar este caso?"
        : "Tem certeza que deseja aceitar este caso?"
    );
    if (!confirmation) {
      return;
    }

    setReviewFeedback(null);
    setReviewError(null);
    setReviewingCase(true);

    try {
      const token = await getToken();
      const updated = await apiRequest<CaseRecord>(`/v1/cases/${id}/review`, {
        method: "POST",
        token,
        body: {
          decision,
          reason,
          requestClientData: decision === "accepted" ? requestClientData : false,
          clientDataRequest: decision === "accepted" && requestClientData ? clientDataRequest.trim() : null
        }
      });

      setCaseItem(updated);
      setMovementStatus(updated.status);
      setReviewFeedback(
        decision === "rejected"
          ? "Caso rejeitado e cliente notificado."
          : requestClientData
            ? "Caso aceito com solicitação de dados enviada ao cliente."
            : "Caso aceito e cliente orientado sobre pagamento inicial."
      );
    } catch (nextError) {
      const message = nextError instanceof ApiError ? nextError.message : "Falha ao salvar parecer do caso.";
      setReviewError(message);
    } finally {
      setReviewingCase(false);
    }
  }

  async function handleSaveServiceFee() {
    if (!id) {
      return;
    }

    const parsedAmount = parseMoneyInput(serviceFeeAmountInput);
    if (parsedAmount === null) {
      setServiceFeeError("Informe um valor válido para a taxa inicial.");
      return;
    }

    if (!serviceFeeDueDate) {
      setServiceFeeError("Informe a data de vencimento.");
      return;
    }

    const confirmation = window.confirm(
      "Confirma o cadastro da taxa inicial e a notificação do cliente para pagamento?"
    );
    if (!confirmation) {
      return;
    }

    setServiceFeeFeedback(null);
    setServiceFeeError(null);
    setSavingServiceFee(true);

    try {
      const token = await getToken();
      const updated = await apiRequest<CaseRecord>(`/v1/cases/${id}/service-fee`, {
        method: "POST",
        token,
        body: {
          amount: parsedAmount,
          dueDate: serviceFeeDueDate
        }
      });

      setCaseItem(updated);
      setMovementStatus(updated.status);
      setServiceFeeFeedback("Cobrança inicial registrada e cliente notificado.");
    } catch (nextError) {
      const message = nextError instanceof ApiError ? nextError.message : "Falha ao registrar cobrança inicial.";
      setServiceFeeError(message);
    } finally {
      setSavingServiceFee(false);
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
            <p className="helper-text">Código do caso: {caseItem.caseCode}</p>
            <p>Consulte os dados principais, o histórico de movimentações e os documentos anexados.</p>
            <div className="hero-cta">
              <button
                type="button"
                className="hero-primary"
                onClick={() => void handleExportPdf()}
                disabled={exportingPdf}
              >
                {exportingPdf ? "Gerando PDF..." : "Exportar petição inicial (PDF)"}
              </button>
              <span className={`status-badge status-badge--${caseItem.status}`}>{STATUS_LABEL[caseItem.status]}</span>
              <Link to="/messages" className="hero-secondary">
                Mensagens
              </Link>
              <Link to="/dashboard" className="hero-secondary">
                Voltar ao painel
              </Link>
            </div>
            {exportError && <p className="error-text">{exportError}</p>}
            {attachmentError && <p className="error-text">{attachmentError}</p>}
          </div>
        </div>
      </section>

      <div className="detail-grid detail-grid--operator">
        <article className="detail-card">
          <h2>Informações principais</h2>
          <div className="detail-list">
            <div className="detail-item">
              <span>Código</span>
              <strong>{caseItem.caseCode}</strong>
            </div>
            <div className="detail-item">
              <span>Status</span>
              <strong>{STATUS_LABEL[caseItem.status]}</strong>
            </div>
            <div className="detail-item">
              <span>Parecer inicial</span>
              <strong>{REVIEW_LABEL[caseItem.reviewDecision]}</strong>
            </div>
            <div className="detail-item">
              <span>Fase atual</span>
              <strong>{WORKFLOW_LABEL[caseItem.workflowStep]}</strong>
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
              <span>Operador alocado</span>
              <strong>{caseItem.assignedOperatorName ?? caseItem.assignedOperatorId ?? "Sem operador"}</strong>
            </div>
            <div className="detail-item">
              <span>Abertura</span>
              <strong>{formatDate(caseItem.createdAt)}</strong>
            </div>
            <div className="detail-item">
              <span>Última atualização</span>
              <strong>{formatDate(caseItem.updatedAt)}</strong>
            </div>
            {(caseItem.responsavelNome || caseItem.responsavelEmail) && (
              <div className="detail-item">
                <span>Conta responsável</span>
                <strong>{caseItem.responsavelNome ?? caseItem.responsavelEmail}</strong>
              </div>
            )}
          </div>

          {(caseItem.reviewReason || caseItem.clientDataRequest) && (
            <div className="info-box">
              <strong>Parecer do operador</strong>
              {caseItem.reviewReason && <span>Resumo: {caseItem.reviewReason}</span>}
              {caseItem.clientDataRequest && (
                <span>Dados solicitados ao cliente: {caseItem.clientDataRequest}</span>
              )}
            </div>
          )}

          {caseItem.serviceFee && (
            <div className="info-box">
              <strong>Taxa inicial de serviço</strong>
              <span>Valor: {formatCurrencyBr(caseItem.serviceFee.amount)}</span>
              <span>Vencimento: {formatIsoDateToBr(caseItem.serviceFee.dueDate)}</span>
              <span>Status: {SERVICE_FEE_STATUS_LABEL[caseItem.serviceFee.status]}</span>
              <span>Provedor: {caseItem.serviceFee.provider.toUpperCase()} (integração preparada)</span>
            </div>
          )}

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
                <span>Interesse em audiência: {caseItem.petitionInitial.hearingInterest ? "Sim" : "Não"}</span>
              </div>

              <div className="resumo-box">
                <strong>Fatos</strong>
                <p>{caseItem.petitionInitial.facts}</p>
              </div>

              {(caseItem.petitionInitial.timelineEvents ?? []).length > 0 && (
                <div className="resumo-box">
                  <strong>Cronologia dos eventos</strong>
                  <ul className="timeline-list">
                    {(caseItem.petitionInitial.timelineEvents ?? []).map((item, index) => (
                      <li key={`${caseItem.id}-evento-${index}`}>
                        {formatIsoDateToBr(item.eventDate)} - {item.description}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

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

              {(caseItem.petitionInitial.pretensions ?? []).length > 0 && (
                <div className="resumo-box">
                  <strong>Pretensões declaradas</strong>
                  <ul className="timeline-list">
                    {(caseItem.petitionInitial.pretensions ?? []).map((item, index) => (
                      <li key={`${caseItem.id}-pretensao-${index}`}>{describePretension(item)}</li>
                    ))}
                  </ul>
                </div>
              )}

              {caseItem.petitionInitial.evidence && (
                <div className="resumo-box">
                  <strong>Provas informadas</strong>
                  <p>{caseItem.petitionInitial.evidence}</p>
                </div>
              )}

              {(caseItem.petitionInitial.attachments ?? []).length > 0 && (
                <div className="resumo-box">
                  <strong>Anexos enviados na petição</strong>
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
                          onClick={() => void handleDownloadPetitionAttachment(item.id, item.originalName)}
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

          <div className="resumo-box">
            <strong>Evolução do caso</strong>
            {sortedMovements.length === 0 ? (
              <p>Nenhuma movimentação registrada até o momento.</p>
            ) : (
              <ul className="movement-list">
                {sortedMovements.map((movement) => (
                  <li key={movement.id}>
                    <div className="movement-list-head">
                      <span className="info-pill info-pill--neutral">{MOVEMENT_STAGE_LABEL[movement.stage]}</span>
                      <span className="movement-list-date">{formatDate(movement.createdAt)}</span>
                    </div>
                    <p>{movement.description}</p>
                    <div className="movement-list-meta">
                      <span>Status: {STATUS_LABEL[movement.statusAfter]}</span>
                      <span>Por: {movement.createdByName ?? movement.createdByUserId}</span>
                      {canAccessAdmin && (
                        <span>Visibilidade: {MOVEMENT_VISIBILITY_LABEL[movement.visibility]}</span>
                      )}
                    </div>
                    {(movement.attachments ?? []).length > 0 && (
                      <ul className="attachment-list movement-attachment-list">
                        {(movement.attachments ?? []).map((attachment) => {
                          const key = `${movement.id}:${attachment.id}`;
                          return (
                            <li key={attachment.id}>
                              <div>
                                <strong>{attachment.originalName}</strong>
                                <span>{formatAttachmentSize(attachment.sizeBytes)}</span>
                              </div>
                              <button
                                type="button"
                                className="attachment-remove"
                                onClick={() =>
                                  void handleDownloadMovementAttachment(
                                    movement.id,
                                    attachment.id,
                                    attachment.originalName
                                  )
                                }
                                disabled={downloadingAttachmentId === key}
                              >
                                {downloadingAttachmentId === key ? "Baixando..." : "Baixar"}
                              </button>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </article>

        <aside className="detail-card detail-card--aside">
          {canAccessAdmin ? (
            <>
              <h2>Ações do operador</h2>

              <div className="operator-action-box">
                <h3>Alocação de caso</h3>
                <p>Assinale o caso para você ou para outro operador.</p>
                <label>
                  Operador
                  <select
                    value={selectedOperatorId}
                    onChange={(event) => setSelectedOperatorId(event.target.value)}
                    disabled={assigningOperator || operators.length === 0}
                  >
                    {operators.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name ?? item.email ?? item.id}
                      </option>
                    ))}
                  </select>
                </label>

                <div className="operator-action-buttons">
                  <button
                    type="button"
                    className="secondary-button secondary-button--small"
                    disabled={assigningOperator || !selectedOperatorId}
                    onClick={() => void handleAssignOperator(selectedOperatorId)}
                  >
                    {assigningOperator ? "Salvando..." : "Alocar operador"}
                  </button>
                  <button
                    type="button"
                    className="ghost-button"
                    disabled={assigningOperator || !user?.uid}
                    onClick={() => user?.uid && void handleAssignOperator(user.uid)}
                  >
                    Assumir para mim
                  </button>
                </div>
                {assignmentFeedback && <p className="success-text">{assignmentFeedback}</p>}
                {assignmentError && <p className="error-text">{assignmentError}</p>}
              </div>

              <div className="operator-action-box">
                <h3>Parecer inicial</h3>
                <p>Avalie a viabilidade e decida se o caso será aceito ou rejeitado.</p>

                <label>
                  Justificativa do parecer
                  <textarea
                    rows={4}
                    value={reviewReason}
                    onChange={(event) => setReviewReason(event.target.value)}
                    placeholder="Descreva de forma objetiva o fundamento do aceite ou rejeição."
                    disabled={reviewingCase}
                  />
                </label>

                <label className="checkbox-inline">
                  <input
                    type="checkbox"
                    checked={requestClientData}
                    onChange={(event) => setRequestClientData(event.target.checked)}
                    disabled={reviewingCase}
                  />
                  Solicitar dados adicionais ao cliente antes da cobrança
                </label>

                {requestClientData && (
                  <label>
                    Dados necessários do cliente
                    <textarea
                      rows={3}
                      value={clientDataRequest}
                      onChange={(event) => setClientDataRequest(event.target.value)}
                      placeholder="Ex: comprovante de residência atualizado, prints do atendimento, nota fiscal."
                      disabled={reviewingCase}
                    />
                  </label>
                )}

                <div className="operator-action-buttons">
                  <button
                    type="button"
                    className="secondary-button secondary-button--small"
                    onClick={() => void handleSubmitCaseReview("accepted")}
                    disabled={reviewingCase}
                  >
                    {reviewingCase ? "Salvando..." : "Aceitar caso"}
                  </button>
                  <button
                    type="button"
                    className="danger-button danger-button--small"
                    onClick={() => void handleSubmitCaseReview("rejected")}
                    disabled={reviewingCase}
                  >
                    Rejeitar caso
                  </button>
                </div>

                {reviewFeedback && <p className="success-text">{reviewFeedback}</p>}
                {reviewError && <p className="error-text">{reviewError}</p>}
              </div>

              <div className="operator-action-box">
                <h3>Cobrança inicial (Asaas)</h3>
                <p>
                  Defina valor e vencimento da taxa inicial. A integração com Asaas fica pronta para conexão nesta
                  semana.
                </p>

                <label>
                  Valor da taxa
                  <input
                    type="text"
                    value={serviceFeeAmountInput}
                    onChange={(event) => setServiceFeeAmountInput(event.target.value)}
                    placeholder="Ex: 150,00"
                    disabled={savingServiceFee}
                  />
                </label>

                <label>
                  Vencimento
                  <input
                    type="date"
                    value={serviceFeeDueDate}
                    onChange={(event) => setServiceFeeDueDate(event.target.value)}
                    disabled={savingServiceFee}
                  />
                </label>

                <button
                  type="button"
                  className="hero-primary"
                  onClick={() => void handleSaveServiceFee()}
                  disabled={savingServiceFee}
                >
                  {savingServiceFee ? "Salvando cobrança..." : "Registrar cobrança inicial"}
                </button>

                {serviceFeeFeedback && <p className="success-text">{serviceFeeFeedback}</p>}
                {serviceFeeError && <p className="error-text">{serviceFeeError}</p>}
              </div>

              <div className="operator-action-box">
                <h3>Nova movimentação</h3>
                <p>Registre a evolução do caso e anexe documentos da etapa.</p>

                <label>
                  Etapa
                  <select
                    value={movementStage}
                    onChange={(event) => setMovementStage(event.target.value as CaseMovementRecord["stage"])}
                    disabled={savingMovement}
                  >
                    <option value="triagem">Triagem</option>
                    <option value="conciliacao">Conciliação</option>
                    <option value="peticao">Petição</option>
                    <option value="protocolo">Protocolo</option>
                    <option value="andamento">Andamento</option>
                    <option value="solucao">Solução</option>
                    <option value="outro">Outro</option>
                  </select>
                </label>

                <label>
                  Visibilidade
                  <select
                    value={movementVisibility}
                    onChange={(event) =>
                      setMovementVisibility(event.target.value as CaseMovementRecord["visibility"])
                    }
                    disabled={savingMovement}
                  >
                    <option value="public">Pública (cliente visualiza)</option>
                    <option value="internal">Interna (somente equipe)</option>
                  </select>
                </label>

                <label>
                  Status do caso
                  <select
                    value={movementStatus}
                    onChange={(event) => setMovementStatus(event.target.value as CaseRecord["status"])}
                    disabled={savingMovement}
                  >
                    <option value="recebido">Recebido</option>
                    <option value="em_analise">Em análise</option>
                    <option value="encerrado">Encerrado</option>
                  </select>
                </label>

                <label>
                  Descrição
                  <textarea
                    rows={6}
                    value={movementDescription}
                    onChange={(event) => setMovementDescription(event.target.value)}
                    placeholder="Descreva o andamento, proposta, resposta da parte reclamada e próximos passos."
                    disabled={savingMovement}
                  />
                </label>

                <label>
                  Anexos da movimentação
                  <input
                    type="file"
                    accept={ATTACHMENT_ACCEPT}
                    multiple
                    onChange={handleMovementFilesChange}
                    disabled={savingMovement}
                  />
                </label>
                <p className="field-help">
                  Opcional: até {MAX_ATTACHMENTS_PER_CASE} arquivos de até {formatAttachmentSize(MAX_ATTACHMENT_SIZE_BYTES)}.
                </p>

                {movementFiles.length > 0 && (
                  <ul className="attachment-list movement-attachment-list">
                    {movementFiles.map((file, index) => (
                      <li key={fingerprintFile(file)}>
                        <div>
                          <strong>{file.name}</strong>
                          <span>{formatAttachmentSize(file.size)}</span>
                        </div>
                        <button
                          type="button"
                          className="attachment-remove"
                          onClick={() => handleRemoveMovementFile(index)}
                          disabled={savingMovement}
                        >
                          Remover
                        </button>
                      </li>
                    ))}
                  </ul>
                )}

                <button
                  type="button"
                  className="hero-primary"
                  onClick={() => void handleCreateMovement()}
                  disabled={savingMovement}
                >
                  {savingMovement ? "Salvando movimentação..." : "Registrar movimentação"}
                </button>

                {movementFeedback && <p className="success-text">{movementFeedback}</p>}
                {movementError && <p className="error-text">{movementError}</p>}
              </div>
            </>
          ) : (
            <>
              <h2>Notificações do caso</h2>
              <ul className="timeline-list">
                <li>Acompanhe nesta página cada atualização pública registrada pelo operador.</li>
                <li>As etapas de conciliação e proposta de solução serão exibidas no histórico.</li>
                <li>Novos documentos disponibilizados no caso podem ser baixados diretamente no histórico.</li>
                <li>Use a área de mensagens no menu lateral para enviar respostas ao operador.</li>
                <li>Você também recebe e-mail quando houver nova movimentação pública.</li>
              </ul>
            </>
          )}
        </aside>
      </div>
    </section>
  );
}
