import { type CSSProperties, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { ApiError, apiRequest } from "../lib/api";
import type { AccountProfile, AdminOperatorOption, CaseMovementRecord, CaseRecord } from "../types";

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
type SaleProposalPopupNotice = {
  caseId: string;
  caseTitle: string;
  amount: number;
  marker: string;
};
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

const CASE_TIMELINE_STEPS = [
  {
    key: "ajuizamento",
    label: "Ajuizamento",
    symbol: "AJ",
    description: "Protocolo inicial da ação para abertura formal do processo."
  },
  {
    key: "audiencia-conciliacao",
    label: "Audiência de conciliação",
    symbol: "AC",
    description: "Tentativa de acordo entre as partes para solução amigável."
  },
  {
    key: "sentenca",
    label: "Sentença",
    symbol: "ST",
    description: "Decisão judicial proferida sobre o mérito do caso."
  },
  {
    key: "acordo",
    label: "Acordo",
    symbol: "AO",
    description: "Composição firmada entre as partes para encerramento da disputa."
  },
  {
    key: "transito-julgado",
    label: "Trânsito em julgado",
    symbol: "TJ",
    description: "Momento em que não cabem mais recursos contra a decisão."
  },
  {
    key: "receber-acao",
    label: "Receber a ação",
    symbol: "RX",
    description: "Fase de liquidação/recebimento do resultado financeiro da ação."
  }
] as const;

type CaseTimelineStageKey = (typeof CASE_TIMELINE_STEPS)[number]["key"];

function formatDate(dateIso: string): string {
  return new Date(dateIso).toLocaleString("pt-BR");
}

function formatCurrencyBr(value: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL"
  }).format(value);
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

function resolveSuggestedSaleAmount(item: CaseRecord): number | null {
  const claimValue = item.petitionInitial?.claimValue;
  if (typeof claimValue !== "number" || !Number.isFinite(claimValue) || claimValue <= 0) {
    return null;
  }

  return Number((claimValue * 0.8).toFixed(2));
}

function buildSaleProposalNoticeStorageKey(userId: string | undefined): string {
  return `dashboard.saleProposalNotice.${userId ?? "anonymous"}`;
}

