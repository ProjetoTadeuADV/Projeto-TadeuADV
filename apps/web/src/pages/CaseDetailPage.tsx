import { ChangeEvent, useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { ApiError, apiRequest } from "../lib/api";
import type {
  ApiErrorResponse,
  ApiSuccessResponse,
  CaseMovementCreateResult,
  CaseMovementRecord,
  CaseRecord,
  PetitionAttachment
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

const CLOSE_REQUEST_STATUS_LABEL: Record<CaseRecord["closeRequest"]["status"], string> = {
  none: "Sem solicitação",
  pending: "Solicitação pendente",
  approved: "Solicitação aprovada",
  denied: "Solicitação recusada"
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

type OperatorActionStep = 1 | 2 | 3;
type CaseDetailTab = "info" | "attachments" | "evolution";
type CaseAttachmentItem = {
  key: string;
  source: "petition" | "message" | "movement";
  attachment: PetitionAttachment;
  meta: string;
  sortDate: string;
  petitionPriority: number;
  messageId?: string;
  movementId?: string;
};

const OPERATOR_ACTION_STEPS: Array<{
  id: OperatorActionStep;
  title: string;
}> = [
  {
    id: 1,
    title: "Parecer Inicial"
  },
  {
    id: 2,
    title: "Cobrança Inicial"
  },
  {
    id: 3,
    title: "Nova Movimentação"
  }
];

const CASE_DETAIL_TABS: Array<{ id: CaseDetailTab; label: string }> = [
  { id: "info", label: "Informações Principais" },
  { id: "attachments", label: "Anexos" },
  { id: "evolution", label: "Evolução do Caso" }
];

function resolveOperatorStepFromWorkflow(workflowStep: CaseRecord["workflowStep"]): OperatorActionStep {
  if (workflowStep === "awaiting_initial_fee") {
    return 2;
  }

  if (workflowStep === "in_progress") {
    return 3;
  }

  return 1;
}

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

function MessageIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path
        d="M6.5 7.2h11a2.3 2.3 0 0 1 2.3 2.3v6.2a2.3 2.3 0 0 1-2.3 2.3h-7l-4.3 3v-3h-.7a2.3 2.3 0 0 1-2.3-2.3V9.5a2.3 2.3 0 0 1 2.3-2.3z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ArrowLeftIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path
        d="M14.8 5.8L8.6 12l6.2 6.2"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function CaseDetailPage() {
  const { getToken, canAccessAdmin, isMasterUser, isOperatorUser, user } = useAuth();
  const { id } = useParams<{ id: string }>();

  const [caseItem, setCaseItem] = useState<CaseRecord | null>(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [generatingPetitionAttachment, setGeneratingPetitionAttachment] = useState(false);
  const [petitionAttachmentError, setPetitionAttachmentError] = useState<string | null>(null);
  const [petitionAttachmentFeedback, setPetitionAttachmentFeedback] = useState<string | null>(null);

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

  const [isOperatorSidebarOpen, setIsOperatorSidebarOpen] = useState(false);
  const [operatorStep, setOperatorStep] = useState<OperatorActionStep>(1);
  const [activeDetailTab, setActiveDetailTab] = useState<CaseDetailTab>("info");
  const [closingCase, setClosingCase] = useState(false);
  const [closeFeedback, setCloseFeedback] = useState<string | null>(null);
  const [closeError, setCloseError] = useState<string | null>(null);
  const [closeRequestReasonInput, setCloseRequestReasonInput] = useState("");
  const [requestingClose, setRequestingClose] = useState(false);
  const [closeRequestFeedback, setCloseRequestFeedback] = useState<string | null>(null);
  const [closeRequestError, setCloseRequestError] = useState<string | null>(null);
  const [closeRequestDecisionReason, setCloseRequestDecisionReason] = useState("");
  const [decidingCloseRequest, setDecidingCloseRequest] = useState(false);
  const [closeRequestDecisionFeedback, setCloseRequestDecisionFeedback] = useState<string | null>(null);
  const [closeRequestDecisionError, setCloseRequestDecisionError] = useState<string | null>(null);

  const isAssignedOperator = Boolean(user?.uid && caseItem?.assignedOperatorId === user.uid);
  const isRejectedOrClosedCase = Boolean(
    caseItem &&
      (caseItem.reviewDecision === "rejected" ||
        caseItem.workflowStep === "closed" ||
        caseItem.status === "encerrado")
  );
  const canManageOperatorActions = Boolean(
    caseItem && canAccessAdmin && !isRejectedOrClosedCase && (isMasterUser || (isOperatorUser && isAssignedOperator))
  );
  const closeRequest = caseItem?.closeRequest;
  const hasPendingCloseRequest = closeRequest?.status === "pending";
  const canClientRequestClose = Boolean(
    caseItem &&
      !canAccessAdmin &&
      !isRejectedOrClosedCase &&
      closeRequest &&
      closeRequest.status !== "pending"
  );

  const sortedMovements = useMemo(() => {
    if (!caseItem?.movements) {
      return [];
    }

    return [...caseItem.movements].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  }, [caseItem?.movements]);

  const petitionAttachments = caseItem?.petitionInitial?.attachments ?? [];
  const allCaseAttachments = useMemo<CaseAttachmentItem[]>(() => {
    const petitionItems: CaseAttachmentItem[] = petitionAttachments.map((attachment) => {
      const isGeneratedPetition = attachment.originalName.toLowerCase().startsWith("peticao-inicial-");
      return {
        key: `petition:${attachment.id}`,
        source: "petition",
        attachment,
        meta: isGeneratedPetition ? "Petição inicial (PDF gerado)" : "Anexo da petição",
        sortDate: attachment.uploadedAt,
        petitionPriority: isGeneratedPetition ? 0 : 1
      };
    });

    const messageItems: CaseAttachmentItem[] = (caseItem?.messages ?? []).flatMap((message) =>
      (message.attachments ?? []).map((attachment) => ({
        key: `message:${message.id}:${attachment.id}`,
        source: "message",
        attachment,
        messageId: message.id,
        meta: `Mensagem · ${message.senderName ?? message.senderRole} · ${formatDate(message.createdAt)}`,
        sortDate: attachment.uploadedAt || message.createdAt,
        petitionPriority: 2
      }))
    );

    const movementItems: CaseAttachmentItem[] = (sortedMovements ?? []).flatMap((movement) =>
      (movement.attachments ?? []).map((attachment) => ({
        key: `movement:${movement.id}:${attachment.id}`,
        source: "movement",
        attachment,
        movementId: movement.id,
        meta: `Movimentação · ${MOVEMENT_STAGE_LABEL[movement.stage]} · ${formatDate(movement.createdAt)}`,
        sortDate: attachment.uploadedAt || movement.createdAt,
        petitionPriority: 2
      }))
    );

    const merged = [...petitionItems, ...messageItems, ...movementItems];
    merged.sort((a, b) => {
      if (a.petitionPriority !== b.petitionPriority) {
        return a.petitionPriority - b.petitionPriority;
      }

      return a.sortDate < b.sortDate ? 1 : -1;
    });

    return merged;
  }, [caseItem?.messages, petitionAttachments, sortedMovements]);

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
        const caseData = await apiRequest<CaseRecord>(`/v1/cases/${id}`, { token });
        setCaseItem(caseData);
        setMovementStatus(caseData.status);
      } catch (nextError) {
        const message = nextError instanceof ApiError ? nextError.message : "Falha ao carregar o caso.";
        setError(message);
      } finally {
        setLoading(false);
      }
    }

    void loadCase();
  }, [getToken, id]);

  useEffect(() => {
    if (!caseItem?.serviceFee) {
      return;
    }

    setServiceFeeAmountInput(String(caseItem.serviceFee.amount));
    setServiceFeeDueDate(caseItem.serviceFee.dueDate);
  }, [caseItem?.serviceFee]);

  useEffect(() => {
    if (!isOperatorSidebarOpen) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsOperatorSidebarOpen(false);
      }
    };

    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOperatorSidebarOpen]);

  useEffect(() => {
    if (!canManageOperatorActions && isOperatorSidebarOpen) {
      setIsOperatorSidebarOpen(false);
    }
  }, [canManageOperatorActions, isOperatorSidebarOpen]);

  function openOperatorSidebar() {
    if (caseItem?.closeRequest?.status === "pending") {
      setOperatorStep(1);
    } else {
      setOperatorStep(caseItem ? resolveOperatorStepFromWorkflow(caseItem.workflowStep) : 1);
    }
    setIsOperatorSidebarOpen(true);
  }

  function closeOperatorSidebar() {
    setIsOperatorSidebarOpen(false);
  }

  function goToNextOperatorStep() {
    setOperatorStep((current) => {
      if (current === 1) {
        return 2;
      }

      if (current === 2) {
        return 3;
      }

      return 3;
    });
  }

  function goToPreviousOperatorStep() {
    setOperatorStep((current) => {
      if (current === 3) {
        return 2;
      }

      if (current === 2) {
        return 1;
      }

      return 1;
    });
  }

  async function handleGeneratePetitionAttachment() {
    if (!id) {
      setPetitionAttachmentError("Caso inválido para gerar a petição.");
      return;
    }

    setPetitionAttachmentError(null);
    setPetitionAttachmentFeedback(null);
    setGeneratingPetitionAttachment(true);

    try {
      const token = await getToken();
      const updated = await apiRequest<CaseRecord>(`/v1/cases/${id}/peticao-inicial/attachment`, {
        method: "POST",
        token
      });

      setCaseItem(updated);
      setActiveDetailTab("attachments");
      setPetitionAttachmentFeedback("Petição inicial gerada em PDF e anexada ao caso.");
    } catch (nextError) {
      const message = nextError instanceof ApiError ? nextError.message : "Falha ao gerar anexo da petição inicial.";
      setPetitionAttachmentError(message);
    } finally {
      setGeneratingPetitionAttachment(false);
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

  async function handleDownloadMessageAttachment(
    messageId: string,
    attachmentId: string,
    fallbackName: string
  ) {
    if (!id) {
      return;
    }

    const key = `message:${messageId}:${attachmentId}`;
    setAttachmentError(null);
    setDownloadingAttachmentId(key);

    try {
      await downloadFile(`/v1/cases/${id}/messages/${messageId}/attachments/${attachmentId}`, fallbackName);
    } catch (nextError) {
      const message = nextError instanceof Error ? nextError.message : "Falha ao baixar anexo.";
      setAttachmentError(message);
    } finally {
      setDownloadingAttachmentId(null);
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
      setOperatorStep(resolveOperatorStepFromWorkflow(updatedCase.workflowStep));
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
      setOperatorStep(resolveOperatorStepFromWorkflow(updated.workflowStep));
      setReviewFeedback(
        decision === "rejected"
          ? "Caso rejeitado e cliente notificado."
          : requestClientData
            ? "Caso aceito com solicitação de dados enviada ao cliente."
            : "Caso aceito e cliente orientado sobre pagamento inicial."
      );

      if (decision === "rejected") {
        setIsOperatorSidebarOpen(false);
      }
    } catch (nextError) {
      const message = nextError instanceof ApiError ? nextError.message : "Falha ao salvar parecer do caso.";
      setReviewError(message);
    } finally {
      setReviewingCase(false);
    }
  }

  async function handleCloseCase() {
    if (!id || !caseItem) {
      return;
    }

    const firstConfirmation = window.confirm("Tem certeza que deseja encerrar este caso?");
    if (!firstConfirmation) {
      return;
    }

    const secondConfirmation = window.confirm(
      "Confirmacao final: este caso sera movido para Casos Encerrados. Deseja continuar?"
    );
    if (!secondConfirmation) {
      return;
    }

    setCloseFeedback(null);
    setCloseError(null);
    setClosingCase(true);

    try {
      const token = await getToken();
      const updated = await apiRequest<CaseRecord>(`/v1/cases/${id}/close`, {
        method: "POST",
        token
      });

      setCaseItem(updated);
      setMovementStatus(updated.status);
      setOperatorStep(resolveOperatorStepFromWorkflow(updated.workflowStep));
      setIsOperatorSidebarOpen(false);
      setCloseFeedback("Caso encerrado com sucesso.");
    } catch (nextError) {
      const message = nextError instanceof ApiError ? nextError.message : "Falha ao encerrar o caso.";
      setCloseError(message);
    } finally {
      setClosingCase(false);
    }
  }

  async function handleRequestCloseCase() {
    if (!id || !caseItem) {
      return;
    }

    const reason = closeRequestReasonInput.trim();
    if (reason.length < 10) {
      setCloseRequestError("Informe uma justificativa com pelo menos 10 caracteres.");
      return;
    }

    const confirmation = window.confirm(
      "Confirma o envio da solicitação de encerramento? O operador responsável fará a decisão final."
    );
    if (!confirmation) {
      return;
    }

    setCloseRequestError(null);
    setCloseRequestFeedback(null);
    setRequestingClose(true);

    try {
      const token = await getToken();
      const updated = await apiRequest<CaseRecord>(`/v1/cases/${id}/close-request`, {
        method: "POST",
        token,
        body: {
          reason
        }
      });

      setCaseItem(updated);
      setCloseRequestReasonInput("");
      setCloseRequestFeedback("Solicitação de encerramento enviada para o operador responsável.");
    } catch (nextError) {
      const message = nextError instanceof ApiError ? nextError.message : "Falha ao solicitar encerramento.";
      setCloseRequestError(message);
    } finally {
      setRequestingClose(false);
    }
  }

  async function handleCloseRequestDecision(decision: "approved" | "denied") {
    if (!id || !caseItem || !hasPendingCloseRequest) {
      return;
    }

    const rejectionReason = closeRequestDecisionReason.trim();
    if (decision === "denied" && rejectionReason.length < 10) {
      setCloseRequestDecisionError("Informe o motivo da recusa com pelo menos 10 caracteres.");
      return;
    }

    const confirmationText =
      decision === "approved"
        ? "Confirma a aprovação do encerramento solicitado pelo cliente?"
        : "Confirma a recusa do encerramento solicitado pelo cliente?";
    const confirmed = window.confirm(confirmationText);
    if (!confirmed) {
      return;
    }

    setCloseRequestDecisionError(null);
    setCloseRequestDecisionFeedback(null);
    setDecidingCloseRequest(true);

    try {
      const token = await getToken();
      const updated = await apiRequest<CaseRecord>(`/v1/cases/${id}/close-request/decision`, {
        method: "POST",
        token,
        body: {
          decision,
          reason: decision === "denied" ? rejectionReason : null
        }
      });

      setCaseItem(updated);
      setMovementStatus(updated.status);
      setOperatorStep(resolveOperatorStepFromWorkflow(updated.workflowStep));
      if (decision === "approved") {
        setIsOperatorSidebarOpen(false);
      } else {
        setCloseRequestDecisionReason("");
      }
      setCloseRequestDecisionFeedback(
        decision === "approved"
          ? "Encerramento aprovado e cliente notificado."
          : "Solicitação recusada e cliente notificado."
      );
    } catch (nextError) {
      const message =
        nextError instanceof ApiError ? nextError.message : "Falha ao registrar decisão da solicitação.";
      setCloseRequestDecisionError(message);
    } finally {
      setDecidingCloseRequest(false);
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
      setOperatorStep(resolveOperatorStepFromWorkflow(updated.workflowStep));
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

  const operatorCurrentStepTitle =
    OPERATOR_ACTION_STEPS.find((step) => step.id === operatorStep)?.title ?? "Etapa";

  return (
    <section className="page-stack">
      <section className="workspace-hero workspace-hero--compact workspace-hero--simple">
        <div className="workspace-hero-grid">
          <div>
            <div className="case-detail-kicker-row">
              <div className="case-detail-kicker-left">
                <Link to="/dashboard" className="case-detail-back-link" aria-label="Voltar ao painel">
                  <ArrowLeftIcon />
                </Link>
                <p className="hero-kicker">Detalhe do caso</p>
              </div>
              <span className={`status-badge status-badge--${caseItem.status}`}>{STATUS_LABEL[caseItem.status]}</span>
            </div>

            <div className="case-detail-title-row">
              <h1>{caseItem.varaNome}</h1>
              <Link
                to={`/messages?caseId=${caseItem.id}`}
                className="case-detail-message-link"
                aria-label="Abrir mensagens do caso"
              >
                <MessageIcon />
              </Link>
            </div>
            <p className="helper-text">Código do caso: {caseItem.caseCode}</p>
            <div className="hero-cta">
              <button
                type="button"
                className="hero-primary"
                onClick={() => void handleGeneratePetitionAttachment()}
                disabled={generatingPetitionAttachment}
              >
                {generatingPetitionAttachment ? "Gerando..." : "Gerar petição e enviar para Anexos"}
              </button>
            </div>
            {petitionAttachmentError && <p className="error-text">{petitionAttachmentError}</p>}
            {petitionAttachmentFeedback && <p className="success-text">{petitionAttachmentFeedback}</p>}
            {attachmentError && <p className="error-text">{attachmentError}</p>}
            {closeError && <p className="error-text">{closeError}</p>}
            {closeFeedback && <p className="success-text">{closeFeedback}</p>}
            {closeRequestError && <p className="error-text">{closeRequestError}</p>}
            {closeRequestFeedback && <p className="success-text">{closeRequestFeedback}</p>}
            {canClientRequestClose && (
              <div className="resumo-box client-close-request-box">
                <strong>Solicitar encerramento do caso</strong>
                <p>Você pode solicitar o encerramento a qualquer momento. O operador fará a confirmação final.</p>
                <label>
                  Justificativa obrigatória
                  <textarea
                    rows={3}
                    value={closeRequestReasonInput}
                    onChange={(event) => setCloseRequestReasonInput(event.target.value)}
                    placeholder="Explique por que deseja encerrar o caso."
                    disabled={requestingClose}
                  />
                </label>
                <button
                  type="button"
                  className="danger-button danger-button--small"
                  onClick={() => void handleRequestCloseCase()}
                  disabled={requestingClose}
                >
                  {requestingClose ? "Enviando..." : "Solicitar encerramento"}
                </button>
              </div>
            )}
            {!canAccessAdmin && closeRequest?.status === "pending" && (
              <p className="helper-text">Solicitação de encerramento pendente de confirmação do operador.</p>
            )}
          </div>
        </div>
      </section>

      <div className="detail-grid detail-grid--single">
        <article className="detail-card">
          <nav className="case-detail-tabs" aria-label="Navegação do caso">
            {CASE_DETAIL_TABS.map((tab) => (
              <button
                key={tab.id}
                type="button"
                className={activeDetailTab === tab.id ? "case-detail-tab case-detail-tab--active" : "case-detail-tab"}
                onClick={() => setActiveDetailTab(tab.id)}
              >
                {tab.label}
              </button>
            ))}
          </nav>

          {activeDetailTab === "info" && (
            <>
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
                  <span>Solicitação de encerramento</span>
                  <strong>{CLOSE_REQUEST_STATUS_LABEL[caseItem.closeRequest.status]}</strong>
                </div>
                <div className="detail-item">
                  <span>Cliente</span>
                  <strong>
                    {caseItem.responsavelNome ?? caseItem.clienteNome ?? caseItem.responsavelEmail ?? "Não informado"}
                  </strong>
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

              {(caseItem.closeRequest.reason || caseItem.closeRequest.decisionReason) && (
                <div className="info-box">
                  <strong>Histórico da solicitação de encerramento</strong>
                  {caseItem.closeRequest.reason && (
                    <span>Pedido do cliente: {caseItem.closeRequest.reason}</span>
                  )}
                  {caseItem.closeRequest.decisionReason && (
                    <span>Motivo da decisão: {caseItem.closeRequest.decisionReason}</span>
                  )}
                </div>
              )}

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
                </>
              )}
            </>
          )}

          {activeDetailTab === "attachments" && (
            <>
              <h2>Anexos</h2>
              {allCaseAttachments.length === 0 ? (
                <p className="helper-text">Nenhum anexo enviado até o momento.</p>
              ) : (
                <div className="page-stack page-stack--tight">
                  <div className="resumo-box">
                    <strong>Todos os anexos do caso</strong>
                    <ul className="attachment-list">
                      {allCaseAttachments.map((item) => {
                        const key =
                          item.source === "petition"
                            ? item.attachment.id
                            : item.source === "message"
                              ? `message:${item.messageId}:${item.attachment.id}`
                              : `${item.movementId}:${item.attachment.id}`;

                        return (
                          <li key={item.key}>
                            <div>
                              <strong>{item.attachment.originalName}</strong>
                              <span>
                                {formatAttachmentSize(item.attachment.sizeBytes)} · {item.meta}
                              </span>
                            </div>
                            <button
                              type="button"
                              className="attachment-remove"
                              onClick={() => {
                                if (item.source === "petition") {
                                  void handleDownloadPetitionAttachment(
                                    item.attachment.id,
                                    item.attachment.originalName
                                  );
                                  return;
                                }

                                if (item.source === "message" && item.messageId) {
                                  void handleDownloadMessageAttachment(
                                    item.messageId,
                                    item.attachment.id,
                                    item.attachment.originalName
                                  );
                                  return;
                                }

                                if (item.source === "movement" && item.movementId) {
                                  void handleDownloadMovementAttachment(
                                    item.movementId,
                                    item.attachment.id,
                                    item.attachment.originalName
                                  );
                                }
                              }}
                              disabled={downloadingAttachmentId === key}
                            >
                              {downloadingAttachmentId === key ? "Baixando..." : "Baixar"}
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                </div>
              )}
            </>
          )}

          {activeDetailTab === "evolution" && (
            <>
              <h2>Evolução do caso</h2>
              <div className="resumo-box">
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
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </>
          )}
        </article>
      </div>

      {canAccessAdmin && !canManageOperatorActions && (
        <section className="workspace-panel">
          {isRejectedOrClosedCase ? (
            <p className="helper-text">
              Este caso está rejeitado/encerrado e não está disponível para novas edições operacionais no momento.
            </p>
          ) : (
            <p className="helper-text">
              As ações do operador ficam disponíveis apenas para o responsável alocado neste caso.
            </p>
          )}
        </section>
      )}

      {canManageOperatorActions && (
        <>
          {!isOperatorSidebarOpen && (
            <div className="operator-action-dock">
              <button type="button" className="operator-progress-trigger" onClick={openOperatorSidebar}>
                Avançar no Caso
              </button>
              <button
                type="button"
                className="danger-button operator-close-trigger"
                onClick={() => void handleCloseCase()}
                disabled={closingCase}
              >
                {closingCase ? "Encerrando..." : "Encerrar Caso"}
              </button>
            </div>
          )}

          {isOperatorSidebarOpen && (
            <button
              type="button"
              className="operator-sidebar-overlay"
              aria-label="Fechar painel de ações do operador"
              onClick={closeOperatorSidebar}
            />
          )}

          <aside className={isOperatorSidebarOpen ? "operator-sidebar operator-sidebar--open" : "operator-sidebar"}>
            <div className="operator-sidebar-header">
              <div>
                <p className="hero-kicker">Ações do operador</p>
                <h2>{operatorCurrentStepTitle}</h2>
                <p className="operator-sidebar-progress">Etapa {operatorStep}/3</p>
              </div>
              <button
                type="button"
                className="operator-sidebar-close"
                aria-label="Fechar painel de ações"
                onClick={closeOperatorSidebar}
              >
                {"\u00D7"}
              </button>
            </div>

            <div className="operator-sidebar-content">
              {operatorStep === 1 && (
                <div className="operator-action-box">
                  <h3>Parecer inicial</h3>
                  <p>Avalie a viabilidade e decida se o caso será aceito ou rejeitado.</p>

                  {hasPendingCloseRequest && (
                    <div className="info-box operator-close-request-box">
                      <strong>Solicitação de encerramento pendente</strong>
                      <span>Justificativa do cliente: {caseItem.closeRequest.reason}</span>
                      {caseItem.closeRequest.requestedAt && (
                        <span>Solicitado em: {formatDate(caseItem.closeRequest.requestedAt)}</span>
                      )}
                      <label>
                        Motivo da recusa (obrigatório ao recusar)
                        <textarea
                          rows={3}
                          value={closeRequestDecisionReason}
                          onChange={(event) => setCloseRequestDecisionReason(event.target.value)}
                          placeholder="Explique o motivo caso decida recusar o pedido."
                          disabled={decidingCloseRequest}
                        />
                      </label>
                      <div className="operator-action-buttons">
                        <button
                          type="button"
                          className="secondary-button secondary-button--small"
                          onClick={() => void handleCloseRequestDecision("approved")}
                          disabled={decidingCloseRequest}
                        >
                          {decidingCloseRequest ? "Salvando..." : "Aprovar encerramento"}
                        </button>
                        <button
                          type="button"
                          className="danger-button danger-button--small"
                          onClick={() => void handleCloseRequestDecision("denied")}
                          disabled={decidingCloseRequest}
                        >
                          Recusar encerramento
                        </button>
                      </div>
                      {closeRequestDecisionFeedback && <p className="success-text">{closeRequestDecisionFeedback}</p>}
                      {closeRequestDecisionError && <p className="error-text">{closeRequestDecisionError}</p>}
                    </div>
                  )}

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

                  <div className="operator-step-nav">
                    <button type="button" className="hero-primary" onClick={goToNextOperatorStep}>
                      Avançar (1/3)
                    </button>
                  </div>
                </div>
              )}

              {operatorStep === 2 && (
                <div className="operator-action-box">
                  <h3>Cobrança inicial (Asaas)</h3>
                  <p>Defina valor e vencimento da taxa inicial para liberar o andamento do caso.</p>

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

                  <div className="operator-step-nav">
                    <button type="button" className="hero-secondary" onClick={goToPreviousOperatorStep}>
                      Voltar para Parecer Inicial
                    </button>
                    <button type="button" className="hero-primary" onClick={goToNextOperatorStep}>
                      Avançar (2/3)
                    </button>
                  </div>
                </div>
              )}

              {operatorStep === 3 && (
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
                      onChange={(event) => setMovementVisibility(event.target.value as CaseMovementRecord["visibility"])}
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
                    Opcional: até {MAX_ATTACHMENTS_PER_CASE} arquivos de até{" "}
                    {formatAttachmentSize(MAX_ATTACHMENT_SIZE_BYTES)}.
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

                  <div className="operator-step-nav">
                    <button type="button" className="hero-secondary" onClick={goToPreviousOperatorStep}>
                      Voltar para Cobrança Inicial
                    </button>
                    <button type="button" className="hero-primary" onClick={closeOperatorSidebar}>
                      Concluir (3/3)
                    </button>
                  </div>
                </div>
              )}
            </div>
          </aside>
        </>
      )}
    </section>
  );
}
