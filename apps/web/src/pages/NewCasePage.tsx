import { FormEvent, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { ApiError, apiRequest } from "../lib/api";
import { formatCpf, isValidCpf, normalizeCpf } from "../lib/cpf";
import type { CaseRecord, CpfConsultaResult, VaraOption } from "../types";

const CPF_STATUS_LABELS: Record<CpfConsultaResult["situacao"], string> = {
  regular: "Regular",
  pendente: "Pendente",
  indisponivel: "Indisponível"
};

export function NewCasePage() {
  const { getToken } = useAuth();
  const navigate = useNavigate();
  const [varas, setVaras] = useState<VaraOption[]>([]);
  const [loadingVaras, setLoadingVaras] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [consultingCpf, setConsultingCpf] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [varaId, setVaraId] = useState("");
  const [cpf, setCpf] = useState("");
  const [resumo, setResumo] = useState("");
  const [cpfData, setCpfData] = useState<CpfConsultaResult | null>(null);
  const hasVaras = varas.length > 0;

  const selectedVaraName = useMemo(
    () => varas.find((item) => item.id === varaId)?.nome ?? "",
    [varas, varaId]
  );

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
    } catch (err) {
      if (!(err instanceof ApiError) || err.statusCode !== 401) {
        throw err;
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
    } catch (err) {
      const message =
        err instanceof ApiError
          ? err.statusCode === 401
            ? "Sua sessão expirou. Entre novamente para consultar CPF."
            : err.message
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
      setError("Nenhuma vara disponível para abrir o caso.");
      return;
    }

    if (!isValidCpf(cpf)) {
      setError("Informe um CPF válido.");
      return;
    }

    const trimmedResumo = resumo.trim();
    if (trimmedResumo.length < 10) {
      setError("Descreva o problema com pelo menos 10 caracteres.");
      return;
    }

    setSubmitting(true);
    try {
      const created = await requestWithAuthRetry<CaseRecord>("/v1/cases", {
        method: "POST",
        body: {
          varaId,
          cpf: normalizeCpf(cpf),
          resumo: trimmedResumo
        }
      });

      navigate(`/cases/${created.id}`, { replace: true });
    } catch (err) {
      const message =
        err instanceof ApiError
          ? err.statusCode === 401
            ? "Sua sessão expirou. Entre novamente para criar o caso."
            : err.message
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
            <p className="hero-kicker">Novo caso</p>
            <h1>Abrir atendimento</h1>
            <p>Preencha os dados abaixo para registrar o problema e iniciar o acompanhamento.</p>
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
              CPF do cliente
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
                  onClick={handleCpfLookup}
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
              Resumo do problema
              <textarea
                value={resumo}
                onChange={(event) => setResumo(event.target.value)}
                rows={6}
                placeholder="Descreva o que aconteceu e o que você deseja resolver."
                required
              />
            </label>

            {error && <p className="error-text">{error}</p>}

            <button type="submit" disabled={submitting || !hasVaras || !varaId}>
              {submitting ? "Salvando..." : "Abrir caso"}
            </button>
          </form>

          <aside className="workspace-panel tips-card">
            <h2>Como preencher</h2>
            <div className="tips-list">
              <div>
                <strong>Escolha a vara</strong>
                <p>Selecione a opção que mais combina com o seu atendimento.</p>
              </div>
              <div>
                <strong>Confira o CPF</strong>
                <p>Use a consulta antes de enviar para evitar dados incorretos.</p>
              </div>
              <div>
                <strong>Explique com clareza</strong>
                <p>Escreva o problema e o resultado que você espera alcançar.</p>
              </div>
            </div>
            <div className="tips-footer">
              <p>
                Exemplo: "Compra não entregue no prazo acordado. Cliente pede cumprimento da oferta
                ou devolução integral."
              </p>
            </div>
          </aside>
        </div>
      )}
    </section>
  );
}
