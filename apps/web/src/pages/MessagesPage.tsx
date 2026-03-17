import { type ChangeEvent, FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { ApiError, apiRequest } from "../lib/api";
import type { CaseMessageRecord, CaseRecord, PetitionAttachment } from "../types";

const MAX_ATTACHMENTS_PER_MESSAGE = 8;
const MAX_ATTACHMENT_SIZE_BYTES = 10 * 1024 * 1024;
const ATTACHMENT_ACCEPT = ".pdf,.jpg,.jpeg,.png,.webp,.txt,.doc,.docx";

function formatDate(value: string): string {
  return new Date(value).toLocaleString("pt-BR");
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

function extractFileName(contentDisposition: string | null): string | null {
  if (!contentDisposition) {
    return null;
  }

  const match = contentDisposition.match(/filename="?([^";]+)"?/i);
  return match?.[1] ?? null;
}

function triggerDownload(blob: Blob, fileName: string): void {
  const url = window.URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.URL.revokeObjectURL(url);
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

const ROLE_LABEL: Record<CaseMessageRecord["senderRole"], string> = {
  client: "Cliente",
  operator: "Operador",
  master: "Master",
  system: "Sistema"
};

function filterCasesForMessages(cases: CaseRecord[], userId: string | undefined, isOperator: boolean, isMaster: boolean) {
  if (!isOperator || isMaster || !userId) {
    return cases;
  }

  return cases.filter((item) => item.assignedOperatorId === userId);
}

export function MessagesPage() {
  const { getToken, user, isOperatorUser, isMasterUser } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedCaseId = searchParams.get("caseId") ?? "";

  const [cases, setCases] = useState<CaseRecord[]>([]);
  const [selectedCaseId, setSelectedCaseId] = useState<string>("");
  const [selectedCase, setSelectedCase] = useState<CaseRecord | null>(null);
  const [newMessage, setNewMessage] = useState("");
  const [pendingAttachments, setPendingAttachments] = useState<File[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingThread, setLoadingThread] = useState(false);
  const [sending, setSending] = useState(false);
  const [downloadingAttachmentId, setDownloadingAttachmentId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const attachmentInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    async function loadCases() {
      setLoading(true);
      setError(null);

      try {
        const token = await getToken();
        const result = await apiRequest<CaseRecord[]>("/v1/cases", { token });
        const filtered = filterCasesForMessages(result, user?.uid, isOperatorUser, isMasterUser);
        setCases(filtered);

        setSelectedCaseId((current) => {
          const preferredCaseId = [requestedCaseId, current, filtered[0]?.id].find(
            (candidate) => typeof candidate === "string" && filtered.some((item) => item.id === candidate)
          );
          return preferredCaseId ?? "";
        });
      } catch (nextError) {
        const message = nextError instanceof ApiError ? nextError.message : "Falha ao carregar casos.";
        setError(message);
      } finally {
        setLoading(false);
      }
    }

    void loadCases();
  }, [getToken, isMasterUser, isOperatorUser, requestedCaseId, user?.uid]);

  useEffect(() => {
    async function loadSelectedCase() {
      if (!selectedCaseId || !cases.some((item) => item.id === selectedCaseId)) {
        setSelectedCase(null);
        return;
      }

      setLoadingThread(true);
      setError(null);
      try {
        const token = await getToken();
        const result = await apiRequest<CaseRecord>(`/v1/cases/${selectedCaseId}`, { token });
        setSelectedCase(result);
      } catch (nextError) {
        const message = nextError instanceof ApiError ? nextError.message : "Falha ao carregar mensagens do caso.";
        setError(message);
      } finally {
        setLoadingThread(false);
      }
    }

    void loadSelectedCase();
  }, [cases, getToken, selectedCaseId]);

  const orderedMessages = useMemo(() => {
    if (!selectedCase?.messages) {
      return [];
    }

    return [...selectedCase.messages].sort((a, b) => (a.createdAt > b.createdAt ? 1 : -1));
  }, [selectedCase?.messages]);

  function handleSelectCase(caseId: string) {
    setSelectedCaseId(caseId);
    setSearchParams({ caseId });
    setFeedback(null);
    setError(null);
  }

  function handleAttachmentInputChange(event: ChangeEvent<HTMLInputElement>) {
    const selected = Array.from(event.target.files ?? []);
    event.target.value = "";

    if (selected.length === 0) {
      return;
    }

    const oversized = selected.find((item) => item.size > MAX_ATTACHMENT_SIZE_BYTES);
    if (oversized) {
      setError(`O arquivo ${oversized.name} excede ${formatAttachmentSize(MAX_ATTACHMENT_SIZE_BYTES)}.`);
      return;
    }

    setPendingAttachments((current) => {
      const known = new Set(current.map((item) => attachmentFingerprint(item)));
      const merged = [...current];

      for (const file of selected) {
        const key = attachmentFingerprint(file);
        if (known.has(key)) {
          continue;
        }

        merged.push(file);
        known.add(key);
      }

      if (merged.length > MAX_ATTACHMENTS_PER_MESSAGE) {
        setError(`Limite de ${MAX_ATTACHMENTS_PER_MESSAGE} anexos por mensagem.`);
        return current;
      }

      setError(null);
      return merged;
    });
  }

  function handleRemovePendingAttachment(index: number) {
    setPendingAttachments((current) => current.filter((_, currentIndex) => currentIndex !== index));
  }

  async function sendMessage(caseId: string, message: string, files: File[]): Promise<CaseRecord> {
    const token = await getToken();
    const formData = new FormData();
    formData.append("message", message);
    files.forEach((file) => formData.append("attachments", file));

    const response = await fetch(`${import.meta.env.VITE_API_URL}/v1/cases/${caseId}/messages`, {
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
      const messageText =
        typeof payload === "object" &&
        payload !== null &&
        "message" in payload &&
        typeof (payload as { message?: unknown }).message === "string"
          ? (payload as { message: string }).message
          : "Falha ao enviar mensagem.";
      throw new ApiError(response.status, messageText);
    }

    return (payload as { result: CaseRecord }).result;
  }

  async function handleSendMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedCaseId) {
      return;
    }

    const payload = newMessage.trim();
    if (!payload && pendingAttachments.length === 0) {
      setError("Escreva uma mensagem ou adicione anexos antes de enviar.");
      return;
    }

    setSending(true);
    setError(null);
    setFeedback(null);

    try {
      const updated = await sendMessage(selectedCaseId, payload, pendingAttachments);
      setSelectedCase(updated);
      setCases((current) => current.map((item) => (item.id === updated.id ? updated : item)));
      setNewMessage("");
      setPendingAttachments([]);
      setFeedback("Mensagem enviada.");
    } catch (nextError) {
      const message = nextError instanceof ApiError ? nextError.message : "Falha ao enviar mensagem.";
      setError(message);
    } finally {
      setSending(false);
    }
  }

  async function handleDownloadAttachment(messageId: string, attachment: PetitionAttachment) {
    if (!selectedCaseId) {
      return;
    }

    setDownloadingAttachmentId(attachment.id);
    setError(null);
    try {
      const token = await getToken();
      const response = await fetch(
        `${import.meta.env.VITE_API_URL}/v1/cases/${selectedCaseId}/messages/${messageId}/attachments/${attachment.id}`,
        {
          method: "GET",
          headers: {
            Authorization: `Bearer ${token}`
          }
        }
      );

      if (!response.ok) {
        let message = "Falha ao baixar anexo.";
        try {
          const payload = (await response.json()) as { message?: unknown };
          if (typeof payload.message === "string" && payload.message.trim()) {
            message = payload.message;
          }
        } catch {
          // Ignora parse e usa fallback.
        }
        throw new ApiError(response.status, message);
      }

      const blob = await response.blob();
      const fileName = extractFileName(response.headers.get("content-disposition")) ?? attachment.originalName;
      triggerDownload(blob, fileName);
    } catch (nextError) {
      const message = nextError instanceof ApiError ? nextError.message : "Falha ao baixar anexo.";
      setError(message);
    } finally {
      setDownloadingAttachmentId(null);
    }
  }

  return (
    <section className="page-stack">
      <section className="workspace-hero workspace-hero--simple workspace-hero--compact">
        <div className="workspace-hero-grid">
          <div>
            <p className="hero-kicker">Comunicacao</p>
            <h1>Mensagens dos casos</h1>
            <p>Converse com o cliente no formato de chat e centralize anexos do caso.</p>
          </div>
        </div>
      </section>

      <section className="workspace-panel">
        {loading && <p>Carregando mensagens...</p>}
        {error && <p className="error-text">{error}</p>}

        {!loading && cases.length === 0 && (
          <div className="empty-state">
            <h2>Sem casos para mensagens</h2>
            <p>
              {isOperatorUser && !isMasterUser
                ? "Nao ha casos alocados para voce no momento."
                : "Assim que houver um caso ativo, a conversa ficara disponivel aqui."}
            </p>
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
                      className={
                        selectedCaseId === item.id
                          ? "messages-case-button messages-case-button--active"
                          : "messages-case-button"
                      }
                      onClick={() => handleSelectCase(item.id)}
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
                    <div>
                      <h2>{selectedCase.varaNome}</h2>
                      <span>{selectedCase.caseCode}</span>
                    </div>
                    {loadingThread && <small>Atualizando...</small>}
                  </header>

                  <div className="messages-thread-list">
                    {orderedMessages.length === 0 ? (
                      <p className="helper-text">Ainda nao ha mensagens neste caso.</p>
                    ) : (
                      orderedMessages.map((item) => {
                        const mine = item.senderUserId === user?.uid;
                        const senderLabel = mine ? "Voce" : item.senderName ?? ROLE_LABEL[item.senderRole];
                        const hasText = item.message.trim().length > 0;
                        return (
                          <article
                            key={item.id}
                            className={mine ? "message-bubble message-bubble--mine" : "message-bubble"}
                          >
                            <div className="message-bubble-head">
                              <strong>{senderLabel}</strong>
                              <small>{formatDate(item.createdAt)}</small>
                            </div>
                            {hasText && <p>{item.message}</p>}
                            {(item.attachments ?? []).length > 0 && (
                              <ul className="message-attachment-list">
                                {item.attachments.map((attachment) => (
                                  <li key={attachment.id}>
                                    <button
                                      type="button"
                                      className="message-attachment-button"
                                      onClick={() => void handleDownloadAttachment(item.id, attachment)}
                                      disabled={downloadingAttachmentId === attachment.id}
                                    >
                                      <span>{attachment.originalName}</span>
                                      <small>{formatAttachmentSize(attachment.sizeBytes)}</small>
                                    </button>
                                  </li>
                                ))}
                              </ul>
                            )}
                          </article>
                        );
                      })
                    )}
                  </div>

                  <form className="messages-compose" onSubmit={handleSendMessage}>
                    <textarea
                      rows={2}
                      value={newMessage}
                      onChange={(event) => setNewMessage(event.target.value)}
                      placeholder="Digite sua mensagem..."
                      disabled={sending}
                    />
                    <div className="messages-compose-actions">
                      <button
                        type="button"
                        className="attachment-trigger"
                        onClick={() => attachmentInputRef.current?.click()}
                        disabled={sending}
                      >
                        <span className="attachment-trigger-icon">
                          <PaperclipIcon />
                        </span>
                        Anexar
                      </button>
                      <input
                        ref={attachmentInputRef}
                        type="file"
                        multiple
                        accept={ATTACHMENT_ACCEPT}
                        className="hidden-file-input"
                        onChange={handleAttachmentInputChange}
                      />
                      <button type="submit" className="hero-primary" disabled={sending}>
                        {sending ? "Enviando..." : "Enviar"}
                      </button>
                    </div>
                    {pendingAttachments.length > 0 && (
                      <ul className="pending-message-attachments">
                        {pendingAttachments.map((file, index) => (
                          <li key={attachmentFingerprint(file)}>
                            <span>{file.name}</span>
                            <small>{formatAttachmentSize(file.size)}</small>
                            <button
                              type="button"
                              className="attachment-remove"
                              onClick={() => handleRemovePendingAttachment(index)}
                              disabled={sending}
                            >
                              Remover
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
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
