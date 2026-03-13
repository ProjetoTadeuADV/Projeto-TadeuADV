import process from "node:process";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

function fail(message) {
  console.error(`[env-check] ${message}`);
  process.exit(1);
}

function warn(message) {
  console.warn(`[env-check] ${message}`);
}

function looksLikePlaceholder(value) {
  const normalized = value.toLowerCase();
  return (
    normalized.includes("sua_api") ||
    normalized.includes("seu_app") ||
    normalized.includes("your_api") ||
    normalized.includes("your-app") ||
    normalized.includes("example") ||
    normalized.includes("placeholder")
  );
}

function isLocalHost(hostname) {
  const host = hostname.toLowerCase();
  return host === "localhost" || host === "127.0.0.1" || host === "0.0.0.0";
}

function parseDotEnvFile(filePath) {
  if (!existsSync(filePath)) {
    return {};
  }

  const content = readFileSync(filePath, "utf8");
  const result = {};
  const lines = content.split(/\r?\n/);

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex <= 0) {
      continue;
    }

    const key = trimmed.slice(0, separatorIndex).trim();
    let value = trimmed.slice(separatorIndex + 1).trim();

    if (
      (value.startsWith("\"") && value.endsWith("\"")) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    result[key] = value;
  }

  return result;
}

function loadViteEnvFromFiles() {
  const mode = (process.env.MODE ?? process.env.NODE_ENV ?? "development").toLowerCase();
  const files = [".env", ".env.local", `.env.${mode}`, `.env.${mode}.local`];
  const loaded = {};

  for (const fileName of files) {
    const filePath = resolve(process.cwd(), fileName);
    Object.assign(loaded, parseDotEnvFile(filePath));
  }

  return loaded;
}

const envFromFiles = loadViteEnvFromFiles();
const apiUrlRaw = (process.env.VITE_API_URL ?? envFromFiles.VITE_API_URL ?? "").trim();
const isVercel = process.env.VERCEL === "1";
const isNodeProd = (process.env.NODE_ENV ?? "").toLowerCase() === "production";
const strictValidation = isVercel || isNodeProd || process.env.STRICT_ENV_VALIDATION === "1";

if (!apiUrlRaw) {
  fail("VITE_API_URL nao foi definida.");
}

if (looksLikePlaceholder(apiUrlRaw)) {
  fail(
    `VITE_API_URL parece placeholder (${apiUrlRaw}). Configure a URL real da API antes do deploy.`
  );
}

if (apiUrlRaw.startsWith("/")) {
  console.log(`[env-check] VITE_API_URL valida (relativa): ${apiUrlRaw}`);
  process.exit(0);
}

let parsedApiUrl;
try {
  parsedApiUrl = new URL(apiUrlRaw);
} catch {
  fail(`VITE_API_URL invalida: ${apiUrlRaw}`);
}

if (strictValidation && isLocalHost(parsedApiUrl.hostname)) {
  fail(
    `VITE_API_URL usa localhost em modo de deploy (${apiUrlRaw}). Aponte para o backend no ar.`
  );
}

if (strictValidation && parsedApiUrl.protocol !== "https:") {
  fail(`VITE_API_URL deve usar https em deploy (${apiUrlRaw}).`);
}

if (!strictValidation && isLocalHost(parsedApiUrl.hostname)) {
  warn(`VITE_API_URL em localhost (${apiUrlRaw}) - esperado para ambiente local.`);
}

console.log(`[env-check] VITE_API_URL valida: ${parsedApiUrl.origin}`);
