import { randomUUID } from "node:crypto";
import { env } from "../config/env.js";

const DEFAULT_TIMEOUT_MS = 15_000;

export interface BillingAttachmentPayload {
  fileName: string;
  mimeType: string;
  bytes: Buffer;
}

export interface BillingCustomerInput {
  userId: string;
  name: string;
  email: string;
  cpfCnpj: string;
  existingCustomerId?: string | null;
}

export interface BillingCustomerResult {
  customerId: string;
  liveMode: boolean;
}

export interface BillingBoletoInput {
  customerId: string;
  caseId: string;
  caseCode: string;
  amount: number;
  dueDate: string;
  description: string;
}

export interface BillingBoletoResult {
  paymentId: string;
  status: string;
  invoiceUrl: string | null;
  bankSlipUrl: string | null;
  attachment: BillingAttachmentPayload;
  liveMode: boolean;
}

export interface BillingProvider {
  isConfigured(): boolean;
  ensureCustomer(input: BillingCustomerInput): Promise<BillingCustomerResult>;
  createBoleto(input: BillingBoletoInput): Promise<BillingBoletoResult>;
}

interface AsaasListResponse<T> {
  data?: T[];
}

interface AsaasCustomerResponse {
  id?: string;
}

interface AsaasPaymentResponse {
  id?: string;
  status?: string;
  invoiceUrl?: string | null;
  bankSlipUrl?: string | null;
}

interface AsaasApiErrorPayload {
  errors?: Array<{ description?: string }>;
  message?: string;
}

function normalizeDigits(value: string): string {
  return value.replace(/\D/g, "");
}

function normalizeAsaasBaseUrl(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    return "https://api-sandbox.asaas.com/v3";
  }

  return trimmed.replace(/\/+$/g, "");
}

function buildMockCustomerId(userId: string): string {
  const compact = userId.replace(/[^a-zA-Z0-9]/g, "").slice(0, 24) || randomUUID().slice(0, 24);
  return `cus_mock_${compact}`;
}

function buildMoneyLabel(value: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL"
  }).format(value);
}

function toSafeIsoDate(value: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return value;
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return parsed.toISOString().slice(0, 10);
}

function buildMockBoletoAttachment(input: BillingBoletoInput): BillingAttachmentPayload {
  const text = [
    "BOLETO SIMULADO (ASAAS NAO CONFIGURADO)",
    `Caso: ${input.caseCode}`,
    `Case ID: ${input.caseId}`,
    `Valor: ${buildMoneyLabel(input.amount)}`,
    `Vencimento: ${toSafeIsoDate(input.dueDate)}`,
    "",
    "Configure ASAAS_API_KEY e ASAAS_BASE_URL para emissao real."
  ].join("\n");

  return {
    fileName: `boleto-${input.caseCode}-simulado.txt`,
    mimeType: "text/plain",
    bytes: Buffer.from(text, "utf-8")
  };
}

function buildFallbackTextAttachment(
  payment: { caseCode: string; amount: number; dueDate: string; paymentId: string; bankSlipUrl: string | null; invoiceUrl: string | null }
): BillingAttachmentPayload {
  const text = [
    "DADOS DO BOLETO",
    `Pagamento: ${payment.paymentId}`,
    `Caso: ${payment.caseCode}`,
    `Valor: ${buildMoneyLabel(payment.amount)}`,
    `Vencimento: ${toSafeIsoDate(payment.dueDate)}`,
    "",
    payment.bankSlipUrl ? `Boleto: ${payment.bankSlipUrl}` : "Boleto: nao informado",
    payment.invoiceUrl ? `Fatura: ${payment.invoiceUrl}` : "Fatura: nao informada"
  ].join("\n");

  return {
    fileName: `boleto-${payment.caseCode}.txt`,
    mimeType: "text/plain",
    bytes: Buffer.from(text, "utf-8")
  };
}

function parseAsaasErrorPayload(payload: unknown): string {
  if (!payload || typeof payload !== "object") {
    return "Erro desconhecido no Asaas.";
  }

  const typed = payload as AsaasApiErrorPayload;
  const fromErrors = typed.errors?.find((item) => typeof item.description === "string")?.description?.trim();
  if (fromErrors) {
    return fromErrors;
  }

  if (typeof typed.message === "string" && typed.message.trim()) {
    return typed.message.trim();
  }

  return "Erro desconhecido no Asaas.";
}

