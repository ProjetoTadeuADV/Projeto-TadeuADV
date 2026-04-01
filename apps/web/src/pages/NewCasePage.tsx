import { type ChangeEvent, FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { ApiError, apiRequest } from "../lib/api";
import { formatCpf, isValidCpf, normalizeCpf } from "../lib/cpf";
import { isValidCnpj } from "../lib/cnpj";
import type {
  AccountProfile,
  CaseRecord,
  CpfConsultaResult,
  PetitionDefendantType,
  PetitionPriorAttemptChannel,
  PetitionPretensionType,
  VaraOption
} from "../types";

const CPF_STATUS_LABELS: Record<CpfConsultaResult["situacao"], string> = {
  regular: "Regular",
  pendente: "Pendente",
  indisponivel: "Indisponível"
};

const MAX_ATTACHMENTS_PER_CASE = 8;
const MAX_ATTACHMENT_SIZE_BYTES = 10 * 1024 * 1024;
const ATTACHMENT_ACCEPT = ".pdf,.jpg,.jpeg,.png,.webp,.txt,.doc,.docx";
const PETITION_TEXT_MAX_LENGTH = 500;
const NEW_CASE_DRAFT_STORAGE_PREFIX = "doutoreu_new_case_draft_v1";

interface AccountProfileResponse {
  user: AccountProfile;
}

interface VaraResolveResult {
  id: string;
  nome: string;
  source?: string;
}

interface ViaCepResponse {
  cep?: string;
  logradouro?: string;
  complemento?: string;
  bairro?: string;
  localidade?: string;
  uf?: string;
  erro?: boolean;
}

interface TimelineEventDraft {
  eventDate: string;
  description: string;
}

interface PretensionOptionConfig {
  type: PetitionPretensionType;
  label: string;
  requiresAmount?: boolean;
  requiresDetails?: boolean;
  amountLabel?: string;
  detailsLabel?: string;
  detailsPlaceholder?: string;
}

interface ClaimSubjectOption {
  value: string;
  label: string;
}

interface PriorAttemptChannelOption {
  value: PetitionPriorAttemptChannel;
  label: string;
}

interface PretensionDraft {
  type: PetitionPretensionType;
  selected: boolean;
  amountInput: string;
  details: string;
}

interface CaseCreationChecklistItem {
  id: string;
  label: string;
  done: boolean;
}

interface NewCaseDraftPayload {
  savedAt: string;
  profileDataConfirmed: boolean;
  resumo: string;
  claimSubjectSelection: string;
  claimSubjectCustom: string;
  priorAttemptMade: boolean;
  priorAttemptChannel: PetitionPriorAttemptChannel | "";
  priorAttemptChannelOther: string;
  priorAttemptProtocol: string;
  priorAttemptHadProposal: boolean | null;
  priorAttemptProposalDetails: string;
  defendantType: PetitionDefendantType;
  defendantName: string;
  defendantDocument: string;
  defendantAddress: string;
  facts: string;
  timelineEvents: TimelineEventDraft[];
  pretensionDrafts: PretensionDraft[];
  requestsText: string;
  evidence: string;
  hearingInterest: boolean;
}

const PRETENSION_OPTIONS: PretensionOptionConfig[] = [
  {
    type: "ressarcimento_valor",
    label: "Ressarcimento de valor",
    requiresAmount: true,
    amountLabel: "Valor pretendido",
    detailsLabel: "Detalhes",
    detailsPlaceholder: "Explique o valor e o motivo do ressarcimento."
  },
  {
    type: "indenizacao_danos",
    label: "Indenização por danos morais ou materiais",
    requiresAmount: true,
    amountLabel: "Valor sugerido",
    detailsLabel: "Detalhes",
    detailsPlaceholder: "Descreva os danos sofridos."
  },
  {
    type: "cumprimento_compromisso",
    label: "Cumprimento de compromisso acordado",
    requiresDetails: true,
    detailsLabel: "Compromisso acordado",
    detailsPlaceholder: "Descreva o compromisso que não foi cumprido."
  },
  {
    type: "retratacao",
    label: "Retratação",
    requiresDetails: true,
    detailsLabel: "Tipo de retratação",
    detailsPlaceholder: "Descreva a forma de retratação solicitada."
  },
  {
    type: "devolucao_produto",
    label: "Devolução do produto com ressarcimento",
    detailsLabel: "Detalhes",
    detailsPlaceholder: "Informe produto, condição de devolução e forma de reembolso."
  },
  {
    type: "outro",
    label: "Outro pedido",
    requiresDetails: true,
    detailsLabel: "Descrição do pedido",
    detailsPlaceholder: "Especifique objetivamente o pedido desejado."
  }
];

const CLAIM_SUBJECT_OTHER_VALUE = "__outro__";

const CLAIM_SUBJECT_OPTIONS: ClaimSubjectOption[] = [
  { value: "Produto não entregue", label: "Produto não entregue" },
  { value: "Produto com defeito", label: "Produto com defeito" },
  { value: "Cobrança indevida", label: "Cobrança indevida" },
  { value: "Serviço não prestado", label: "Serviço não prestado" },
  { value: "Cancelamento sem estorno", label: "Cancelamento sem estorno" },
  { value: "Descumprimento de oferta", label: "Descumprimento de oferta" },
  { value: CLAIM_SUBJECT_OTHER_VALUE, label: "Outros" }
];

const AUTO_LEGAL_GROUNDS_TEXT =
  "Os fundamentos da reclamação serão consolidados pela equipe com base nos fatos, documentos e pedidos informados pelo cliente.";

const PRIOR_ATTEMPT_CHANNEL_OPTIONS: PriorAttemptChannelOption[] = [
  { value: "direto_reclamado", label: "Própria empresa" },
  { value: "procon", label: "Procon" },
  { value: "consumidor_gov_br", label: "Consumidor.gov.br" },
  { value: "reclame_aqui", label: "Reclame Aqui" },
  { value: "outro", label: "Outro" }
];

function buildNewCaseDraftStorageKey(userId: string | null | undefined): string {
  return `${NEW_CASE_DRAFT_STORAGE_PREFIX}:${userId ?? "anonymous"}`;
}

function restorePretensionDrafts(input: unknown): PretensionDraft[] {
  const base = createInitialPretensionDrafts();
  if (!Array.isArray(input)) {
    return base;
  }

  const byType = new Map<string, unknown>();
  for (const item of input) {
    if (!item || typeof item !== "object") {
      continue;
    }

    const type = (item as { type?: unknown }).type;
    if (typeof type !== "string") {
      continue;
    }

    byType.set(type, item);
  }

  return base.map((draft) => {
    const raw = byType.get(draft.type);
    if (!raw || typeof raw !== "object") {
      return draft;
    }

    const selected = (raw as { selected?: unknown }).selected;
    const amountInput = (raw as { amountInput?: unknown }).amountInput;
    const details = (raw as { details?: unknown }).details;
    return {
      ...draft,
      selected: typeof selected === "boolean" ? selected : false,
      amountInput: typeof amountInput === "string" ? amountInput : "",
      details: typeof details === "string" ? details.slice(0, PETITION_TEXT_MAX_LENGTH) : ""
    };
  });
}

function restoreTimelineEvents(input: unknown): TimelineEventDraft[] {
  if (!Array.isArray(input)) {
    return [{ eventDate: "", description: "" }];
  }

  const restored = input
    .filter((item) => item && typeof item === "object")
    .map((item) => {
      const eventDate = (item as { eventDate?: unknown }).eventDate;
      const description = (item as { description?: unknown }).description;
      return {
        eventDate: typeof eventDate === "string" ? eventDate : "",
        description: typeof description === "string" ? description.slice(0, PETITION_TEXT_MAX_LENGTH) : ""
      };
    })
    .slice(0, 40);

  return restored.length > 0 ? restored : [{ eventDate: "", description: "" }];
}

function createInitialPretensionDrafts(): PretensionDraft[] {
  return PRETENSION_OPTIONS.map((item) => ({
    type: item.type,
    selected: false,
    amountInput: "",
    details: ""
  }));
}

function normalizeDigits(value: string): string {
  return value.replace(/\D/g, "");
}

function normalizeZipCode(value: string): string {
  return normalizeDigits(value).slice(0, 8);
}

function formatZipCode(value: string): string {
  const digits = normalizeZipCode(value);
  if (digits.length <= 5) {
    return digits;
  }

  return `${digits.slice(0, 5)}-${digits.slice(5)}`;
}

function formatCnpj(value: string): string {
  const digits = normalizeDigits(value).slice(0, 14);
  if (digits.length <= 2) {
    return digits;
  }

  if (digits.length <= 5) {
    return `${digits.slice(0, 2)}.${digits.slice(2)}`;
  }

  if (digits.length <= 8) {
    return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5)}`;
  }

  if (digits.length <= 12) {
    return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8)}`;
  }

  return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8, 12)}-${digits.slice(12)}`;
}

function formatDefendantDocumentInput(value: string, defendantType: PetitionDefendantType): string {
  const digits = normalizeDigits(value);

  if (defendantType === "pessoa_fisica") {
    return formatCpf(digits);
  }

  if (defendantType === "pessoa_juridica") {
    return formatCnpj(digits);
  }

  return digits.length <= 11 ? formatCpf(digits) : formatCnpj(digits);
}

function parseRequests(value: string): string[] {
  return value
    .split(/\r?\n/)
    .map((line) => line.replace(/^[-*]\s*/, "").trim())
    .filter(Boolean);
}

function parseClaimValue(value: string): number | null {
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

function formatCurrencyBr(value: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL"
  }).format(value);
}

function formatDateTimeBr(value: string | null | undefined): string {
  if (!value) {
    return "";
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return "";
  }

  return parsed.toLocaleString("pt-BR");
}

function formatCurrencyInputOnBlur(value: string): string {
  const parsed = parseClaimValue(value);
  if (parsed === null) {
    return "";
  }

  return formatCurrencyBr(parsed);
}

function limitPetitionText(value: string): string {
  return value.slice(0, PETITION_TEXT_MAX_LENGTH);
}

function isIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }

  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime());
}

function getTimelineEventFeedback(item: TimelineEventDraft): {
  tone: "success" | "error" | "neutral";
  message: string;
} {
  const dateValue = item.eventDate.trim();
  const descriptionValue = item.description.trim();

  if (!dateValue && !descriptionValue) {
    return { tone: "neutral", message: "Aguardando preenchimento do evento." };
  }

  if (!dateValue || !descriptionValue) {
    return { tone: "error", message: "Preencha data e descrição para salvar este evento." };
  }

  if (!isIsoDate(dateValue)) {
    return { tone: "error", message: "Data inválida. Use o formato de data do campo." };
  }

  if (descriptionValue.length < 5) {
    return { tone: "error", message: "Descrição curta. Use pelo menos 5 caracteres." };
  }

  return { tone: "success", message: "Evento pronto para envio." };
}

function getPretensionOption(type: PetitionPretensionType): PretensionOptionConfig {
  return PRETENSION_OPTIONS.find((item) => item.type === type) ?? PRETENSION_OPTIONS[0];
}

function formatPretensionAsRequest(input: {
  type: PetitionPretensionType;
  amount: number | null;
  details: string | null;
}): string {
  const option = getPretensionOption(input.type);
  const amountLabel =
    typeof input.amount === "number" && Number.isFinite(input.amount)
      ? ` (valor sugerido: ${new Intl.NumberFormat("pt-BR", {
          style: "currency",
          currency: "BRL"
        }).format(input.amount)})`
      : "";
  const details = input.details ? `: ${input.details}` : "";

  return `${option.label}${details}${amountLabel}.`;
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

function normalizeTextForMatch(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function resolveVaraIdByAddress(city: string, state: string, varas: VaraOption[]): string | null {
  if (!varas.length) {
    return null;
  }

  const capital = varas.find((item) => item.id === "jec-sp-capital") ?? varas[0];
  const normalizedState = state.trim().toUpperCase();
  if (normalizedState !== "SP") {
    return capital.id;
  }

  const normalizedCity = normalizeTextForMatch(city);
  if (!normalizedCity) {
    return capital.id;
  }

  const municipalityId =
    normalizedCity === "sao paulo"
      ? "jec-sp-capital"
      : `jec-sp-${normalizedCity
          .replace(/[^a-z0-9\s-]/g, "")
          .trim()
          .replace(/\s+/g, "-")}`;
  const mappedById = varas.find((vara) => vara.id === municipalityId);
  if (mappedById) {
    return mappedById.id;
  }

  const specialMap: Array<{ matcher: RegExp; varaId: string }> = [
    { matcher: /piracicaba/, varaId: "jec-campinas" },
    { matcher: /campinas/, varaId: "jec-campinas" },
    { matcher: /guarulhos/, varaId: "jec-guarulhos" },
    { matcher: /santos/, varaId: "jec-santos" },
    { matcher: /sao bernardo|sao bernardo do campo/, varaId: "jec-sao-bernardo" },
    { matcher: /sao paulo|capital|sp/, varaId: "jec-sp-capital" }
  ];

  for (const item of specialMap) {
    if (!item.matcher.test(normalizedCity)) {
      continue;
    }

    const found = varas.find((vara) => vara.id === item.varaId);
    if (found) {
      return found.id;
    }
  }

  const matched = varas.find((vara) => normalizeTextForMatch(vara.nome).includes(normalizedCity));
  if (matched) {
    return matched.id;
  }

  return capital.id;
}

function attachmentFingerprint(file: File): string {
  return `${file.name}:${file.size}:${file.lastModified}`;
}

function PaperclipIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path
        d="M7 13.5l6.2-6.2a3.1 3.1 0 114.4 4.4L9.4 20A5 5 0 112.3 13l8.3-8.3"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function NewCasePage() {
  const { getToken, user } = useAuth();
  const navigate = useNavigate();

  const [varas, setVaras] = useState<VaraOption[]>([]);
  const [loadingVaras, setLoadingVaras] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [consultingCpf, setConsultingCpf] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [profileReadyForCase, setProfileReadyForCase] = useState(false);
  const [profileReadyMessage, setProfileReadyMessage] = useState<string | null>(null);
  const [profileCheckFinished, setProfileCheckFinished] = useState(false);
  const [profileDataConfirmed, setProfileDataConfirmed] = useState(false);
  const [resolvingVara, setResolvingVara] = useState(false);
  const [draftHydrated, setDraftHydrated] = useState(false);
  const [restoredDraftSavedAt, setRestoredDraftSavedAt] = useState<string | null>(null);
  const [showDraftRestoreActions, setShowDraftRestoreActions] = useState(false);

  const [varaId, setVaraId] = useState("");
  const [cpf, setCpf] = useState("");
  const [resumo, setResumo] = useState("");
  const [claimSubjectSelection, setClaimSubjectSelection] = useState(CLAIM_SUBJECT_OPTIONS[0]?.value ?? "");
  const [claimSubjectCustom, setClaimSubjectCustom] = useState("");
  const [priorAttemptMade, setPriorAttemptMade] = useState(false);
  const [priorAttemptChannel, setPriorAttemptChannel] = useState<PetitionPriorAttemptChannel | "">("");
  const [priorAttemptChannelOther, setPriorAttemptChannelOther] = useState("");
  const [priorAttemptProtocol, setPriorAttemptProtocol] = useState("");
  const [priorAttemptHadProposal, setPriorAttemptHadProposal] = useState<boolean | null>(null);
  const [priorAttemptProposalDetails, setPriorAttemptProposalDetails] = useState("");

  const [claimantZipCode, setClaimantZipCode] = useState("");
  const [claimantStreet, setClaimantStreet] = useState("");
  const [claimantNumber, setClaimantNumber] = useState("");
  const [claimantNeighborhood, setClaimantNeighborhood] = useState("");
  const [claimantCity, setClaimantCity] = useState("");
  const [claimantState, setClaimantState] = useState("");
  const [claimantComplement, setClaimantComplement] = useState("");

  const [defendantType, setDefendantType] = useState<PetitionDefendantType>("pessoa_juridica");
  const [defendantName, setDefendantName] = useState("");
  const [defendantDocument, setDefendantDocument] = useState("");
  const [defendantAddress, setDefendantAddress] = useState("");

  const [facts, setFacts] = useState("");
  const [timelineEvents, setTimelineEvents] = useState<TimelineEventDraft[]>([
    { eventDate: "", description: "" }
  ]);
  const [pretensionDrafts, setPretensionDrafts] = useState<PretensionDraft[]>(() => createInitialPretensionDrafts());
  const [requestsText, setRequestsText] = useState("");
  const [evidence, setEvidence] = useState("");
  const [attachments, setAttachments] = useState<File[]>([]);
  const [attachmentFeedback, setAttachmentFeedback] = useState<string | null>(null);
  const [hearingInterest, setHearingInterest] = useState(true);
  const [cpfData, setCpfData] = useState<CpfConsultaResult | null>(null);
  const attachmentInputRef = useRef<HTMLInputElement | null>(null);
  const draftStorageKey = useMemo(() => buildNewCaseDraftStorageKey(user?.uid), [user?.uid]);

  const hasVaras = varas.length > 0;
  const claimValueTotal = useMemo(() => {
    const total = pretensionDrafts.reduce((accumulator, item) => {
      if (!item.selected) {
        return accumulator;
      }

      const amount = parseClaimValue(item.amountInput);
      if (amount === null) {
        return accumulator;
      }

      return accumulator + amount;
    }, 0);

    return Number(total.toFixed(2));
  }, [pretensionDrafts]);
  const resolvedClaimSubject = useMemo(() => {
    if (claimSubjectSelection === CLAIM_SUBJECT_OTHER_VALUE) {
      return claimSubjectCustom.trim();
    }

    return claimSubjectSelection.trim();
  }, [claimSubjectCustom, claimSubjectSelection]);
  const claimantAddressSummary = useMemo(() => {
    const normalized = normalizeZipCode(claimantZipCode);
    if (
      normalized.length !== 8 ||
      claimantStreet.trim().length < 3 ||
      claimantNumber.trim().length === 0 ||
      claimantNeighborhood.trim().length < 2 ||
      claimantCity.trim().length < 2 ||
      claimantState.trim().length !== 2
    ) {
      return "Endereço do cadastro incompleto.";
    }

    const complement = claimantComplement.trim();
    return [
      `${claimantStreet.trim()}, ${claimantNumber.trim()}${complement ? `, ${complement}` : ""}`,
      `${claimantNeighborhood.trim()} - ${claimantCity.trim()}/${claimantState.trim().toUpperCase()}`,
      `CEP ${formatZipCode(normalized)}`
    ].join(", ");
  }, [
    claimantCity,
    claimantComplement,
    claimantNeighborhood,
    claimantNumber,
    claimantState,
    claimantStreet,
    claimantZipCode
  ]);
  const normalizedDefendantDocument = useMemo(() => normalizeDigits(defendantDocument), [defendantDocument]);
  const normalizedTimelineEvents = useMemo(
    () =>
      timelineEvents
        .map((item) => ({
          eventDate: item.eventDate.trim(),
          description: item.description.trim()
        }))
        .filter((item) => item.eventDate.length > 0 || item.description.length > 0),
    [timelineEvents]
  );
  const selectedPretensions = useMemo(
    () => pretensionDrafts.filter((item) => item.selected),
    [pretensionDrafts]
  );
  const hasValidPretensionSelection = useMemo(() => {
    return selectedPretensions.every((item) => {
      const option = getPretensionOption(item.type);
      const details = item.details.trim();
      const amount = parseClaimValue(item.amountInput);

      if (option.requiresAmount && amount === null) {
        return false;
      }

      if (item.amountInput.trim() && amount === null) {
        return false;
      }

      if (option.requiresDetails && details.length < 3) {
        return false;
      }

      return true;
    });
  }, [selectedPretensions]);
  const freeRequests = useMemo(
    () => parseRequests(requestsText).filter((item) => item.length >= 10),
    [requestsText]
  );
  const isDefendantDocumentValid = useMemo(() => {
    if (defendantType === "pessoa_fisica") {
      return normalizedDefendantDocument.length === 11 && isValidCpf(normalizedDefendantDocument);
    }

    if (defendantType === "pessoa_juridica") {
      return normalizedDefendantDocument.length === 14 && isValidCnpj(normalizedDefendantDocument);
    }

    if (normalizedDefendantDocument.length === 11) {
      return isValidCpf(normalizedDefendantDocument);
    }

    if (normalizedDefendantDocument.length === 14) {
      return isValidCnpj(normalizedDefendantDocument);
    }

    return false;
  }, [defendantType, normalizedDefendantDocument]);
  const defendantDocumentValidationMessage = useMemo(() => {
    if (!normalizedDefendantDocument) {
      return null;
    }

    if (defendantType === "pessoa_fisica") {
      if (normalizedDefendantDocument.length < 11) {
        return {
          type: "info" as const,
          message: "Informe os 11 dígitos do CPF."
        };
      }

      return {
        type: isValidCpf(normalizedDefendantDocument) ? ("success" as const) : ("error" as const),
        message: isValidCpf(normalizedDefendantDocument)
          ? "CPF válido."
          : "CPF inválido. Confira os dígitos informados."
      };
    }

    if (normalizedDefendantDocument.length < 14) {
      return {
        type: "info" as const,
        message: "Informe os 14 dígitos do CNPJ."
      };
    }

    return {
      type: isValidCnpj(normalizedDefendantDocument) ? ("success" as const) : ("error" as const),
      message: isValidCnpj(normalizedDefendantDocument)
        ? "CNPJ válido."
        : "CNPJ inválido. Confira os dígitos informados."
    };
  }, [defendantType, normalizedDefendantDocument]);
  const isPriorAttemptSectionValid = useMemo(() => {
    if (!priorAttemptMade) {
      return true;
    }

    if (!priorAttemptChannel) {
      return false;
    }

    if (priorAttemptChannel === "outro" && priorAttemptChannelOther.trim().length < 3) {
      return false;
    }

    if (priorAttemptChannel === "direto_reclamado" && priorAttemptChannelOther.trim().length < 5) {
      return false;
    }

    const normalizedProtocol = priorAttemptProtocol.trim();
    if (priorAttemptChannel === "direto_reclamado") {
      if (normalizedProtocol.length > 0 && normalizedProtocol.length < 3) {
        return false;
      }
    } else if (normalizedProtocol.length < 3) {
      return false;
    }

    if (priorAttemptHadProposal === null) {
      return false;
    }

    if (priorAttemptHadProposal && priorAttemptProposalDetails.trim().length < 5) {
      return false;
    }

    return true;
  }, [
    priorAttemptChannel,
    priorAttemptChannelOther,
    priorAttemptHadProposal,
    priorAttemptMade,
    priorAttemptProposalDetails,
    priorAttemptProtocol
  ]);
  const caseChecklist = useMemo<CaseCreationChecklistItem[]>(
    () => [
      {
        id: "processo",
        label: "Dados iniciais (CPF válido, resumo e assunto preenchidos)",
        done: Boolean(varaId) && isValidCpf(cpf) && resumo.trim().length >= 20 && resolvedClaimSubject.length >= 5
      },
      {
        id: "endereco",
        label: "Cadastro completo do cliente (CPF e endereço no perfil)",
        done: profileReadyForCase
      },
      {
        id: "confirmacao",
        label: "Confirmação dos dados do cadastro antes do envio",
        done: profileDataConfirmed
      },
      {
        id: "reclamada",
        label: "Parte contrária identificada (nome mín. 2 e CPF/CNPJ válido)",
        done: defendantName.trim().length >= 2 && isDefendantDocumentValid
      },
      {
        id: "cronologia",
        label: "Cronologia preenchida (ao menos 1 evento com data válida e descrição mín. 5)",
        done:
          normalizedTimelineEvents.length > 0 &&
          normalizedTimelineEvents.every((item) => isIsoDate(item.eventDate) && item.description.length >= 5)
      },
      {
        id: "tratativa",
        label: "Tratativa prévia informada (canal, protocolo quando houver e proposta)",
        done: isPriorAttemptSectionValid
      },
      {
        id: "pedidos",
        label: "Pedidos e pretensões (com valores/detalhes quando aplicável)",
        done: hasValidPretensionSelection && (selectedPretensions.length > 0 || freeRequests.length > 0)
      },
      {
        id: "texto",
        label: "Fatos do caso (mín. 30 caracteres)",
        done: facts.trim().length >= 30
      },
      {
        id: "anexos",
        label: "Anexos inseridos no clipe (opcional)",
        done: true
      }
    ],
    [
      cpf,
      defendantName,
      facts,
      freeRequests.length,
      hasValidPretensionSelection,
      isPriorAttemptSectionValid,
      isDefendantDocumentValid,
      normalizedTimelineEvents,
      profileDataConfirmed,
      profileReadyForCase,
      resolvedClaimSubject,
      resumo,
      selectedPretensions.length,
      varaId
    ]
  );
  const completedChecklistSteps = useMemo(
    () => caseChecklist.filter((item) => item.done).length,
    [caseChecklist]
  );
  const isChecklistComplete = completedChecklistSteps === caseChecklist.length;

  useEffect(() => {
    setDefendantDocument((current) => formatDefendantDocumentInput(current, defendantType));
  }, [defendantType]);

  useEffect(() => {
    if (priorAttemptMade) {
      return;
    }

    setPriorAttemptChannel("");
    setPriorAttemptChannelOther("");
    setPriorAttemptProtocol("");
    setPriorAttemptHadProposal(null);
    setPriorAttemptProposalDetails("");
  }, [priorAttemptMade]);

  useEffect(() => {
    if (priorAttemptHadProposal) {
      return;
    }

    setPriorAttemptProposalDetails("");
  }, [priorAttemptHadProposal]);

  useEffect(() => {
    if (priorAttemptChannel === "outro") {
      return;
    }

    setPriorAttemptChannelOther("");
  }, [priorAttemptChannel]);

  function buildDraftPayload(): NewCaseDraftPayload {
    return {
      savedAt: new Date().toISOString(),
      profileDataConfirmed,
      resumo,
      claimSubjectSelection,
      claimSubjectCustom,
      priorAttemptMade,
      priorAttemptChannel,
      priorAttemptChannelOther,
      priorAttemptProtocol,
      priorAttemptHadProposal,
      priorAttemptProposalDetails,
      defendantType,
      defendantName,
      defendantDocument,
      defendantAddress,
      facts,
      timelineEvents,
      pretensionDrafts,
      requestsText,
      evidence,
      hearingInterest
    };
  }

  function clearCaseDraftLocally(): void {
    try {
      window.localStorage.removeItem(draftStorageKey);
    } catch {
      // Ignora falha local para não bloquear o fluxo do usuário.
    }
  }

  function handleStartFreshCase(): void {
    clearCaseDraftLocally();
    setShowDraftRestoreActions(false);
    setRestoredDraftSavedAt(null);
    setProfileDataConfirmed(false);
    setResumo("");
    setClaimSubjectSelection(CLAIM_SUBJECT_OPTIONS[0]?.value ?? "");
    setClaimSubjectCustom("");
    setPriorAttemptMade(false);
    setPriorAttemptChannel("");
    setPriorAttemptChannelOther("");
    setPriorAttemptProtocol("");
    setPriorAttemptHadProposal(null);
    setPriorAttemptProposalDetails("");
    setDefendantType("pessoa_juridica");
    setDefendantName("");
    setDefendantDocument("");
    setDefendantAddress("");
    setFacts("");
    setTimelineEvents([{ eventDate: "", description: "" }]);
    setPretensionDrafts(createInitialPretensionDrafts());
    setRequestsText("");
    setEvidence("");
    setAttachments([]);
    setAttachmentFeedback(null);
    setHearingInterest(true);
    setCpfData(null);
    setError(null);
  }

  function handleKeepRestoredDraft(): void {
    setShowDraftRestoreActions(false);
  }

  async function requestWithAuthRetry<T>(
    path: string,
    options: {
      method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
      body?: unknown;
    }
  ): Promise<T> {
    const firstToken = await getToken();

    try {
      return await apiRequest<T>(path, { ...options, token: firstToken });
    } catch (nextError) {
      if (!(nextError instanceof ApiError) || nextError.statusCode !== 401) {
        throw nextError;
      }

      const refreshedToken = await getToken(true);
      return apiRequest<T>(path, { ...options, token: refreshedToken });
    }
  }

  function extractValidationMessage(error: ApiError): string {
    const details = error.details as
      | {
          formErrors?: string[];
          fieldErrors?: Record<string, string[] | undefined>;
        }
      | null
      | undefined;

    const firstFormError = details?.formErrors?.find((item) => typeof item === "string" && item.trim().length > 0);
    if (firstFormError) {
      return firstFormError;
    }

    if (details?.fieldErrors) {
      for (const [fieldName, messages] of Object.entries(details.fieldErrors)) {
        const firstFieldError = messages?.find((item) => typeof item === "string" && item.trim().length > 0);
        if (!firstFieldError) {
          continue;
        }

        if (fieldName === "petitionInitial") {
          return firstFieldError;
        }

        return `${fieldName}: ${firstFieldError}`;
      }
    }

    return error.message;
  }

  async function uploadCaseAttachments(
    caseId: string,
    files: File[],
    token: string
  ): Promise<CaseRecord> {
    const formData = new FormData();
    files.forEach((item) => formData.append("attachments", item));

    const response = await fetch(`${import.meta.env.VITE_API_URL}/v1/cases/${caseId}/attachments`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`
      },
      body: formData
    });

    let payload: unknown = null;
    try {
      payload = await response.json();
    } catch {
      payload = null;
    }

    const isApiSuccess =
      typeof payload === "object" &&
      payload !== null &&
      "status" in payload &&
      (payload as { status?: unknown }).status === "ok" &&
      "result" in payload;

    if (!response.ok || !isApiSuccess) {
      const message =
        typeof payload === "object" &&
        payload !== null &&
        "message" in payload &&
        typeof (payload as { message?: unknown }).message === "string"
          ? (payload as { message: string }).message
          : "Falha ao enviar anexos da petição.";
      throw new ApiError(response.status, message);
    }

    return (payload as { result: CaseRecord }).result;
  }

  async function uploadCaseAttachmentsWithAuthRetry(caseId: string, files: File[]): Promise<CaseRecord> {
    const firstToken = await getToken();

    try {
      return await uploadCaseAttachments(caseId, files, firstToken);
    } catch (nextError) {
      if (!(nextError instanceof ApiError) || nextError.statusCode !== 401) {
        throw nextError;
      }

      const refreshedToken = await getToken(true);
      return uploadCaseAttachments(caseId, files, refreshedToken);
    }
  }

  function handleAttachmentInputChange(event: ChangeEvent<HTMLInputElement>) {
    const selected = Array.from(event.target.files ?? []);
    event.target.value = "";

    if (selected.length === 0) {
      return;
    }

    const oversized = selected.find((item) => item.size > MAX_ATTACHMENT_SIZE_BYTES);
    if (oversized) {
      setError(
        `O arquivo ${oversized.name} excede o limite de ${formatAttachmentSize(MAX_ATTACHMENT_SIZE_BYTES)}.`
      );
      return;
    }

    setAttachments((current) => {
      const known = new Set(current.map((item) => attachmentFingerprint(item)));
      const merged = [...current];

      for (const file of selected) {
        const fingerprint = attachmentFingerprint(file);
        if (known.has(fingerprint)) {
          continue;
        }

        merged.push(file);
        known.add(fingerprint);
      }

      if (merged.length > MAX_ATTACHMENTS_PER_CASE) {
        setError(`Limite de ${MAX_ATTACHMENTS_PER_CASE} anexos por petição.`);
        return current;
      }

      setError(null);
      setAttachmentFeedback(`${merged.length} anexo(s) pronto(s) para envio.`);
      return merged;
    });
  }

  function handleRemoveAttachment(index: number) {
    setAttachments((current) => {
      const next = current.filter((_, currentIndex) => currentIndex !== index);
      setAttachmentFeedback(next.length > 0 ? `${next.length} anexo(s) pronto(s) para envio.` : null);
      return next;
    });
  }

  function handleTimelineEventChange(
    index: number,
    field: "eventDate" | "description",
    value: string
  ) {
    const normalizedValue = field === "description" ? limitPetitionText(value) : value;
    setTimelineEvents((current) =>
      current.map((item, itemIndex) =>
        itemIndex === index
          ? {
              ...item,
              [field]: normalizedValue
            }
          : item
      )
    );
  }

  function handleAddTimelineEvent() {
    setTimelineEvents((current) => [...current, { eventDate: "", description: "" }]);
  }

  function handleRemoveTimelineEvent(index: number) {
    setTimelineEvents((current) => {
      if (current.length <= 1) {
        return [{ eventDate: "", description: "" }];
      }

      return current.filter((_, itemIndex) => itemIndex !== index);
    });
  }

  function handlePretensionSelection(type: PetitionPretensionType, selected: boolean) {
    setPretensionDrafts((current) =>
      current.map((item) =>
        item.type === type
          ? {
              ...item,
              selected
            }
          : item
      )
    );
  }

  function handlePretensionFieldChange(
    type: PetitionPretensionType,
    field: "amountInput" | "details",
    value: string
  ) {
    const normalizedValue = field === "details" ? limitPetitionText(value) : value;
    setPretensionDrafts((current) =>
      current.map((item) =>
        item.type === type
          ? {
              ...item,
              [field]: normalizedValue
            }
          : item
      )
    );
  }

  useEffect(() => {
    async function loadVaras() {
      setLoadingVaras(true);
      setError(null);

      try {
        const data = await apiRequest<VaraOption[]>("/v1/varas");
        setVaras(data);
        if (data.length === 0) {
          setError("Nenhuma vara foi configurada no sistema.");
        }
      } catch {
        setError("Falha ao carregar a lista de varas.");
      } finally {
        setLoadingVaras(false);
      }
    }

    void loadVaras();
  }, []);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(draftStorageKey);
      if (!raw) {
        setDraftHydrated(true);
        return;
      }

      const parsed = JSON.parse(raw) as Partial<NewCaseDraftPayload>;
      if (typeof parsed.savedAt === "string" && parsed.savedAt.trim().length > 0) {
        setRestoredDraftSavedAt(parsed.savedAt);
        setShowDraftRestoreActions(true);
      }
      if (typeof parsed.profileDataConfirmed === "boolean") {
        setProfileDataConfirmed(parsed.profileDataConfirmed);
      }
      if (typeof parsed.resumo === "string") {
        setResumo(parsed.resumo.slice(0, PETITION_TEXT_MAX_LENGTH));
      }
      if (typeof parsed.claimSubjectSelection === "string") {
        setClaimSubjectSelection(parsed.claimSubjectSelection);
      }
      if (typeof parsed.claimSubjectCustom === "string") {
        setClaimSubjectCustom(parsed.claimSubjectCustom);
      }
      if (typeof parsed.priorAttemptMade === "boolean") {
        setPriorAttemptMade(parsed.priorAttemptMade);
      }
      if (
        parsed.priorAttemptChannel === "" ||
        parsed.priorAttemptChannel === "direto_reclamado" ||
        parsed.priorAttemptChannel === "procon" ||
        parsed.priorAttemptChannel === "consumidor_gov_br" ||
        parsed.priorAttemptChannel === "reclame_aqui" ||
        parsed.priorAttemptChannel === "outro"
      ) {
        setPriorAttemptChannel(parsed.priorAttemptChannel);
      }
      if (typeof parsed.priorAttemptChannelOther === "string") {
        setPriorAttemptChannelOther(parsed.priorAttemptChannelOther.slice(0, PETITION_TEXT_MAX_LENGTH));
      }
      if (typeof parsed.priorAttemptProtocol === "string") {
        setPriorAttemptProtocol(parsed.priorAttemptProtocol);
      }
      if (
        parsed.priorAttemptHadProposal === null ||
        parsed.priorAttemptHadProposal === true ||
        parsed.priorAttemptHadProposal === false
      ) {
        setPriorAttemptHadProposal(parsed.priorAttemptHadProposal);
      }
      if (typeof parsed.priorAttemptProposalDetails === "string") {
        setPriorAttemptProposalDetails(parsed.priorAttemptProposalDetails.slice(0, PETITION_TEXT_MAX_LENGTH));
      }
      if (
        parsed.defendantType === "pessoa_fisica" ||
        parsed.defendantType === "pessoa_juridica" ||
        parsed.defendantType === "nao_informado"
      ) {
        setDefendantType(parsed.defendantType);
      }
      if (typeof parsed.defendantName === "string") {
        setDefendantName(parsed.defendantName);
      }
      if (typeof parsed.defendantDocument === "string") {
        setDefendantDocument(parsed.defendantDocument);
      }
      if (typeof parsed.defendantAddress === "string") {
        setDefendantAddress(parsed.defendantAddress);
      }
      if (typeof parsed.facts === "string") {
        setFacts(parsed.facts.slice(0, PETITION_TEXT_MAX_LENGTH));
      }
      if (typeof parsed.requestsText === "string") {
        setRequestsText(parsed.requestsText.slice(0, PETITION_TEXT_MAX_LENGTH));
      }
      if (typeof parsed.evidence === "string") {
        setEvidence(parsed.evidence.slice(0, PETITION_TEXT_MAX_LENGTH));
      }
      if (typeof parsed.hearingInterest === "boolean") {
        setHearingInterest(parsed.hearingInterest);
      }
      if (parsed.timelineEvents !== undefined) {
        setTimelineEvents(restoreTimelineEvents(parsed.timelineEvents));
      }
      if (parsed.pretensionDrafts !== undefined) {
        setPretensionDrafts(restorePretensionDrafts(parsed.pretensionDrafts));
      }
    } catch {
      // Se o rascunho estiver corrompido, ignora sem bloquear o preenchimento.
    } finally {
      setDraftHydrated(true);
    }
  }, [draftStorageKey]);

  useEffect(() => {
    if (!draftHydrated || submitting) {
      return;
    }

    const timer = window.setTimeout(() => {
      try {
        window.localStorage.setItem(draftStorageKey, JSON.stringify(buildDraftPayload()));
      } catch {
        // Mantém o fluxo mesmo se o navegador bloquear gravação local.
      }
    }, 350);

    return () => {
      window.clearTimeout(timer);
    };
  }, [
    claimSubjectCustom,
    claimSubjectSelection,
    defendantAddress,
    defendantDocument,
    defendantName,
    defendantType,
    draftHydrated,
    draftStorageKey,
    evidence,
    facts,
    hearingInterest,
    pretensionDrafts,
    priorAttemptChannel,
    priorAttemptChannelOther,
    priorAttemptHadProposal,
    priorAttemptMade,
    priorAttemptProposalDetails,
    priorAttemptProtocol,
    profileDataConfirmed,
    requestsText,
    resumo,
    submitting,
    timelineEvents
  ]);

  useEffect(() => {
    if (!draftHydrated) {
      return;
    }

    function persistOnBackground(): void {
      if (submitting) {
        return;
      }

      try {
        window.localStorage.setItem(draftStorageKey, JSON.stringify(buildDraftPayload()));
      } catch {
        // Não interrompe a navegação se o navegador impedir gravação local.
      }
    }

    function handleVisibilityChange(): void {
      if (document.visibilityState === "hidden") {
        persistOnBackground();
      }
    }

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("pagehide", persistOnBackground);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("pagehide", persistOnBackground);
    };
  }, [draftHydrated, draftStorageKey, profileDataConfirmed, submitting, resumo, claimSubjectSelection, claimSubjectCustom, priorAttemptMade, priorAttemptChannel, priorAttemptChannelOther, priorAttemptProtocol, priorAttemptHadProposal, priorAttemptProposalDetails, defendantType, defendantName, defendantDocument, defendantAddress, facts, timelineEvents, pretensionDrafts, requestsText, evidence, hearingInterest]);

  useEffect(() => {
    async function loadProfilePrefill() {
      try {
        const profileResponse = await requestWithAuthRetry<AccountProfileResponse>("/v1/users/me", {});
        const profile = profileResponse.user;

        if (profile.cpf) {
          setCpf((current) => (current.trim().length === 0 ? formatCpf(profile.cpf ?? "") : current));
        }

        const profileAddress = profile.address
          ? {
              ...profile.address
            }
          : null;
        const profileZipCode = normalizeZipCode(profileAddress?.cep ?? "");

        if (profileAddress && profileZipCode.length === 8) {
          const hasMissingAddressFromCep =
            (profileAddress.street ?? "").trim().length < 3 ||
            (profileAddress.neighborhood ?? "").trim().length < 2 ||
            (profileAddress.city ?? "").trim().length < 2 ||
            (profileAddress.state ?? "").trim().length !== 2;

          if (hasMissingAddressFromCep) {
            try {
              const viaCepResponse = await fetch(`https://viacep.com.br/ws/${profileZipCode}/json/`);
              if (viaCepResponse.ok) {
                const viaCepData = (await viaCepResponse.json()) as ViaCepResponse;
                if (!viaCepData.erro) {
                  if ((profileAddress.street ?? "").trim().length < 3) {
                    profileAddress.street = viaCepData.logradouro?.trim() ?? profileAddress.street;
                  }
                  if ((profileAddress.neighborhood ?? "").trim().length < 2) {
                    profileAddress.neighborhood = viaCepData.bairro?.trim() ?? profileAddress.neighborhood;
                  }
                  if ((profileAddress.city ?? "").trim().length < 2) {
                    profileAddress.city = viaCepData.localidade?.trim() ?? profileAddress.city;
                  }
                  if ((profileAddress.state ?? "").trim().length !== 2) {
                    profileAddress.state =
                      viaCepData.uf?.trim().toUpperCase() ?? profileAddress.state;
                  }
                }
              }
            } catch {
              // Mantém o fluxo sem bloquear o usuário caso ViaCEP esteja indisponível.
            }
          }
        }

        const hasProfileAddress = Boolean(
          profileAddress &&
            (
              profileAddress.cep ||
              profileAddress.street ||
              profileAddress.number ||
              profileAddress.complement ||
              profileAddress.neighborhood ||
              profileAddress.city ||
              profileAddress.state
            )
        );
        const hasCompleteProfileAddress = Boolean(
          profileAddress &&
            normalizeZipCode(profileAddress.cep ?? "").length === 8 &&
            (profileAddress.street ?? "").trim().length >= 3 &&
            (profileAddress.number ?? "").trim().length > 0 &&
            (profileAddress.neighborhood ?? "").trim().length >= 2 &&
            (profileAddress.city ?? "").trim().length >= 2 &&
            (profileAddress.state ?? "").trim().length === 2
        );
        const hasValidProfileCpf = Boolean(profile.cpf && isValidCpf(profile.cpf));

        if (hasProfileAddress && profileAddress) {
          if (profileAddress.cep) {
            setClaimantZipCode((current) =>
              current.trim().length === 0 ? formatZipCode(profileAddress.cep ?? "") : current
            );
          }
          if (profileAddress.street) {
            setClaimantStreet((current) => (current.trim().length === 0 ? profileAddress.street ?? "" : current));
          }
          if (profileAddress.number) {
            setClaimantNumber((current) => (current.trim().length === 0 ? profileAddress.number ?? "" : current));
          }
          if (profileAddress.complement) {
            setClaimantComplement((current) =>
              current.trim().length === 0 ? profileAddress.complement ?? "" : current
            );
          }
          if (profileAddress.neighborhood) {
            setClaimantNeighborhood((current) =>
              current.trim().length === 0 ? profileAddress.neighborhood ?? "" : current
            );
          }
          if (profileAddress.city) {
            setClaimantCity((current) => (current.trim().length === 0 ? profileAddress.city ?? "" : current));
          }
          if (profileAddress.state) {
            setClaimantState((current) =>
              current.trim().length === 0 ? (profileAddress.state ?? "").toUpperCase() : current
            );
          }

        }

        if (!hasValidProfileCpf || !hasCompleteProfileAddress) {
          setProfileReadyForCase(false);
          setProfileReadyMessage(
            "Antes de abrir um caso, complete seu cadastro em Minha Conta com CPF e endereço completo."
          );
          return;
        }

        setProfileReadyForCase(true);
        setProfileReadyMessage(null);
      } catch {
        setProfileReadyForCase(false);
        setProfileReadyMessage(
          "Não foi possível carregar seu cadastro agora. Acesse Minha Conta, confirme seus dados e tente novamente."
        );
      } finally {
        setProfileCheckFinished(true);
      }
    }

    void loadProfilePrefill();
  }, []);

  useEffect(() => {
    if (!varas.length) {
      setVaraId("");
      return;
    }

    let cancelled = false;
    async function resolveByAddress() {
      setResolvingVara(true);
      try {
        const cityParam = encodeURIComponent(claimantCity.trim());
        const stateParam = encodeURIComponent(claimantState.trim().toUpperCase());
        const resolved = await apiRequest<VaraResolveResult>(`/v1/varas/resolve?city=${cityParam}&state=${stateParam}`);
        if (cancelled) {
          return;
        }

        if (typeof resolved.id === "string" && resolved.id.trim().length > 0) {
          setVaraId(resolved.id);
          return;
        }
      } catch {
        // fallback local abaixo
      } finally {
        if (!cancelled) {
          setResolvingVara(false);
        }
      }

      if (cancelled) {
        return;
      }

      const fallback = resolveVaraIdByAddress(claimantCity, claimantState, varas);
      setVaraId(fallback ?? (varas.find((item) => item.id === "jec-sp-capital")?.id ?? varas[0].id));
    }

    void resolveByAddress();
    return () => {
      cancelled = true;
    };
  }, [claimantCity, claimantState, varas]);

  useEffect(() => {
    if (!cpfData) {
      return;
    }

    if (normalizeCpf(cpfData.cpf) !== normalizeCpf(cpf)) {
      setCpfData(null);
    }
  }, [cpf, cpfData]);

  async function handleCpfLookup() {
    setCpfData(null);
    setError(null);

    if (!hasVaras || !varaId) {
      setError("Não foi possível definir a vara automaticamente para sua cidade.");
      return;
    }

    if (!isValidCpf(cpf)) {
      setError("CPF inválido para consulta.");
      return;
    }

    setConsultingCpf(true);
    try {
      const result = await requestWithAuthRetry<CpfConsultaResult>("/v1/cpf/consulta", {
        method: "POST",
        body: { cpf: normalizeCpf(cpf) }
      });
      setCpfData(result);
    } catch (nextError) {
      const message =
        nextError instanceof ApiError
          ? nextError.statusCode === 401
            ? "Sua sessão expirou. Entre novamente para consultar CPF."
            : nextError.message
          : "Erro na consulta de CPF.";
      setError(message);
    } finally {
      setConsultingCpf(false);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (!hasVaras || !varaId) {
      setError("Não foi possível definir a vara automaticamente para sua cidade.");
      return;
    }

    if (!profileReadyForCase) {
      setError(profileReadyMessage ?? "Complete seu cadastro em Minha Conta antes de abrir um caso.");
      return;
    }

    if (!profileDataConfirmed) {
      setError("Confirme os dados do seu cadastro antes de enviar o caso para análise.");
      return;
    }

    if (!isChecklistComplete) {
      setError("Conclua 100% do checklist antes de salvar e enviar para análise.");
      return;
    }

    if (!isValidCpf(cpf)) {
      setError("Informe um CPF válido.");
      return;
    }

    const trimmedResumo = resumo.trim();
    if (trimmedResumo.length < 20) {
      setError("Resumo do caso deve ter pelo menos 20 caracteres.");
      return;
    }

    const trimmedClaimSubject = resolvedClaimSubject.trim();
    if (trimmedClaimSubject.length < 5) {
      setError("Informe o assunto principal da reclamação.");
      return;
    }

    const normalizedZipCode = normalizeZipCode(claimantZipCode);
    const trimmedStreet = claimantStreet.trim();
    const trimmedNumber = claimantNumber.trim();
    const trimmedNeighborhood = claimantNeighborhood.trim();
    const trimmedCity = claimantCity.trim();
    const trimmedState = claimantState.trim().toUpperCase();
    const trimmedComplement = claimantComplement.trim();

    if (normalizedZipCode.length !== 8) {
      setError("Informe um CEP válido.");
      return;
    }

    if (trimmedStreet.length < 3) {
      setError("Informe o logradouro do seu cadastro.");
      return;
    }

    if (!trimmedNumber) {
      setError("Informe o número do endereço do seu cadastro.");
      return;
    }

    if (trimmedNeighborhood.length < 2) {
      setError("Informe o bairro do seu cadastro.");
      return;
    }

    if (trimmedCity.length < 2) {
      setError("Informe a cidade do seu cadastro.");
      return;
    }

    if (trimmedState.length !== 2) {
      setError("Informe a UF do seu cadastro com 2 letras.");
      return;
    }

    const claimantAddress = [
      `${trimmedStreet}, ${trimmedNumber}${trimmedComplement ? `, ${trimmedComplement}` : ""}`,
      `${trimmedNeighborhood} - ${trimmedCity}/${trimmedState}`,
      `CEP ${formatZipCode(normalizedZipCode)}`
    ].join(", ");

    const trimmedDefendantName = defendantName.trim();
    if (trimmedDefendantName.length < 2) {
      setError("Informe o nome da parte contrária.");
      return;
    }

    const normalizedDefendantDocument = normalizeDigits(defendantDocument);
    if (!normalizedDefendantDocument) {
      setError("Informe CPF ou CNPJ da parte contrária.");
      return;
    }

    if (defendantType === "pessoa_fisica" && normalizedDefendantDocument.length !== 11) {
      setError("Para pessoa física, informe CPF com 11 dígitos.");
      return;
    }

    if (defendantType === "pessoa_fisica" && !isValidCpf(normalizedDefendantDocument)) {
      setError("CPF da parte contrária inválido.");
      return;
    }

    if (defendantType === "pessoa_juridica" && normalizedDefendantDocument.length !== 14) {
      setError("Para pessoa jurídica, informe CNPJ com 14 dígitos.");
      return;
    }

    if (defendantType === "pessoa_juridica" && !isValidCnpj(normalizedDefendantDocument)) {
      setError("CNPJ da parte contrária inválido.");
      return;
    }

    if (defendantType === "nao_informado" && ![11, 14].includes(normalizedDefendantDocument.length)) {
      setError("Documento da parte contrária deve conter 11 ou 14 dígitos.");
      return;
    }

    if (defendantType === "nao_informado" && normalizedDefendantDocument.length === 11 && !isValidCpf(normalizedDefendantDocument)) {
      setError("CPF da parte contrária inválido.");
      return;
    }

    if (defendantType === "nao_informado" && normalizedDefendantDocument.length === 14 && !isValidCnpj(normalizedDefendantDocument)) {
      setError("CNPJ da parte contrária inválido.");
      return;
    }

    if (!isPriorAttemptSectionValid) {
      setError("Preencha corretamente os dados de tratativa prévia antes de enviar para análise.");
      return;
    }

    const normalizedTimelineEvents = timelineEvents
      .map((item) => ({
        eventDate: item.eventDate.trim(),
        description: item.description.trim()
      }))
      .filter((item) => item.eventDate.length > 0 || item.description.length > 0);

    if (normalizedTimelineEvents.length === 0) {
      setError("Informe pelo menos um evento na cronologia do caso.");
      return;
    }

    for (const [index, item] of normalizedTimelineEvents.entries()) {
      if (!isIsoDate(item.eventDate)) {
        setError(`Data inválida no evento ${index + 1}. Use o formato AAAA-MM-DD.`);
        return;
      }

      if (item.description.length < 5) {
        setError(`Descrição muito curta no evento ${index + 1}.`);
        return;
      }
    }

    const normalizedPretensions: Array<{
      type: PetitionPretensionType;
      amount: number | null;
      details: string | null;
    }> = [];
    for (const item of pretensionDrafts.filter((draft) => draft.selected)) {
      const config = getPretensionOption(item.type);
      const details = item.details.trim();
      const amount = parseClaimValue(item.amountInput);

      if (config.requiresAmount && amount === null) {
        setError(`Informe um valor válido em "${config.label}".`);
        return;
      }

      if (item.amountInput.trim() && amount === null) {
        setError(`Valor inválido em "${config.label}".`);
        return;
      }

      if (config.requiresDetails && details.length < 3) {
        setError(`Detalhe melhor "${config.label}".`);
        return;
      }

      normalizedPretensions.push({
        type: item.type,
        amount,
        details: details || null
      });
    }

    const structuredRequests = normalizedPretensions.map((item) => formatPretensionAsRequest(item));
    const freeRequests = parseRequests(requestsText);
    for (const [index, request] of freeRequests.entries()) {
      if (request.trim().length < 10) {
        setError(`Pedido complementar ${index + 1} deve ter pelo menos 10 caracteres.`);
        return;
      }
    }
    const requests = [...structuredRequests, ...freeRequests];
    if (requests.length === 0) {
      setError("Informe ao menos uma pretensão ou um pedido complementar.");
      return;
    }

    const trimmedFacts = facts.trim();
    if (trimmedFacts.length < 30) {
      setError("Descreva os fatos com pelo menos 30 caracteres.");
      return;
    }

    const normalizedPriorAttemptChannel: PetitionPriorAttemptChannel | null =
      priorAttemptMade && priorAttemptChannel ? priorAttemptChannel : null;
    const normalizedPriorAttemptChannelOther =
      priorAttemptMade &&
      (normalizedPriorAttemptChannel === "outro" || normalizedPriorAttemptChannel === "direto_reclamado")
        ? priorAttemptChannelOther.trim()
        : null;
    const normalizedPriorAttemptProtocol = priorAttemptMade ? priorAttemptProtocol.trim() || null : null;
    const normalizedPriorAttemptHadProposal = priorAttemptMade ? priorAttemptHadProposal : null;
    const normalizedPriorAttemptProposalDetails =
      priorAttemptMade && priorAttemptHadProposal ? priorAttemptProposalDetails.trim() : null;

    const trimmedLegalGrounds = AUTO_LEGAL_GROUNDS_TEXT;

    setSubmitting(true);
    try {
      const created = await requestWithAuthRetry<CaseRecord>("/v1/cases", {
        method: "POST",
        body: {
          varaId,
          cpf: normalizeCpf(cpf),
          resumo: trimmedResumo,
          petitionInitial: {
            claimantAddress,
            claimSubject: trimmedClaimSubject,
            defendantType,
            defendantName: trimmedDefendantName,
            defendantDocument: normalizedDefendantDocument,
            defendantAddress: defendantAddress.trim() || null,
            facts: trimmedFacts,
            legalGrounds: trimmedLegalGrounds,
            requests,
            timelineEvents: normalizedTimelineEvents,
            pretensions: normalizedPretensions,
            evidence: evidence.trim() || null,
            attachments: [],
            claimValue: claimValueTotal,
            hearingInterest,
            priorAttemptMade,
            priorAttemptChannel: normalizedPriorAttemptChannel,
            priorAttemptChannelOther: normalizedPriorAttemptChannelOther || null,
            priorAttemptProtocol: normalizedPriorAttemptProtocol || null,
            priorAttemptHadProposal: normalizedPriorAttemptHadProposal,
            priorAttemptProposalDetails: normalizedPriorAttemptProposalDetails || null
          }
        }
      });

      if (attachments.length > 0) {
        try {
          await uploadCaseAttachmentsWithAuthRetry(created.id, attachments);
        } catch (uploadError) {
          const message =
            uploadError instanceof ApiError
              ? uploadError.message
              : "Caso criado, mas não foi possível salvar os anexos.";
          window.alert(`Caso criado com sucesso, mas os anexos falharam: ${message}`);
        }
      }

      clearCaseDraftLocally();
      navigate(`/cases/${created.id}`, { replace: true });
    } catch (nextError) {
      const message =
        nextError instanceof ApiError
          ? nextError.statusCode === 401
            ? "Sua sessão expirou. Entre novamente para criar o caso."
            : nextError.statusCode === 400
              ? extractValidationMessage(nextError)
              : nextError.message
          : "Erro ao criar caso.";
      setError(message);
    } finally {
      setSubmitting(false);
    }
  }

  const missingProfileRequirements = useMemo(() => {
    const pending: string[] = [];
    if (!isValidCpf(cpf)) {
      pending.push("CPF válido");
    }

    if (normalizeZipCode(claimantZipCode).length !== 8) {
      pending.push("CEP válido");
    }

    if (claimantStreet.trim().length < 3) {
      pending.push("logradouro");
    }

    if (claimantNumber.trim().length === 0) {
      pending.push("número");
    }

    if (claimantNeighborhood.trim().length < 2) {
      pending.push("bairro");
    }

    if (claimantCity.trim().length < 2) {
      pending.push("cidade");
    }

    if (claimantState.trim().length !== 2) {
      pending.push("UF");
    }

    return pending;
  }, [claimantCity, claimantNeighborhood, claimantNumber, claimantState, claimantStreet, claimantZipCode, cpf]);

  const isPreparingCaseForm = loadingVaras || !profileCheckFinished;
  const shouldBlockCaseForm = !isPreparingCaseForm && !profileReadyForCase;

  return (
    <section className="page-stack">
      <section className="workspace-hero workspace-hero--compact workspace-hero--simple">
        <div className="workspace-hero-grid">
          <div>
            <p className="hero-kicker">Petição inicial</p>
            <h1>Abrir reclamação completa</h1>
            <p>Preencha os dados para enviar seu caso para análise inicial.</p>
          </div>
        </div>
      </section>

      {isPreparingCaseForm ? (
        <section className="workspace-panel">
          <p>Carregando formulário...</p>
        </section>
      ) : shouldBlockCaseForm ? (
        <section className="workspace-panel">
          <div className="info-box">
            <strong>Antes de abrir um novo caso, complete seu cadastro</strong>
            <span>
              {profileReadyMessage ??
                "Para evitar retrabalho, confirme CPF e endereço completos em Minha Conta antes de começar o formulário."}
            </span>
            {missingProfileRequirements.length > 0 && (
              <>
                <span>Dados pendentes:</span>
                <ul className="tips-checklist">
                  {missingProfileRequirements.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </>
            )}
            <div className="profile-actions">
              <button
                type="button"
                className="secondary-button"
                onClick={() => navigate("/settings/profile?context=novo-caso")}
              >
                Ir para Minha Conta
              </button>
              <button type="button" className="ghost-button" onClick={() => navigate("/dashboard")}>
                Voltar ao painel
              </button>
            </div>
          </div>
        </section>
      ) : (
        <div className="case-layout">
          <form className="form-grid case-form" onSubmit={handleSubmit}>
            <h2>Dados do processo</h2>
            <p className="field-help">Rascunho salvo automaticamente neste dispositivo (exceto anexos).</p>
            {resolvingVara && <p className="field-help">Identificando automaticamente a vara para o seu endereço...</p>}
            {restoredDraftSavedAt && (
              <div className="info-box">
                <strong>Rascunho restaurado</strong>
                <span>Último salvamento: {formatDateTimeBr(restoredDraftSavedAt)}</span>
                {showDraftRestoreActions ? (
                  <div className="profile-actions">
                    <button type="button" className="secondary-button" onClick={handleKeepRestoredDraft}>
                      Continuar rascunho
                    </button>
                    <button type="button" className="ghost-button" onClick={handleStartFreshCase}>
                      Começar novo
                    </button>
                  </div>
                ) : (
                  <span className="field-help">Você pode limpar e começar novo a qualquer momento.</span>
                )}
              </div>
            )}

            <label>
              Seu CPF (carregado do cadastro)
              <div className="inline-input">
                <input
                  type="text"
                  value={cpf}
                  onChange={(event) => setCpf(formatCpf(event.target.value))}
                  placeholder="000.000.000-00"
                  inputMode="numeric"
                  readOnly
                  required
                />
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => void handleCpfLookup()}
                  disabled={consultingCpf || !varaId}
                >
                  {consultingCpf ? "Consultando..." : "Consultar CPF"}
                </button>
              </div>
              <span className="field-help">CPF carregado do seu perfil. Para alterar, acesse Minha Conta.</span>
            </label>

            {cpfData && (
              <div className="info-box">
                <strong>Consulta de CPF (simulação interna)</strong>
                <span>Nome: {cpfData.nome}</span>
                <span>Situação: {CPF_STATUS_LABELS[cpfData.situacao]}</span>
                <span>Atualizado em: {new Date(cpfData.updatedAt).toLocaleString("pt-BR")}</span>
              </div>
            )}

            <label>
              Resumo do caso (mín. 20 caracteres)
              <textarea
                value={resumo}
                onChange={(event) => setResumo(limitPetitionText(event.target.value))}
                rows={4}
                placeholder="Nos conte, bem resumidamente, qual é o caso que você está enfrentando."
                maxLength={PETITION_TEXT_MAX_LENGTH}
                required
              />
              <span className="field-help">
                {resumo.length}/{PETITION_TEXT_MAX_LENGTH} caracteres
              </span>
            </label>

            <label>
              Assunto principal da reclamação
              <select
                value={claimSubjectSelection}
                onChange={(event) => setClaimSubjectSelection(event.target.value)}
                required
              >
                {CLAIM_SUBJECT_OPTIONS.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </select>
            </label>

            {claimSubjectSelection === CLAIM_SUBJECT_OTHER_VALUE && (
              <label>
                Descreva o assunto do caso (mín. 5 caracteres)
                <input
                  type="text"
                  value={claimSubjectCustom}
                  onChange={(event) => setClaimSubjectCustom(event.target.value)}
                  placeholder="Ex.: bloqueio indevido de conta, cobrança após cancelamento, etc."
                  required
                />
              </label>
            )}

            <h2>Dados do seu cadastro</h2>
            <div className="info-box">
              <strong>Endereço do seu cadastro (pré-carregado do perfil)</strong>
              <span>{claimantAddressSummary}</span>
              <span>
                Para corrigir endereço ou CPF, acesse <strong>Minha Conta</strong> no menu lateral.
              </span>
            </div>
            <div className="info-box">
              <strong>Confirmação dos dados do cadastro</strong>
              <span>Confirme que seu CPF e endereço acima estão atualizados antes de enviar o caso.</span>
              <div className="profile-actions">
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => setProfileDataConfirmed(true)}
                  disabled={profileDataConfirmed}
                >
                  {profileDataConfirmed ? "Dados confirmados" : "Confirmar meus dados"}
                </button>
                <button
                  type="button"
                  className="ghost-button"
                  onClick={() => setProfileDataConfirmed(false)}
                  disabled={!profileDataConfirmed}
                >
                  Revisar dados
                </button>
              </div>
              {profileDataConfirmed && (
                <span className="success-text">
                  Dados confirmados. Você pode seguir com o envio para análise.
                </span>
              )}
            </div>
            <h2>Dados de quem você está processando (parte contrária)</h2>
            <div className="info-box">
              <strong>O que é a parte contrária?</strong>
              <span>
                É a empresa ou pessoa que você entende ser responsável pelo problema e contra quem o caso será aberto.
              </span>
            </div>
            <label>
              Tipo da parte contrária
              <select
                value={defendantType}
                onChange={(event) => setDefendantType(event.target.value as PetitionDefendantType)}
                required
              >
                <option value="pessoa_juridica">Pessoa jurídica</option>
                <option value="pessoa_fisica">Pessoa física</option>
              </select>
            </label>

            <label>
              Nome da parte contrária (mín. 2 caracteres)
              <input
                type="text"
                value={defendantName}
                onChange={(event) => setDefendantName(event.target.value)}
                placeholder="Nome da empresa ou pessoa"
                required
              />
            </label>

            <label>
              {defendantType === "pessoa_fisica" ? "CPF da parte contrária" : "CNPJ da parte contrária"}
              <input
                type="text"
                value={defendantDocument}
                onChange={(event) => setDefendantDocument(formatDefendantDocumentInput(event.target.value, defendantType))}
                placeholder={
                  defendantType === "pessoa_fisica"
                    ? "000.000.000-00"
                    : "00.000.000/0000-00"
                }
                inputMode="numeric"
                maxLength={defendantType === "pessoa_fisica" ? 14 : 18}
                required
              />
              {defendantDocumentValidationMessage && (
                <span
                  className={
                    defendantDocumentValidationMessage.type === "error"
                      ? "error-text"
                      : defendantDocumentValidationMessage.type === "success"
                        ? "success-text"
                        : "field-help"
                  }
                >
                  {defendantDocumentValidationMessage.message}
                </span>
              )}
            </label>

            <label>
              Endereço da parte contrária
              <input
                type="text"
                value={defendantAddress}
                onChange={(event) => setDefendantAddress(event.target.value)}
                placeholder="Opcional"
              />
            </label>

            <h2>Continue nos contando sobre o caso</h2>
            <div className="petition-section">
              <div className="petition-section-head">
                <h3>Tentativa de solução antes da ação</h3>
                <p>Informe se você já tentou resolver antes, seja por órgão de defesa do consumidor ou direto com a empresa.</p>
              </div>

              <label>
                Já houve tentativa para resolver o caso com a própria empresa ou órgão de proteção ao consumidor? (Sim/Não)
                <select
                  value={priorAttemptMade ? "sim" : "nao"}
                  onChange={(event) => setPriorAttemptMade(event.target.value === "sim")}
                >
                  <option value="nao">Não</option>
                  <option value="sim">Sim</option>
                </select>
              </label>

              {priorAttemptMade && (
                <>
                  <label>
                    Qual foi o canal da tentativa de solução?
                    <select
                      value={priorAttemptChannel}
                      onChange={(event) =>
                        setPriorAttemptChannel(event.target.value as PetitionPriorAttemptChannel | "")
                      }
                      required
                    >
                      <option value="">Selecione</option>
                      {PRIOR_ATTEMPT_CHANNEL_OPTIONS.map((item) => (
                        <option key={item.value} value={item.value}>
                          {item.label}
                        </option>
                      ))}
                    </select>
                  </label>

                  {priorAttemptChannel === "direto_reclamado" && (
                    <label>
                      Como foi a tentativa com a própria empresa? (mín. 5 caracteres)
                      <textarea
                        value={priorAttemptChannelOther}
                        onChange={(event) => setPriorAttemptChannelOther(limitPetitionText(event.target.value))}
                        rows={3}
                        placeholder="Conte como foi o contato com a empresa e qual retorno você recebeu."
                        maxLength={PETITION_TEXT_MAX_LENGTH}
                        required
                      />
                      <span className="field-help">
                        {priorAttemptChannelOther.length}/{PETITION_TEXT_MAX_LENGTH} caracteres
                      </span>
                    </label>
                  )}

                  {priorAttemptChannel === "outro" && (
                    <label>
                      Qual foi o órgão/canal? (mín. 3 caracteres)
                      <input
                        type="text"
                        value={priorAttemptChannelOther}
                        onChange={(event) => setPriorAttemptChannelOther(event.target.value)}
                        placeholder="Ex.: plataforma regional, associação de defesa local, outro canal."
                        required
                      />
                    </label>
                  )}

                  <label>
                    {priorAttemptChannel === "direto_reclamado"
                      ? "Número de protocolo (opcional, se houver)"
                      : "Qual o protocolo de atendimento? (mín. 3 caracteres)"}
                    <input
                      type="text"
                      value={priorAttemptProtocol}
                      onChange={(event) => setPriorAttemptProtocol(event.target.value)}
                      placeholder="Ex.: 2026-00012345"
                      required={priorAttemptChannel !== "direto_reclamado"}
                    />
                  </label>

                  <label>
                    Nessa tratativa houve alguma proposta de acordo da empresa/pessoa? (Sim/Não)
                    <select
                      value={
                        priorAttemptHadProposal === null ? "" : priorAttemptHadProposal ? "sim" : "nao"
                      }
                      onChange={(event) => {
                        const value = event.target.value;
                        if (value === "sim") {
                          setPriorAttemptHadProposal(true);
                          return;
                        }

                        if (value === "nao") {
                          setPriorAttemptHadProposal(false);
                          return;
                        }

                        setPriorAttemptHadProposal(null);
                      }}
                      required
                    >
                      <option value="">Selecione</option>
                      <option value="sim">Sim</option>
                      <option value="nao">Não</option>
                    </select>
                  </label>

                  {priorAttemptHadProposal && (
                    <label>
                      Se sim, qual foi? (mín. 5 caracteres)
                      <textarea
                        value={priorAttemptProposalDetails}
                        onChange={(event) =>
                          setPriorAttemptProposalDetails(limitPetitionText(event.target.value))
                        }
                        rows={3}
                        placeholder="Descreva objetivamente a proposta de acordo apresentada."
                        maxLength={PETITION_TEXT_MAX_LENGTH}
                        required
                      />
                      <span className="field-help">
                        {priorAttemptProposalDetails.length}/{PETITION_TEXT_MAX_LENGTH} caracteres
                      </span>
                    </label>
                  )}
                </>
              )}
            </div>

            <div className="petition-section">
              <div className="petition-section-head">
                <h3>Cronologia dos eventos</h3>
                <p>Registre os fatos em ordem de data para facilitar análise e geração da petição.</p>
              </div>
              <div className="timeline-event-list">
                {timelineEvents.map((eventItem, index) => {
                  const feedback = getTimelineEventFeedback(eventItem);
                  return (
                    <div key={`timeline-event-${index}`} className="timeline-event-row">
                      <label>
                        Evento {index + 1} - Data
                        <input
                          type="date"
                          value={eventItem.eventDate}
                          onChange={(event) => handleTimelineEventChange(index, "eventDate", event.target.value)}
                        />
                      </label>
                      <label>
                        Descrição do evento (mín. 5 caracteres)
                        <textarea
                          value={eventItem.description}
                          onChange={(event) =>
                            handleTimelineEventChange(index, "description", event.target.value)
                          }
                          rows={2}
                          placeholder="Descreva o que aconteceu nessa data."
                          maxLength={PETITION_TEXT_MAX_LENGTH}
                        />
                        <span className="field-help">
                          {eventItem.description.length}/{PETITION_TEXT_MAX_LENGTH} caracteres
                        </span>
                        <span
                          className={
                            feedback.tone === "success"
                              ? "success-text"
                              : feedback.tone === "error"
                                ? "error-text"
                                : "field-help"
                          }
                        >
                          {feedback.message}
                        </span>
                      </label>
                      <div className="timeline-event-actions">
                        <button
                          type="button"
                          className="ghost-button"
                          onClick={() => handleRemoveTimelineEvent(index)}
                        >
                          Remover
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
              <button type="button" className="secondary-button timeline-add-button" onClick={handleAddTimelineEvent}>
                Adicionar evento
              </button>
              <p className="field-help">
                Os eventos preenchidos são mantidos no rascunho automaticamente. O último evento também é enviado na análise.
              </p>
            </div>

            <div className="petition-section">
              <div className="petition-section-head">
                <h3>Pretensão do cliente</h3>
                <p>Selecione os pedidos desejados e detalhe valor ou condições quando necessário.</p>
              </div>

              <div className="pretension-grid">
                {pretensionDrafts.map((draft) => {
                  const option = getPretensionOption(draft.type);

                  return (
                    <div key={draft.type} className="pretension-card">
                      <label className="pretension-check">
                        <input
                          type="checkbox"
                          checked={draft.selected}
                          onChange={(event) => handlePretensionSelection(draft.type, event.target.checked)}
                        />
                        <span>{option.label}</span>
                      </label>

                      {draft.selected && (
                        <div className="pretension-fields">
                          {option.requiresAmount && (
                            <label>
                              {option.amountLabel ?? "Valor"}
                              <input
                                type="text"
                                value={draft.amountInput}
                                onChange={(event) =>
                                  handlePretensionFieldChange(draft.type, "amountInput", event.target.value)
                                }
                                onBlur={(event) =>
                                  handlePretensionFieldChange(
                                    draft.type,
                                    "amountInput",
                                    formatCurrencyInputOnBlur(event.target.value)
                                  )
                                }
                                inputMode="decimal"
                                placeholder="Ex: 1.500,00"
                              />
                            </label>
                          )}

                          <label>
                            {option.detailsLabel ?? "Detalhes"}
                            <textarea
                              value={draft.details}
                              onChange={(event) =>
                                handlePretensionFieldChange(draft.type, "details", event.target.value)
                              }
                              rows={2}
                              placeholder={option.detailsPlaceholder ?? "Descreva objetivamente o pedido."}
                              maxLength={PETITION_TEXT_MAX_LENGTH}
                            />
                            <span className="field-help">
                              {draft.details.length}/{PETITION_TEXT_MAX_LENGTH} caracteres
                            </span>
                          </label>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            <label>
              Fatos (mín. 30 caracteres)
              <textarea
                value={facts}
                onChange={(event) => setFacts(limitPetitionText(event.target.value))}
                rows={7}
                placeholder="Narrativa cronológica do que ocorreu, com datas e detalhes relevantes."
                maxLength={PETITION_TEXT_MAX_LENGTH}
                required
              />
              <span className="field-help">
                {facts.length}/{PETITION_TEXT_MAX_LENGTH} caracteres
              </span>
            </label>

            <label>
              Pedidos complementares (opcional, um por linha)
              <textarea
                value={requestsText}
                onChange={(event) => setRequestsText(limitPetitionText(event.target.value))}
                rows={6}
                placeholder={"- Restituição em dobro dos valores cobrados indevidamente.\n- Indenização por danos morais.\n- Inversão do ônus da prova."}
                maxLength={PETITION_TEXT_MAX_LENGTH}
              />
              <span className="field-help">
                {requestsText.length}/{PETITION_TEXT_MAX_LENGTH} caracteres
              </span>
            </label>

            <div className="evidence-field">
              <div className="evidence-field-header">
                <span className="evidence-field-title">Provas e documentos</span>
                <button
                  type="button"
                  className="attachment-trigger"
                  onClick={() => attachmentInputRef.current?.click()}
                >
                  <span className="attachment-trigger-icon">
                    <PaperclipIcon />
                  </span>
                  Incluir anexos
                </button>
              </div>
              <textarea
                value={evidence}
                onChange={(event) => setEvidence(limitPetitionText(event.target.value))}
                rows={4}
                placeholder="Contratos, conversas, notas fiscais, protocolos e demais evidências."
                maxLength={PETITION_TEXT_MAX_LENGTH}
              />
              <p className="field-help">
                {evidence.length}/{PETITION_TEXT_MAX_LENGTH} caracteres
              </p>
              <input
                ref={attachmentInputRef}
                type="file"
                multiple
                accept={ATTACHMENT_ACCEPT}
                className="hidden-file-input"
                onChange={handleAttachmentInputChange}
              />
              <p className="field-help">
                Até {MAX_ATTACHMENTS_PER_CASE} arquivos, limite de{" "}
                {formatAttachmentSize(MAX_ATTACHMENT_SIZE_BYTES)} por arquivo.
              </p>
              {attachmentFeedback && <p className="success-text">{attachmentFeedback}</p>}
              {attachments.length > 0 && (
                <ul className="attachment-list">
                  {attachments.map((file, index) => (
                    <li key={attachmentFingerprint(file)}>
                      <div>
                        <strong>{file.name}</strong>
                        <span>{formatAttachmentSize(file.size)}</span>
                      </div>
                      <button type="button" className="attachment-remove" onClick={() => handleRemoveAttachment(index)}>
                        Remover
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <label>
              Valor total estimado da causa
              <input
                type="text"
                value={formatCurrencyBr(claimValueTotal)}
                readOnly
              />
              <span className="field-help">
                Soma automática dos valores informados nas pretensões financeiras.
              </span>
            </label>

            <label>
              Interesse em audiência de conciliação
              <select
                value={hearingInterest ? "sim" : "nao"}
                onChange={(event) => setHearingInterest(event.target.value === "sim")}
              >
                <option value="sim">Sim</option>
                <option value="nao">Não</option>
              </select>
            </label>

            {error && <p className="error-text">{error}</p>}

            <button
              type="submit"
              disabled={submitting || !profileReadyForCase || !hasVaras || !varaId || !isChecklistComplete}
            >
              {submitting ? "Salvando..." : "Salvar e enviar para análise"}
            </button>
            {!isChecklistComplete && (
              <p className="field-help">
                Checklist incompleto: {completedChecklistSteps}/{caseChecklist.length} etapas concluídas.
              </p>
            )}
          </form>

          <aside className="workspace-panel tips-card tips-card--compact">
            <h2>Checklist</h2>
            <p className="tips-checklist-progress">
              {completedChecklistSteps}/{caseChecklist.length} concluído
            </p>
            <ul className="tips-checklist" aria-label="Checklist da petição">
              {caseChecklist.map((item) => (
                <li key={item.id} className={item.done ? "is-done" : "is-pending"}>
                  {item.label}
                </li>
              ))}
            </ul>
            <div className="tips-footer">
              <p>Somente com checklist completo o sistema libera o envio para análise.</p>
            </div>
          </aside>
        </div>
      )}
    </section>
  );
}
