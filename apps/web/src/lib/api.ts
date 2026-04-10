import type { ApiErrorResponse, ApiSuccessResponse } from "../types";

const apiBaseUrl = import.meta.env.VITE_API_URL;

if (!apiBaseUrl) {
  throw new Error("VITE_API_URL não configurada.");
}

export class ApiError extends Error {
  statusCode: number;
  details?: unknown;

  constructor(statusCode: number, message: string, details?: unknown) {
    super(message);
    this.statusCode = statusCode;
    this.details = details;
  }
}

interface ApiRequestOptions {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  token?: string;
  body?: unknown;
}

export async function apiRequest<T>(path: string, options: ApiRequestOptions = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${apiBaseUrl}${path}`, {
      method: options.method ?? "GET",
      headers: {
        "Content-Type": "application/json",
        ...(options.token ? { Authorization: `Bearer ${options.token}` } : {})
      },
      body: options.body ? JSON.stringify(options.body) : undefined
    });
  } catch {
    throw new ApiError(
      0,
      "Não foi possível conectar ao servidor. Verifique a conexão e se a API está ativa."
    );
  }

  const rawBody = await response.text();
  let data: ApiSuccessResponse<T> | ApiErrorResponse | null = null;
  if (rawBody.trim().length > 0) {
    try {
      data = JSON.parse(rawBody) as ApiSuccessResponse<T> | ApiErrorResponse;
    } catch {
      data = null;
    }
  }

  if (!response.ok) {
    const message =
      data && typeof data === "object" && "message" in data
        ? data.message
        : `Erro HTTP ${response.status} ao comunicar com o servidor.`;
    const details = data && typeof data === "object" && "details" in data ? data.details : undefined;
    throw new ApiError(response.status, message, details);
  }

  if (!data || data.status !== "ok") {
    const message =
      data && typeof data === "object" && "message" in data
        ? data.message
        : "Resposta inválida da API.";
    const details = data && typeof data === "object" && "details" in data ? data.details : undefined;
    throw new ApiError(response.status, message, details);
  }

  return data.result;
}