export class AsaasBillingProvider implements BillingProvider {
  private readonly apiKey = env.ASAAS_API_KEY.trim();
  private readonly baseUrl = normalizeAsaasBaseUrl(env.ASAAS_BASE_URL);
  private readonly userAgent = env.ASAAS_USER_AGENT.trim() || "DoutorEu-API/1.0";

  isConfigured(): boolean {
    return this.apiKey.length > 0;
  }

  async ensureCustomer(input: BillingCustomerInput): Promise<BillingCustomerResult> {
    if (!this.isConfigured()) {
      return {
        customerId: input.existingCustomerId?.trim() || buildMockCustomerId(input.userId),
        liveMode: false
      };
    }

    const normalizedCpfCnpj = normalizeDigits(input.cpfCnpj);
    if (!normalizedCpfCnpj) {
      throw new Error("CPF/CNPJ obrigatorio para criar cliente no Asaas.");
    }

    const externalReference = `USER-${input.userId}`;
    const existingById = input.existingCustomerId?.trim() || null;

    if (existingById) {
      await this.updateCustomer(existingById, input.name, input.email, normalizedCpfCnpj, externalReference);
      return {
        customerId: existingById,
        liveMode: true
      };
    }

    const foundByExternalReference = await this.findCustomerByExternalReference(externalReference);
    if (foundByExternalReference) {
      await this.updateCustomer(
        foundByExternalReference,
        input.name,
        input.email,
        normalizedCpfCnpj,
        externalReference
      );
      return {
        customerId: foundByExternalReference,
        liveMode: true
      };
    }

    const created = await this.requestJson<AsaasCustomerResponse>("/customers", {
      method: "POST",
      body: {
        name: input.name.trim(),
        email: input.email.trim().toLowerCase(),
        cpfCnpj: normalizedCpfCnpj,
        externalReference
      }
    });

    if (!created.id || typeof created.id !== "string") {
      throw new Error("Asaas nao retornou ID de cliente.");
    }

    return {
      customerId: created.id,
      liveMode: true
    };
  }

  async createBoleto(input: BillingBoletoInput): Promise<BillingBoletoResult> {
    if (!this.isConfigured()) {
      return {
        paymentId: `pay_mock_${randomUUID().slice(0, 12)}`,
        status: "PENDING",
        invoiceUrl: null,
        bankSlipUrl: null,
        attachment: buildMockBoletoAttachment(input),
        liveMode: false
      };
    }

    const created = await this.requestJson<AsaasPaymentResponse>("/payments", {
      method: "POST",
      body: {
        customer: input.customerId,
        billingType: "BOLETO",
        value: Number(input.amount.toFixed(2)),
        dueDate: input.dueDate,
        description: input.description,
        externalReference: input.caseCode
      }
    });

    const paymentId = typeof created.id === "string" && created.id.trim() ? created.id.trim() : null;
    if (!paymentId) {
      throw new Error("Asaas nao retornou ID da cobranca.");
    }

    const bankSlipUrl = typeof created.bankSlipUrl === "string" ? created.bankSlipUrl.trim() || null : null;
    const invoiceUrl = typeof created.invoiceUrl === "string" ? created.invoiceUrl.trim() || null : null;
    const pdfAttachment = await this.tryDownloadBoletoPdf(paymentId, bankSlipUrl, invoiceUrl, input.caseCode);

    return {
      paymentId,
      status: typeof created.status === "string" ? created.status : "UNKNOWN",
      invoiceUrl,
      bankSlipUrl,
      attachment:
        pdfAttachment ??
        buildFallbackTextAttachment({
          caseCode: input.caseCode,
          amount: input.amount,
          dueDate: input.dueDate,
          paymentId,
          bankSlipUrl,
          invoiceUrl
        }),
      liveMode: true
    };
  }

  private async findCustomerByExternalReference(externalReference: string): Promise<string | null> {
    try {
      const response = await this.requestJson<AsaasListResponse<{ id?: string }>>(
        `/customers?externalReference=${encodeURIComponent(externalReference)}&limit=1`,
        {
          method: "GET"
        }
      );
      const firstId = response.data?.[0]?.id;
      if (typeof firstId === "string" && firstId.trim()) {
        return firstId.trim();
      }
    } catch {
      // Ignore lookup failure and fallback to customer creation.
    }

    return null;
  }

