import { type ChangeEvent, FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
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

interface InlineProfilePatchPayload {
  cpf?: string | null;
  address?: {
    cep: string | null;
    street: string | null;
    number: string | null;
    complement: string | null;
    neighborhood: string | null;
    city: string | null;
    state: string | null;
  } | null;
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

interface BrasilApiCepResponse {
  cep?: string;
  state?: string;
  city?: string;
  neighborhood?: string;
  street?: string;
}

interface CepLookupAddress {
  street: string;
  neighborhood: string;
  city: string;
  state: string;
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

interface NewCaseDraftPayload {
  savedAt: string;
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
  urgentRequest: string;
  claimValueInput: string;
  evidence: string;
  hearingInterest: boolean;
  finalReviewConfirmed: boolean;
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
  { value: "direto_reclamado", label: "Contato direto com a parte contrária" },
  { value: "procon", label: "Procon" },
  { value: "consumidor_gov_br", label: "Consumidor.gov.br" },
  { value: "reclame_aqui", label: "Reclame Aqui" },
  { value: "outro", label: "Outro" }
];

function resolveDirectAttemptLabel(defendantType: PetitionDefendantType): string {
  return defendantType === "pessoa_fisica" ? "Próprio acusado" : "Própria empresa";
}

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

function normalizeOptionalText(value: string): string | null {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
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

function extractCepAddressFromBrasilApi(data: BrasilApiCepResponse): CepLookupAddress | null {
  const street = data.street?.trim() ?? "";
  const neighborhood = data.neighborhood?.trim() ?? "";
  const city = data.city?.trim() ?? "";
  const state = data.state?.trim().toUpperCase() ?? "";
  if (!street || !neighborhood || !city || state.length !== 2) {
    return null;
  }

  return {
    street,
    neighborhood,
    city,
    state
  };
}

function extractCepAddressFromViaCep(data: ViaCepResponse): CepLookupAddress | null {
  if (data.erro) {
    return null;
  }

  const street = data.logradouro?.trim() ?? "";
  const neighborhood = data.bairro?.trim() ?? "";
  const city = data.localidade?.trim() ?? "";
  const state = data.uf?.trim().toUpperCase() ?? "";
  if (!street || !neighborhood || !city || state.length !== 2) {
    return null;
  }

  return {
    street,
    neighborhood,
    city,
    state
  };
}

async function lookupAddressByCep(cepDigits: string): Promise<CepLookupAddress> {
  try {
    const brasilApiResponse = await fetch(`https://brasilapi.com.br/api/cep/v2/${cepDigits}`);
    if (brasilApiResponse.ok) {
      const brasilApiData = (await brasilApiResponse.json()) as BrasilApiCepResponse;
      const parsedBrasilApi = extractCepAddressFromBrasilApi(brasilApiData);
      if (parsedBrasilApi) {
        return parsedBrasilApi;
      }
    }
  } catch {
    // Mantém fallback para ViaCEP quando a consulta principal falhar.
  }

  const viaCepResponse = await fetch(`https://viacep.com.br/ws/${cepDigits}/json/`);
  if (!viaCepResponse.ok) {
    throw new Error("Falha ao consultar CEP.");
  }
  const viaCepData = (await viaCepResponse.json()) as ViaCepResponse;
  const parsedViaCep = extractCepAddressFromViaCep(viaCepData);
  if (!parsedViaCep) {
    throw new Error("CEP não encontrado.");
  }

  return parsedViaCep;
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
  const [savingInlineProfile, setSavingInlineProfile] = useState(false);
  const [cepLookupLoading, setCepLookupLoading] = useState(false);
  const [consultingCpf, setConsultingCpf] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [inlineProfileFeedback, setInlineProfileFeedback] = useState<string | null>(null);
  const [profileReadyForCase, setProfileReadyForCase] = useState(false);
  const [profileReadyMessage, setProfileReadyMessage] = useState<string | null>(null);
  const [profileCheckFinished, setProfileCheckFinished] = useState(false);
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
  const [urgentRequest, setUrgentRequest] = useState("");
  const [claimValueInput, setClaimValueInput] = useState("");
  const [evidence, setEvidence] = useState("");
  const [attachments, setAttachments] = useState<File[]>([]);
  const [attachmentFeedback, setAttachmentFeedback] = useState<string | null>(null);
  const [hearingInterest, setHearingInterest] = useState(true);
  const [cpfData, setCpfData] = useState<CpfConsultaResult | null>(null);
  const [finalReviewConfirmed, setFinalReviewConfirmed] = useState(false);
  const attachmentInputRef = useRef<HTMLInputElement | null>(null);
  const lastCepLookupRef = useRef("");
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
  const directAttemptLabel = useMemo(() => resolveDirectAttemptLabel(defendantType), [defendantType]);
  const directAttemptTargetLabel = useMemo(
    () => (defendantType === "pessoa_fisica" ? "a pessoa reclamada" : "a empresa reclamada"),
    [defendantType]
  );
  const priorAttemptChannelOptions = useMemo(
    () =>
      PRIOR_ATTEMPT_CHANNEL_OPTIONS.map((item) =>
        item.value === "direto_reclamado" ? { ...item, label: directAttemptLabel } : item
      ),
    [directAttemptLabel]
  );
  const claimantAddressSummary = useMemo(() => {
    const normalized = normalizeZipCode(claimantZipCode);
    if (
      normalized.length !== 8 ||
      claimantStreet.trim().length === 0 ||
      claimantNumber.trim().length === 0 ||
      claimantNeighborhood.trim().length === 0 ||
      claimantCity.trim().length === 0 ||
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
  const isAddressAutoFilledFromCep = useMemo(
    () =>
      normalizeZipCode(claimantZipCode).length === 8 &&
      claimantStreet.trim().length > 0 &&
      claimantNeighborhood.trim().length > 0 &&
      claimantCity.trim().length > 0 &&
      claimantState.trim().length === 2,
    [claimantCity, claimantNeighborhood, claimantState, claimantStreet, claimantZipCode]
  );
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
      urgentRequest,
      claimValueInput,
      evidence,
      hearingInterest,
      finalReviewConfirmed
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
    setUrgentRequest("");
    setClaimValueInput("");
    setEvidence("");
    setAttachments([]);
    setAttachmentFeedback(null);
    setHearingInterest(true);
    setCpfData(null);
    setFinalReviewConfirmed(false);
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

  async function handleLookupClaimantCep(
    cepOverride?: string,
    options?: {
      silentInvalid?: boolean;
    }
  ) {
    const cepDigits = normalizeZipCode(cepOverride ?? claimantZipCode);
    if (!cepDigits || cepDigits.length !== 8) {
      if (!options?.silentInvalid) {
        setError("Informe um CEP válido com 8 dígitos para consulta.");
      }
      return;
    }

    setCepLookupLoading(true);
    setError(null);
    setInlineProfileFeedback(null);

    try {
      const address = await lookupAddressByCep(cepDigits);
      setClaimantZipCode(formatZipCode(cepDigits));
      setClaimantStreet(address.street);
      setClaimantNeighborhood(address.neighborhood);
      setClaimantCity(address.city);
      setClaimantState(address.state);
      setInlineProfileFeedback("CEP encontrado. Complete número e complemento.");
      lastCepLookupRef.current = cepDigits;
    } catch (nextError) {
      const message = nextError instanceof Error ? nextError.message : "Não foi possível consultar este CEP agora.";
      setError(message);
    } finally {
      setCepLookupLoading(false);
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
      if (typeof parsed.urgentRequest === "string") {
        setUrgentRequest(parsed.urgentRequest.slice(0, PETITION_TEXT_MAX_LENGTH));
      }
      if (typeof parsed.claimValueInput === "string") {
        setClaimValueInput(parsed.claimValueInput);
      }
      if (typeof parsed.evidence === "string") {
        setEvidence(parsed.evidence.slice(0, PETITION_TEXT_MAX_LENGTH));
      }
      if (typeof parsed.hearingInterest === "boolean") {
        setHearingInterest(parsed.hearingInterest);
      }
      if (typeof parsed.finalReviewConfirmed === "boolean") {
        setFinalReviewConfirmed(parsed.finalReviewConfirmed);
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
    requestsText,
    urgentRequest,
    claimValueInput,
    resumo,
    submitting,
    timelineEvents,
    finalReviewConfirmed
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
  }, [draftHydrated, draftStorageKey, submitting, resumo, claimSubjectSelection, claimSubjectCustom, priorAttemptMade, priorAttemptChannel, priorAttemptChannelOther, priorAttemptProtocol, priorAttemptHadProposal, priorAttemptProposalDetails, defendantType, defendantName, defendantDocument, defendantAddress, facts, timelineEvents, pretensionDrafts, requestsText, urgentRequest, claimValueInput, evidence, hearingInterest, finalReviewConfirmed]);

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
            (profileAddress.street ?? "").trim().length === 0 ||
            (profileAddress.neighborhood ?? "").trim().length === 0 ||
            (profileAddress.city ?? "").trim().length === 0 ||
            (profileAddress.state ?? "").trim().length !== 2;

          if (hasMissingAddressFromCep) {
            try {
              const addressFromCep = await lookupAddressByCep(profileZipCode);
              if ((profileAddress.street ?? "").trim().length === 0) {
                profileAddress.street = addressFromCep.street;
              }
              if ((profileAddress.neighborhood ?? "").trim().length === 0) {
                profileAddress.neighborhood = addressFromCep.neighborhood;
              }
              if ((profileAddress.city ?? "").trim().length === 0) {
                profileAddress.city = addressFromCep.city;
              }
              if ((profileAddress.state ?? "").trim().length !== 2) {
                profileAddress.state = addressFromCep.state;
              }
            } catch {
              // Mantém o fluxo sem bloquear o usuário caso a consulta de CEP esteja indisponível.
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
            (profileAddress.street ?? "").trim().length > 0 &&
            (profileAddress.number ?? "").trim().length > 0 &&
            (profileAddress.neighborhood ?? "").trim().length > 0 &&
            (profileAddress.city ?? "").trim().length > 0 &&
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
            "Preencha CPF e endereço completos para continuar."
          );
          return;
        }

        setProfileReadyForCase(true);
        setProfileReadyMessage(null);
      } catch {
        setProfileReadyForCase(false);
        setProfileReadyMessage(
          "Não foi possível carregar seu cadastro agora. Preencha os dados abaixo e salve para continuar."
        );
      } finally {
        setProfileCheckFinished(true);
      }
    }

    void loadProfilePrefill();
  }, []);

  useEffect(() => {
    if (cepLookupLoading) {
      return;
    }

    const cepDigits = normalizeZipCode(claimantZipCode);
    if (!cepDigits || cepDigits.length !== 8) {
      lastCepLookupRef.current = "";
      return;
    }

    if (lastCepLookupRef.current === cepDigits) {
      return;
    }

    void handleLookupClaimantCep(cepDigits, { silentInvalid: true });
  }, [cepLookupLoading, claimantZipCode]);

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

  async function handleInlineProfileSave() {
    setError(null);
    setInlineProfileFeedback(null);

    const normalizedCpf = normalizeCpf(cpf);
    const normalizedZipCode = normalizeZipCode(claimantZipCode);
    const trimmedStreet = claimantStreet.trim();
    const trimmedNumber = claimantNumber.trim();
    const trimmedNeighborhood = claimantNeighborhood.trim();
    const trimmedCity = claimantCity.trim();
    const trimmedState = claimantState.trim().toUpperCase();
    const trimmedComplement = claimantComplement.trim();

    if (!isValidCpf(normalizedCpf)) {
      setError("Informe um CPF válido para salvar seu cadastro.");
      return;
    }

    if (normalizedZipCode.length !== 8) {
      setError("Informe um CEP válido com 8 dígitos.");
      return;
    }

    if (!trimmedStreet || !trimmedNumber || !trimmedNeighborhood || !trimmedCity || trimmedState.length !== 2) {
      setError("Preencha rua, número, bairro, cidade e UF para concluir seu cadastro.");
      return;
    }

    setSavingInlineProfile(true);
    try {
      const response = await requestWithAuthRetry<AccountProfileResponse>("/v1/users/me", {
        method: "PATCH",
        body: {
          cpf: normalizedCpf,
          address: {
            cep: normalizedZipCode,
            street: trimmedStreet,
            number: trimmedNumber,
            complement: normalizeOptionalText(trimmedComplement),
            neighborhood: trimmedNeighborhood,
            city: trimmedCity,
            state: trimmedState
          }
        } satisfies InlineProfilePatchPayload
      });

      setCpf(formatCpf(response.user.cpf ?? normalizedCpf));
      setClaimantZipCode(formatZipCode(response.user.address?.cep ?? normalizedZipCode));
      setClaimantStreet(response.user.address?.street ?? trimmedStreet);
      setClaimantNumber(response.user.address?.number ?? trimmedNumber);
      setClaimantComplement(response.user.address?.complement ?? trimmedComplement);
      setClaimantNeighborhood(response.user.address?.neighborhood ?? trimmedNeighborhood);
      setClaimantCity(response.user.address?.city ?? trimmedCity);
      setClaimantState((response.user.address?.state ?? trimmedState).toUpperCase());
      setProfileReadyForCase(true);
      setProfileReadyMessage(null);
      setInlineProfileFeedback("Cadastro salvo com sucesso. Você já pode continuar a criação do caso.");
    } catch (nextError) {
      const message =
        nextError instanceof ApiError
          ? extractValidationMessage(nextError)
          : "Não foi possível salvar seus dados agora.";
      setError(message);
    } finally {
      setSavingInlineProfile(false);
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
      setError(profileReadyMessage ?? "Complete seu cadastro para continuar.");
      return;
    }

    if (!finalReviewConfirmed) {
      setError("Revise os dados e confirme o envio na etapa final.");
      return;
    }

    if (!isValidCpf(cpf)) {
      setError("Informe um CPF válido.");
      return;
    }

    const trimmedResumo = resumo.trim();
    if (!trimmedResumo) {
      setError("Preencha o resumo do caso.");
      return;
    }

    const trimmedClaimSubject = resolvedClaimSubject.trim();
    if (!trimmedClaimSubject) {
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

    if (!trimmedStreet) {
      setError("Informe o logradouro do seu cadastro.");
      return;
    }

    if (!trimmedNumber) {
      setError("Informe o número do endereço do seu cadastro.");
      return;
    }

    if (!trimmedNeighborhood) {
      setError("Informe o bairro do seu cadastro.");
      return;
    }

    if (!trimmedCity) {
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
    if (!trimmedDefendantName) {
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

    const typedTimelineEvents = timelineEvents
      .map((item) => ({
        eventDate: item.eventDate.trim(),
        description: item.description.trim()
      }))
      .filter((item) => item.eventDate.length > 0 && item.description.length > 0);

    for (const [index, item] of typedTimelineEvents.entries()) {
      if (!isIsoDate(item.eventDate)) {
        setError(`Data inválida no evento ${index + 1}. Use o formato AAAA-MM-DD.`);
        return;
      }
    }

    const todayIso = new Date().toISOString().slice(0, 10);
    const fallbackTimelineDescription = facts.trim() || trimmedResumo || "Relato inicial do caso.";
    const normalizedTimelineEvents =
      typedTimelineEvents.length > 0
        ? typedTimelineEvents
        : [{ eventDate: todayIso, description: fallbackTimelineDescription }];

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

      if (config.requiresDetails && !details) {
        setError(`Preencha os detalhes em "${config.label}".`);
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
    const urgentRequestText = urgentRequest.trim();
    const requests = [
      ...structuredRequests,
      ...freeRequests,
      ...(urgentRequestText ? [`Pedido urgente: ${urgentRequestText}.`] : [])
    ];
    if (requests.length === 0) {
      setError("Informe seu pedido para a justiça.");
      return;
    }

    const trimmedFacts = facts.trim();
    if (!trimmedFacts) {
      setError("Conte seu caso para que possamos seguir com a análise.");
      return;
    }

    if (!isPriorAttemptSectionValid) {
      setError("Preencha os dados da tentativa de solução antes de continuar.");
      return;
    }

    const normalizedPriorAttemptMade = priorAttemptMade;
    const normalizedPriorAttemptChannel: PetitionPriorAttemptChannel | null =
      normalizedPriorAttemptMade && priorAttemptChannel ? priorAttemptChannel : null;
    const normalizedPriorAttemptChannelOther =
      normalizedPriorAttemptMade &&
      (priorAttemptChannel === "direto_reclamado" || priorAttemptChannel === "outro")
        ? normalizeOptionalText(priorAttemptChannelOther)
        : null;
    const normalizedPriorAttemptProtocol = normalizedPriorAttemptMade
      ? normalizeOptionalText(priorAttemptProtocol)
      : null;
    const normalizedPriorAttemptHadProposal = normalizedPriorAttemptMade ? priorAttemptHadProposal : null;
    const normalizedPriorAttemptProposalDetails =
      normalizedPriorAttemptMade && priorAttemptHadProposal
        ? normalizeOptionalText(priorAttemptProposalDetails)
        : null;

    const manualClaimValue = parseClaimValue(claimValueInput);
    const normalizedClaimValue =
      manualClaimValue !== null ? manualClaimValue : claimValueTotal > 0 ? claimValueTotal : null;

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
            claimValue: normalizedClaimValue,
            hearingInterest,
            priorAttemptMade: normalizedPriorAttemptMade,
            priorAttemptChannel: normalizedPriorAttemptChannel,
            priorAttemptChannelOther: normalizedPriorAttemptChannelOther,
            priorAttemptProtocol: normalizedPriorAttemptProtocol,
            priorAttemptHadProposal: normalizedPriorAttemptHadProposal,
            priorAttemptProposalDetails: normalizedPriorAttemptProposalDetails
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

    if (claimantStreet.trim().length === 0) {
      pending.push("logradouro");
    }

    if (claimantNumber.trim().length === 0) {
      pending.push("número");
    }

    if (claimantNeighborhood.trim().length === 0) {
      pending.push("bairro");
    }

    if (claimantCity.trim().length === 0) {
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
            <strong>Complete seus dados para continuar</strong>
            <span>
              {profileReadyMessage ?? "Preencha CPF e endereço abaixo para seguir sem sair desta tela."}
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
            <p className="field-help">
              Informe o CEP para preencher rua, bairro, cidade e UF automaticamente com base dos Correios. Você só
              precisa completar número e complemento.
            </p>

            <div className="address-grid">
              <label>
                CPF
                <input
                  type="text"
                  value={cpf}
                  onChange={(event) => setCpf(formatCpf(event.target.value))}
                  placeholder="000.000.000-00"
                  inputMode="numeric"
                />
              </label>
              <label>
                CEP
                <input
                  type="text"
                  value={claimantZipCode}
                  onChange={(event) => setClaimantZipCode(formatZipCode(event.target.value))}
                  placeholder="00000-000"
                  inputMode="numeric"
                />
                {cepLookupLoading && <span className="field-help">Buscando CEP...</span>}
              </label>
              <label className="address-grid-span">
                Rua
                <input
                  type="text"
                  value={claimantStreet}
                  onChange={(event) => setClaimantStreet(event.target.value)}
                  placeholder="Rua / Avenida"
                  readOnly={isAddressAutoFilledFromCep}
                />
              </label>
              <label>
                Número
                <input
                  type="text"
                  value={claimantNumber}
                  onChange={(event) => setClaimantNumber(event.target.value)}
                  placeholder="Número"
                />
              </label>
              <label>
                Complemento
                <input
                  type="text"
                  value={claimantComplement}
                  onChange={(event) => setClaimantComplement(event.target.value)}
                  placeholder="Opcional"
                />
              </label>
              <label>
                Bairro
                <input
                  type="text"
                  value={claimantNeighborhood}
                  onChange={(event) => setClaimantNeighborhood(event.target.value)}
                  placeholder="Bairro"
                  readOnly={isAddressAutoFilledFromCep}
                />
              </label>
              <label>
                Cidade
                <input
                  type="text"
                  value={claimantCity}
                  onChange={(event) => setClaimantCity(event.target.value)}
                  placeholder="Cidade"
                  readOnly={isAddressAutoFilledFromCep}
                />
              </label>
              <label>
                UF
                <input
                  type="text"
                  value={claimantState}
                  onChange={(event) => setClaimantState(event.target.value.toUpperCase())}
                  placeholder="UF"
                  maxLength={2}
                  readOnly={isAddressAutoFilledFromCep}
                />
              </label>
            </div>
            {isAddressAutoFilledFromCep && (
              <p className="field-help">
                Endereço principal preenchido automaticamente pelo CEP. Informe apenas número e complemento.
              </p>
            )}

            <div className="profile-actions">
              <button type="button" className="secondary-button" onClick={() => void handleInlineProfileSave()} disabled={savingInlineProfile}>
                {savingInlineProfile ? "Salvando..." : "Salvar dados e continuar"}
              </button>
            </div>
            {inlineProfileFeedback && <p className="success-text">{inlineProfileFeedback}</p>}
          </div>
        </section>
      ) : (
        <div className="case-layout case-layout--single">
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
              Seu CPF
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
              Resumo do caso
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
                Descreva o assunto do caso
                <input
                  type="text"
                  value={claimSubjectCustom}
                  onChange={(event) => setClaimSubjectCustom(event.target.value)}
                  placeholder="Ex.: bloqueio indevido de conta, cobrança após cancelamento, etc."
                  required
                />
              </label>
            )}

            <h2>Tentativa de solução antes da ação</h2>
            <label>
              Você tentou resolver com a parte contrária ou com algum órgão de proteção ao consumidor?
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
                  Onde você tentou resolver?
                  <select
                    value={priorAttemptChannel}
                    onChange={(event) => setPriorAttemptChannel(event.target.value as PetitionPriorAttemptChannel | "")}
                    required={priorAttemptMade}
                  >
                    <option value="">Selecione</option>
                    {priorAttemptChannelOptions.map((item) => (
                      <option key={item.value} value={item.value}>
                        {item.label}
                      </option>
                    ))}
                  </select>
                </label>

                {priorAttemptChannel === "direto_reclamado" && (
                  <label>
                    Detalhe a tratativa com {directAttemptTargetLabel}
                    <textarea
                      value={priorAttemptChannelOther}
                      onChange={(event) => setPriorAttemptChannelOther(limitPetitionText(event.target.value))}
                      rows={4}
                      placeholder={`Descreva como foi a tentativa direta com ${directAttemptTargetLabel}, incluindo datas e respostas.`}
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
                    Qual foi o canal utilizado?
                    <input
                      type="text"
                      value={priorAttemptChannelOther}
                      onChange={(event) => setPriorAttemptChannelOther(limitPetitionText(event.target.value))}
                      placeholder="Ex.: SAC da empresa, ouvidoria, plataforma externa, etc."
                      required
                    />
                  </label>
                )}

                <label>
                  Protocolo, número de atendimento ou referência da tratativa
                  <input
                    type="text"
                    value={priorAttemptProtocol}
                    onChange={(event) => setPriorAttemptProtocol(event.target.value)}
                    placeholder="Informe o número de protocolo (quando houver)"
                    required={priorAttemptChannel !== "direto_reclamado"}
                  />
                </label>

                <label>
                  Houve proposta de acordo da parte contrária?
                  <select
                    value={
                      priorAttemptHadProposal === null
                        ? ""
                        : priorAttemptHadProposal
                          ? "sim"
                          : "nao"
                    }
                    onChange={(event) => {
                      if (event.target.value === "sim") {
                        setPriorAttemptHadProposal(true);
                        return;
                      }

                      if (event.target.value === "nao") {
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
                    Detalhe a proposta recebida e por que não resolveu o problema
                    <textarea
                      value={priorAttemptProposalDetails}
                      onChange={(event) => setPriorAttemptProposalDetails(limitPetitionText(event.target.value))}
                      rows={4}
                      placeholder="Descreva a proposta apresentada e o motivo de não ter aceitado."
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

            <h2>Dados do seu cadastro</h2>
            <div className="info-box">
              <strong>Endereço do seu cadastro</strong>
              <span>{claimantAddressSummary}</span>
              <span>
                Para corrigir endereço ou CPF, acesse{" "}
                <Link to="/settings/profile?context=novo-caso">Minha Conta</Link> na seção de endereço e CPF.
              </span>
            </div>
            <h2>Contra quem você quer entrar com uma ação?</h2>
            <div className="info-box">
              <strong>Informe a pessoa ou empresa responsável pelo problema</strong>
              <span>
                Você pode preencher CPF ou CNPJ para facilitar a identificação da parte contrária.
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
              Nome da parte contrária
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

            <h2>O que você gostaria de conseguir com sua ação?</h2>
            <label>
              Qual é o seu pedido para a justiça?
              <textarea
                value={requestsText}
                onChange={(event) => setRequestsText(limitPetitionText(event.target.value))}
                rows={4}
                placeholder="Ex.: Quero receber o valor pago de volta e cancelar a cobrança indevida."
                maxLength={PETITION_TEXT_MAX_LENGTH}
                required
              />
              <span className="field-help">
                {requestsText.length}/{PETITION_TEXT_MAX_LENGTH} caracteres
              </span>
            </label>

            <label>
              Existe algum pedido urgente para análise imediata do juiz? (opcional)
              <textarea
                value={urgentRequest}
                onChange={(event) => setUrgentRequest(limitPetitionText(event.target.value))}
                rows={3}
                placeholder="Ex.: Nome negativado, bloqueio de conta, interrupção de serviço essencial."
                maxLength={PETITION_TEXT_MAX_LENGTH}
              />
              <span className="field-help">
                {urgentRequest.length}/{PETITION_TEXT_MAX_LENGTH} caracteres
              </span>
            </label>

            <h2>Conte para a gente o seu caso, com o máximo de detalhes possível</h2>
            <label>
              Relato do caso
              <textarea
                value={facts}
                onChange={(event) => setFacts(limitPetitionText(event.target.value))}
                rows={7}
                placeholder="Descreva em detalhes tudo o que aconteceu, incluindo as tentativas de resolver com a empresa, com datas e protocolos."
                maxLength={PETITION_TEXT_MAX_LENGTH}
                required
              />
              <span className="field-help">
                {facts.length}/{PETITION_TEXT_MAX_LENGTH} caracteres
              </span>
            </label>

            <div className="evidence-field">
              <div className="evidence-field-header">
                <span className="evidence-field-title">Apresente para a gente os documentos do caso</span>
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
                placeholder="Descreva os documentos e provas que está enviando."
                maxLength={PETITION_TEXT_MAX_LENGTH}
              />
              <p className="field-help">
                {evidence.length}/{PETITION_TEXT_MAX_LENGTH} caracteres
              </p>
              <ul className="tips-checklist">
                <li>Comprovante de endereço atual: conta de consumo (obrigatório)</li>
                <li>Documento de identidade: RG, CPF ou CNH (obrigatório)</li>
                <li>Contrato (quando houver)</li>
                <li>Outros documentos relevantes do caso</li>
              </ul>
              <p className="field-help">
                Precisa de ajuda para escolher os documentos? Consulte as orientações na{" "}
                <Link to="/settings/profile">Minha Conta</Link>.
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

            <h2>Qual o valor da sua causa?</h2>
            <label>
              Informe um valor estimado para a causa
              <input
                type="text"
                value={claimValueInput}
                onChange={(event) => setClaimValueInput(event.target.value)}
                onBlur={(event) => setClaimValueInput(formatCurrencyInputOnBlur(event.target.value))}
                inputMode="decimal"
                placeholder="Ex.: R$ 5.000,00"
              />
              <span className="field-help">
                Valor estimado pelo cliente. A equipe irá conferir durante a análise.
              </span>
            </label>

            <div className="petition-section">
              <div className="petition-section-head">
                <h3>Revisão final antes do envio</h3>
                <p>Confira os principais dados abaixo. Se precisar, edite os campos acima antes de finalizar.</p>
              </div>
              <ul className="tips-checklist" aria-label="Resumo da petição">
                <li>
                  <strong>Parte contrária:</strong>{" "}
                  {defendantName.trim() || "Não informado"}
                </li>
                <li>
                  <strong>Pedido para a justiça:</strong>{" "}
                  {requestsText.trim() || "Não informado"}
                </li>
                <li>
                  <strong>Pedido urgente:</strong>{" "}
                  {urgentRequest.trim() || "Não informado"}
                </li>
                <li>
                  <strong>Valor estimado:</strong>{" "}
                  {parseClaimValue(claimValueInput) !== null
                    ? formatCurrencyBr(parseClaimValue(claimValueInput) ?? 0)
                    : "Não informado"}
                </li>
              </ul>
              <label>
                <input
                  type="checkbox"
                  checked={finalReviewConfirmed}
                  onChange={(event) => setFinalReviewConfirmed(event.target.checked)}
                />{" "}
                Li e confirmo que revisei os dados antes do envio.
              </label>
            </div>

            {error && <p className="error-text">{error}</p>}

            <button
              type="submit"
              disabled={submitting || !profileReadyForCase || !hasVaras || !varaId || !finalReviewConfirmed}
            >
              {submitting ? "Salvando..." : "Salvar e enviar para análise"}
            </button>
          </form>
        </div>
      )}
    </section>
  );
}
