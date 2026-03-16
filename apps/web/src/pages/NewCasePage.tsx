import { FormEvent, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { ApiError, apiRequest } from "../lib/api";
import { formatCpf, isValidCpf, normalizeCpf } from "../lib/cpf";
import type { CaseRecord, CpfConsultaResult, PetitionDefendantType, VaraOption } from "../types";

const CPF_STATUS_LABELS: Record<CpfConsultaResult["situacao"], string> = {
  regular: "Regular",
  pendente: "Pendente",
  indisponivel: "Indisponivel"
};

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
  const [claimValueInput, setClaimValueInput] = useState("");
  const [hearingInterest, setHearingInterest] = useState(true);
  const [cpfData, setCpfData] = useState<CpfConsultaResult | null>(null);

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
      setError("Selecione uma vara valida antes de consultar o CPF.");
      return;
    }

    if (!isValidCpf(cpf)) {
      setError("CPF invalido para consulta.");
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
            ? "Sua sessao expirou. Entre novamente para consultar CPF."
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
      setError("Informe um CEP valido com 8 digitos.");
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
        throw new Error("CEP nao encontrado.");
      }

      setClaimantZipCode(formatZipCode(data.cep ?? normalizedZipCode));
      setClaimantStreet((data.logradouro ?? "").trim());
      setClaimantNeighborhood((data.bairro ?? "").trim());
      setClaimantCity((data.localidade ?? "").trim());
      setClaimantState((data.uf ?? "").trim().toUpperCase());
      setZipCodeFeedback("Endereco localizado. Informe numero e complemento.");
    } catch (nextError) {
      const message = nextError instanceof Error ? nextError.message : "Nao foi possivel consultar o CEP.";
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
      setError("Nenhuma vara disponivel para abrir o caso.");
      return;
    }

    if (!isValidCpf(cpf)) {
      setError("Informe um CPF valido.");
      return;
    }

    const trimmedResumo = resumo.trim();
    if (trimmedResumo.length < 20) {
      setError("Resumo da reclamacao deve ter pelo menos 20 caracteres.");
      return;
    }

    const trimmedClaimSubject = claimSubject.trim();
    if (trimmedClaimSubject.length < 5) {
      setError("Informe o assunto principal da reclamacao.");
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
      setError("Informe um CEP valido.");
      return;
    }

    if (trimmedStreet.length < 3) {
      setError("Informe o logradouro do requerente.");
      return;
    }

    if (!trimmedNumber) {
      setError("Informe o numero do endereco do requerente.");
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
      setError("Informe os fundamentos da reclamacao com pelo menos 30 caracteres.");
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
        setError("Para pessoa fisica, informe CPF com 11 digitos.");
        return;
      }

      if (defendantType === "pessoa_juridica" && normalizedDefendantDocument.length !== 14) {
        setError("Para pessoa juridica, informe CNPJ com 14 digitos.");
        return;
      }

      if (defendantType === "nao_informado" && ![11, 14].includes(normalizedDefendantDocument.length)) {
        setError("Documento da reclamada deve conter 11 ou 14 digitos.");
        return;
      }
    }

    const parsedClaimValue = parseClaimValue(claimValueInput);
    if (claimValueInput.trim() && parsedClaimValue === null) {
      setError("Valor da causa invalido. Use formato numerico, ex: 1500,00.");
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
            claimValue: parsedClaimValue,
            hearingInterest
          }
        }
      });

      navigate(`/cases/${created.id}`, { replace: true });
    } catch (nextError) {
      const message =
        nextError instanceof ApiError
          ? nextError.statusCode === 401
            ? "Sua sessao expirou. Entre novamente para criar o caso."
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
            <p className="hero-kicker">Peticao inicial</p>
            <h1>Abrir reclamacao completa</h1>
            <p>Preencha os dados para gerar uma peticao mais pronta para protocolo.</p>
          </div>
        </div>
      </section>

      {loadingVaras ? (
        <section className="workspace-panel">
          <p>Carregando formulario...</p>
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
                <strong>Consulta de CPF (simulacao interna)</strong>
                <span>Vara selecionada: {selectedVaraName || "Nao informada"}</span>
                <span>Nome: {cpfData.nome}</span>
                <span>Situacao: {CPF_STATUS_LABELS[cpfData.situacao]}</span>
                <span>Atualizado em: {new Date(cpfData.updatedAt).toLocaleString("pt-BR")}</span>
              </div>
            )}

            <label>
              Resumo executivo da reclamacao
              <textarea
                value={resumo}
                onChange={(event) => setResumo(event.target.value)}
                rows={4}
                placeholder="Resumo curto para identificacao rapida do caso."
                required
              />
            </label>

            <label>
              Assunto principal da reclamacao
              <input
                type="text"
                value={claimSubject}
                onChange={(event) => setClaimSubject(event.target.value)}
                placeholder="Ex: cobranca indevida, produto nao entregue, cancelamento sem estorno"
                required
              />
            </label>

            <h2>Endereco do requerente</h2>
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
                Numero
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
                  placeholder="Apartamento, bloco, referencia (opcional)"
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
                <option value="pessoa_juridica">Pessoa juridica</option>
                <option value="pessoa_fisica">Pessoa fisica</option>
                <option value="nao_informado">Nao informado</option>
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
              Endereco da reclamada
              <input
                type="text"
                value={defendantAddress}
                onChange={(event) => setDefendantAddress(event.target.value)}
                placeholder="Opcional"
              />
            </label>

            <h2>Conteudo da peticao</h2>
            <label>
              Fatos
              <textarea
                value={facts}
                onChange={(event) => setFacts(event.target.value)}
                rows={7}
                placeholder="Narrativa cronologica do que ocorreu, com datas e detalhes relevantes."
                required
              />
            </label>

            <label>
              Fundamentos da reclamacao
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
                placeholder={"- Restituicao em dobro dos valores cobrados indevidamente.\n- Indenizacao por danos morais.\n- Inversao do onus da prova."}
                required
              />
            </label>

            <label>
              Provas e documentos
              <textarea
                value={evidence}
                onChange={(event) => setEvidence(event.target.value)}
                rows={4}
                placeholder="Contratos, conversas, notas fiscais, protocolos e demais evidencias."
              />
            </label>

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
              Interesse em audiencia de conciliacao
              <select
                value={hearingInterest ? "sim" : "nao"}
                onChange={(event) => setHearingInterest(event.target.value === "sim")}
              >
                <option value="sim">Sim</option>
                <option value="nao">Nao</option>
              </select>
            </label>

            {error && <p className="error-text">{error}</p>}

            <button type="submit" disabled={submitting || !hasVaras || !varaId}>
              {submitting ? "Salvando..." : "Salvar e gerar peticao"}
            </button>
          </form>

          <aside className="workspace-panel tips-card tips-card--compact">
            <h2>Checklist</h2>
            <ul className="tips-checklist" aria-label="Checklist da peticao">
              <li>Confirme vara e CPF do requerente.</li>
              <li>Preencha CEP e complete numero/complemento.</li>
              <li>Informe a parte reclamada com CPF ou CNPJ formatado.</li>
              <li>Descreva fatos e fundamentos com clareza objetiva.</li>
              <li>Liste pedidos em linhas separadas para o PDF.</li>
            </ul>
            <div className="tips-footer">
              <p>No detalhe do caso, use o botao de exportacao para baixar a peticao em PDF.</p>
            </div>
          </aside>
        </div>
      )}
    </section>
  );
}
