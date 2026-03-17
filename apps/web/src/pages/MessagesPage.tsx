import { FormEvent, useEffect, useMemo, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { ApiError, apiRequest } from "../lib/api";
import type { CaseMessageRecord, CaseRecord } from "../types";

function formatDate(value: string): string {
  return new Date(value).toLocaleString("pt-BR");
}

const ROLE_LABEL: Record<CaseMessageRecord["senderRole"], string> = {
  client: "Cliente",
  operator: "Operador",
  master: "Master",
  system: "Sistema"
};

export function MessagesPage() {
  const { getToken, user } = useAuth();
  const [cases, setCases] = useState<CaseRecord[]>([]);
  const [selectedCaseId, setSelectedCaseId] = useState<string>("");
  const [selectedCase, setSelectedCase] = useState<CaseRecord | null>(null);
  const [newMessage, setNewMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  useEffect(() => {
    async function loadCases() {
      setLoading(true);
      setError(null);

      try {
        const token = await getToken();
        const result = await apiRequest<CaseRecord[]>("/v1/cases", { token });
        setCases(result);
        if (result.length > 0) {
          setSelectedCaseId((current) => current || result[0].id);
        }
      } catch (nextError) {
        const message = nextError instanceof ApiError ? nextError.message : "Falha ao carregar casos.";
        setError(message);
      } finally {
        setLoading(false);
      }
    }

    void loadCases();
  }, [getToken]);

  useEffect(() => {
    async function loadSelectedCase() {
      if (!selectedCaseId) {
        setSelectedCase(null);
        return;
      }

      setError(null);
      try {
        const token = await getToken();
        const result = await apiRequest<CaseRecord>(`/v1/cases/${selectedCaseId}`, { token });
        setSelectedCase(result);
      } catch (nextError) {
        const message = nextError instanceof ApiError ? nextError.message : "Falha ao carregar mensagens do caso.";
        setError(message);
      }
    }

    void loadSelectedCase();
  }, [getToken, selectedCaseId]);

  const orderedMessages = useMemo(() => {
    if (!selectedCase?.messages) {
      return [];
    }

    return [...selectedCase.messages].sort((a, b) => (a.createdAt > b.createdAt ? 1 : -1));
  }, [selectedCase?.messages]);

  async function handleSendMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedCaseId) {
      return;
    }

    const payload = newMessage.trim();
    if (!payload) {
      setError("Escreva uma mensagem antes de enviar.");
      return;
    }

    setSending(true);
    setError(null);
    setFeedback(null);

    try {
      const token = await getToken();
      const updated = await apiRequest<CaseRecord>(`/v1/cases/${selectedCaseId}/messages`, {
        method: "POST",
        token,
        body: {
          message: payload
        }
      });

      setSelectedCase(updated);
      setCases((current) =>
        current.map((item) => (item.id === updated.id ? { ...item, messages: updated.messages } : item))
      );
      setNewMessage("");
      setFeedback("Mensagem enviada.");
    } catch (nextError) {
      const message = nextError instanceof ApiError ? nextError.message : "Falha ao enviar mensagem.";
      setError(message);
    } finally {
      setSending(false);
    }
  }

  return (
    <section className="page-stack">
      <section className="workspace-hero workspace-hero--simple workspace-hero--compact">
        <div className="workspace-hero-grid">
          <div>
            <p className="hero-kicker">Comunicação</p>
            <h1>Mensagens dos casos</h1>
            <p>Converse com o operador ou cliente sobre documentos pendentes e próximos passos do caso.</p>
          </div>
        </div>
      </section>

      <section className="workspace-panel">
        {loading && <p>Carregando mensagens...</p>}
        {error && <p className="error-text">{error}</p>}

        {!loading && cases.length === 0 && (
          <div className="empty-state">
            <h2>Sem casos para mensagens</h2>
            <p>Assim que houver um caso ativo, a conversa ficará disponível aqui.</p>
          </div>
        )}

        {!loading && cases.length > 0 && (
          <div className="messages-layout">
            <aside className="messages-cases">
              <h2>Casos</h2>
              <ul className="messages-case-list">
                {cases.map((item) => (
                  <li key={item.id}>
                    <button
                      type="button"
                      className={selectedCaseId === item.id ? "messages-case-button messages-case-button--active" : "messages-case-button"}
                      onClick={() => setSelectedCaseId(item.id)}
                    >
                      <strong>{item.varaNome}</strong>
                      <span>{item.caseCode}</span>
                      <small>{item.resumo}</small>
                    </button>
                  </li>
                ))}
              </ul>
            </aside>

            <div className="messages-thread-card">
              {selectedCase ? (
                <>
                  <header className="messages-thread-header">
                    <h2>{selectedCase.varaNome}</h2>
                    <span>{selectedCase.caseCode}</span>
                  </header>

                  <div className="messages-thread-list">
                    {orderedMessages.length === 0 ? (
                      <p className="helper-text">Ainda não há mensagens neste caso.</p>
                    ) : (
                      orderedMessages.map((item) => {
                        const mine = item.senderUserId === user?.uid;
                        return (
                          <article
                            key={item.id}
                            className={mine ? "message-bubble message-bubble--mine" : "message-bubble"}
                          >
                            <div className="message-bubble-head">
                              <strong>{mine ? "Você" : item.senderName ?? ROLE_LABEL[item.senderRole]}</strong>
                              <small>{ROLE_LABEL[item.senderRole]}</small>
                            </div>
                            <p>{item.message}</p>
                            <span>{formatDate(item.createdAt)}</span>
                          </article>
                        );
                      })
                    )}
                  </div>

                  <form className="messages-compose" onSubmit={handleSendMessage}>
                    <label>
                      Nova mensagem
                      <textarea
                        rows={3}
                        value={newMessage}
                        onChange={(event) => setNewMessage(event.target.value)}
                        placeholder="Digite sua mensagem para atualizar o caso."
                        disabled={sending}
                      />
                    </label>
                    <button type="submit" className="hero-primary" disabled={sending}>
                      {sending ? "Enviando..." : "Enviar mensagem"}
                    </button>
                    {feedback && <p className="success-text">{feedback}</p>}
                  </form>
                </>
              ) : (
                <p>Selecione um caso para visualizar a conversa.</p>
              )}
            </div>
          </div>
        )}
      </section>
    </section>
  );
}
