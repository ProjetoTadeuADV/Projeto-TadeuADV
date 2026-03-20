import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getFirebaseStorage } from "../config/firebaseAdmin.js";
import { env, hasFirebaseCredentials } from "../config/env.js";
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
const CLOUD_ATTACHMENT_PREFIX = "case-attachments";

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

function uniqueStrings(values: string[]): string[] {
  return values.filter((item, index) => values.indexOf(item) === index);
}

function normalizeStoredName(value: string): string {
  if (typeof value !== "string") {
    return "";
  }

  const normalized = value
    .trim()
    .replace(/[\\]+/g, "/")
    .replace(/^\/+/g, "");
  if (!normalized) {
    return "";
  }

  const segments = normalized.split("/").filter((segment) => segment && segment !== "." && segment !== "..");
  return segments.join("/");
}

function resolveStoredNameCandidates(storedName: string): string[] {
  const normalized = normalizeStoredName(storedName);
  if (!normalized) {
    return [];
  }

  const baseName = path.posix.basename(normalized);
  return uniqueStrings([normalized, baseName].filter(Boolean));
}

function resolveAbsoluteStoredPathCandidate(storedName: string): string | null {
  const trimmed = typeof storedName === "string" ? storedName.trim() : "";
  if (!trimmed) {
    return null;
  }

  if (path.isAbsolute(trimmed)) {
    return trimmed;
  }

  if (/^[a-zA-Z]:[\\/]/.test(trimmed)) {
    return trimmed;
  }

  return null;
}

function sanitizeBucketName(value: string): string {
  return value.trim().replace(/^gs:\/\//i, "").replace(/\/+$/g, "");
}

function resolveStorageBucketCandidates(): string[] {
  const explicitBucket = sanitizeBucketName(env.FIREBASE_STORAGE_BUCKET);
  const projectId = env.FIREBASE_PROJECT_ID.trim();
  const candidates = [
    explicitBucket,
    projectId ? `${projectId}.appspot.com` : "",
    projectId ? `${projectId}.firebasestorage.app` : ""
  ].filter(Boolean);

  return uniqueStrings(candidates);
}

function resolveCloudObjectCandidates(caseId: string, storedName: string): string[] {
  const storedCandidates = resolveStoredNameCandidates(storedName);
  const candidates: string[] = [];

  for (const item of storedCandidates) {
    candidates.push(path.posix.join(caseId, item));
    candidates.push(path.posix.join(CLOUD_ATTACHMENT_PREFIX, caseId, item));
    candidates.push(item);
  }

  return uniqueStrings(candidates);
}

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

function resolvePrimaryStoredName(storedName: string): string {
  const [first] = resolveStoredNameCandidates(storedName);
  return first ?? sanitizeFileBaseName(path.basename(storedName || "anexo"));
}

function isFileNotFoundError(error: unknown): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }

  const nodeError = error as NodeJS.ErrnoException & { statusCode?: number };
  if (nodeError.code === "ENOENT") {
    return true;
  }

  if (nodeError.statusCode === 404) {
    return true;
  }

  if (typeof nodeError.code === "string" && nodeError.code.trim() === "404") {
    return true;
  }

  return false;
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
  const storedCandidates = resolveStoredNameCandidates(storedName);
  const candidates: string[] = [];

  for (const root of roots) {
    for (const candidate of storedCandidates) {
      candidates.push(path.join(root, caseId, candidate));
      candidates.push(path.join(root, candidate));
    }
  }

  const absoluteCandidate = resolveAbsoluteStoredPathCandidate(storedName);
  if (absoluteCandidate) {
    candidates.push(absoluteCandidate);
  }

  return uniqueStrings(candidates);
}

async function writeCaseAttachmentToCloud(
  caseId: string,
  storedName: string,
  bytes: Buffer,
  mimeType: string
): Promise<void> {
  if (!hasFirebaseCredentials()) {
    return;
  }

  const storage = getFirebaseStorage();
  const bucketNames = resolveStorageBucketCandidates();
  if (bucketNames.length === 0) {
    return;
  }

  const objectPath = path.posix.join(caseId, resolvePrimaryStoredName(storedName));
  let lastError: unknown = null;

  for (const bucketName of bucketNames) {
    try {
      const bucket = storage.bucket(bucketName);
      await bucket.file(objectPath).save(bytes, {
        resumable: false,
        metadata: {
          contentType: mimeType || "application/octet-stream"
        }
      });
      return;
    } catch (error) {
      lastError = error;
    }
  }

  if (lastError) {
    const details = lastError instanceof Error ? lastError.message : "unknown";
    console.error("case-attachment-cloud-write-failed", {
      caseId,
      storedName,
      details
    });
  }
}

async function readCaseAttachmentFromCloud(caseId: string, storedName: string): Promise<Buffer | null> {
  if (!hasFirebaseCredentials()) {
    return null;
  }

  const storage = getFirebaseStorage();
  const bucketNames = resolveStorageBucketCandidates();
  if (bucketNames.length === 0) {
    return null;
  }

  const objectPathCandidates = resolveCloudObjectCandidates(caseId, storedName);
  for (const bucketName of bucketNames) {
    const bucket = storage.bucket(bucketName);

    for (const objectPath of objectPathCandidates) {
      try {
        const [downloaded] = await bucket.file(objectPath).download();
        return downloaded;
      } catch (error) {
        if (isFileNotFoundError(error)) {
          continue;
        }
      }
    }
  }

  return null;
}

async function cacheCaseAttachmentLocally(caseId: string, storedName: string, bytes: Buffer): Promise<void> {
  const normalizedStoredName = resolvePrimaryStoredName(storedName);
  const fullPath = resolveCaseAttachmentPath(caseId, normalizedStoredName);
  const parent = path.dirname(fullPath);
  await fs.mkdir(parent, { recursive: true });
  await fs.writeFile(fullPath, bytes);
}

export async function readCaseAttachmentBuffer(caseId: string, storedName: string): Promise<Buffer> {
  const candidatePaths = resolveCaseAttachmentReadPaths(caseId, storedName);

  for (const filePath of candidatePaths) {
    try {
      return await fs.readFile(filePath);
    } catch (error) {
      if (isFileNotFoundError(error)) {
        continue;
      }

      throw error;
    }
  }

  const downloadedFromCloud = await readCaseAttachmentFromCloud(caseId, storedName);
  if (downloadedFromCloud) {
    await cacheCaseAttachmentLocally(caseId, storedName, downloadedFromCloud).catch(() => undefined);
    return downloadedFromCloud;
  }

  throw new HttpError(404, "Arquivo de anexo não encontrado no armazenamento.");
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
        await writeCaseAttachmentToCloud(caseId, storedName, file.buffer, file.mimetype || "application/octet-stream");
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
