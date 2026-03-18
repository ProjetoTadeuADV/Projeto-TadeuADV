import { config as loadDotenv } from "dotenv";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const currentDir = dirname(fileURLToPath(import.meta.url));
loadDotenv({ path: resolve(currentDir, "../../.env") });

function parsePort(value: string | undefined, fallback: number): number {
  const port = Number(value);
  return Number.isFinite(port) && port > 0 ? port : fallback;
}

function parseEmailList(value: string | undefined): string[] {
  if (!value) {
    return [];
  }

  return value
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
}

export const env = {
  NODE_ENV: process.env.NODE_ENV ?? "development",
  PORT: parsePort(process.env.PORT, 8080),
  CORS_ORIGIN: process.env.CORS_ORIGIN ?? "http://localhost:5173,https://*.vercel.app",
  FIREBASE_PROJECT_ID: process.env.FIREBASE_PROJECT_ID ?? "",
  FIREBASE_CLIENT_EMAIL: process.env.FIREBASE_CLIENT_EMAIL ?? "",
  FIREBASE_PRIVATE_KEY: process.env.FIREBASE_PRIVATE_KEY ?? "",
  MOCK_CPF_DEFAULT_NAME: process.env.MOCK_CPF_DEFAULT_NAME ?? "Cliente Consultado",
  MASTER_EMAILS: parseEmailList(process.env.MASTER_EMAILS),
  VERIFY_EMAIL_CONTINUE_URL: process.env.VERIFY_EMAIL_CONTINUE_URL ?? "",
  EMAIL_BRAND_NAME: process.env.EMAIL_BRAND_NAME ?? "DoutorEu",
  EMAIL_LOGO_URL: process.env.EMAIL_LOGO_URL ?? "",
  EMAIL_FROM: process.env.EMAIL_FROM ?? "",
  EMAIL_REPLY_TO: process.env.EMAIL_REPLY_TO ?? "",
  SENDGRID_API_KEY: process.env.SENDGRID_API_KEY ?? "",
  SENDGRID_TEMPLATE_ID: process.env.SENDGRID_TEMPLATE_ID ?? "",
  ASAAS_API_KEY: process.env.ASAAS_API_KEY ?? "",
  ASAAS_BASE_URL: process.env.ASAAS_BASE_URL ?? "https://api-sandbox.asaas.com/v3",
  ASAAS_USER_AGENT: process.env.ASAAS_USER_AGENT ?? "DoutorEu-API/1.0"
};

function looksLikePlaceholder(value: string): boolean {
  const normalized = value.trim().toLowerCase();
  return (
    normalized.includes("seu_app") ||
    normalized.includes("sua_api") ||
    normalized.includes("your-app") ||
    normalized.includes("your_api") ||
    normalized.includes("example") ||
    normalized.includes("placeholder")
  );
}

function isLocalHost(rawValue: string): boolean {
  const normalized = rawValue.trim().toLowerCase();
  if (
    normalized.includes("localhost") ||
    normalized.includes("127.0.0.1") ||
    normalized.includes("0.0.0.0")
  ) {
    return true;
  }

  try {
    const parsed = new URL(normalized);
    return ["localhost", "127.0.0.1", "0.0.0.0"].includes(parsed.hostname.toLowerCase());
  } catch {
    return false;
  }
}

function assertProductionEnvSafety(): void {
  if (env.NODE_ENV !== "production") {
    return;
  }

  const issues: string[] = [];
  const corsOrigins = env.CORS_ORIGIN.split(",").map((item) => item.trim()).filter(Boolean);

  if (corsOrigins.length === 0) {
    issues.push("CORS_ORIGIN vazio.");
  }

  if (corsOrigins.some((origin) => isLocalHost(origin))) {
    issues.push("CORS_ORIGIN contem localhost/127.0.0.1.");
  }

  if (corsOrigins.some((origin) => looksLikePlaceholder(origin))) {
    issues.push("CORS_ORIGIN contem placeholder (SEU_APP/SUA_API/etc).");
  }

  if (!env.VERIFY_EMAIL_CONTINUE_URL.trim()) {
    issues.push("VERIFY_EMAIL_CONTINUE_URL vazio.");
  } else {
    if (isLocalHost(env.VERIFY_EMAIL_CONTINUE_URL)) {
      issues.push("VERIFY_EMAIL_CONTINUE_URL aponta para localhost.");
    }

    if (looksLikePlaceholder(env.VERIFY_EMAIL_CONTINUE_URL)) {
      issues.push("VERIFY_EMAIL_CONTINUE_URL contem placeholder.");
    }
  }

  if (issues.length > 0) {
    const message = [
      "Configuracao de producao invalida para API.",
      ...issues.map((item) => `- ${item}`)
    ].join("\n");
    throw new Error(message);
  }
}

function hasPlaceholder(value: string): boolean {
  return (
    value.includes("seu-projeto-firebase") ||
    value.includes("firebase-adminsdk-xxx") ||
    value.includes("-----BEGIN PRIVATE KEY-----\\n...") ||
    value.includes("...")
  );
}

export function hasFirebaseCredentials(): boolean {
  return (
    Boolean(env.FIREBASE_PROJECT_ID) &&
    Boolean(env.FIREBASE_CLIENT_EMAIL) &&
    Boolean(env.FIREBASE_PRIVATE_KEY) &&
    !hasPlaceholder(env.FIREBASE_PROJECT_ID) &&
    !hasPlaceholder(env.FIREBASE_CLIENT_EMAIL) &&
    !hasPlaceholder(env.FIREBASE_PRIVATE_KEY)
  );
}

export function isMasterEmail(email: string | null | undefined): boolean {
  if (!email) {
    return false;
  }

  return env.MASTER_EMAILS.includes(email.trim().toLowerCase());
}

assertProductionEnvSafety();
