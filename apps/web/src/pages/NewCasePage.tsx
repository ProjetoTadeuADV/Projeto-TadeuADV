import { type ChangeEvent, FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { ApiError, apiRequest } from "../lib/api";
import { formatCpf, isValidCpf, normalizeCpf } from "../lib/cpf";
import type {
  AccountProfile,
  CaseRecord,
  CpfConsultaResult,
  PetitionDefendantType,
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

interface ViaCepResponse {
  cep?: string;
  logradouro?: string;
  bairro?: string;
  localidade?: string;
  uf?: string;
  erro?: boolean;
}

interface AccountProfileResponse {
  user: AccountProfile;
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

interface PretensionDraft {
  type: PetitionPretensionType;
  selected: boolean;
  amountInput: string;
  details: string;
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
  const { getToken } = useAuth();
  const navigate = useNavigate();

  const [varas, setVaras] = useState<VaraOption[]>([]);
  const [loadingVaras, setLoadingVaras] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [consultingCpf, setConsultingCpf] = useState(false);
  const [lookingUpZipCode, setLookingUpZipCode] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [zipCodeFeedback, setZipCodeFeedback] = useState<string | null>(null);

  const [varaId, setVaraId] = useState("");
  const [cpf, setCpf] = useState("");
  const [resumo, setResumo] = useState("");
  const [claimSubject, setClaimSubject] = useState("");

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
  const [legalGrounds, setLegalGrounds] = useState("");
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
  const [cpfLockedByProfile, setCpfLockedByProfile] = useState(false);
  const [claimantAddressLockedByProfile, setClaimantAddressLockedByProfile] = useState(false);
  const attachmentInputRef = useRef<HTMLInputElement | null>(null);

  const hasVaras = varas.length > 0;
  const selectedVaraName = useMemo(
    () => varas.find((item) => item.id === varaId)?.nome ?? "",
    [varas, varaId]
  );
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

  useEffect(() => {
    setDefendantDocument((current) => formatDefendantDocumentInput(current, defendantType));
  }, [defendantType]);

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
        if (data.length > 0) {
          setVaraId(data[0].id);
          return;
        }

        setError("Nenhuma vara foi configurada no sistema.");
      } catch {
        setError("Falha ao carregar a lista de varas.");
      } finally {
        setLoadingVaras(false);
      }
    }

    void loadVaras();
  }, []);

  useEffect(() => {
    async function loadProfilePrefill() {
      try {
        const profileResponse = await requestWithAuthRetry<AccountProfileResponse>("/v1/users/me", {});
        const profile = profileResponse.user;

        if (profile.cpf) {
          setCpf((current) => (current.trim().length === 0 ? formatCpf(profile.cpf ?? "") : current));
          setCpfLockedByProfile(true);
        }

        const profileAddress = profile.address;
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

          setClaimantAddressLockedByProfile(true);
        }
      } catch {
        // Sem bloqueio: usuário pode preencher manualmente caso perfil não esteja disponível.
      }
    }

    void loadProfilePrefill();
  }, []);

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
      setError("Selecione uma vara válida antes de consultar o CPF.");
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

  async function handleZipCodeLookup() {
    setError(null);
    setZipCodeFeedback(null);

    const normalizedZipCode = normalizeZipCode(claimantZipCode);
    if (normalizedZipCode.length !== 8) {
      setError("Informe um CEP válido com 8 dígitos.");
      return;
    }

    setLookingUpZipCode(true);
    try {
      const response = await fetch(`https://viacep.com.br/ws/${normalizedZipCode}/json/`);
      if (!response.ok) {
        throw new Error("Falha ao consultar CEP.");
      }

      const data = (await response.json()) as ViaCepResponse;
      if (data.erro) {
        throw new Error("CEP não encontrado.");
      }

      setClaimantZipCode(formatZipCode(data.cep ?? normalizedZipCode));
      setClaimantStreet((data.logradouro ?? "").trim());
      setClaimantNeighborhood((data.bairro ?? "").trim());
      setClaimantCity((data.localidade ?? "").trim());
      setClaimantState((data.uf ?? "").trim().toUpperCase());
      setZipCodeFeedback("Endereço localizado. Informe número e complemento.");
    } catch (nextError) {
      const message = nextError instanceof Error ? nextError.message : "Não foi possível consultar o CEP.";
      setError(message);
    } finally {
      setLookingUpZipCode(false);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setZipCodeFeedback(null);

    if (!hasVaras || !varaId) {
      setError("Nenhuma vara disponível para abrir o caso.");
      return;
    }

    if (!isValidCpf(cpf)) {
      setError("Informe um CPF válido.");
      return;
    }

    const trimmedResumo = resumo.trim();
    if (trimmedResumo.length < 20) {
      setError("Resumo da reclamação deve ter pelo menos 20 caracteres.");
      return;
    }

    const trimmedClaimSubject = claimSubject.trim();
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
      setError("Informe o logradouro do requerente.");
      return;
    }

    if (!trimmedNumber) {
      setError("Informe o número do endereço do requerente.");
      return;
    }

    if (trimmedNeighborhood.length < 2) {
      setError("Informe o bairro do requerente.");
      return;
    }

    if (trimmedCity.length < 2) {
      setError("Informe a cidade do requerente.");
      return;
    }

    if (trimmedState.length !== 2) {
      setError("Informe a UF do requerente com 2 letras.");
      return;
    }

    const claimantAddress = [
      `${trimmedStreet}, ${trimmedNumber}${trimmedComplement ? `, ${trimmedComplement}` : ""}`,
      `${trimmedNeighborhood} - ${trimmedCity}/${trimmedState}`,
      `CEP ${formatZipCode(normalizedZipCode)}`
    ].join(", ");

    const trimmedDefendantName = defendantName.trim();
    if (trimmedDefendantName.length < 2) {
      setError("Informe o nome da parte reclamada.");
      return;
    }

    const normalizedDefendantDocument = normalizeDigits(defendantDocument);
    if (!normalizedDefendantDocument) {
      setError("Informe CPF ou CNPJ da parte reclamada.");
      return;
    }

    if (defendantType === "pessoa_fisica" && normalizedDefendantDocument.length !== 11) {
      setError("Para pessoa física, informe CPF com 11 dígitos.");
      return;
    }

    if (defendantType === "pessoa_juridica" && normalizedDefendantDocument.length !== 14) {
      setError("Para pessoa jurídica, informe CNPJ com 14 dígitos.");
      return;
    }

    if (defendantType === "nao_informado" && ![11, 14].includes(normalizedDefendantDocument.length)) {
      setError("Documento da reclamada deve conter 11 ou 14 dígitos.");
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

    const trimmedLegalGrounds = legalGrounds.trim();
    if (trimmedLegalGrounds.length < 30) {
      setError("Informe os fundamentos da reclamação com pelo menos 30 caracteres.");
      return;
    }

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
            hearingInterest
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

      navigate(`/cases/${created.id}`, { replace: true });
    } catch (nextError) {
      const message =
        nextError instanceof ApiError
          ? nextError.statusCode === 401
            ? "Sua sessão expirou. Entre novamente para criar o caso."
            : nextError.message
          : "Erro ao criar caso.";
      setError(message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="page-stack">
      <section className="workspace-hero workspace-hero--compact workspace-hero--simple">
        <div className="workspace-hero-grid">
          <div>
            <p className="hero-kicker">Petição inicial</p>
            <h1>Abrir reclamação completa</h1>
            <p>Preencha os dados para gerar uma petição mais pronta para protocolo.</p>
          </div>
        </div>
      </section>

      {loadingVaras ? (
        <section className="workspace-panel">
          <p>Carregando formulário...</p>
        </section>
      ) : (
        <div className="case-layout">
          <form className="form-grid case-form" onSubmit={handleSubmit}>
            <h2>Dados do processo</h2>

            <label>
              Vara
              <select
                value={varaId}
                onChange={(event) => setVaraId(event.target.value)}
                required
                disabled={!hasVaras}
              >
                {varas.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.nome}
                  </option>
                ))}
              </select>
            </label>

            <label>
              CPF do requerente
              <div className="inline-input">
                <input
                  type="text"
                  value={cpf}
                  onChange={(event) => setCpf(formatCpf(event.target.value))}
                  onFocus={() => {
                    if (cpfLockedByProfile) {
                      setCpfLockedByProfile(false);
                    }
                  }}
                  placeholder="000.000.000-00"
                  inputMode="numeric"
                  readOnly={cpfLockedByProfile}
                  required
                />
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => void handleCpfLookup()}
                  disabled={consultingCpf || !hasVaras || !varaId}
                >
                  {consultingCpf ? "Consultando..." : "Consultar CPF"}
                </button>
              </div>
              {cpfLockedByProfile && (
                <span className="field-help">CPF preenchido com base no seu perfil. Clique no campo para editar.</span>
              )}
            </label>

            {cpfData && (
              <div className="info-box">
                <strong>Consulta de CPF (simulação interna)</strong>
                <span>Vara selecionada: {selectedVaraName || "Não informada"}</span>
                <span>Nome: {cpfData.nome}</span>
                <span>Situação: {CPF_STATUS_LABELS[cpfData.situacao]}</span>
                <span>Atualizado em: {new Date(cpfData.updatedAt).toLocaleString("pt-BR")}</span>
              </div>
            )}

            <label>
              Resumo executivo da reclamação
              <textarea
                value={resumo}
                onChange={(event) => setResumo(limitPetitionText(event.target.value))}
                rows={4}
                placeholder="Resumo curto para identificação rápida do caso."
                maxLength={PETITION_TEXT_MAX_LENGTH}
                required
              />
              <span className="field-help">
                {resumo.length}/{PETITION_TEXT_MAX_LENGTH} caracteres
              </span>
            </label>

            <label>
              Assunto principal da reclamação
              <input
                type="text"
                value={claimSubject}
                onChange={(event) => setClaimSubject(event.target.value)}
                placeholder="Ex: cobrança indevida, produto não entregue, cancelamento sem estorno"
                required
              />
            </label>

            <h2>Endereço do requerente</h2>
            <label>
              CEP
              <div className="inline-input">
                <input
                  type="text"
                  value={claimantZipCode}
                  onChange={(event) => setClaimantZipCode(formatZipCode(event.target.value))}
                  onFocus={() => {
                    if (claimantAddressLockedByProfile) {
                      setClaimantAddressLockedByProfile(false);
                    }
                  }}
                  onBlur={() => {
                    if (normalizeZipCode(claimantZipCode).length === 8 && !claimantStreet.trim()) {
                      void handleZipCodeLookup();
                    }
                  }}
                  placeholder="00000-000"
                  inputMode="numeric"
                  readOnly={claimantAddressLockedByProfile}
                  required
                />
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => void handleZipCodeLookup()}
                  disabled={lookingUpZipCode || claimantAddressLockedByProfile}
                >
                  {lookingUpZipCode ? "Buscando..." : "Buscar CEP"}
                </button>
              </div>
              {claimantAddressLockedByProfile && (
                <span className="field-help">
                  Endereço preenchido com base no seu perfil. Clique em qualquer campo para editar.
                </span>
              )}
            </label>

            <div className="address-grid">
              <label className="address-grid-span">
                Logradouro
                <input
                  type="text"
                  value={claimantStreet}
                  onChange={(event) => setClaimantStreet(event.target.value)}
                  onFocus={() => {
                    if (claimantAddressLockedByProfile) {
                      setClaimantAddressLockedByProfile(false);
                    }
                  }}
                  placeholder="Rua, avenida, travessa..."
                  readOnly={claimantAddressLockedByProfile}
                  required
                />
              </label>

              <label>
                Número
                <input
                  type="text"
                  value={claimantNumber}
                  onChange={(event) => setClaimantNumber(event.target.value)}
                  onFocus={() => {
                    if (claimantAddressLockedByProfile) {
                      setClaimantAddressLockedByProfile(false);
                    }
                  }}
                  placeholder="123"
                  readOnly={claimantAddressLockedByProfile}
                  required
                />
              </label>

              <label className="address-grid-span">
                Complemento
                <input
                  type="text"
                  value={claimantComplement}
                  onChange={(event) => setClaimantComplement(event.target.value)}
                  onFocus={() => {
                    if (claimantAddressLockedByProfile) {
                      setClaimantAddressLockedByProfile(false);
                    }
                  }}
                  placeholder="Apartamento, bloco, referência (opcional)"
                  readOnly={claimantAddressLockedByProfile}
                />
              </label>

              <label>
                Bairro
                <input
                  type="text"
                  value={claimantNeighborhood}
                  onChange={(event) => setClaimantNeighborhood(event.target.value)}
                  onFocus={() => {
                    if (claimantAddressLockedByProfile) {
                      setClaimantAddressLockedByProfile(false);
                    }
                  }}
                  readOnly={claimantAddressLockedByProfile}
                  required
                />
              </label>

              <label>
                Cidade
                <input
                  type="text"
                  value={claimantCity}
                  onChange={(event) => setClaimantCity(event.target.value)}
                  onFocus={() => {
                    if (claimantAddressLockedByProfile) {
                      setClaimantAddressLockedByProfile(false);
                    }
                  }}
                  readOnly={claimantAddressLockedByProfile}
                  required
                />
              </label>

              <label>
                UF
                <input
                  type="text"
                  value={claimantState}
                  onChange={(event) => setClaimantState(event.target.value.replace(/[^a-zA-Z]/g, "").slice(0, 2).toUpperCase())}
                  onFocus={() => {
                    if (claimantAddressLockedByProfile) {
                      setClaimantAddressLockedByProfile(false);
                    }
                  }}
                  placeholder="SP"
                  readOnly={claimantAddressLockedByProfile}
                  required
                />
              </label>
            </div>

            {zipCodeFeedback && <p className="success-text">{zipCodeFeedback}</p>}

            <h2>Dados da parte reclamada</h2>
            <label>
              Tipo da reclamada
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
              Nome da reclamada
              <input
                type="text"
                value={defendantName}
                onChange={(event) => setDefendantName(event.target.value)}
                placeholder="Nome da empresa ou pessoa reclamada"
                required
              />
            </label>

            <label>
              {defendantType === "pessoa_fisica" ? "CPF da reclamada" : "CNPJ da reclamada"}
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
                required
              />
              <span className="field-help">Preencha apenas os números que o campo aplica a máscara automaticamente.</span>
            </label>

            <label>
              Endereço da reclamada
              <input
                type="text"
                value={defendantAddress}
                onChange={(event) => setDefendantAddress(event.target.value)}
                placeholder="Opcional"
              />
            </label>

            <h2>Conteúdo da petição</h2>
            <div className="petition-section">
              <div className="petition-section-head">
                <h3>Cronologia dos eventos</h3>
                <p>Registre os fatos em ordem de data para facilitar análise e geração da petição.</p>
              </div>
              <div className="timeline-event-list">
                {timelineEvents.map((eventItem, index) => (
                  <div key={`timeline-event-${index}`} className="timeline-event-row">
                    <label>
                      Data
                      <input
                        type="date"
                        value={eventItem.eventDate}
                        onChange={(event) => handleTimelineEventChange(index, "eventDate", event.target.value)}
                      />
                    </label>
                    <label>
                      Descrição do evento
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
                ))}
              </div>
              <button type="button" className="secondary-button timeline-add-button" onClick={handleAddTimelineEvent}>
                Adicionar evento
              </button>
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
              Fatos
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
              Fundamentos da reclamação
              <textarea
                value={legalGrounds}
                onChange={(event) => setLegalGrounds(limitPetitionText(event.target.value))}
                rows={7}
                placeholder="Base legal e argumentos que justificam os pedidos."
                maxLength={PETITION_TEXT_MAX_LENGTH}
                required
              />
              <span className="field-help">
                {legalGrounds.length}/{PETITION_TEXT_MAX_LENGTH} caracteres
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
                Opcional: até {MAX_ATTACHMENTS_PER_CASE} arquivos, limite de{" "}
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

            <button type="submit" disabled={submitting || !hasVaras || !varaId}>
              {submitting ? "Salvando..." : "Salvar e gerar petição"}
            </button>
          </form>

          <aside className="workspace-panel tips-card tips-card--compact">
            <h2>Checklist</h2>
            <ul className="tips-checklist" aria-label="Checklist da petição">
              <li>Confirme vara e CPF do requerente.</li>
              <li>Preencha CEP e complete número/complemento.</li>
              <li>Identifique a parte reclamada com nome e CPF/CNPJ obrigatórios.</li>
              <li>Preencha a cronologia com data e descrição objetiva dos eventos.</li>
              <li>Selecione as pretensões e detalhe valores quando houver.</li>
              <li>Descreva fatos e fundamentos com clareza jurídica.</li>
              <li>Use o clipe para anexar documentos da reclamação.</li>
            </ul>
            <div className="tips-footer">
              <p>No detalhe do caso, use o botão de exportação para baixar a petição em PDF.</p>
            </div>
          </aside>
        </div>
      )}
    </section>
  );
}