  private async updateCustomer(
    customerId: string,
    name: string,
    email: string,
    cpfCnpj: string,
    externalReference: string
  ): Promise<void> {
    await this.requestJson<AsaasCustomerResponse>(`/customers/${encodeURIComponent(customerId)}`, {
      method: "PUT",
      body: {
        name: name.trim(),
        email: email.trim().toLowerCase(),
        cpfCnpj,
        externalReference
      }
    });
  }

  private async tryDownloadBoletoPdf(
    paymentId: string,
    bankSlipUrl: string | null,
    invoiceUrl: string | null,
    caseCode: string
  ): Promise<BillingAttachmentPayload | null> {
    const preferredUrls = [bankSlipUrl, invoiceUrl].filter(
      (item): item is string => typeof item === "string" && item.trim().length > 0
    );

    for (const url of preferredUrls) {
      const downloaded = await this.tryDownloadPdfByUrl(url, caseCode);
      if (downloaded) {
        return downloaded;
      }
    }

    const byEndpoint = await this.tryDownloadPdfByEndpoint(paymentId, caseCode);
    if (byEndpoint) {
      return byEndpoint;
    }

    return null;
  }

  private async tryDownloadPdfByUrl(url: string, caseCode: string): Promise<BillingAttachmentPayload | null> {
    const attempts: Array<{ headers?: Record<string, string> }> = [
      {},
      {
        headers: {
          access_token: this.apiKey,
          "User-Agent": this.userAgent
        }
      }
    ];

    for (const attempt of attempts) {
      try {
        const response = await this.fetchWithTimeout(url, {
          method: "GET",
          ...(attempt.headers ? { headers: attempt.headers } : {})
        });

        if (!response.ok) {
          continue;
        }

        const contentType = (response.headers.get("content-type") ?? "").toLowerCase();
        if (!contentType.includes("application/pdf")) {
          continue;
        }

        const bytes = Buffer.from(await response.arrayBuffer());
        if (bytes.length === 0) {
          continue;
        }

        return {
          fileName: `boleto-${caseCode}.pdf`,
          mimeType: "application/pdf",
          bytes
        };
      } catch {
        // Ignore and continue.
      }
    }

    return null;
  }

  private async tryDownloadPdfByEndpoint(paymentId: string, caseCode: string): Promise<BillingAttachmentPayload | null> {
    try {
      const response = await this.fetchWithTimeout(
        `${this.baseUrl}/payments/${encodeURIComponent(paymentId)}/pdf`,
        {
          method: "GET",
          headers: {
            access_token: this.apiKey,
            "User-Agent": this.userAgent
          }
        }
      );

      if (!response.ok) {
        return null;
      }

      const contentType = (response.headers.get("content-type") ?? "").toLowerCase();
      if (!contentType.includes("application/pdf")) {
        return null;
      }

      const bytes = Buffer.from(await response.arrayBuffer());
      if (bytes.length === 0) {
        return null;
      }

      return {
        fileName: `boleto-${caseCode}.pdf`,
        mimeType: "application/pdf",
        bytes
      };
    } catch {
      return null;
    }
  }

  private async requestJson<T>(
    path: string,
    options: {
      method: "GET" | "POST" | "PUT";
      body?: unknown;
    }
  ): Promise<T> {
    const url = `${this.baseUrl}${path.startsWith("/") ? path : `/${path}`}`;
    const response = await this.fetchWithTimeout(url, {
      method: options.method,
      headers: {
        access_token: this.apiKey,
        "Content-Type": "application/json",
        "User-Agent": this.userAgent
      },
      body: typeof options.body === "undefined" ? undefined : JSON.stringify(options.body)
    });

    const rawText = await response.text();
    let payload: unknown = null;
    if (rawText) {
      try {
        payload = JSON.parse(rawText);
      } catch {
        payload = rawText;
      }
    }

    if (!response.ok) {
      const message = parseAsaasErrorPayload(payload);
      throw new Error(`Asaas error ${response.status}: ${message}`);
    }

    return payload as T;
  }

  private async fetchWithTimeout(input: string, init: RequestInit): Promise<Response> {
    const abortController = new AbortController();
    const timeout = setTimeout(() => abortController.abort(), DEFAULT_TIMEOUT_MS);

    try {
      return await fetch(input, {
        ...init,
        signal: abortController.signal
      });
    } finally {
      clearTimeout(timeout);
    }
  }
}
