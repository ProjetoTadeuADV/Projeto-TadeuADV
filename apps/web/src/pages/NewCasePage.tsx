import { FormEvent, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { apiRequest, ApiError } from "../lib/api";
import { formatCpf, isValidCpf, normalizeCpf } from "../lib/cpf";
import type { CaseRecord, CpfConsultaResult, VaraOption } from "../types";

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

  useEffect(() => {
    async function loadVaras() {
      setLoadingVaras(true);
      try {
        const data = await apiRequest<VaraOption[]>("/v1/varas");
        setVaras(data);
        if (data.length > 0) {
          setVaraId(data[0].id);
        }
      } catch {
        setError("Falha ao carregar a lista de varas.");
      } finally {
        setLoadingVaras(false);
      }
    }

    void loadVaras();
  }, []);

  async function handleCpfLookup() {
    setCpfData(null);
    setError(null);

    if (!isValidCpf(cpf)) {
      setError("CPF inválido para consulta.");
      return;
    }

    setConsultingCpf(true);
    try {
      const token = await getToken();
      const result = await apiRequest<CpfConsultaResult>("/v1/cpf/consulta", {
        method: "POST",
        token,
        body: { cpf: normalizeCpf(cpf) }
      });
      setCpfData(result);
    } catch (err) {
      const message = err instanceof ApiError ? err.message : "Erro na consulta de CPF.";
      setError(message);
    } finally {
      setConsultingCpf(false);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (!isValidCpf(cpf)) {
      setError("Informe um CPF válido.");
      return;
    }

    if (resumo.trim().length < 10) {
      setError("Descreva o problema com pelo menos 10 caracteres.");
      return;
    }

    setSubmitting(true);
    try {
      const token = await getToken();
      const created = await apiRequest<CaseRecord>("/v1/cases", {
        method: "POST",
        token,
        body: {
          varaId,
          cpf: normalizeCpf(cpf),
          resumo
        }
      });

      navigate(`/cases/${created.id}`, { replace: true });
    } catch (err) {
      const message = err instanceof ApiError ? err.message : "Erro ao criar caso.";
      setError(message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="page-stack">
      <header className="page-header">
        <div>
          <h1>Novo Caso</h1>
          <p>Informe a vara, o CPF e um resumo do problema para iniciar.</p>
        </div>
      </header>

      {loadingVaras ? (
        <p>Carregando formulário...</p>
      ) : (
        <form className="form-grid case-form" onSubmit={handleSubmit}>
          <label>
            Vara
            <select value={varaId} onChange={(event) => setVaraId(event.target.value)} required>
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
                disabled={consultingCpf}
              >
                {consultingCpf ? "Consultando..." : "Consultar CPF"}
              </button>
            </div>
          </label>

          {cpfData && (
            <div className="info-box">
              <strong>Consulta CPF (mock)</strong>
              <span>Nome: {cpfData.nome}</span>
              <span>Situação: {cpfData.situacao}</span>
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

          <button type="submit" disabled={submitting}>
            {submitting ? "Salvando..." : "Abrir caso"}
          </button>
        </form>
      )}
    </section>
  );
}

