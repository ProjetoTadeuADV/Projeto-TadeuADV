import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { PetitionAttachment } from "../types/case.js";
import { HttpError } from "../utils/httpError.js";

export const MAX_ATTACHMENTS_PER_CASE = 8;
export const MAX_ATTACHMENT_SIZE_BYTES = 10 * 1024 * 1024;

const LEGACY_TEMP_ATTACHMENT_ROOT = path.join(tmpdir(), "jec-api-case-attachments");
const MODULE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../");
const DEFAULT_ATTACHMENT_ROOT = path.resolve(MODULE_ROOT, ".data", "case-attachments");
const LEGACY_CWD_ATTACHMENT_ROOT = path.resolve(process.cwd(), ".data", "case-attachments");
const LEGACY_WORKSPACE_ATTACHMENT_ROOT = path.resolve(process.cwd(), "apps", "api", ".data", "case-attachments");
const STORAGE_ROOT =
  typeof process.env.CASE_ATTACHMENTS_DIR === "string" && process.env.CASE_ATTACHMENTS_DIR.trim().length > 0
    ? path.resolve(process.env.CASE_ATTACHMENTS_DIR.trim())
    : DEFAULT_ATTACHMENT_ROOT;

const MIME_EXTENSION_MAP: Record<string, string> = {
  "application/pdf": ".pdf",
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "text/plain": ".txt",
  "application/msword": ".doc",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": ".docx"
};

const ALLOWED_EXTENSIONS = new Set([".pdf", ".jpg", ".jpeg", ".png", ".webp", ".txt", ".doc", ".docx"]);

function sanitizeFileBaseName(value: string): string {
  const normalized = value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^\.+/, "")
    .trim();

  return normalized.length > 0 ? normalized.slice(0, 80) : "anexo";
}

function sanitizeExtension(value: string): string {
  if (!value || value === ".") {
    return "";
  }

  const cleaned = value.replace(/[^a-zA-Z0-9.]/g, "").toLowerCase();
  if (!cleaned.startsWith(".")) {
    return "";
  }

  return cleaned.slice(0, 10);
}

function resolveExtension(file: Express.Multer.File): string {
  const fromName = sanitizeExtension(path.extname(file.originalname ?? ""));
  if (fromName) {
    return fromName;
  }

  const fromMime = MIME_EXTENSION_MAP[file.mimetype] ?? "";
  return sanitizeExtension(fromMime);
}

function resolveCaseDirectory(caseId: string): string {
  return path.join(STORAGE_ROOT, caseId);
}

export function resolveCaseAttachmentPath(caseId: string, storedName: string): string {
  return path.join(resolveCaseDirectory(caseId), storedName);
}

export function resolveCaseAttachmentReadPaths(caseId: string, storedName: string): string[] {
  const roots = [
    STORAGE_ROOT,
    DEFAULT_ATTACHMENT_ROOT,
    LEGACY_CWD_ATTACHMENT_ROOT,
    LEGACY_WORKSPACE_ATTACHMENT_ROOT,
    LEGACY_TEMP_ATTACHMENT_ROOT
  ];
  const candidates = roots.map((root) => path.join(root, caseId, storedName));

  return candidates.filter((item, index) => candidates.indexOf(item) === index);
}

export function formatAttachmentSize(sizeBytes: number): string {
  if (!Number.isFinite(sizeBytes) || sizeBytes <= 0) {
    return "0 B";
  }

  const units = ["B", "KB", "MB", "GB"];
  let value = sizeBytes;
  let index = 0;

  while (value >= 1024 && index < units.length - 1) {
    value /= 1024;
    index += 1;
  }

  const rounded = index === 0 ? `${Math.round(value)}` : value.toFixed(1);
  return `${rounded} ${units[index]}`;
}

export async function storeCaseAttachments(
  caseId: string,
  files: Express.Multer.File[]
): Promise<PetitionAttachment[]> {
  if (files.length === 0) {
    return [];
  }

  const caseDirectory = resolveCaseDirectory(caseId);
  await fs.mkdir(caseDirectory, { recursive: true });

  const storedPaths: string[] = [];

  try {
    const attachments = await Promise.all(
      files.map(async (file) => {
        if (!file.buffer || file.size <= 0) {
          throw new HttpError(400, "Arquivo de anexo vazio ou inválido.");
        }

        if (file.size > MAX_ATTACHMENT_SIZE_BYTES) {
          throw new HttpError(
            400,
            `Arquivo acima do limite de ${formatAttachmentSize(MAX_ATTACHMENT_SIZE_BYTES)}.`
          );
        }

        const id = randomUUID();
        const extension = resolveExtension(file);
        if (!ALLOWED_EXTENSIONS.has(extension)) {
          throw new HttpError(
            400,
            "Tipo de arquivo não suportado. Use PDF, imagem, texto ou documento Word."
          );
        }
        const storedName = `${id}${extension}`;
        const safeOriginalName = sanitizeFileBaseName(path.basename(file.originalname || "anexo")) || "anexo";
        const fullPath = resolveCaseAttachmentPath(caseId, storedName);

        await fs.writeFile(fullPath, file.buffer);
        storedPaths.push(fullPath);

        return {
          id,
          originalName: safeOriginalName,
          storedName,
          mimeType: file.mimetype || "application/octet-stream",
          sizeBytes: file.size,
          uploadedAt: new Date().toISOString()
        } satisfies PetitionAttachment;
      })
    );

    return attachments;
  } catch (error) {
    await Promise.all(storedPaths.map((item) => fs.rm(item, { force: true })));
    throw error;
  }
}

export async function storeGeneratedCaseAttachment(
  caseId: string,
  input: {
    fileName: string;
    mimeType: string;
    bytes: Buffer;
  }
): Promise<PetitionAttachment> {
  const syntheticFile = {
    originalname: input.fileName,
    mimetype: input.mimeType,
    size: input.bytes.length,
    buffer: input.bytes
  } as Express.Multer.File;

  const [stored] = await storeCaseAttachments(caseId, [syntheticFile]);
  return stored;
}