function parseSaleProposalNoticeStorage(value: string | null): Record<string, string> {
  if (!value) {
    return {};
  }

  try {
    const parsed = JSON.parse(value) as unknown;
    if (!parsed || typeof parsed !== "object") {
      return {};
    }

    const result: Record<string, string> = {};
    for (const [entryKey, entryValue] of Object.entries(parsed)) {
      if (typeof entryKey === "string" && typeof entryValue === "string") {
        result[entryKey] = entryValue;
      }
    }
    return result;
  } catch {
    return {};
  }
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

function getTimelineStepIndex(stage: string | null | undefined): number {
  if (!stage) {
    return -1;
  }

  return CASE_TIMELINE_STEPS.findIndex((item) => item.key === stage);
}

function resolveTimelineStage(item: CaseRecord): CaseTimelineStageKey {
  const manualStage = item.procedureProgress?.timeline?.currentStage;
  if (manualStage && getTimelineStepIndex(manualStage) >= 0) {
    return manualStage as CaseTimelineStageKey;
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

  const normalizedProgress = Math.min(Math.max(progress, 1), CASE_TIMELINE_STEPS.length);
  return CASE_TIMELINE_STEPS[normalizedProgress - 1].key;
}

function resolveTimelineProgress(item: CaseRecord): number {
  if (item.reviewDecision === "rejected") {
    return 0;
  }

  const timelineStage = resolveTimelineStage(item);
  const stageIndex = getTimelineStepIndex(timelineStage);
  return stageIndex >= 0 ? stageIndex + 1 : 1;
}

function resolveLatestMovement(item: CaseRecord): CaseMovementRecord | null {
  if (!item.movements || item.movements.length === 0) {
    return null;
  }

  return item.movements.reduce((latest, current) => {
    return latest.createdAt > current.createdAt ? latest : current;
  }, item.movements[0]);
}

function isRejectedCase(item: CaseRecord): boolean {
  return item.reviewDecision === "rejected" || item.workflowStep === "closed";
}

function isClosedCase(item: CaseRecord): boolean {
  return item.status === "encerrado" || item.workflowStep === "closed";
}

function hasSameResponsibleSelection(left: string[], right: string[]): boolean {
  const normalizedLeft = Array.from(new Set(left.map((value) => value.trim()).filter(Boolean))).sort();
  const normalizedRight = Array.from(new Set(right.map((value) => value.trim()).filter(Boolean))).sort();
  if (normalizedLeft.length !== normalizedRight.length) {
    return false;
  }

  return normalizedLeft.every((value, index) => value === normalizedRight[index]);
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
  const [responsiblePickerCaseId, setResponsiblePickerCaseId] = useState<string | null>(null);
  const [responsibleDraftByCaseId, setResponsibleDraftByCaseId] = useState<Record<string, string[]>>({});
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("todos");
  const [sortBy, setSortBy] = useState<SortOption>("updated_desc");
  const [expandedCaseId, setExpandedCaseId] = useState<string | null>(null);
  const [saleProposalNotice, setSaleProposalNotice] = useState<SaleProposalPopupNotice | null>(null);
  const [saleRequestPopupCaseId, setSaleRequestPopupCaseId] = useState<string | null>(null);
  const [saleRequestAmountInput, setSaleRequestAmountInput] = useState("");
  const [saleRequestPopupError, setSaleRequestPopupError] = useState<string | null>(null);
  const [requestingCaseSale, setRequestingCaseSale] = useState(false);
  const [caseSaleFeedback, setCaseSaleFeedback] = useState<string | null>(null);
  const [accountProfile, setAccountProfile] = useState<AccountProfile | null>(null);
  const [requestingWithdrawal, setRequestingWithdrawal] = useState(false);
  const [withdrawalBottomBar, setWithdrawalBottomBar] = useState<WithdrawalBottomBarState | null>(null);

  useEffect(() => {
    async function loadCases() {
      setLoading(true);
      setError(null);
      setAssignmentError(null);

      try {
        const token = await getToken();
        const data = await apiRequest<CaseRecord[]>("/v1/cases", { token });
        setCases(data);

        if (!canAccessAdmin) {
          try {
            const profileResponse = await apiRequest<AccountProfileResponse>("/v1/users/me", { token });
            setAccountProfile(profileResponse.user);
          } catch {
            setAccountProfile(null);
          }
        } else {
          setAccountProfile(null);
        }

        if (canAccessAdmin && isMasterUser) {
          const availableOperators = await apiRequest<AdminOperatorOption[]>("/v1/admin/operators", { token });
          setOperators(availableOperators);
        } else {
          setOperators([]);
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

  const visibleCases = useMemo(() => {
    if (canAccessAdmin && !isMasterUser) {
      if (!user?.uid) {
        return [];
      }

      return cases.filter((item) => isUserAssignedToCase(item, user.uid));
    }

    return cases;
  }, [canAccessAdmin, cases, isMasterUser, user?.uid]);
  const saleProposalNoticeStorageKey = useMemo(
    () => buildSaleProposalNoticeStorageKey(user?.uid),
    [user?.uid]
  );

  useEffect(() => {
    if (canAccessAdmin || typeof window === "undefined") {
      setSaleProposalNotice(null);
      return;
    }

    const rawMarkers = window.localStorage.getItem(saleProposalNoticeStorageKey);
    const seenMarkersByCase = parseSaleProposalNoticeStorage(rawMarkers);
    const nextNotice =
      visibleCases
        .map((item): SaleProposalPopupNotice | null => {
          if (item.saleRequest?.status !== "proposal_sent") {
            return null;
          }

          const amount = item.saleRequest.suggestedAmount ?? 0;
          if (!Number.isFinite(amount) || amount <= 0) {
            return null;
          }

          const marker = item.saleRequest.proposalSentAt ?? item.saleRequest.reviewedAt ?? item.updatedAt;
          if (!marker || seenMarkersByCase[item.id] === marker) {
            return null;
          }

          return {
            caseId: item.id,
            caseTitle: resolveCounterpartyName(item),
            amount,
            marker
          };
        })
        .filter((item): item is SaleProposalPopupNotice => item !== null)
        .sort((left, right) => (left.marker < right.marker ? 1 : -1))[0] ?? null;

    if (!nextNotice) {
      setSaleProposalNotice(null);
      return;
    }

    setSaleProposalNotice((current) => {
      if (current && current.caseId === nextNotice.caseId && current.marker === nextNotice.marker) {
        return current;
      }

      return nextNotice;
    });
  }, [canAccessAdmin, saleProposalNotice, saleProposalNoticeStorageKey, visibleCases]);

  const totalCases = visibleCases.length;
  const recebidos = useMemo(() => visibleCases.filter((item) => item.status === "recebido").length, [visibleCases]);
  const emAnalise = useMemo(() => visibleCases.filter((item) => item.status === "em_analise").length, [visibleCases]);
  const encerrados = useMemo(() => visibleCases.filter((item) => item.status === "encerrado").length, [visibleCases]);
  const clientPendingPayoutBalance = useMemo(() => {
    if (canAccessAdmin) {
      return 0;
    }

    const total = visibleCases.reduce((sum, item) => {
      if (item.saleRequest?.status !== "accepted") {
        return sum;
      }

      if (item.saleRequest.payoutStatus === "transfer_sent") {
        return sum;
      }

      const amount = item.saleRequest.suggestedAmount ?? 0;
      return Number.isFinite(amount) && amount > 0 ? sum + amount : sum;
    }, 0);

    return Number(total.toFixed(2));
  }, [canAccessAdmin, visibleCases]);
  const clientPendingPayoutLabel = useMemo(
    () => formatCurrencyBr(clientPendingPayoutBalance),
    [clientPendingPayoutBalance]
  );
  const normalizedSearch = useMemo(() => search.trim().toLowerCase(), [search]);

  const filteredCases = useMemo(() => {
    const byStatus =
      statusFilter === "todos"
        ? visibleCases
        : visibleCases.filter((item) => item.status === statusFilter);

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
  }, [normalizedSearch, sortBy, statusFilter, visibleCases]);

  const operatorOptions = useMemo(() => operators, [operators]);
  const saleRequestPopupCase = useMemo(
    () => visibleCases.find((item) => item.id === saleRequestPopupCaseId) ?? null,
    [saleRequestPopupCaseId, visibleCases]
  );
  const hasCases = visibleCases.length > 0;
  const sortedOperatorOptions = useMemo(() => {
    return [...operatorOptions].sort((left, right) => {
      const leftLabel = (left.name ?? left.email ?? left.id).trim();
      const rightLabel = (right.name ?? right.email ?? right.id).trim();
      return leftLabel.localeCompare(rightLabel, "pt-BR", { sensitivity: "base" });
    });
  }, [operatorOptions]);

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

  function resetFilters() {
    setSearch("");
    setStatusFilter("todos");
    setSortBy("updated_desc");
  }

  function markSaleProposalNoticeAsSeen(notice: SaleProposalPopupNotice | null) {
    if (!notice || typeof window === "undefined") {
      return;
    }

    try {
      const current = parseSaleProposalNoticeStorage(window.localStorage.getItem(saleProposalNoticeStorageKey));
      current[notice.caseId] = notice.marker;
      window.localStorage.setItem(saleProposalNoticeStorageKey, JSON.stringify(current));
    } catch {
      // Não bloqueia a navegação caso localStorage esteja indisponível.
    }
  }

  function dismissSaleProposalNotice() {
    markSaleProposalNoticeAsSeen(saleProposalNotice);
    setSaleProposalNotice(null);
  }

  function canClientRequestSaleFromDashboard(item: CaseRecord): boolean {
    if (canAccessAdmin) {
      return false;
    }

    if (isRejectedCase(item) || isClosedCase(item)) {
      return false;
    }

    const saleStatus = item.saleRequest?.status ?? "none";
    return saleStatus === "none" || saleStatus === "rejected";
  }

  function openSaleRequestPopup(caseItem: CaseRecord) {
    if (!canClientRequestSaleFromDashboard(caseItem)) {
      return;
    }

    const suggestedAmount = resolveSuggestedSaleAmount(caseItem);
    setSaleRequestPopupCaseId(caseItem.id);
    setSaleRequestAmountInput(
      suggestedAmount !== null ? suggestedAmount.toFixed(2).replace(".", ",") : ""
    );
    setSaleRequestPopupError(null);
    setCaseSaleFeedback(null);
  }

  function closeSaleRequestPopup() {
    if (requestingCaseSale) {
      return;
    }

    setSaleRequestPopupCaseId(null);
    setSaleRequestAmountInput("");
    setSaleRequestPopupError(null);
  }

  async function handleRequestCaseSaleFromPopup() {
    if (!saleRequestPopupCase) {
      return;
    }

    const desiredAmount = parseMoneyInput(saleRequestAmountInput);
    if (desiredAmount === null) {
      setSaleRequestPopupError("Informe um valor válido para enviar a solicitação de venda.");
      return;
    }

    const confirmation = window.confirm("Confirma o envio da solicitação de venda do caso para análise da equipe?");
    if (!confirmation) {
      return;
    }

    setSaleRequestPopupError(null);
    setCaseSaleFeedback(null);
    setRequestingCaseSale(true);

    try {
      const token = await getToken();
      const requestMessage = `Valor desejado para venda: ${formatCurrencyBr(desiredAmount)}.`;
      const updated = await apiRequest<CaseRecord>(`/v1/cases/${saleRequestPopupCase.id}/sale/request`, {
        method: "POST",
        token,
        body: {
          requestMessage
        }
      });

      setCases((current) =>
        current.map((item) => (item.id === saleRequestPopupCase.id ? { ...item, ...updated } : item))
      );
      setCaseSaleFeedback("Solicitação de venda enviada. Você será notificado após a análise da equipe.");
      setSaleRequestPopupCaseId(null);
      setSaleRequestAmountInput("");
    } catch (err) {
      const message = err instanceof ApiError ? err.message : "Falha ao solicitar venda do caso.";
      setSaleRequestPopupError(message);
    } finally {
      setRequestingCaseSale(false);
    }
  }

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
    if (canAccessAdmin || requestingWithdrawal) {
      return;
    }

    if (clientPendingPayoutBalance <= 0) {
      showWithdrawalBottomBar("info", "Não há valor disponível para retirada no momento.");
      return;
    }

    if (!hasRegisteredBankAccount(accountProfile)) {
      showWithdrawalBottomBar(
        "error",
        "Para retirar o valor, é necessário cadastrar uma conta bancária na página",
        "/settings/profile"
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
      showWithdrawalBottomBar("success", result.message);
    } catch (err) {
      const message = err instanceof ApiError ? err.message : "Não foi possível solicitar a retirada agora.";
      showWithdrawalBottomBar("error", message);
    } finally {
      setRequestingWithdrawal(false);
    }
  }

  function toggleExpanded(caseId: string) {
    setExpandedCaseId((current) => (current === caseId ? null : caseId));
  }

  function toggleResponsiblePicker(caseItem: CaseRecord) {
    const caseId = caseItem.id;
    const isOpen = responsiblePickerCaseId === caseId;

    if (isOpen) {
      setResponsiblePickerCaseId(null);
      setResponsibleDraftByCaseId((current) => {
        const next = { ...current };
        delete next[caseId];
        return next;
      });
      return;
    }

    setResponsiblePickerCaseId(caseId);
    setResponsibleDraftByCaseId((current) => ({
      ...current,
      [caseId]: resolveAssignedOperatorIds(caseItem)
    }));
  }

  function updateResponsibleDraftSelection(caseItem: CaseRecord, operatorId: string, checked: boolean) {
    setResponsibleDraftByCaseId((current) => {
      const baseSelection = current[caseItem.id] ?? resolveAssignedOperatorIds(caseItem);
      const nextSelection = checked
        ? [...baseSelection, operatorId]
        : baseSelection.filter((value) => value !== operatorId);

      return {
        ...current,
        [caseItem.id]: Array.from(new Set(nextSelection))
      };
    });
  }

  async function applyResponsibleSelection(caseItem: CaseRecord) {
    const nextSelection = responsibleDraftByCaseId[caseItem.id] ?? resolveAssignedOperatorIds(caseItem);
    const saved = await handleUpdateCaseOperators(caseItem, nextSelection);
    if (!saved) {
      return;
    }

    setResponsiblePickerCaseId(null);
    setResponsibleDraftByCaseId((current) => {
      const next = { ...current };
      delete next[caseItem.id];
      return next;
    });
  }

  async function handleUpdateCaseOperators(caseItem: CaseRecord, operatorUserIds: string[]): Promise<boolean> {
    if (!isMasterUser) {
      return false;
    }

    if (isRejectedCase(caseItem) || caseItem.status === "encerrado") {
      setAssignmentError("Casos rejeitados/encerrados nao podem receber nova alocacao no momento.");
      return false;
    }

    setAssignmentError(null);
    setAssignmentFeedback(null);
    setAssigningCaseId(caseItem.id);

    try {
      const currentOperatorIds = resolveAssignedOperatorIds(caseItem);
      const nextOperatorIds = Array.from(new Set(operatorUserIds.map((value) => value.trim()).filter(Boolean)));
      const token = await getToken();
      const updated = await apiRequest<CaseRecord>(`/v1/cases/${caseItem.id}/assign-operator`, {
        method: "POST",
        token,
        body: {
          operatorUserIds: nextOperatorIds
        }
      });

      setCases((current) =>
        current.map((item) => (item.id === caseItem.id ? { ...item, ...updated } : item))
      );

      const resolveOperatorLabel = (operatorId: string): string => {
        const found = operatorOptions.find((item) => item.id === operatorId);
        return found?.name ?? found?.email ?? operatorId;
      };
      const addedIds = nextOperatorIds.filter((value) => !currentOperatorIds.includes(value));
      const removedIds = currentOperatorIds.filter((value) => !nextOperatorIds.includes(value));
      const addedLabels = addedIds.map(resolveOperatorLabel);
      const removedLabels = removedIds.map(resolveOperatorLabel);

      if (addedLabels.length > 0 && removedLabels.length > 0) {
        setAssignmentFeedback(
          `Responsáveis atualizados no processo ${updated.caseCode}. Adicionados: ${addedLabels.join(", ")}. Removidos: ${removedLabels.join(", ")}.`
        );
      } else if (addedLabels.length > 0) {
        setAssignmentFeedback(
          `Responsáveis adicionados ao processo ${updated.caseCode}: ${addedLabels.join(", ")}.`
        );
      } else if (removedLabels.length > 0) {
        setAssignmentFeedback(
          `Responsáveis removidos do processo ${updated.caseCode}: ${removedLabels.join(", ")}.`
        );
      } else {
        setAssignmentFeedback(`Responsáveis mantidos sem alterações no processo ${updated.caseCode}.`);
      }
      return true;
    } catch (err) {
      const message = err instanceof ApiError ? err.message : "Falha ao atualizar responsáveis deste caso.";
      setAssignmentError(message);
      return false;
    } finally {
      setAssigningCaseId(null);
    }
  }

  function renderCaseCards(items: CaseRecord[], layout: "grid" | "list" = "grid") {
    return (
      <div className={layout === "list" ? "card-grid card-grid--list" : "card-grid"}>
        {items.map((item) => {
          const creatorName = resolveCreatorName(item);
          const latestMovement = resolveLatestMovement(item);
          const isExpanded = expandedCaseId === item.id;
          const closeRequestStatus = item.closeRequest?.status ?? "none";
          const timelineProgress = resolveTimelineProgress(item);
          const timelineTrackProgress =
            CASE_TIMELINE_STEPS.length > 1 ? Math.max(timelineProgress - 1, 0) / (CASE_TIMELINE_STEPS.length - 1) : 0;
          const timelineOffset = 100 / (CASE_TIMELINE_STEPS.length * 2);
          const currentTimelineStage = resolveTimelineStage(item);
          const currentTimelineIndex = getTimelineStepIndex(currentTimelineStage);
          const isResponsiblePickerOpen = responsiblePickerCaseId === item.id;
          const assignedOperatorIds = resolveAssignedOperatorIds(item);
          const draftOperatorIds = responsibleDraftByCaseId[item.id] ?? assignedOperatorIds;
          const hasResponsibleChanges = !hasSameResponsibleSelection(draftOperatorIds, assignedOperatorIds);

          if (!canAccessAdmin) {
            const saleStatus = item.saleRequest?.status ?? "none";
            const saleSuggestedAmount = item.saleRequest?.suggestedAmount ?? 0;
            const hasSaleSuggestedAmount = Number.isFinite(saleSuggestedAmount) && saleSuggestedAmount > 0;
            const hasPendingSaleProposal = saleStatus === "proposal_sent";
            const suggestedSaleAmount = resolveSuggestedSaleAmount(item);
            const suggestedSaleAmountLabel =
              suggestedSaleAmount !== null ? formatCurrencyBr(suggestedSaleAmount) : "Não informado";
            const canRequestSaleFromPopup = canClientRequestSaleFromDashboard(item);
            const clientSaleCtaLabel = hasPendingSaleProposal && hasSaleSuggestedAmount
              ? `Proposta de ${formatCurrencyBr(saleSuggestedAmount)}`
              : saleStatus === "requested"
                ? "Solicitação em análise"
                : saleStatus === "accepted"
                  ? "Venda aceita"
                  : "Opção de venda";

            return (
              <article key={item.id} className="case-card case-card--client-simple">
                <div className="case-card-simple-head">
                  <small>Nome</small>
                  <Link to={`/cases/${item.id}`} className="case-card-title-link">
                    {resolveCounterpartyName(item)}
                  </Link>
                </div>

                <div className="case-card-simple-meta">
                  <span>
                    <small>Início do processo</small>
                    {formatDate(item.createdAt)}
                  </span>
                  <span>
                    <small>Em que pé está</small>
                    <strong>{WORKFLOW_LABEL[item.workflowStep]}</strong>
                  </span>
                </div>

                <div className="case-card-timeline-wrap">
                  <Link
                    to={`/cases/${item.id}?tab=evolution`}
                    className="case-card-timeline"
                    aria-label="Ir para evolução do caso"
                    style={
                      {
                        "--timeline-progress": `${timelineTrackProgress}`,
                        "--timeline-offset": `${timelineOffset}%`
                      } as CSSProperties
                    }
                  >
                    <span className="case-card-timeline-progress" />
                    {CASE_TIMELINE_STEPS.map((step, index) => {
                      const stepNumber = index + 1;
                      const isDone = stepNumber <= timelineProgress;
                      const isCurrent = timelineProgress > 0 && stepNumber === timelineProgress;
                      const stepClass = isDone
                        ? isCurrent
                          ? "case-card-timeline-node case-card-timeline-node--done case-card-timeline-node--current"
                          : "case-card-timeline-node case-card-timeline-node--done"
                        : "case-card-timeline-node";
                      const stepStatus = isCurrent ? "Etapa atual" : isDone ? "Concluída" : "Pendente";

                      return (
                        <span
                          key={`${item.id}-timeline-${step.key}`}
                          className={stepClass}
                          aria-label={`${step.label}: ${step.description}`}
                        >
                          <span className="case-card-timeline-dot" aria-hidden="true">
                            <span className="case-card-timeline-symbol">{step.symbol}</span>
                          </span>
                          <span className="case-card-timeline-label">{step.label}</span>
                          <span className="case-card-timeline-tooltip">
                            <strong>{step.label}</strong>
                            <span>{step.description}</span>
                            <em>{stepStatus}</em>
                          </span>
                        </span>
                      );
                    })}
                  </Link>
                </div>

                <p className="case-card-timeline-current">
                  Etapa atual:{" "}
                  <strong>
                    {currentTimelineIndex >= 0 ? CASE_TIMELINE_STEPS[currentTimelineIndex].label : "Não definida"}
                  </strong>
                </p>

                <div className="case-card-simple-sale">
                  <div className="case-card-simple-sale-info">
                    <small>Preço sugerido</small>
                    <strong>{suggestedSaleAmountLabel}</strong>
                  </div>
                  {canRequestSaleFromPopup ? (
                    <button
                      type="button"
                      className="case-card-sell-button"
                      onClick={() => openSaleRequestPopup(item)}
                    >
                      {clientSaleCtaLabel}
                    </button>
                  ) : (
                    <Link to={`/cases/${item.id}?tab=sale`} className="case-card-sell-button">
                      {clientSaleCtaLabel}
                    </Link>
                  )}
                </div>
              </article>
            );
          }

          return (
            <article
              key={item.id}
              className={`case-card ${isExpanded ? "case-card--expanded" : ""} ${
                isResponsiblePickerOpen ? "case-card--responsible-open" : ""
              }`}
            >
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
                  {creatorName}
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
                <Link
                  to={`/cases/${item.id}?tab=evolution`}
                  className="case-card-timeline"
                  aria-label="Ir para evolução do caso"
                  style={
                    {
                      "--timeline-progress": `${timelineTrackProgress}`,
                      "--timeline-offset": `${timelineOffset}%`
                    } as CSSProperties
                  }
                >
                  <span className="case-card-timeline-progress" />
                  {CASE_TIMELINE_STEPS.map((step, index) => {
                    const stepNumber = index + 1;
                    const isDone = stepNumber <= timelineProgress;
                    const isCurrent = timelineProgress > 0 && stepNumber === timelineProgress;
                    const stepClass = isDone
                      ? isCurrent
                        ? "case-card-timeline-node case-card-timeline-node--done case-card-timeline-node--current"
                        : "case-card-timeline-node case-card-timeline-node--done"
                      : "case-card-timeline-node";
                    const stepStatus = isCurrent ? "Etapa atual" : isDone ? "Concluída" : "Pendente";

                    return (
                      <span
                        key={`${item.id}-timeline-${step.key}`}
                        className={stepClass}
                        aria-label={`${step.label}: ${step.description}`}
                      >
                        <span className="case-card-timeline-dot" aria-hidden="true">
                          <span className="case-card-timeline-symbol">{step.symbol}</span>
                        </span>
                        <span className="case-card-timeline-label">{step.label}</span>
                        <span className="case-card-timeline-tooltip">
                          <strong>{step.label}</strong>
                          <span>{step.description}</span>
                          <em>{stepStatus}</em>
                        </span>
                      </span>
                    );
                  })}
                </Link>
              </div>

              <p className="case-card-timeline-current">
                Etapa atual:{" "}
                <strong>
                  {currentTimelineIndex >= 0 ? CASE_TIMELINE_STEPS[currentTimelineIndex].label : "Não definida"}
                </strong>
              </p>

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
                    <button
                      type="button"
                      className="secondary-button case-card-detail-button"
                      onClick={() => toggleResponsiblePicker(item)}
                      disabled={assigningCaseId === item.id || operatorOptions.length === 0 || isRejectedCase(item)}
                    >
                      Responsáveis
                    </button>

                    {isResponsiblePickerOpen && (
                      <div className="case-card-responsible-picker">
                        <strong>Escolha os responsáveis do caso</strong>
                        <div className="case-card-responsible-list">
                          {sortedOperatorOptions.map((option) => {
                            const optionLabel = `${option.name ?? option.email ?? option.id}${
                              option.isMaster ? " (Master)" : option.isOperator ? " (Operador)" : ""
                            }`;
                            const isChecked = draftOperatorIds.includes(option.id);

                            return (
                              <label key={`${item.id}-responsible-${option.id}`} className="case-card-responsible-option">
                                <input
                                  type="checkbox"
                                  checked={isChecked}
                                  disabled={assigningCaseId === item.id}
                                  onChange={(event) => {
                                    updateResponsibleDraftSelection(item, option.id, event.target.checked);
                                  }}
                                />
                                <span>{optionLabel}</span>
                              </label>
                            );
                          })}
                        </div>
                        <p className="helper-text">Marque ou desmarque os nomes para atualizar os responsáveis do caso.</p>
                        <div className="case-card-responsible-actions">
                          <button
                            type="button"
                            className="secondary-button secondary-button--small"
                            onClick={() => toggleResponsiblePicker(item)}
                            disabled={assigningCaseId === item.id}
                          >
                            Cancelar
                          </button>
                          <button
                            type="button"
                            className="hero-primary case-card-responsible-save"
                            onClick={() => void applyResponsibleSelection(item)}
                            disabled={assigningCaseId === item.id || !hasResponsibleChanges}
                          >
                            {assigningCaseId === item.id ? "Salvando..." : "Salvar responsáveis"}
                          </button>
                        </div>
                      </div>
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
        <div className={canAccessAdmin ? "workspace-hero-grid" : "workspace-hero-grid dashboard-hero-grid"}>
          <div className="dashboard-hero-main">
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
                {!canAccessAdmin && (
                  <button
                    type="button"
                    className="hero-secondary"
                    onClick={() => void handleRequestWithdrawal()}
                    disabled={requestingWithdrawal}
                  >
                    {requestingWithdrawal ? "Solicitando..." : "Retirada"}
                  </button>
                )}
              </div>
            )}

            {!canAccessAdmin && (
              <Link
                to="/statement"
                className="dashboard-withdraw-highlight"
                aria-label={`Valor disponível para resgate: ${clientPendingPayoutLabel}. Abrir extrato.`}
              >
                <span>Valor disponível para resgate</span>
                <strong>{clientPendingPayoutLabel}</strong>
              </Link>
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

      </section>

      <section className="workspace-panel">
        <header className="page-header">
          <div>
            <h2>Lista de casos</h2>
            <p>
              {canAccessAdmin
                ? "Expanda para consultar operador alocado, movimentações e documentos do caso."
                : "Acompanhe o andamento e a opção de venda dos seus casos."}
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
            Mostrando {displayedCasesCount} de {visibleCases.length} casos.
          </p>
        )}

        {loading && <p>Carregando casos...</p>}
        {error && <p className="error-text">{error}</p>}
        {assignmentError && <p className="error-text">{assignmentError}</p>}
        {assignmentFeedback && <p className="success-text">{assignmentFeedback}</p>}
        {caseSaleFeedback && <p className="success-text">{caseSaleFeedback}</p>}

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

      {saleRequestPopupCase && (
        <>
          <button
            type="button"
            className="case-notice-overlay"
            aria-label="Fechar solicitação de venda"
            onClick={closeSaleRequestPopup}
          />
          <section
            className="case-notice-popup case-notice-popup--client sale-request-popup"
            role="dialog"
            aria-modal="true"
            aria-labelledby="sale-request-popup-title"
          >
            <div className="case-notice-header">
              <div>
                <p className="hero-kicker">Solicitação de venda</p>
                <h3 id="sale-request-popup-title">Solicitar venda do caso</h3>
              </div>
              <button
                type="button"
                className="case-notice-close"
                aria-label="Fechar pop-up de venda"
                onClick={closeSaleRequestPopup}
                disabled={requestingCaseSale}
              >
                {"\u00D7"}
              </button>
            </div>

            <div className="detail-list">
              <div className="detail-item">
                <span>Caso</span>
                <strong>{resolveCounterpartyName(saleRequestPopupCase)}</strong>
              </div>
              <div className="detail-item">
                <span>Início do processo</span>
                <strong>{formatDate(saleRequestPopupCase.createdAt)}</strong>
              </div>
              <div className="detail-item">
                <span>Status atual</span>
                <strong>{WORKFLOW_LABEL[saleRequestPopupCase.workflowStep]}</strong>
              </div>
              <div className="detail-item">
                <span>Valor da causa</span>
                <strong>
                  {saleRequestPopupCase.petitionInitial?.claimValue &&
                  Number.isFinite(saleRequestPopupCase.petitionInitial.claimValue) &&
                  saleRequestPopupCase.petitionInitial.claimValue > 0
                    ? formatCurrencyBr(saleRequestPopupCase.petitionInitial.claimValue)
                    : "Não informado"}
                </strong>
              </div>
            </div>

            {saleRequestPopupCase.resumo?.trim() && (
              <div className="info-box case-notice-box">
                <strong>Resumo do caso</strong>
                <span>{saleRequestPopupCase.resumo}</span>
              </div>
            )}

            <form
              className="sale-request-popup-form"
              onSubmit={(event) => {
                event.preventDefault();
                void handleRequestCaseSaleFromPopup();
              }}
            >
              <label>
                Valor que você deseja vender
                <input
                  type="text"
                  inputMode="decimal"
                  placeholder="Ex: 12.500,00"
                  value={saleRequestAmountInput}
                  onChange={(event) => setSaleRequestAmountInput(event.target.value)}
                  disabled={requestingCaseSale}
                />
              </label>

              <p className="sale-request-popup-tip">
                {(() => {
                  const suggestedAmount = resolveSuggestedSaleAmount(saleRequestPopupCase);
                  return suggestedAmount !== null
                    ? `Tip: o preço sugerido de venda é ${formatCurrencyBr(suggestedAmount)}.`
                    : "Tip: preencha um valor de venda compatível com o valor total da causa.";
                })()}
              </p>

              {saleRequestPopupError && <p className="error-text">{saleRequestPopupError}</p>}

              <div className="operator-action-buttons">
                <button type="submit" className="hero-primary" disabled={requestingCaseSale}>
                  {requestingCaseSale ? "Enviando..." : "Enviar solicitação"}
                </button>
                <button
                  type="button"
                  className="hero-secondary"
                  onClick={closeSaleRequestPopup}
                  disabled={requestingCaseSale}
                >
                  Cancelar
                </button>
              </div>
            </form>
          </section>
        </>
      )}

      {saleProposalNotice && (
        <>
          <button
            type="button"
            className="case-notice-overlay"
            aria-label="Fechar aviso de proposta recebida"
            onClick={dismissSaleProposalNotice}
          />
          <section
            className="case-notice-popup case-notice-popup--client"
            role="dialog"
            aria-modal="true"
            aria-labelledby="sale-proposal-popup-title"
          >
            <div className="case-notice-header">
              <div>
                <p className="hero-kicker">Nova proposta</p>
                <h3 id="sale-proposal-popup-title">Você recebeu uma proposta de caso</h3>
              </div>
              <button
                type="button"
                className="case-notice-close"
                aria-label="Fechar aviso"
                onClick={dismissSaleProposalNotice}
              >
                {"\u00D7"}
              </button>
            </div>

            <div className="info-box case-notice-box">
              <strong>{saleProposalNotice.caseTitle}</strong>
              <span>Proposta de venda: {formatCurrencyBr(saleProposalNotice.amount)}</span>
            </div>

            <div className="operator-action-buttons">
              <Link
                to={`/cases/${saleProposalNotice.caseId}?tab=sale`}
                className="hero-primary"
                onClick={() => {
                  markSaleProposalNoticeAsSeen(saleProposalNotice);
                  setSaleProposalNotice(null);
                }}
              >
                Abrir proposta
              </Link>
              <button type="button" className="hero-secondary" onClick={dismissSaleProposalNotice}>
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
