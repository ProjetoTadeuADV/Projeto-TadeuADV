import { type ChangeEvent, FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { ApiError, apiRequest } from "../lib/api";
import { formatCpf, isValidCpf, normalizeCpf } from "../lib/cpf";
import type { CaseRecord, CpfConsultaResult, PetitionDefendantType, VaraOption } from "../types";

const CPF_STATUS_LABELS: Record<CpfConsultaResult["situacao"], string> = {
  regular: "Regular",
  pendente: "Pendente",
  indisponivel: "Indisponível"
};

const MAX_ATTACHMENTS_PER_CASE = 8;
const MAX_ATTACHMENT_SIZE_BYTES = 10 * 1024 * 1024;
const ATTACHMENT_ACCEPT = ".pdf,.jpg,.jpeg,.png,.webp,.txt,.doc,.docx";

interface ViaCepResponse {
  cep?: string;
  logradouro?: string;
  bairro?: string;
  localidade?: string;
  uf?: string;
  erro?: boolean;
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
  const [requestsText, setRequestsText] = useState("");
  const [evidence, setEvidence] = useState("");
  const [attachments, setAttachments] = useState<File[]>([]);
  const [attachmentFeedback, setAttachmentFeedback] = useState<string | null>(null);
  const [claimValueInput, setClaimValueInput] = useState("");
  const [hearingInterest, setHearingInterest] = useState(true);
  const [cpfData, setCpfData] = useState<CpfConsultaResult | null>(null);
  const attachmentInputRef = useRef<HTMLInputElement | null>(null);

  const hasVaras = varas.length > 0;
  const selectedVaraName = useMemo(
    () => varas.find((item) => item.id === varaId)?.nome ?? "",
    [varas, varaId]
  );

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

    const requests = parseRequests(requestsText);
    if (requests.length === 0) {
      setError("Informe ao menos um pedido, um por linha.");
      return;
    }

    const normalizedDefendantDocument = normalizeDigits(defendantDocument);
    if (normalizedDefendantDocument) {
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
    }

    const parsedClaimValue = parseClaimValue(claimValueInput);
    if (claimValueInput.trim() && parsedClaimValue === null) {
      setError("Valor da causa inválido. Use formato numérico, ex: 1500,00.");
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
            defendantDocument: normalizedDefendantDocument || null,
            defendantAddress: defendantAddress.trim() || null,
            facts: trimmedFacts,
            legalGrounds: trimmedLegalGrounds,
            requests,
            evidence: evidence.trim() || null,
            attachments: [],
            claimValue: parsedClaimValue,
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
                  placeholder="000.000.000-00"
                  inputMode="numeric"
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
                onChange={(event) => setResumo(event.target.value)}
                rows={4}
                placeholder="Resumo curto para identificação rápida do caso."
                required
              />
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
                  onBlur={() => {
                    if (normalizeZipCode(claimantZipCode).length === 8 && !claimantStreet.trim()) {
                      void handleZipCodeLookup();
                    }
                  }}
                  placeholder="00000-000"
                  inputMode="numeric"
                  required
                />
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => void handleZipCodeLookup()}
                  disabled={lookingUpZipCode}
                >
                  {lookingUpZipCode ? "Buscando..." : "Buscar CEP"}
                </button>
              </div>
            </label>

            <div className="address-grid">
              <label className="address-grid-span">
                Logradouro
                <input
                  type="text"
                  value={claimantStreet}
                  onChange={(event) => setClaimantStreet(event.target.value)}
                  placeholder="Rua, avenida, travessa..."
                  required
                />
              </label>

              <label>
                Número
                <input
                  type="text"
                  value={claimantNumber}
                  onChange={(event) => setClaimantNumber(event.target.value)}
                  placeholder="123"
                  required
                />
              </label>

              <label className="address-grid-span">
                Complemento
                <input
                  type="text"
                  value={claimantComplement}
                  onChange={(event) => setClaimantComplement(event.target.value)}
                  placeholder="Apartamento, bloco, referência (opcional)"
                />
              </label>

              <label>
                Bairro
                <input
                  type="text"
                  value={claimantNeighborhood}
                  onChange={(event) => setClaimantNeighborhood(event.target.value)}
                  required
                />
              </label>

              <label>
                Cidade
                <input
                  type="text"
                  value={claimantCity}
                  onChange={(event) => setClaimantCity(event.target.value)}
                  required
                />
              </label>

              <label>
                UF
                <input
                  type="text"
                  value={claimantState}
                  onChange={(event) => setClaimantState(event.target.value.replace(/[^a-zA-Z]/g, "").slice(0, 2).toUpperCase())}
                  placeholder="SP"
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
                <option value="nao_informado">Não informado</option>
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
              {defendantType === "pessoa_fisica" ? "CPF da reclamada" : defendantType === "pessoa_juridica" ? "CNPJ da reclamada" : "CPF ou CNPJ da reclamada"}
              <input
                type="text"
                value={defendantDocument}
                onChange={(event) => setDefendantDocument(formatDefendantDocumentInput(event.target.value, defendantType))}
                placeholder={
                  defendantType === "pessoa_fisica"
                    ? "000.000.000-00"
                    : defendantType === "pessoa_juridica"
                      ? "00.000.000/0000-00"
                      : "CPF ou CNPJ"
                }
                inputMode="numeric"
              />
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
            <label>
              Fatos
              <textarea
                value={facts}
                onChange={(event) => setFacts(event.target.value)}
                rows={7}
                placeholder="Narrativa cronológica do que ocorreu, com datas e detalhes relevantes."
                required
              />
            </label>

            <label>
              Fundamentos da reclamação
              <textarea
                value={legalGrounds}
                onChange={(event) => setLegalGrounds(event.target.value)}
                rows={7}
                placeholder="Base legal e argumentos que justificam os pedidos."
                required
              />
            </label>

            <label>
              Pedidos (um por linha)
              <textarea
                value={requestsText}
                onChange={(event) => setRequestsText(event.target.value)}
                rows={6}
                placeholder={"- Restituição em dobro dos valores cobrados indevidamente.\n- Indenização por danos morais.\n- Inversão do ônus da prova."}
                required
              />
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
                onChange={(event) => setEvidence(event.target.value)}
                rows={4}
                placeholder="Contratos, conversas, notas fiscais, protocolos e demais evidências."
              />
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
              Valor da causa
              <input
                type="text"
                value={claimValueInput}
                onChange={(event) => setClaimValueInput(event.target.value)}
                placeholder="Ex: 2500,00"
              />
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
              <li>Informe a parte reclamada com CPF ou CNPJ formatado.</li>
              <li>Descreva fatos e fundamentos com clareza objetiva.</li>
              <li>Liste pedidos em linhas separadas para o PDF.</li>
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

