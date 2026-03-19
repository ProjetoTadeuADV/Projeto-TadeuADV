import { Router, type Request, type Response } from "express";
import multer from "multer";
import { promises as fs } from "node:fs";
import { randomUUID } from "node:crypto";
import { env, hasFirebaseCredentials, isMasterEmail } from "../config/env.js";
import { getFirebaseAuth } from "../config/firebaseAdmin.js";
import { VARAS } from "../constants/varas.js";
import type { AppDependencies } from "../dependencies.js";
import { authMiddleware } from "../middleware/auth.js";
import { FirestoreCaseRepository } from "../repositories/firestoreCaseRepository.js";
import {
  CASE_MOVEMENT_STAGE_LABELS,
  CASE_STATUS_LABELS,
  type CaseMovementRecord,
  type CaseRecord,
  type UserRecord
} from "../types/case.js";
import {
  validateAccountProfilePatchPayload,
  validateAccessLevelPayload,
  validateAssignOperatorPayload,
  validateCaseChargeUpdatePayload,
  validateCaseConciliationProgressPayload,
  validateCaseMessagePayload,
  validateCaseMovementPayload,
  validateCaseCloseRequestDecisionPayload,
  validateCaseCloseRequestPayload,
  validateCasePetitionProgressPayload,
  validateCaseReviewPayload,
  validateCaseServiceFeePayload,
  validateCreateCaseInput,
  validateCpfLookupPayload,
  validateLoginIdentifierPayload,
  validateMasterAccessPayload,
  validateRegisterAvailabilityPayload,
  validateUserProfilePayload
} from "../services/caseInput.js";
import {
  isCustomVerificationEmailEnabled,
  sendCustomVerificationEmail
} from "../services/verificationEmailSender.js";
import {
  isCaseNotificationEmailEnabled,
  sendCaseNotificationEmail
} from "../services/caseNotificationSender.js";
import { generateInitialPetitionPdf } from "../services/petitionPdf.js";
import {
  MAX_ATTACHMENTS_PER_CASE,
  MAX_ATTACHMENT_SIZE_BYTES,
  formatAttachmentSize,
  resolveCaseAttachmentReadPaths,
  storeCaseAttachments,
  storeGeneratedCaseAttachment
} from "../services/caseAttachmentStorage.js";
import { HttpError } from "../utils/httpError.js";

const caseAttachmentUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    files: MAX_ATTACHMENTS_PER_CASE,
    fileSize: MAX_ATTACHMENT_SIZE_BYTES
  }
});

function runCaseAttachmentUpload(req: Request, res: Response): Promise<Express.Multer.File[]> {
  return new Promise((resolve, reject) => {
    caseAttachmentUpload.array("attachments", MAX_ATTACHMENTS_PER_CASE)(req, res, (error) => {
      if (error) {
        reject(error);
        return;
      }

      const files = Array.isArray(req.files) ? (req.files as Express.Multer.File[]) : [];
      resolve(files);
    });
  });
}

function toAttachmentUploadError(error: unknown): HttpError {
  if (!error || typeof error !== "object") {
    return new HttpError(400, "Falha no envio dos anexos.");
  }

  const maybeMulterError = error as { name?: string; code?: string; message?: string };
  if (maybeMulterError.name !== "MulterError") {
    return new HttpError(400, maybeMulterError.message ?? "Falha no envio dos anexos.");
  }

  if (maybeMulterError.code === "LIMIT_FILE_SIZE") {
    return new HttpError(400, `Cada anexo deve ter no máximo ${formatAttachmentSize(MAX_ATTACHMENT_SIZE_BYTES)}.`);
  }

  if (maybeMulterError.code === "LIMIT_FILE_COUNT") {
    return new HttpError(400, `Limite de ${MAX_ATTACHMENTS_PER_CASE} anexos por petição.`);
  }

  if (maybeMulterError.code === "LIMIT_UNEXPECTED_FILE") {
    return new HttpError(400, "Campo de upload inválido. Use o campo 'attachments'.");
  }

  return new HttpError(400, maybeMulterError.message ?? "Falha no envio dos anexos.");
}

function countRecentUsers(users: UserRecord[], days: number): number {
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  return users.filter((user) => new Date(user.lastSeenAt).getTime() >= cutoff).length;
}

function countNewUsers(users: UserRecord[], days: number): number {
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  return users.filter((user) => new Date(user.createdAt).getTime() >= cutoff).length;
}

function getLatestCaseDate(cases: CaseRecord[]): string | null {
  if (cases.length === 0) {
    return null;
  }

  return [...cases].sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1))[0].updatedAt;
}

function buildUserCasesMap(cases: CaseRecord[]): Map<string, CaseRecord[]> {
  const userCasesMap = new Map<string, CaseRecord[]>();

  for (const item of cases) {
    const current = userCasesMap.get(item.userId) ?? [];
    current.push(item);
    userCasesMap.set(item.userId, current);
  }

  return userCasesMap;
}

function enrichCaseWithOwner(
  caseItem: CaseRecord,
  usersById: Map<string, UserRecord>
): CaseRecord & {
  clienteNome: string | null;
  responsavelNome: string | null;
  responsavelEmail: string | null;
} {
  const owner = usersById.get(caseItem.userId);

  return {
    ...caseItem,
    clienteNome: owner?.name?.trim() || owner?.email?.trim() || null,
    responsavelNome: owner?.name ?? null,
    responsavelEmail: owner?.email ?? null
  };
}

function toPublicCaseView(caseItem: CaseRecord): CaseRecord {
  return {
    ...caseItem,
    movements: (caseItem.movements ?? []).filter((movement) => movement.visibility === "public")
  };
}

function findMovementById(caseItem: CaseRecord, movementId: string): CaseMovementRecord | null {
  return (caseItem.movements ?? []).find((item) => item.id === movementId) ?? null;
}

async function resolveCaseByAccess(
  deps: AppDependencies,
  user: { uid: string; isMaster: boolean; isOperator?: boolean },
  caseId: string
): Promise<CaseRecord | null> {
  if (canAccessAdminPanel(user)) {
    const allCases = await deps.repository.listAllCases();
    return allCases.find((item) => item.id === caseId) ?? null;
  }

  return deps.repository.getCaseByIdForUser(caseId, user.uid);
}

async function resolveCaseForMessagingAccess(
  deps: AppDependencies,
  user: { uid: string; isMaster: boolean; isOperator?: boolean },
  caseId: string
): Promise<CaseRecord | null> {
  const caseItem = await resolveCaseByAccess(deps, user, caseId);
  if (!caseItem) {
    return null;
  }

  if (user.isMaster) {
    return caseItem;
  }

  if (user.isOperator && caseItem.assignedOperatorId !== user.uid) {
    throw new HttpError(403, "Este caso nao esta alocado para voce.");
  }

  return caseItem;
}

function ensureOperatorCanManageCase(
  user: { uid: string; isMaster: boolean; isOperator?: boolean },
  caseItem: CaseRecord,
  options: { allowWhenUnassigned?: boolean } = {}
): void {
  if (user.isMaster) {
    return;
  }

  if (user.isOperator !== true) {
    throw new HttpError(403, "Acesso restrito a operadores.");
  }

  if (!caseItem.assignedOperatorId) {
    if (options.allowWhenUnassigned) {
      return;
    }

    throw new HttpError(403, "Este caso ainda não foi alocado para um operador responsável.");
  }

  if (caseItem.assignedOperatorId !== user.uid) {
    throw new HttpError(403, "Este caso está alocado para outro operador.");
  }
}

function ensureCaseIsEditable(caseItem: CaseRecord): void {
  if (
    caseItem.reviewDecision === "rejected" ||
    caseItem.workflowStep === "closed" ||
    caseItem.status === "encerrado"
  ) {
    throw new HttpError(409, "Caso rejeitado/encerrado. Não é possível editar no momento.");
  }
}

function filterAdminVisibleCases(
  cases: CaseRecord[],
  user: { uid: string; isMaster: boolean; isOperator?: boolean }
): CaseRecord[] {
  if (user.isMaster) {
    return cases;
  }

  if (user.isOperator) {
    return cases.filter((item) => item.assignedOperatorId === user.uid);
  }

  return [];
}

function ensureAdminCanViewCase(
  user: { uid: string; isMaster: boolean; isOperator?: boolean },
  caseItem: CaseRecord
): void {
  if (user.isMaster) {
    return;
  }

  if (user.isOperator && caseItem.assignedOperatorId === user.uid) {
    return;
  }

  throw new HttpError(404, "Caso não encontrado.");
}

function resolveSenderRole(
  user: { isMaster: boolean; isOperator?: boolean } | null | undefined
): "client" | "operator" | "master" {
  if (user?.isMaster) {
    return "master";
  }

  if (user?.isOperator) {
    return "operator";
  }

  return "client";
}

function defaultProcedureChecklist(): NonNullable<CaseRecord["procedureProgress"]>["petition"]["checklist"] {
  return [
    {
      id: "audiencia-conciliacao",
      label: "Audiência de conciliação",
      done: false,
      notes: null,
      updatedAt: null
    },
    {
      id: "audiencia-instrucao",
      label: "Audiência de instrução",
      done: false,
      notes: null,
      updatedAt: null
    },
    {
      id: "manifestacoes",
      label: "Prazos e manifestações",
      done: false,
      notes: null,
      updatedAt: null
    },
    {
      id: "sentenca",
      label: "Sentença / decisão",
      done: false,
      notes: null,
      updatedAt: null
    }
  ];
}

function defaultProcedureProgress(): NonNullable<CaseRecord["procedureProgress"]> {
  return {
    conciliation: {
      contactedDefendant: false,
      defendantContact: null,
      defendantEmail: null,
      emailDraft: null,
      emailSent: false,
      emailSentAt: null,
      lastUpdatedAt: null,
      agreementReached: false,
      agreementClosedAt: null
    },
    petition: {
      petitionPulled: false,
      petitionPulledAt: null,
      jusiaProtocolChecked: false,
      jusiaProtocolCheckedAt: null,
      protocolCode: null,
      protocolCodeUpdatedAt: null,
      checklist: defaultProcedureChecklist(),
      lastUpdatedAt: null
    }
  };
}

function resolveProcedureProgress(caseItem: CaseRecord): NonNullable<CaseRecord["procedureProgress"]> {
  const base = caseItem.procedureProgress ?? defaultProcedureProgress();
  const checklist =
    Array.isArray(base.petition?.checklist) && base.petition.checklist.length > 0
      ? base.petition.checklist
      : defaultProcedureChecklist();

  return {
    conciliation: {
      contactedDefendant: base.conciliation?.contactedDefendant === true,
      defendantContact: base.conciliation?.defendantContact ?? null,
      defendantEmail: base.conciliation?.defendantEmail ?? null,
      emailDraft: base.conciliation?.emailDraft ?? null,
      emailSent: base.conciliation?.emailSent === true,
      emailSentAt: base.conciliation?.emailSentAt ?? null,
      lastUpdatedAt: base.conciliation?.lastUpdatedAt ?? null,
      agreementReached: base.conciliation?.agreementReached === true,
      agreementClosedAt: base.conciliation?.agreementClosedAt ?? null
    },
    petition: {
      petitionPulled: base.petition?.petitionPulled === true,
      petitionPulledAt: base.petition?.petitionPulledAt ?? null,
      jusiaProtocolChecked: base.petition?.jusiaProtocolChecked === true,
      jusiaProtocolCheckedAt: base.petition?.jusiaProtocolCheckedAt ?? null,
      protocolCode: base.petition?.protocolCode ?? null,
      protocolCodeUpdatedAt: base.petition?.protocolCodeUpdatedAt ?? null,
      checklist,
      lastUpdatedAt: base.petition?.lastUpdatedAt ?? null
    }
  };
}

function mapServiceFeeStatusToChargeStatus(
  status: NonNullable<CaseRecord["serviceFee"]>["status"]
): "awaiting_payment" | "received" | "confirmed" | "canceled" {
  if (status === "paid") {
    return "confirmed";
  }

  if (status === "canceled") {
    return "canceled";
  }

  return "awaiting_payment";
}

function mapChargeStatusToServiceFeeStatus(
  status: "awaiting_payment" | "received" | "confirmed" | "canceled"
): NonNullable<CaseRecord["serviceFee"]>["status"] {
  if (status === "confirmed") {
    return "paid";
  }

  if (status === "canceled") {
    return "canceled";
  }

  return "awaiting_payment";
}

function summarizeAdminUser(user: UserRecord, userCases: CaseRecord[]) {
  const activeCases = userCases.filter((item) => item.status !== "encerrado").length;
  const bootstrapMaster = isMasterEmail(user.email);
  const isMaster = bootstrapMaster || user.isMaster;
  const isOperator = !isMaster && user.isOperator === true;

  return {
    id: user.id,
    email: user.email,
    name: user.name,
    avatarUrl: user.avatarUrl ?? null,
    cpf: user.cpf ?? null,
    emailVerified: user.emailVerified,
    isMaster,
    isOperator,
    accessLevel: isMaster ? "master" : isOperator ? "operator" : "user",
    isBootstrapMaster: bootstrapMaster,
    createdAt: user.createdAt,
    lastSeenAt: user.lastSeenAt,
    totalCases: userCases.length,
    activeCases,
    lastCaseAt: getLatestCaseDate(userCases)
  };
}

function buildCurrentUserProfile(
  userRecord: UserRecord | null,
  fallback: { uid: string; email: string | null; name: string | null; avatarUrl: string | null }
) {
  const resolvedId = userRecord?.id ?? fallback.uid;
  const resolvedEmail = userRecord?.email ?? fallback.email;
  const resolvedName = userRecord ? userRecord.name ?? null : fallback.name;
  const resolvedAvatarUrl = userRecord ? userRecord.avatarUrl ?? null : fallback.avatarUrl;

  return {
    id: resolvedId,
    email: resolvedEmail,
    firebaseUid: fallback.uid,
    name: resolvedName,
    avatarUrl: resolvedAvatarUrl,
    cpf: userRecord?.cpf ?? null,
    rg: userRecord?.rg ?? null,
    rgIssuer: userRecord?.rgIssuer ?? null,
    birthDate: userRecord?.birthDate ?? null,
    maritalStatus: userRecord?.maritalStatus ?? null,
    profession: userRecord?.profession ?? null,
    address: userRecord?.address ?? null
  };
}

interface AuthSnapshotUser {
  id: string;
  email: string | null;
  name: string | null;
  avatarUrl: string | null;
  emailVerified: boolean;
  isMaster: boolean;
  isOperator: boolean;
  createdAt: string;
  lastSeenAt: string;
}

function readBooleanClaim(claims: Record<string, unknown>, key: string): boolean {
  const value = claims[key];
  if (value === true) {
    return true;
  }

  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    return normalized === "true" || normalized === "1" || normalized === "yes";
  }

  if (typeof value === "number") {
    return value === 1;
  }

  return false;
}

function resolveAccessFromClaims(claims: Record<string, unknown>) {
  const roleClaim = typeof claims.role === "string" ? claims.role.trim().toLowerCase() : "";
  const claimMaster =
    roleClaim === "master" ||
    readBooleanClaim(claims, "isMaster") ||
    readBooleanClaim(claims, "master");
  const claimOperator =
    roleClaim === "operator" ||
    readBooleanClaim(claims, "isOperator") ||
    readBooleanClaim(claims, "operator");

  return {
    isMaster: claimMaster,
    isOperator: !claimMaster && claimOperator
  };
}

function canAccessAdminPanel(user: { isMaster: boolean; isOperator?: boolean } | null | undefined): boolean {
  if (!user) {
    return false;
  }

  return user.isMaster || user.isOperator === true;
}

function ensureAdminPanelAccess(user: { isMaster: boolean; isOperator?: boolean } | null | undefined): void {
  if (!canAccessAdminPanel(user)) {
    throw new HttpError(403, "Acesso restrito aos perfis master ou operador.");
  }
}

function parseDate(value: string | undefined | null, fallback: string): string {
  if (!value) {
    return fallback;
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return fallback;
  }

  return parsed.toISOString();
}

function resolveLatestDate(values: Array<string | null | undefined>, fallback: string): string {
  const valid = values
    .filter((value): value is string => Boolean(value))
    .map((value) => new Date(value))
    .filter((date) => !Number.isNaN(date.getTime()));

  if (valid.length === 0) {
    return fallback;
  }

  valid.sort((a, b) => b.getTime() - a.getTime());
  return valid[0].toISOString();
}

async function readCaseAttachmentBuffer(caseId: string, storedName: string): Promise<Buffer> {
  const candidatePaths = resolveCaseAttachmentReadPaths(caseId, storedName);

  for (const filePath of candidatePaths) {
    try {
      return await fs.readFile(filePath);
    } catch (error) {
      const nodeError = error as NodeJS.ErrnoException;
      if (nodeError?.code === "ENOENT") {
        continue;
      }

      throw error;
    }
  }

  throw new HttpError(404, "Arquivo de anexo não encontrado no armazenamento.");
}

function sanitizeAbsoluteUrl(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed || trimmed.includes("*")) {
    return null;
  }

  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return null;
    }

    return parsed.toString();
  } catch {
    return null;
  }
}

function resolveVerificationContinueUrl(): string {
  const explicitContinueUrl = sanitizeAbsoluteUrl(env.VERIFY_EMAIL_CONTINUE_URL);
  if (explicitContinueUrl) {
    return explicitContinueUrl;
  }

  const corsOrigins = env.CORS_ORIGIN.split(",").map((item) => item.trim()).filter(Boolean);
  for (const origin of corsOrigins) {
    const validOrigin = sanitizeAbsoluteUrl(origin);
    if (!validOrigin) {
      continue;
    }

    const parsedOrigin = new URL(validOrigin);
    return `${parsedOrigin.origin}/verify-email`;
  }

  return "http://localhost:5173/verify-email";
}

function resolvePortalBaseUrl(): string {
  const [firstCorsOrigin] = env.CORS_ORIGIN
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  return firstCorsOrigin || "http://localhost:5173";
}

function buildCaseMessagesUrl(caseId: string): string {
  const base = resolvePortalBaseUrl().replace(/\/+$/g, "");
  return `${base}/messages?caseId=${encodeURIComponent(caseId)}`;
}

function normalizeEmail(value: string | null | undefined): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim().toLowerCase();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeCpfDigits(value: string | null | undefined): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const digits = value.replace(/\D/g, "");
  return digits.length > 0 ? digits : null;
}

function normalizeName(value: string | null | undefined): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

async function syncAsaasCustomerForUser(
  deps: AppDependencies,
  input: {
    userId: string;
    fallbackName?: string | null;
    fallbackEmail?: string | null;
    fallbackCpf?: string | null;
    required?: boolean;
  }
): Promise<{ userRecord: UserRecord | null; customerId: string | null }> {
  const userRecord = await deps.repository.getUserById(input.userId);
  if (!userRecord) {
    if (input.required) {
      throw new HttpError(404, "Conta do cliente nao encontrada para integracao de pagamento.");
    }

    return {
      userRecord: null,
      customerId: null
    };
  }

  const resolvedCpf = normalizeCpfDigits(userRecord.cpf ?? input.fallbackCpf ?? null);
  const resolvedEmail = normalizeEmail(userRecord.email ?? input.fallbackEmail ?? null);
  const resolvedName = normalizeName(
    userRecord.name ?? input.fallbackName ?? userRecord.email ?? input.fallbackEmail ?? null
  );

  if (!resolvedCpf || !resolvedEmail || !resolvedName) {
    if (input.required) {
      throw new HttpError(
        400,
        "Perfil do cliente incompleto para cobranca. Confirme nome, e-mail e CPF antes de gerar boleto."
      );
    }

    return {
      userRecord,
      customerId: userRecord.asaasCustomerId ?? null
    };
  }

  try {
    const customer = await deps.paymentProvider.ensureCustomer({
      userId: userRecord.id,
      name: resolvedName,
      email: resolvedEmail,
      cpfCnpj: resolvedCpf,
      existingCustomerId: userRecord.asaasCustomerId ?? null
    });

    if (customer.customerId && customer.customerId !== userRecord.asaasCustomerId) {
      const updatedUser = await deps.repository.updateUserAsaasCustomer(userRecord.id, customer.customerId);
      return {
        userRecord: updatedUser ?? userRecord,
        customerId: customer.customerId
      };
    }

    return {
      userRecord,
      customerId: customer.customerId
    };
  } catch (error) {
    if (input.required) {
      const details = error instanceof Error ? error.message : "unknown";
      throw new HttpError(502, `Falha na integracao de pagamentos (Asaas): ${details}`);
    }

    const details = error instanceof Error ? error.message : "unknown";
    console.error("asaas-customer-sync-failed", {
      userId: userRecord.id,
      details
    });

    return {
      userRecord,
      customerId: userRecord.asaasCustomerId ?? null
    };
  }
}

async function notifyCaseOwnerByEmail(
  deps: AppDependencies,
  caseItem: CaseRecord,
  movement: CaseMovementRecord
): Promise<void> {
  if (!isCaseNotificationEmailEnabled()) {
    return;
  }

  const owner = await deps.repository.getUserById(caseItem.userId);
  const ownerEmail = normalizeEmail(owner?.email);
  if (!ownerEmail) {
    return;
  }

  const isInternal = movement.visibility === "internal";
  const description = isInternal
    ? "Houve uma atualização interna no seu caso. A equipe responsável já registrou o andamento."
    : movement.description;
  const stageLabel = isInternal
    ? `${CASE_MOVEMENT_STAGE_LABELS[movement.stage]} (interna)`
    : CASE_MOVEMENT_STAGE_LABELS[movement.stage];

  await sendCaseNotificationEmail({
    toEmail: ownerEmail,
    toName: owner?.name ?? caseItem.cpfConsulta?.nome ?? null,
    caseId: caseItem.id,
    varaNome: caseItem.varaNome,
    stageLabel,
    description,
    statusLabel: CASE_STATUS_LABELS[movement.statusAfter],
    messagesUrl: buildCaseMessagesUrl(caseItem.id)
  });
}

async function notifyCaseOwnerByCustomUpdate(
  deps: AppDependencies,
  caseItem: CaseRecord,
  input: {
    stageLabel: string;
    description: string;
    statusAfter: CaseRecord["status"];
  }
): Promise<void> {
  if (!isCaseNotificationEmailEnabled()) {
    return;
  }

  const owner = await deps.repository.getUserById(caseItem.userId);
  const ownerEmail = normalizeEmail(owner?.email);
  if (!ownerEmail) {
    return;
  }

  await sendCaseNotificationEmail({
    toEmail: ownerEmail,
    toName: owner?.name ?? caseItem.cpfConsulta?.nome ?? null,
    caseId: caseItem.id,
    varaNome: caseItem.varaNome,
    stageLabel: input.stageLabel,
    description: input.description,
    statusLabel: CASE_STATUS_LABELS[input.statusAfter],
    messagesUrl: buildCaseMessagesUrl(caseItem.id)
  });
}

async function emailExistsInFirebaseAuth(email: string): Promise<boolean> {
  if (isTestRuntime() || !hasFirebaseCredentials()) {
    return false;
  }

  try {
    await getFirebaseAuth().getUserByEmail(email);
    return true;
  } catch (error) {
    if (isFirebaseUserNotFoundError(error)) {
      return false;
    }

    throw error;
  }
}

async function listFirebaseAuthUsers(): Promise<AuthSnapshotUser[]> {
  if (!hasFirebaseCredentials()) {
    return [];
  }

  const auth = getFirebaseAuth();
  const users: AuthSnapshotUser[] = [];
  let pageToken: string | undefined;
  const now = new Date().toISOString();

  do {
    const page = await auth.listUsers(1000, pageToken);

    users.push(
      ...page.users.map((item) => {
        const createdAt = parseDate(item.metadata.creationTime, now);
        const lastSeenAt = parseDate(item.metadata.lastSignInTime, createdAt);
        const claimAccess = resolveAccessFromClaims(item.customClaims ?? {});
        const bootstrapMaster = isMasterEmail(item.email);
        const isMaster = bootstrapMaster || claimAccess.isMaster;
        const isOperator = !isMaster && claimAccess.isOperator;

        return {
          id: item.uid,
          email: item.email ?? null,
          name: item.displayName ?? null,
          avatarUrl: item.photoURL ?? null,
          emailVerified: item.emailVerified,
          isMaster,
          isOperator,
          createdAt,
          lastSeenAt
        };
      })
    );

    pageToken = page.pageToken;
  } while (pageToken);

  return users;
}

function isTestRuntime(): boolean {
  return env.NODE_ENV === "test" || Boolean(process.env.VITEST);
}

function isFirebaseUserNotFoundError(error: unknown): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }

  const typed = error as {
    code?: string;
    message?: string;
    errorInfo?: { code?: string };
  };

  const code = typed.code ?? typed.errorInfo?.code ?? "";
  if (code === "auth/user-not-found") {
    return true;
  }

  const message = (typed.message ?? "").toLowerCase();
  return message.includes("no user record") || message.includes("user-not-found");
}

async function deleteFirebaseUserIfPossible(userId: string): Promise<void> {
  if (isTestRuntime() || !hasFirebaseCredentials()) {
    return;
  }

  try {
    await getFirebaseAuth().deleteUser(userId);
  } catch (error) {
    if (isFirebaseUserNotFoundError(error)) {
      return;
    }

    throw error;
  }
}

export function createV1Router(deps: AppDependencies) {
  const router = Router();

  router.get("/health", (_req, res) => {
    res.status(200).json({
      status: "ok",
      result: {
        service: "jec-api",
        timestamp: new Date().toISOString(),
        environment: env.NODE_ENV,
        firebaseProjectId: env.FIREBASE_PROJECT_ID || null,
        hasFirebaseCredentials: hasFirebaseCredentials()
      }
    });
  });

  router.get("/varas", (_req, res) => {
    res.status(200).json({
      status: "ok",
      result: VARAS
    });
  });

  router.get("/auth/session", authMiddleware(deps.authVerifier, deps.repository), async (req, res, next) => {
    try {
      if (!req.user) {
        throw new HttpError(401, "Usuário não autenticado.");
      }

      res.status(200).json({
        status: "ok",
        result: {
          uid: req.user.uid,
          email: req.user.email,
          name: req.user.name,
          avatarUrl: req.user.avatarUrl,
          emailVerified: req.user.emailVerified,
          isMaster: req.user.isMaster,
          isOperator: req.user.isOperator,
          accessLevel: req.user.isMaster ? "master" : req.user.isOperator ? "operator" : "user",
          canAccessAdmin: canAccessAdminPanel(req.user),
          isBootstrapMaster: req.user.isBootstrapMaster
        }
      });
    } catch (error) {
      next(error);
    }
  });

  router.post("/auth/resolve-login", async (req, res, next) => {
    try {
      const parsed = validateLoginIdentifierPayload(req.body);

      if (parsed.type === "email") {
        res.status(200).json({
          status: "ok",
          result: {
            email: parsed.value
          }
        });
        return;
      }

      const found = await deps.repository.findUserByCpf(parsed.value);
      if (!found?.email) {
        throw new HttpError(404, "Credencial não encontrada.");
      }

      res.status(200).json({
        status: "ok",
        result: {
          email: found.email
        }
      });
    } catch (error) {
      next(error);
    }
  });

  router.post("/auth/register-availability", async (req, res, next) => {
    try {
      const payload = validateRegisterAvailabilityPayload(req.body);
      const normalizedEmail = payload.email;

      const [cpfOwner, users, emailInFirebaseAuth] = await Promise.all([
        deps.repository.findUserByCpf(payload.cpf),
        deps.repository.listUsers(),
        emailExistsInFirebaseAuth(normalizedEmail)
      ]);

      const emailInRepository = users.some(
        (item) => normalizeEmail(item.email) === normalizedEmail
      );

      res.status(200).json({
        status: "ok",
        result: {
          cpfInUse: Boolean(cpfOwner),
          emailInUse: emailInRepository || emailInFirebaseAuth
        }
      });
    } catch (error) {
      next(error);
    }
  });

  router.post(
    "/auth/verification-email",
    authMiddleware(deps.authVerifier, deps.repository),
    async (req, res, next) => {
      try {
        if (!req.user) {
          throw new HttpError(401, "Usuário não autenticado.");
        }

        if (!req.user.email) {
          throw new HttpError(400, "Não foi encontrado e-mail nesta conta.");
        }

        if (req.user.emailVerified) {
          res.status(200).json({
            status: "ok",
            result: {
              sent: false,
              reason: "already-verified"
            }
          });
          return;
        }

        if (!isCustomVerificationEmailEnabled()) {
          res.status(200).json({
            status: "ok",
            result: {
              sent: false,
              reason: "custom-sender-not-configured"
            }
          });
          return;
        }

        let verificationLink = "";
        try {
          verificationLink = await getFirebaseAuth().generateEmailVerificationLink(req.user.email, {
            url: resolveVerificationContinueUrl(),
            handleCodeInApp: false
          });
        } catch (linkError) {
          const message = linkError instanceof Error ? linkError.message : "unknown";
          res.status(200).json({
            status: "ok",
            result: {
              sent: false,
              reason: "verification-link-failed",
              provider: "firebase-auth",
              message
            }
          });
          return;
        }

        try {
          await sendCustomVerificationEmail({
            email: req.user.email,
            name: req.user.name,
            verificationLink
          });
        } catch (sendError) {
          const message = sendError instanceof Error ? sendError.message : "unknown";
          res.status(200).json({
            status: "ok",
            result: {
              sent: false,
              reason: "custom-send-failed",
              provider: "sendgrid",
              message
            }
          });
          return;
        }

        res.status(200).json({
          status: "ok",
          result: {
            sent: true,
            channel: "custom"
          }
        });
      } catch (error) {
        next(error);
      }
    }
  );

  router.post("/cpf/consulta", authMiddleware(deps.authVerifier, deps.repository), async (req, res, next) => {
    try {
      const { cpf } = validateCpfLookupPayload(req.body);
      const result = await deps.cpfProvider.lookup(cpf);

      res.status(200).json({
        status: "ok",
        result
      });
    } catch (error) {
      next(error);
    }
  });

  router.post("/users/profile", authMiddleware(deps.authVerifier, deps.repository), async (req, res, next) => {
    try {
      if (!req.user) {
        throw new HttpError(401, "Usuário não autenticado.");
      }

      const payload = validateUserProfilePayload(req.body);
      const currentUserUid = req.user.uid;
      const currentUserEmail = req.user.email;
      const existingCpfUser = await deps.repository.findUserByCpf(payload.cpf);
      if (existingCpfUser && existingCpfUser.id !== currentUserUid) {
        throw new HttpError(
          409,
          'Já existe uma conta com este CPF. Faça login ou use "Esqueci minha senha".'
        );
      }

      const normalizedCurrentEmail = normalizeEmail(currentUserEmail);
      if (normalizedCurrentEmail) {
        const users = await deps.repository.listUsers();
        const emailInUse = users.some(
          (item) => item.id !== currentUserUid && normalizeEmail(item.email) === normalizedCurrentEmail
        );

        if (emailInUse) {
          throw new HttpError(
            409,
            'Já existe uma conta com este e-mail. Faça login ou use "Esqueci minha senha".'
          );
        }
      }

      const updated = await deps.repository.updateUserProfile(currentUserUid, {
        cpf: payload.cpf,
        name: payload.name
      });

      if (updated) {
        await syncAsaasCustomerForUser(deps, {
          userId: currentUserUid,
          fallbackName: payload.name,
          fallbackEmail: currentUserEmail,
          fallbackCpf: payload.cpf
        });
      }

      res.status(200).json({
        status: "ok",
        result: updated
      });
    } catch (error) {
      next(error);
    }
  });

  router.get("/users/me", authMiddleware(deps.authVerifier, deps.repository), async (req, res, next) => {
    try {
      if (!req.user) {
        throw new HttpError(401, "Usuário não autenticado.");
      }

      const userRecord = await deps.repository.getUserById(req.user.uid);
      res.status(200).json({
        status: "ok",
        result: {
          user: buildCurrentUserProfile(userRecord, {
            uid: req.user.uid,
            email: req.user.email,
            name: req.user.name,
            avatarUrl: req.user.avatarUrl
          })
        }
      });
    } catch (error) {
      next(error);
    }
  });

  router.patch("/users/me", authMiddleware(deps.authVerifier, deps.repository), async (req, res, next) => {
    try {
      if (!req.user) {
        throw new HttpError(401, "Usuário não autenticado.");
      }

      const payload = validateAccountProfilePatchPayload(req.body);

      if (Object.prototype.hasOwnProperty.call(payload, "cpf") && payload.cpf) {
        const existingCpfUser = await deps.repository.findUserByCpf(payload.cpf);
        if (existingCpfUser && existingCpfUser.id !== req.user.uid) {
          throw new HttpError(
            409,
            'Já existe uma conta com este CPF. Faça login ou use "Esqueci minha senha".'
          );
        }
      }

      const updated = await deps.repository.updateAccountProfile(req.user.uid, payload);

      if (updated) {
        await syncAsaasCustomerForUser(deps, {
          userId: req.user.uid,
          fallbackName: payload.name ?? req.user.name ?? null,
          fallbackEmail: req.user.email,
          fallbackCpf: payload.cpf ?? null
        });
      }

      res.status(200).json({
        status: "ok",
        result: {
          user: buildCurrentUserProfile(updated, {
            uid: req.user.uid,
            email: req.user.email,
            name: req.user.name,
            avatarUrl: req.user.avatarUrl
          })
        }
      });
    } catch (error) {
      next(error);
    }
  });

  router.delete("/users/me", authMiddleware(deps.authVerifier, deps.repository), async (req, res, next) => {
    try {
      if (!req.user) {
        throw new HttpError(401, "Usuário não autenticado.");
      }

      if (req.user.isBootstrapMaster) {
        throw new HttpError(400, "A conta master principal não pode ser excluída por esta ação.");
      }

      await deleteFirebaseUserIfPossible(req.user.uid);
      const removed = await deps.repository.deleteUserWithCases(req.user.uid);

      res.status(200).json({
        status: "ok",
        result: {
          deletedUserId: req.user.uid,
          deletedCases: removed.deletedCases
        }
      });
    } catch (error) {
      next(error);
    }
  });

  router.post("/cases", authMiddleware(deps.authVerifier, deps.repository), async (req, res, next) => {
    try {
      if (!req.user) {
        throw new HttpError(401, "Usuário não autenticado.");
      }

      const validated = validateCreateCaseInput(req.body);
      const cpfConsulta = await deps.cpfProvider.lookup(validated.cpf);

      const created = await deps.repository.createCase({
        userId: req.user.uid,
        varaId: validated.varaId,
        varaNome: validated.varaNome,
        cpf: validated.cpf,
        resumo: validated.resumo,
        cpfConsulta,
        petitionInitial: validated.petitionInitial
      });

      res.status(201).json({
        status: "ok",
        result: created
      });
    } catch (error) {
      next(error);
    }
  });

  router.get("/cases", authMiddleware(deps.authVerifier, deps.repository), async (req, res, next) => {
    try {
      if (!req.user) {
        throw new HttpError(401, "Usuário não autenticado.");
      }

      if (canAccessAdminPanel(req.user)) {
        const [allCases, users] = await Promise.all([
          deps.repository.listAllCases(),
          deps.repository.listUsers()
        ]);
        const visibleCases = filterAdminVisibleCases(allCases, req.user);
        const usersById = new Map(users.map((item) => [item.id, item]));
        const enrichedCases = visibleCases.map((item) => enrichCaseWithOwner(item, usersById));

        res.status(200).json({
          status: "ok",
          result: enrichedCases
        });
        return;
      }

      const cases = await deps.repository.listCasesByUserId(req.user.uid);
      res.status(200).json({
        status: "ok",
        result: cases.map((item) => toPublicCaseView(item))
      });
    } catch (error) {
      next(error);
    }
  });

  router.get("/cases/:id", authMiddleware(deps.authVerifier, deps.repository), async (req, res, next) => {
    try {
      if (!req.user) {
        throw new HttpError(401, "Usuário não autenticado.");
      }

      if (canAccessAdminPanel(req.user)) {
        const [allCases, users] = await Promise.all([
          deps.repository.listAllCases(),
          deps.repository.listUsers()
        ]);
        const found = allCases.find((item) => item.id === req.params.id);
        if (!found) {
          throw new HttpError(404, "Caso não encontrado.");
        }
        ensureAdminCanViewCase(req.user, found);

        const usersById = new Map(users.map((item) => [item.id, item]));
        res.status(200).json({
          status: "ok",
          result: enrichCaseWithOwner(found, usersById)
        });
        return;
      }

      const found = await deps.repository.getCaseByIdForUser(req.params.id, req.user.uid);
      if (!found) {
        throw new HttpError(404, "Caso não encontrado.");
      }

      res.status(200).json({
        status: "ok",
        result: toPublicCaseView(found)
      });
    } catch (error) {
      next(error);
    }
  });

  router.post(
    "/cases/:id/attachments",
    authMiddleware(deps.authVerifier, deps.repository),
    async (req, res, next) => {
      try {
        if (!req.user) {
          throw new HttpError(401, "Usuário não autenticado.");
        }

        let files: Express.Multer.File[] = [];
        try {
          files = await runCaseAttachmentUpload(req, res);
        } catch (uploadError) {
          throw toAttachmentUploadError(uploadError);
        }

        if (files.length === 0) {
          throw new HttpError(400, "Selecione ao menos um anexo para envio.");
        }

        const caseItem = await deps.repository.getCaseByIdForUser(req.params.id, req.user.uid);
        if (!caseItem) {
          throw new HttpError(404, "Caso não encontrado.");
        }

        if (!caseItem.petitionInitial) {
          throw new HttpError(400, "Este caso ainda não possui petição estruturada para anexos.");
        }

        const existingAttachments = caseItem.petitionInitial.attachments ?? [];
        if (existingAttachments.length + files.length > MAX_ATTACHMENTS_PER_CASE) {
          throw new HttpError(400, `Limite de ${MAX_ATTACHMENTS_PER_CASE} anexos por petição.`);
        }

        const storedAttachments = await storeCaseAttachments(caseItem.id, files);
        const updated = await deps.repository.appendCaseAttachments(caseItem.id, req.user.uid, storedAttachments);
        if (!updated) {
          throw new HttpError(404, "Caso não encontrado.");
        }

        res.status(200).json({
          status: "ok",
          result: updated
        });
      } catch (error) {
        next(error);
      }
    }
  );

  router.post(
    "/cases/:id/assign-operator",
    authMiddleware(deps.authVerifier, deps.repository),
    async (req, res, next) => {
      try {
        if (!req.user) {
          throw new HttpError(401, "Usuário não autenticado.");
        }

        if (!req.user.isMaster) {
          throw new HttpError(403, "Somente usuários master podem alocar casos.");
        }

        const allCases = await deps.repository.listAllCases();
        const currentCase = allCases.find((item) => item.id === req.params.id);
        if (!currentCase) {
          throw new HttpError(404, "Caso não encontrado.");
        }
        ensureCaseIsEditable(currentCase);

        const payload = validateAssignOperatorPayload(req.body);
        const operator = await deps.repository.getUserById(payload.operatorUserId);
        if (!operator) {
          throw new HttpError(404, "Operador não encontrado.");
        }

        if (!operator.isMaster && operator.isOperator !== true) {
          throw new HttpError(400, "Selecione um usuário com perfil operador ou master para alocação.");
        }

        const updated = await deps.repository.assignCaseOperator(
          req.params.id,
          {
            id: operator.id,
            name: operator.name ?? operator.email ?? null
          },
          {
            id: req.user.uid,
            name: req.user.name ?? req.user.email ?? null
          }
        );

        if (!updated) {
          throw new HttpError(404, "Caso não encontrado.");
        }

        const latestMovement = updated.movements[updated.movements.length - 1] ?? null;
        if (latestMovement) {
          void notifyCaseOwnerByEmail(deps, updated, latestMovement).catch((error) => {
            const details = error instanceof Error ? error.message : "unknown";
            console.error("case-notification-email-failed", {
              caseId: updated.id,
              movementId: latestMovement.id,
              details
            });
          });
        }

        res.status(200).json({
          status: "ok",
          result: updated
        });
      } catch (error) {
        next(error);
      }
    }
  );

  router.post(
    "/cases/:id/movements",
    authMiddleware(deps.authVerifier, deps.repository),
    async (req, res, next) => {
      try {
        if (!req.user) {
          throw new HttpError(401, "Usuário não autenticado.");
        }

        ensureAdminPanelAccess(req.user);

        const payload = validateCaseMovementPayload(req.body);
        const allCases = await deps.repository.listAllCases();
        const currentCase = allCases.find((item) => item.id === req.params.id);
        if (!currentCase) {
          throw new HttpError(404, "Caso não encontrado.");
        }
        ensureOperatorCanManageCase(req.user, currentCase);
        ensureCaseIsEditable(currentCase);

        const appended = await deps.repository.appendCaseMovement(req.params.id, {
          stage: payload.stage,
          description: payload.description,
          visibility: payload.visibility,
          createdByUserId: req.user.uid,
          createdByName: req.user.name ?? req.user.email ?? null,
          statusAfter: payload.status ?? currentCase.status
        });

        if (!appended) {
          throw new HttpError(404, "Caso não encontrado.");
        }

        let latestCase = appended.caseItem;
        if (currentCase.reviewDecision === "accepted" && currentCase.workflowStep !== "in_progress") {
          const progressed = await deps.repository.updateCaseWorkflow(req.params.id, {
            status: appended.caseItem.status,
            workflowStep: "in_progress"
          });
          if (progressed) {
            latestCase = progressed;
          }
        }

        void notifyCaseOwnerByEmail(deps, latestCase, appended.movement).catch((error) => {
          const details = error instanceof Error ? error.message : "unknown";
          console.error("case-notification-email-failed", {
            caseId: latestCase.id,
            movementId: appended.movement.id,
            details
          });
        });

        res.status(201).json({
          status: "ok",
          result: {
            caseItem: latestCase,
            movement: appended.movement
          }
        });
      } catch (error) {
        next(error);
      }
    }
  );

  router.post(
    "/cases/:id/review",
    authMiddleware(deps.authVerifier, deps.repository),
    async (req, res, next) => {
      try {
        if (!req.user) {
          throw new HttpError(401, "Usuário não autenticado.");
        }

        ensureAdminPanelAccess(req.user);

        const payload = validateCaseReviewPayload(req.body);
        const allCases = await deps.repository.listAllCases();
        const currentCase = allCases.find((item) => item.id === req.params.id);
        if (!currentCase) {
          throw new HttpError(404, "Caso não encontrado.");
        }
        ensureOperatorCanManageCase(req.user, currentCase);
        ensureCaseIsEditable(currentCase);

        const now = new Date().toISOString();
        const actorName = req.user.name ?? req.user.email ?? null;
        const senderRole = resolveSenderRole(req.user);

        const isRejected = payload.decision === "rejected";
        const nextStatus: CaseRecord["status"] = isRejected ? "encerrado" : "em_analise";
        const nextWorkflow: CaseRecord["workflowStep"] = isRejected
          ? "closed"
          : payload.requestClientData
            ? "awaiting_client_data"
            : "awaiting_initial_fee";

        const movementDescription = isRejected
          ? `Caso rejeitado na análise inicial. Motivo: ${payload.reason}`
          : payload.requestClientData
            ? `Caso aceito na análise inicial. Dados adicionais solicitados ao cliente. ${payload.reason}`
            : `Caso aceito na análise inicial. Segue para etapa de cobrança da taxa inicial. ${payload.reason}`;

        const appendedMovement = await deps.repository.appendCaseMovement(req.params.id, {
          stage: "triagem",
          description: movementDescription,
          visibility: "public",
          createdByUserId: req.user.uid,
          createdByName: actorName,
          statusAfter: nextStatus
        });
        if (!appendedMovement) {
          throw new HttpError(404, "Caso não encontrado.");
        }

        const reviewed = await deps.repository.updateCaseWorkflow(req.params.id, {
          status: nextStatus,
          reviewDecision: payload.decision,
          reviewReason: payload.reason,
          reviewedAt: now,
          reviewedByUserId: req.user.uid,
          reviewedByName: actorName,
          clientDataRequest: payload.requestClientData ? payload.clientDataRequest : null,
          clientDataRequestedAt: payload.requestClientData ? now : null,
          workflowStep: nextWorkflow
        });
        if (!reviewed) {
          throw new HttpError(404, "Caso não encontrado.");
        }

        const clientMessage = isRejected
          ? `Seu caso foi rejeitado na análise inicial. Motivo: ${payload.reason}`
          : payload.requestClientData
            ? `Seu caso foi aceito. Para continuar, envie os dados solicitados: ${payload.clientDataRequest ?? ""}`
            : "Seu caso foi aceito e seguirá para andamento após o pagamento da taxa inicial de serviço.";

        const withMessage = await deps.repository.appendCaseMessage(req.params.id, {
          senderUserId: req.user.uid,
          senderName: actorName,
          senderRole,
          message: clientMessage
        });

        const latestCase = withMessage ?? reviewed;

        void notifyCaseOwnerByCustomUpdate(deps, latestCase, {
          stageLabel: "Análise inicial",
          description: clientMessage,
          statusAfter: latestCase.status
        }).catch((error) => {
          const details = error instanceof Error ? error.message : "unknown";
          console.error("case-notification-email-failed", {
            caseId: latestCase.id,
            details
          });
        });

        res.status(200).json({
          status: "ok",
          result: latestCase
        });
      } catch (error) {
        next(error);
      }
    }
  );

  router.post(
    "/cases/:id/close-request",
    authMiddleware(deps.authVerifier, deps.repository),
    async (req, res, next) => {
      try {
        if (!req.user) {
          throw new HttpError(401, "Usuário não autenticado.");
        }

        if (canAccessAdminPanel(req.user)) {
          throw new HttpError(403, "A solicitação de encerramento deve ser feita pelo cliente responsável.");
        }

        const payload = validateCaseCloseRequestPayload(req.body);
        const currentCase = await deps.repository.getCaseByIdForUser(req.params.id, req.user.uid);
        if (!currentCase) {
          throw new HttpError(404, "Caso não encontrado.");
        }

        if (currentCase.status === "encerrado" || currentCase.workflowStep === "closed") {
          throw new HttpError(409, "Este caso já está encerrado.");
        }

        if (currentCase.closeRequest.status === "pending") {
          throw new HttpError(409, "Já existe uma solicitação de encerramento pendente para este caso.");
        }

        const now = new Date().toISOString();
        const requesterName = req.user.name ?? req.user.email ?? null;
        const movementDescription = `Cliente solicitou encerramento do caso. Justificativa: ${payload.reason}`;

        const appendedMovement = await deps.repository.appendCaseMovement(req.params.id, {
          stage: "andamento",
          description: movementDescription,
          visibility: "public",
          createdByUserId: req.user.uid,
          createdByName: requesterName,
          statusAfter: currentCase.status
        });
        if (!appendedMovement) {
          throw new HttpError(404, "Caso não encontrado.");
        }

        const withCloseRequest = await deps.repository.updateCaseWorkflow(req.params.id, {
          closeRequest: {
            status: "pending",
            reason: payload.reason,
            requestedAt: now,
            requestedByUserId: req.user.uid,
            requestedByName: requesterName,
            decisionAt: null,
            decidedByUserId: null,
            decidedByName: null,
            decisionReason: null
          }
        });
        if (!withCloseRequest) {
          throw new HttpError(404, "Caso não encontrado.");
        }

        const withMessage = await deps.repository.appendCaseMessage(req.params.id, {
          senderUserId: req.user.uid,
          senderName: requesterName,
          senderRole: "client",
          message: `Solicito o encerramento do caso. Justificativa: ${payload.reason}`
        });

        const latestCase = withMessage ?? withCloseRequest;

        res.status(200).json({
          status: "ok",
          result: toPublicCaseView(latestCase)
        });
      } catch (error) {
        next(error);
      }
    }
  );

  router.post(
    "/cases/:id/close-request/decision",
    authMiddleware(deps.authVerifier, deps.repository),
    async (req, res, next) => {
      try {
        if (!req.user) {
          throw new HttpError(401, "Usuário não autenticado.");
        }

        ensureAdminPanelAccess(req.user);

        const payload = validateCaseCloseRequestDecisionPayload(req.body);
        const allCases = await deps.repository.listAllCases();
        const currentCase = allCases.find((item) => item.id === req.params.id);
        if (!currentCase) {
          throw new HttpError(404, "Caso não encontrado.");
        }
        ensureOperatorCanManageCase(req.user, currentCase);

        if (currentCase.closeRequest.status !== "pending") {
          throw new HttpError(409, "Não há solicitação de encerramento pendente para este caso.");
        }

        const now = new Date().toISOString();
        const actorName = req.user.name ?? req.user.email ?? null;
        const senderRole = resolveSenderRole(req.user);
        const isApproved = payload.decision === "approved";

        const movementDescription = isApproved
          ? "Solicitação de encerramento do cliente aprovada pela equipe responsável."
          : `Solicitação de encerramento do cliente recusada. Motivo: ${payload.reason}`;
        const movementStatusAfter: CaseRecord["status"] = isApproved ? "encerrado" : currentCase.status;

        const appendedMovement = await deps.repository.appendCaseMovement(req.params.id, {
          stage: isApproved ? "solucao" : "andamento",
          description: movementDescription,
          visibility: "public",
          createdByUserId: req.user.uid,
          createdByName: actorName,
          statusAfter: movementStatusAfter
        });
        if (!appendedMovement) {
          throw new HttpError(404, "Caso não encontrado.");
        }

        const withDecision = await deps.repository.updateCaseWorkflow(req.params.id, {
          ...(isApproved ? { status: "encerrado" as const, workflowStep: "closed" as const } : {}),
          closeRequest: {
            ...currentCase.closeRequest,
            status: isApproved ? "approved" : "denied",
            decisionAt: now,
            decidedByUserId: req.user.uid,
            decidedByName: actorName,
            decisionReason: payload.reason
          }
        });
        if (!withDecision) {
          throw new HttpError(404, "Caso não encontrado.");
        }

        const decisionMessage = isApproved
          ? "Sua solicitação de encerramento foi aprovada. O caso foi encerrado."
          : `Sua solicitação de encerramento foi recusada. Motivo: ${payload.reason}`;
        const withMessage = await deps.repository.appendCaseMessage(req.params.id, {
          senderUserId: req.user.uid,
          senderName: actorName,
          senderRole,
          message: decisionMessage
        });

        const latestCase = withMessage ?? withDecision;

        void notifyCaseOwnerByCustomUpdate(deps, latestCase, {
          stageLabel: "Solicitação de encerramento",
          description: decisionMessage,
          statusAfter: latestCase.status
        }).catch((error) => {
          const details = error instanceof Error ? error.message : "unknown";
          console.error("case-notification-email-failed", {
            caseId: latestCase.id,
            details
          });
        });

        res.status(200).json({
          status: "ok",
          result: canAccessAdminPanel(req.user) ? latestCase : toPublicCaseView(latestCase)
        });
      } catch (error) {
        next(error);
      }
    }
  );

  router.post(
    "/cases/:id/close",
    authMiddleware(deps.authVerifier, deps.repository),
    async (req, res, next) => {
      try {
        if (!req.user) {
          throw new HttpError(401, "Usuário não autenticado.");
        }

        ensureAdminPanelAccess(req.user);

        const allCases = await deps.repository.listAllCases();
        const currentCase = allCases.find((item) => item.id === req.params.id);
        if (!currentCase) {
          throw new HttpError(404, "Caso não encontrado.");
        }
        ensureOperatorCanManageCase(req.user, currentCase);
        ensureCaseIsEditable(currentCase);

        const actorName = req.user.name ?? req.user.email ?? null;
        const senderRole = resolveSenderRole(req.user);
        const now = new Date().toISOString();

        const movementDescription =
          "Caso encerrado pela equipe responsável. Não há novas ações operacionais pendentes no momento.";
        const appendedMovement = await deps.repository.appendCaseMovement(req.params.id, {
          stage: "solucao",
          description: movementDescription,
          visibility: "public",
          createdByUserId: req.user.uid,
          createdByName: actorName,
          statusAfter: "encerrado"
        });
        if (!appendedMovement) {
          throw new HttpError(404, "Caso não encontrado.");
        }

        const closedCase = await deps.repository.updateCaseWorkflow(req.params.id, {
          status: "encerrado",
          workflowStep: "closed",
          closeRequest:
            currentCase.closeRequest.status === "pending"
              ? {
                  ...currentCase.closeRequest,
                  status: "approved",
                  decisionAt: now,
                  decidedByUserId: req.user.uid,
                  decidedByName: actorName,
                  decisionReason: "Encerrado diretamente pela equipe responsável."
                }
              : currentCase.closeRequest
        });
        if (!closedCase) {
          throw new HttpError(404, "Caso não encontrado.");
        }

        const closeMessage =
          "Seu caso foi encerrado pela equipe responsável. Você pode consultar o histórico e os anexos no painel.";
        const withMessage = await deps.repository.appendCaseMessage(req.params.id, {
          senderUserId: req.user.uid,
          senderName: actorName,
          senderRole,
          message: closeMessage
        });

        const latestCase = withMessage ?? closedCase;

        void notifyCaseOwnerByCustomUpdate(deps, latestCase, {
          stageLabel: "Encerramento do caso",
          description: closeMessage,
          statusAfter: latestCase.status
        }).catch((error) => {
          const details = error instanceof Error ? error.message : "unknown";
          console.error("case-notification-email-failed", {
            caseId: latestCase.id,
            details
          });
        });

        res.status(200).json({
          status: "ok",
          result: latestCase
        });
      } catch (error) {
        next(error);
      }
    }
  );

  router.post(
    "/cases/:id/service-fee",
    authMiddleware(deps.authVerifier, deps.repository),
    async (req, res, next) => {
      try {
        if (!req.user) {
          throw new HttpError(401, "Usuário não autenticado.");
        }

        ensureAdminPanelAccess(req.user);

        const payload = validateCaseServiceFeePayload(req.body);
        const allCases = await deps.repository.listAllCases();
        const currentCase = allCases.find((item) => item.id === req.params.id);
        if (!currentCase) {
          throw new HttpError(404, "Caso não encontrado.");
        }
        ensureOperatorCanManageCase(req.user, currentCase);
        ensureCaseIsEditable(currentCase);

        if (currentCase.reviewDecision === "rejected") {
          throw new HttpError(400, "Não é possível cadastrar cobrança para caso rejeitado.");
        }

        const now = new Date().toISOString();
        const actorName = req.user.name ?? req.user.email ?? null;
        const customerSync = await syncAsaasCustomerForUser(deps, {
          userId: currentCase.userId,
          fallbackName: currentCase.cpfConsulta?.nome ?? null,
          fallbackCpf: currentCase.cpf,
          required: true
        });
        const customerId = customerSync.customerId;
        if (!customerId) {
          throw new HttpError(400, "Nao foi possivel identificar o cliente no Asaas para gerar o boleto.");
        }

        const boleto = await deps.paymentProvider.createBoleto({
          customerId,
          caseId: currentCase.id,
          caseCode: currentCase.caseCode,
          amount: payload.amount,
          dueDate: payload.dueDate,
          description: `Taxa inicial de servico do caso ${currentCase.caseCode}`
        });

        const boletoAttachment = await storeGeneratedCaseAttachment(currentCase.id, {
          fileName: boleto.attachment.fileName,
          mimeType: boleto.attachment.mimeType,
          bytes: boleto.attachment.bytes
        });

        const recoveredLegacyCharge =
          (currentCase.charges ?? []).length === 0 && currentCase.serviceFee
            ? [
                {
                  id: `fee-${currentCase.serviceFee.externalReference ?? "legacy"}`,
                  amount: currentCase.serviceFee.amount,
                  dueDate: currentCase.serviceFee.dueDate,
                  provider: "asaas" as const,
                  status: mapServiceFeeStatusToChargeStatus(currentCase.serviceFee.status),
                  externalReference: currentCase.serviceFee.externalReference,
                  paymentUrl: currentCase.serviceFee.paymentUrl,
                  attachmentId: null,
                  createdAt: currentCase.serviceFee.updatedAt,
                  updatedAt: currentCase.serviceFee.updatedAt,
                  createdByUserId: currentCase.reviewedByUserId ?? req.user.uid,
                  createdByName: currentCase.reviewedByName ?? actorName
                }
              ]
            : [];

        const nextCharge = {
          id: randomUUID(),
          amount: payload.amount,
          dueDate: payload.dueDate,
          provider: "asaas" as const,
          status: "awaiting_payment" as const,
          externalReference: boleto.paymentId,
          paymentUrl: boleto.bankSlipUrl ?? boleto.invoiceUrl,
          attachmentId: boletoAttachment.id,
          createdAt: now,
          updatedAt: now,
          createdByUserId: req.user.uid,
          createdByName: actorName
        };

        const withFee = await deps.repository.updateCaseWorkflow(req.params.id, {
          status: "em_analise",
          workflowStep: "awaiting_initial_fee",
          serviceFee: {
            amount: payload.amount,
            dueDate: payload.dueDate,
            provider: "asaas",
            status: "awaiting_payment",
            externalReference: boleto.paymentId,
            paymentUrl: boleto.bankSlipUrl ?? boleto.invoiceUrl,
            updatedAt: now
          },
          charges: [...recoveredLegacyCharge, ...(currentCase.charges ?? []), nextCharge]
        });
        if (!withFee) {
          throw new HttpError(404, "Caso não encontrado.");
        }

        const movementDescription = `Taxa inicial de serviço configurada em ${new Intl.NumberFormat("pt-BR", {
          style: "currency",
          currency: "BRL"
        }).format(payload.amount)} com vencimento em ${payload.dueDate}.`;

        const appendedMovement = await deps.repository.appendCaseMovement(req.params.id, {
          stage: "andamento",
          description: movementDescription,
          visibility: "public",
          createdByUserId: req.user.uid,
          createdByName: actorName,
          statusAfter: "em_analise"
        });
        if (!appendedMovement) {
          throw new HttpError(404, "Caso não encontrado.");
        }

        const paymentLink = boleto.bankSlipUrl ?? boleto.invoiceUrl;
        const paymentMessage = paymentLink
          ? `Boleto da taxa inicial emitido. Valor ${new Intl.NumberFormat("pt-BR", {
              style: "currency",
              currency: "BRL"
            }).format(payload.amount)} com vencimento em ${payload.dueDate}. Link direto: ${paymentLink}. O documento tambem foi anexado nesta conversa.`
          : `Boleto da taxa inicial emitido. Valor ${new Intl.NumberFormat("pt-BR", {
              style: "currency",
              currency: "BRL"
            }).format(payload.amount)} com vencimento em ${payload.dueDate}. O documento foi anexado nesta conversa.`;
        const withMessage = await deps.repository.appendCaseMessage(req.params.id, {
          senderUserId: req.user.uid,
          senderName: actorName,
          senderRole: resolveSenderRole(req.user),
          message: paymentMessage,
          attachments: [boletoAttachment]
        });

        const latestCase = withMessage ?? appendedMovement.caseItem;

        void notifyCaseOwnerByCustomUpdate(deps, latestCase, {
          stageLabel: "Pagamento inicial",
          description: paymentMessage,
          statusAfter: latestCase.status
        }).catch((error) => {
          const details = error instanceof Error ? error.message : "unknown";
          console.error("case-notification-email-failed", {
            caseId: latestCase.id,
            details
          });
        });

        res.status(200).json({
          status: "ok",
          result: latestCase
        });
      } catch (error) {
        next(error);
      }
    }
  );

  router.post(
    "/cases/:id/charges",
    authMiddleware(deps.authVerifier, deps.repository),
    async (req, res, next) => {
      try {
        if (!req.user) {
          throw new HttpError(401, "Usuário não autenticado.");
        }

        ensureAdminPanelAccess(req.user);

        const payload = validateCaseServiceFeePayload(req.body);
        const allCases = await deps.repository.listAllCases();
        const currentCase = allCases.find((item) => item.id === req.params.id);
        if (!currentCase) {
          throw new HttpError(404, "Caso não encontrado.");
        }
        ensureOperatorCanManageCase(req.user, currentCase);
        ensureCaseIsEditable(currentCase);

        if (currentCase.reviewDecision !== "accepted") {
          throw new HttpError(409, "A cobrança só pode ser criada após o aceite inicial do caso.");
        }

        const now = new Date().toISOString();
        const actorName = req.user.name ?? req.user.email ?? null;
        const customerSync = await syncAsaasCustomerForUser(deps, {
          userId: currentCase.userId,
          fallbackName: currentCase.cpfConsulta?.nome ?? null,
          fallbackCpf: currentCase.cpf,
          required: true
        });
        const customerId = customerSync.customerId;
        if (!customerId) {
          throw new HttpError(400, "Nao foi possivel identificar o cliente no Asaas para gerar o boleto.");
        }

        const boleto = await deps.paymentProvider.createBoleto({
          customerId,
          caseId: currentCase.id,
          caseCode: currentCase.caseCode,
          amount: payload.amount,
          dueDate: payload.dueDate,
          description: `Cobranca do caso ${currentCase.caseCode}`
        });

        const boletoAttachment = await storeGeneratedCaseAttachment(currentCase.id, {
          fileName: boleto.attachment.fileName,
          mimeType: boleto.attachment.mimeType,
          bytes: boleto.attachment.bytes
        });

        const recoveredLegacyCharge =
          (currentCase.charges ?? []).length === 0 && currentCase.serviceFee
            ? [
                {
                  id: `fee-${currentCase.serviceFee.externalReference ?? "legacy"}`,
                  amount: currentCase.serviceFee.amount,
                  dueDate: currentCase.serviceFee.dueDate,
                  provider: "asaas" as const,
                  status: mapServiceFeeStatusToChargeStatus(currentCase.serviceFee.status),
                  externalReference: currentCase.serviceFee.externalReference,
                  paymentUrl: currentCase.serviceFee.paymentUrl,
                  attachmentId: null,
                  createdAt: currentCase.serviceFee.updatedAt,
                  updatedAt: currentCase.serviceFee.updatedAt,
                  createdByUserId: currentCase.reviewedByUserId ?? req.user.uid,
                  createdByName: currentCase.reviewedByName ?? actorName
                }
              ]
            : [];

        const nextCharge = {
          id: randomUUID(),
          amount: payload.amount,
          dueDate: payload.dueDate,
          provider: "asaas" as const,
          status: "awaiting_payment" as const,
          externalReference: boleto.paymentId,
          paymentUrl: boleto.bankSlipUrl ?? boleto.invoiceUrl,
          attachmentId: boletoAttachment.id,
          createdAt: now,
          updatedAt: now,
          createdByUserId: req.user.uid,
          createdByName: actorName
        };

        const withCharge = await deps.repository.updateCaseWorkflow(req.params.id, {
          status: "em_analise",
          workflowStep: currentCase.workflowStep === "in_progress" ? "in_progress" : "awaiting_initial_fee",
          serviceFee: {
            amount: payload.amount,
            dueDate: payload.dueDate,
            provider: "asaas",
            status: "awaiting_payment",
            externalReference: boleto.paymentId,
            paymentUrl: boleto.bankSlipUrl ?? boleto.invoiceUrl,
            updatedAt: now
          },
          charges: [...recoveredLegacyCharge, ...(currentCase.charges ?? []), nextCharge]
        });
        if (!withCharge) {
          throw new HttpError(404, "Caso não encontrado.");
        }

        const movementDescription = `Nova cobrança criada em ${new Intl.NumberFormat("pt-BR", {
          style: "currency",
          currency: "BRL"
        }).format(payload.amount)} com vencimento em ${payload.dueDate}.`;

        const appendedMovement = await deps.repository.appendCaseMovement(req.params.id, {
          stage: "andamento",
          description: movementDescription,
          visibility: "public",
          createdByUserId: req.user.uid,
          createdByName: actorName,
          statusAfter: "em_analise"
        });
        if (!appendedMovement) {
          throw new HttpError(404, "Caso não encontrado.");
        }

        const paymentLink = boleto.bankSlipUrl ?? boleto.invoiceUrl;
        const paymentMessage = paymentLink
          ? `Nova cobrança emitida. Valor ${new Intl.NumberFormat("pt-BR", {
              style: "currency",
              currency: "BRL"
            }).format(payload.amount)} com vencimento em ${payload.dueDate}. Link direto: ${paymentLink}.`
          : `Nova cobrança emitida. Valor ${new Intl.NumberFormat("pt-BR", {
              style: "currency",
              currency: "BRL"
            }).format(payload.amount)} com vencimento em ${payload.dueDate}.`;
        const withMessage = await deps.repository.appendCaseMessage(req.params.id, {
          senderUserId: req.user.uid,
          senderName: actorName,
          senderRole: resolveSenderRole(req.user),
          message: paymentMessage,
          attachments: [boletoAttachment]
        });

        const latestCase = withMessage ?? appendedMovement.caseItem;

        void notifyCaseOwnerByCustomUpdate(deps, latestCase, {
          stageLabel: "Cobrança",
          description: paymentMessage,
          statusAfter: latestCase.status
        }).catch((error) => {
          const details = error instanceof Error ? error.message : "unknown";
          console.error("case-notification-email-failed", {
            caseId: latestCase.id,
            details
          });
        });

        res.status(200).json({
          status: "ok",
          result: latestCase
        });
      } catch (error) {
        next(error);
      }
    }
  );

  router.patch(
    "/cases/:id/charges/:chargeId",
    authMiddleware(deps.authVerifier, deps.repository),
    async (req, res, next) => {
      try {
        if (!req.user) {
          throw new HttpError(401, "Usuário não autenticado.");
        }

        ensureAdminPanelAccess(req.user);

        const payload = validateCaseChargeUpdatePayload(req.body);
        const allCases = await deps.repository.listAllCases();
        const currentCase = allCases.find((item) => item.id === req.params.id);
        if (!currentCase) {
          throw new HttpError(404, "Caso não encontrado.");
        }
        ensureOperatorCanManageCase(req.user, currentCase);
        ensureCaseIsEditable(currentCase);

        const currentCharges = currentCase.charges ?? [];
        const targetIndex = currentCharges.findIndex((item) => item.id === req.params.chargeId);
        if (targetIndex < 0) {
          throw new HttpError(404, "Cobrança não encontrada para este caso.");
        }

        const now = new Date().toISOString();
        const targetCharge = currentCharges[targetIndex];
        const updatedCharge = {
          ...targetCharge,
          ...(typeof payload.amount === "number" ? { amount: payload.amount } : {}),
          ...(typeof payload.dueDate === "string" ? { dueDate: payload.dueDate } : {}),
          ...(payload.status ? { status: payload.status } : {}),
          updatedAt: now
        };

        const nextCharges = [...currentCharges];
        nextCharges[targetIndex] = updatedCharge;

        const updated = await deps.repository.updateCaseWorkflow(req.params.id, {
          workflowStep:
            payload.status === "confirmed" && currentCase.workflowStep !== "closed"
              ? "in_progress"
              : currentCase.workflowStep,
          serviceFee: {
            amount: updatedCharge.amount,
            dueDate: updatedCharge.dueDate,
            provider: "asaas",
            status: mapChargeStatusToServiceFeeStatus(updatedCharge.status),
            externalReference: updatedCharge.externalReference,
            paymentUrl: updatedCharge.paymentUrl,
            updatedAt: now
          },
          charges: nextCharges
        });
        if (!updated) {
          throw new HttpError(404, "Caso não encontrado.");
        }

        const actorName = req.user.name ?? req.user.email ?? null;
        const movementDescription = `Cobrança atualizada: valor ${new Intl.NumberFormat("pt-BR", {
          style: "currency",
          currency: "BRL"
        }).format(updatedCharge.amount)}, vencimento ${updatedCharge.dueDate} e status ${updatedCharge.status}.`;
        const appendedMovement = await deps.repository.appendCaseMovement(req.params.id, {
          stage: "andamento",
          description: movementDescription,
          visibility: "public",
          createdByUserId: req.user.uid,
          createdByName: actorName,
          statusAfter: updated.status
        });
        const latestCase = appendedMovement?.caseItem ?? updated;

        res.status(200).json({
          status: "ok",
          result: latestCase
        });
      } catch (error) {
        next(error);
      }
    }
  );

  router.post(
    "/cases/:id/progress/conciliation",
    authMiddleware(deps.authVerifier, deps.repository),
    async (req, res, next) => {
      try {
        if (!req.user) {
          throw new HttpError(401, "Usuário não autenticado.");
        }

        ensureAdminPanelAccess(req.user);

        const payload = validateCaseConciliationProgressPayload(req.body);
        const allCases = await deps.repository.listAllCases();
        const currentCase = allCases.find((item) => item.id === req.params.id);
        if (!currentCase) {
          throw new HttpError(404, "Caso não encontrado.");
        }
        ensureOperatorCanManageCase(req.user, currentCase);
        ensureCaseIsEditable(currentCase);

        if (currentCase.reviewDecision !== "accepted") {
          throw new HttpError(409, "A etapa de conciliação exige que o caso esteja aceito.");
        }

        const now = new Date().toISOString();
        const actorName = req.user.name ?? req.user.email ?? null;
        const nextProgress = resolveProcedureProgress(currentCase);
        nextProgress.conciliation = {
          ...nextProgress.conciliation,
          contactedDefendant: payload.contactedDefendant,
          defendantContact: payload.defendantContact,
          defendantEmail: payload.defendantEmail,
          emailDraft: payload.emailDraft,
          emailSent: payload.sendEmailToDefendant || nextProgress.conciliation.emailSent,
          emailSentAt: payload.sendEmailToDefendant ? now : nextProgress.conciliation.emailSentAt,
          lastUpdatedAt: now
        };

        const withProgress = await deps.repository.updateCaseWorkflow(req.params.id, {
          status: "em_analise",
          workflowStep: "in_progress",
          procedureProgress: nextProgress
        });
        if (!withProgress) {
          throw new HttpError(404, "Caso não encontrado.");
        }

        const movementDescription = payload.sendEmailToDefendant
          ? "Checklist de conciliação atualizado e e-mail ao reclamado marcado como enviado."
          : "Checklist de conciliação atualizado.";
        const appendedMovement = await deps.repository.appendCaseMovement(req.params.id, {
          stage: "conciliacao",
          description: movementDescription,
          visibility: "public",
          createdByUserId: req.user.uid,
          createdByName: actorName,
          statusAfter: withProgress.status
        });

        const latestCase = appendedMovement?.caseItem ?? withProgress;
        res.status(200).json({
          status: "ok",
          result: latestCase
        });
      } catch (error) {
        next(error);
      }
    }
  );

  router.post(
    "/cases/:id/progress/conciliation/agreement",
    authMiddleware(deps.authVerifier, deps.repository),
    async (req, res, next) => {
      try {
        if (!req.user) {
          throw new HttpError(401, "Usuário não autenticado.");
        }

        ensureAdminPanelAccess(req.user);

        const allCases = await deps.repository.listAllCases();
        const currentCase = allCases.find((item) => item.id === req.params.id);
        if (!currentCase) {
          throw new HttpError(404, "Caso não encontrado.");
        }
        ensureOperatorCanManageCase(req.user, currentCase);
        ensureCaseIsEditable(currentCase);

        const now = new Date().toISOString();
        const actorName = req.user.name ?? req.user.email ?? null;
        const nextProgress = resolveProcedureProgress(currentCase);
        nextProgress.conciliation = {
          ...nextProgress.conciliation,
          agreementReached: true,
          agreementClosedAt: now,
          lastUpdatedAt: now
        };

        const closed = await deps.repository.updateCaseWorkflow(req.params.id, {
          status: "encerrado",
          workflowStep: "closed",
          procedureProgress: nextProgress
        });
        if (!closed) {
          throw new HttpError(404, "Caso não encontrado.");
        }

        const movementDescription = "Caso encerrado por acordo em conciliação.";
        const appendedMovement = await deps.repository.appendCaseMovement(req.params.id, {
          stage: "solucao",
          description: movementDescription,
          visibility: "public",
          createdByUserId: req.user.uid,
          createdByName: actorName,
          statusAfter: "encerrado"
        });

        const withMessage = await deps.repository.appendCaseMessage(req.params.id, {
          senderUserId: req.user.uid,
          senderName: actorName,
          senderRole: resolveSenderRole(req.user),
          message: "Seu caso foi encerrado por acordo na etapa de conciliação."
        });

        const latestCase = withMessage ?? appendedMovement?.caseItem ?? closed;

        void notifyCaseOwnerByCustomUpdate(deps, latestCase, {
          stageLabel: "Conciliação",
          description: "Caso encerrado por acordo em conciliação.",
          statusAfter: latestCase.status
        }).catch((error) => {
          const details = error instanceof Error ? error.message : "unknown";
          console.error("case-notification-email-failed", {
            caseId: latestCase.id,
            details
          });
        });

        res.status(200).json({
          status: "ok",
          result: latestCase
        });
      } catch (error) {
        next(error);
      }
    }
  );

  router.post(
    "/cases/:id/progress/petition",
    authMiddleware(deps.authVerifier, deps.repository),
    async (req, res, next) => {
      try {
        if (!req.user) {
          throw new HttpError(401, "Usuário não autenticado.");
        }

        ensureAdminPanelAccess(req.user);

        const payload = validateCasePetitionProgressPayload(req.body);
        const allCases = await deps.repository.listAllCases();
        const currentCase = allCases.find((item) => item.id === req.params.id);
        if (!currentCase) {
          throw new HttpError(404, "Caso não encontrado.");
        }
        ensureOperatorCanManageCase(req.user, currentCase);
        ensureCaseIsEditable(currentCase);

        if (currentCase.reviewDecision !== "accepted") {
          throw new HttpError(409, "A etapa de petição exige que o caso esteja aceito.");
        }

        const now = new Date().toISOString();
        const actorName = req.user.name ?? req.user.email ?? null;
        const nextProgress = resolveProcedureProgress(currentCase);

        const nextChecklist = payload.checklist.map((item) => {
          const existing = (nextProgress.petition.checklist ?? []).find((entry) => entry.id === item.id);
          const changed =
            !existing ||
            existing.done !== item.done ||
            (existing.notes ?? null) !== (item.notes ?? null) ||
            existing.label !== item.label;

          return {
            id: item.id,
            label: item.label,
            done: item.done,
            notes: item.notes,
            updatedAt: changed ? now : existing?.updatedAt ?? null
          };
        });

        nextProgress.petition = {
          ...nextProgress.petition,
          petitionPulled: payload.petitionPulled,
          petitionPulledAt: payload.petitionPulled ? now : nextProgress.petition.petitionPulledAt,
          jusiaProtocolChecked: payload.jusiaProtocolChecked,
          jusiaProtocolCheckedAt: payload.jusiaProtocolChecked ? now : nextProgress.petition.jusiaProtocolCheckedAt,
          protocolCode: payload.protocolCode,
          protocolCodeUpdatedAt: payload.protocolCode ? now : nextProgress.petition.protocolCodeUpdatedAt,
          checklist: nextChecklist,
          lastUpdatedAt: now
        };

        const withProgress = await deps.repository.updateCaseWorkflow(req.params.id, {
          status: "em_analise",
          workflowStep: "in_progress",
          procedureProgress: nextProgress
        });
        if (!withProgress) {
          throw new HttpError(404, "Caso não encontrado.");
        }

        const completedSteps = nextChecklist.filter((item) => item.done).length;
        const movementDescription = `Checklist de petição atualizado (${completedSteps}/${nextChecklist.length} etapas concluídas).`;
        const appendedMovement = await deps.repository.appendCaseMovement(req.params.id, {
          stage: "peticao",
          description: movementDescription,
          visibility: "public",
          createdByUserId: req.user.uid,
          createdByName: actorName,
          statusAfter: withProgress.status
        });

        const latestCase = appendedMovement?.caseItem ?? withProgress;
        res.status(200).json({
          status: "ok",
          result: latestCase
        });
      } catch (error) {
        next(error);
      }
    }
  );

  router.post(
    "/cases/:id/messages",
    authMiddleware(deps.authVerifier, deps.repository),
    async (req, res, next) => {
      try {
        if (!req.user) {
          throw new HttpError(401, "Usuário não autenticado.");
        }

        let files: Express.Multer.File[] = [];
        const isMultipartRequest = req.is("multipart/form-data");
        if (isMultipartRequest) {
          try {
            files = await runCaseAttachmentUpload(req, res);
          } catch (uploadError) {
            throw toAttachmentUploadError(uploadError);
          }
        }

        const payload = validateCaseMessagePayload(req.body);
        const messageText = payload.message.trim();
        if (!messageText && files.length === 0) {
          throw new HttpError(400, "Informe uma mensagem ou adicione ao menos um anexo.");
        }

        const caseItem = await resolveCaseForMessagingAccess(deps, req.user, req.params.id);
        if (!caseItem) {
          throw new HttpError(404, "Caso não encontrado.");
        }

        const storedAttachments =
          files.length > 0 ? await storeCaseAttachments(caseItem.id, files) : [];

        const senderRole = resolveSenderRole(req.user);
        const senderName = req.user.name ?? req.user.email ?? null;
        const updated = await deps.repository.appendCaseMessage(req.params.id, {
          senderUserId: req.user.uid,
          senderName,
          senderRole,
          message: messageText,
          attachments: storedAttachments
        });
        if (!updated) {
          throw new HttpError(404, "Caso não encontrado.");
        }

        if (senderRole === "operator" || senderRole === "master") {
          const notificationDescription =
            messageText || "Nova mensagem com anexos enviada no chat do caso.";
          void notifyCaseOwnerByCustomUpdate(deps, updated, {
            stageLabel: "Mensagens do caso",
            description: notificationDescription,
            statusAfter: updated.status
          }).catch((error) => {
            const details = error instanceof Error ? error.message : "unknown";
            console.error("case-notification-email-failed", {
              caseId: updated.id,
              details
            });
          });
        }

        res.status(201).json({
          status: "ok",
          result: canAccessAdminPanel(req.user) ? updated : toPublicCaseView(updated)
        });
      } catch (error) {
        next(error);
      }
    }
  );

  router.post(
    "/cases/:id/movements/:movementId/attachments",
    authMiddleware(deps.authVerifier, deps.repository),
    async (req, res, next) => {
      try {
        if (!req.user) {
          throw new HttpError(401, "Usuário não autenticado.");
        }

        ensureAdminPanelAccess(req.user);

        let files: Express.Multer.File[] = [];
        try {
          files = await runCaseAttachmentUpload(req, res);
        } catch (uploadError) {
          throw toAttachmentUploadError(uploadError);
        }

        if (files.length === 0) {
          throw new HttpError(400, "Selecione ao menos um anexo para envio.");
        }

        const allCases = await deps.repository.listAllCases();
        const caseItem = allCases.find((item) => item.id === req.params.id);
        if (!caseItem) {
          throw new HttpError(404, "Caso não encontrado.");
        }
        if (canAccessAdminPanel(req.user)) {
          ensureAdminCanViewCase(req.user, caseItem);
        }
        ensureOperatorCanManageCase(req.user, caseItem);
        ensureCaseIsEditable(caseItem);

        const movement = findMovementById(caseItem, req.params.movementId);
        if (!movement) {
          throw new HttpError(404, "Movimentação não encontrada para este caso.");
        }

        const existingAttachments = movement.attachments ?? [];
        if (existingAttachments.length + files.length > MAX_ATTACHMENTS_PER_CASE) {
          throw new HttpError(400, `Limite de ${MAX_ATTACHMENTS_PER_CASE} anexos por movimentação.`);
        }

        const storedAttachments = await storeCaseAttachments(caseItem.id, files);
        const updated = await deps.repository.appendMovementAttachments(
          caseItem.id,
          req.params.movementId,
          storedAttachments
        );

        if (!updated) {
          throw new HttpError(404, "Caso ou movimentação não encontrados.");
        }

        res.status(200).json({
          status: "ok",
          result: updated
        });
      } catch (error) {
        next(error);
      }
    }
  );

  router.get(
    "/cases/:id/messages/:messageId/attachments/:attachmentId",
    authMiddleware(deps.authVerifier, deps.repository),
    async (req, res, next) => {
      try {
        if (!req.user) {
          throw new HttpError(401, "Usuário não autenticado.");
        }

        const caseItem = await resolveCaseForMessagingAccess(deps, req.user, req.params.id);
        if (!caseItem) {
          throw new HttpError(404, "Caso não encontrado.");
        }

        const message = (caseItem.messages ?? []).find((item) => item.id === req.params.messageId) ?? null;
        if (!message) {
          throw new HttpError(404, "Mensagem não encontrada para este caso.");
        }

        const selectedAttachment =
          (message.attachments ?? []).find((item) => item.id === req.params.attachmentId) ?? null;
        if (!selectedAttachment) {
          throw new HttpError(404, "Anexo não encontrado para esta mensagem.");
        }

        const fileBuffer = await readCaseAttachmentBuffer(caseItem.id, selectedAttachment.storedName);

        const safeDownloadName = selectedAttachment.originalName.replace(/[\"\\]/g, "_");
        res.setHeader("Content-Type", selectedAttachment.mimeType || "application/octet-stream");
        res.setHeader("Content-Length", String(fileBuffer.length));
        res.setHeader("Content-Disposition", `attachment; filename=\"${safeDownloadName}\"`);
        res.status(200).send(fileBuffer);
      } catch (error) {
        next(error);
      }
    }
  );

  router.get(
    "/cases/:id/attachments/:attachmentId",
    authMiddleware(deps.authVerifier, deps.repository),
    async (req, res, next) => {
      try {
        if (!req.user) {
          throw new HttpError(401, "Usuário não autenticado.");
        }

        let caseItem: CaseRecord | null = null;
        if (canAccessAdminPanel(req.user)) {
          const allCases = await deps.repository.listAllCases();
          caseItem = allCases.find((item) => item.id === req.params.id) ?? null;
        } else {
          caseItem = await deps.repository.getCaseByIdForUser(req.params.id, req.user.uid);
        }

        if (!caseItem) {
          throw new HttpError(404, "Caso não encontrado.");
        }
        if (canAccessAdminPanel(req.user)) {
          ensureAdminCanViewCase(req.user, caseItem);
        }

        const petitionAttachments = caseItem.petitionInitial?.attachments ?? [];
        const messageAttachments = (caseItem.messages ?? []).flatMap((message) => message.attachments ?? []);
        const attachments = [...petitionAttachments, ...messageAttachments];
        const selectedAttachment = attachments.find((item) => item.id === req.params.attachmentId);
        if (!selectedAttachment) {
          throw new HttpError(404, "Anexo não encontrado para este caso.");
        }

        const fileBuffer = await readCaseAttachmentBuffer(caseItem.id, selectedAttachment.storedName);

        const safeDownloadName = selectedAttachment.originalName.replace(/[\"\\]/g, "_");
        res.setHeader("Content-Type", selectedAttachment.mimeType || "application/octet-stream");
        res.setHeader("Content-Length", String(fileBuffer.length));
        res.setHeader("Content-Disposition", `attachment; filename=\"${safeDownloadName}\"`);
        res.status(200).send(fileBuffer);
      } catch (error) {
        next(error);
      }
    }
  );

  router.get(
    "/cases/:id/movements/:movementId/attachments/:attachmentId",
    authMiddleware(deps.authVerifier, deps.repository),
    async (req, res, next) => {
      try {
        if (!req.user) {
          throw new HttpError(401, "Usuário não autenticado.");
        }

        let caseItem: CaseRecord | null = null;
        const isAdminUser = canAccessAdminPanel(req.user);

        if (isAdminUser) {
          const allCases = await deps.repository.listAllCases();
          caseItem = allCases.find((item) => item.id === req.params.id) ?? null;
        } else {
          caseItem = await deps.repository.getCaseByIdForUser(req.params.id, req.user.uid);
        }

        if (!caseItem) {
          throw new HttpError(404, "Caso não encontrado.");
        }
        if (isAdminUser) {
          ensureAdminCanViewCase(req.user, caseItem);
        }

        const movement = findMovementById(caseItem, req.params.movementId);
        if (!movement) {
          throw new HttpError(404, "Movimentação não encontrada para este caso.");
        }

        if (!isAdminUser && movement.visibility !== "public") {
          throw new HttpError(404, "Movimentação não encontrada para este caso.");
        }

        const selectedAttachment =
          (movement.attachments ?? []).find((item) => item.id === req.params.attachmentId) ?? null;
        if (!selectedAttachment) {
          throw new HttpError(404, "Anexo não encontrado para esta movimentação.");
        }

        const fileBuffer = await readCaseAttachmentBuffer(caseItem.id, selectedAttachment.storedName);

        const safeDownloadName = selectedAttachment.originalName.replace(/[\"\\]/g, "_");
        res.setHeader("Content-Type", selectedAttachment.mimeType || "application/octet-stream");
        res.setHeader("Content-Length", String(fileBuffer.length));
        res.setHeader("Content-Disposition", `attachment; filename=\"${safeDownloadName}\"`);
        res.status(200).send(fileBuffer);
      } catch (error) {
        next(error);
      }
    }
  );

  router.post(
    "/cases/:id/peticao-inicial/attachment",
    authMiddleware(deps.authVerifier, deps.repository),
    async (req, res, next) => {
      try {
        if (!req.user) {
          throw new HttpError(401, "Usuário não autenticado.");
        }

        let caseItem: CaseRecord | null = null;

        if (canAccessAdminPanel(req.user)) {
          const allCases = await deps.repository.listAllCases();
          caseItem = allCases.find((item) => item.id === req.params.id) ?? null;
          if (caseItem) {
            ensureAdminCanViewCase(req.user, caseItem);
          }
        } else {
          caseItem = await deps.repository.getCaseByIdForUser(req.params.id, req.user.uid);
        }

        if (!caseItem) {
          throw new HttpError(404, "Caso não encontrado.");
        }

        if (!caseItem.petitionInitial) {
          throw new HttpError(400, "Este caso ainda não possui petição estruturada para geração do PDF.");
        }

        const hasExistingGeneratedAttachment = (caseItem.petitionInitial.attachments ?? []).some((attachment) =>
          attachment.originalName.toLowerCase().startsWith("peticao-inicial-")
        );

        if (hasExistingGeneratedAttachment) {
          res.status(200).json({
            status: "ok",
            result: canAccessAdminPanel(req.user) ? caseItem : toPublicCaseView(caseItem)
          });
          return;
        }

        const currentPetitionAttachmentCount = caseItem.petitionInitial.attachments?.length ?? 0;
        if (currentPetitionAttachmentCount >= MAX_ATTACHMENTS_PER_CASE) {
          throw new HttpError(400, `Limite de ${MAX_ATTACHMENTS_PER_CASE} anexos por petição.`);
        }

        const owner = await deps.repository.getUserById(caseItem.userId);
        const pdf = await generateInitialPetitionPdf({
          caseItem,
          owner
        });

        const generatedAttachment = await storeGeneratedCaseAttachment(caseItem.id, {
          fileName: pdf.fileName,
          mimeType: "application/pdf",
          bytes: Buffer.from(pdf.bytes)
        });

        const updated = await deps.repository.appendCaseAttachments(caseItem.id, caseItem.userId, [generatedAttachment]);
        if (!updated) {
          throw new HttpError(404, "Caso não encontrado.");
        }

        res.status(200).json({
          status: "ok",
          result: canAccessAdminPanel(req.user) ? updated : toPublicCaseView(updated)
        });
      } catch (error) {
        next(error);
      }
    }
  );

  router.get(
    "/cases/:id/peticao-inicial.pdf",
    authMiddleware(deps.authVerifier, deps.repository),
    async (req, res, next) => {
      try {
        if (!req.user) {
          throw new HttpError(401, "Usuário não autenticado.");
        }

        let caseItem: CaseRecord | null = null;

        if (canAccessAdminPanel(req.user)) {
          const allCases = await deps.repository.listAllCases();
          caseItem = allCases.find((item) => item.id === req.params.id) ?? null;
        } else {
          caseItem = await deps.repository.getCaseByIdForUser(req.params.id, req.user.uid);
        }

        if (!caseItem) {
          throw new HttpError(404, "Caso não encontrado.");
        }
        if (canAccessAdminPanel(req.user)) {
          ensureAdminCanViewCase(req.user, caseItem);
        }

        const owner = await deps.repository.getUserById(caseItem.userId);
        const pdf = await generateInitialPetitionPdf({
          caseItem,
          owner
        });

        res.setHeader("Content-Type", "application/pdf");
        res.setHeader("Content-Disposition", `attachment; filename=\"${pdf.fileName}\"`);
        res.status(200).send(Buffer.from(pdf.bytes));
      } catch (error) {
        next(error);
      }
    }
  );

  router.get("/admin/operators", authMiddleware(deps.authVerifier, deps.repository), async (req, res, next) => {
    try {
      if (!req.user) {
        throw new HttpError(401, "Usuário não autenticado.");
      }

      ensureAdminPanelAccess(req.user);

      const users = await deps.repository.listUsers();
      const operators = users
        .filter((item) => item.isMaster || item.isOperator)
        .map((item) => ({
          id: item.id,
          name: item.name ?? null,
          email: item.email ?? null,
          isMaster: item.isMaster,
          isOperator: item.isOperator ?? false
        }))
        .sort((a, b) => {
          if (a.isMaster !== b.isMaster) {
            return a.isMaster ? -1 : 1;
          }

          const nameA = (a.name ?? a.email ?? a.id).toLowerCase();
          const nameB = (b.name ?? b.email ?? b.id).toLowerCase();
          return nameA.localeCompare(nameB, "pt-BR");
        });

      res.status(200).json({
        status: "ok",
        result: operators
      });
    } catch (error) {
      next(error);
    }
  });

  router.get("/admin/overview", authMiddleware(deps.authVerifier, deps.repository), async (req, res, next) => {
    try {
      if (!req.user) {
        throw new HttpError(401, "Usuário não autenticado.");
      }

      ensureAdminPanelAccess(req.user);

      let users = await deps.repository.listUsers();
      let authUsers: AuthSnapshotUser[] = [];

      if (deps.repository instanceof FirestoreCaseRepository) {
        try {
          authUsers = await listFirebaseAuthUsers();
        } catch {
          authUsers = [];
        }
      }

      if (authUsers.length > 0) {
        const usersById = new Map(users.map((item) => [item.id, item]));

        await Promise.all(
          authUsers.map(async (item) => {
            const existing = usersById.get(item.id);
            const isMaster = item.isMaster || existing?.isMaster === true;
            const isOperator = !isMaster && (item.isOperator || existing?.isOperator === true);
            await deps.repository.upsertUser({
              id: item.id,
              email: item.email ?? existing?.email ?? null,
              name: item.name ?? existing?.name ?? null,
              avatarUrl: item.avatarUrl ?? existing?.avatarUrl ?? null,
              cpf: existing?.cpf ?? null,
              emailVerified: item.emailVerified,
              isMaster,
              isOperator,
              createdAt: existing?.createdAt ?? item.createdAt,
              lastSeenAt: resolveLatestDate([existing?.lastSeenAt, item.lastSeenAt], item.createdAt)
            });
          })
        );

        users = await deps.repository.listUsers();
      }

      const cases = await deps.repository.listAllCases();
      const userCasesMap = buildUserCasesMap(cases);

      const summarizedUsers = users
        .map((user) => summarizeAdminUser(user, userCasesMap.get(user.id) ?? []))
        .sort((a, b) => {
          const roleScoreA = a.isMaster ? 2 : a.isOperator ? 1 : 0;
          const roleScoreB = b.isMaster ? 2 : b.isOperator ? 1 : 0;
          if (roleScoreB !== roleScoreA) {
            return roleScoreB - roleScoreA;
          }

          if (a.totalCases !== b.totalCases) {
            return b.totalCases - a.totalCases;
          }

          return a.lastSeenAt < b.lastSeenAt ? 1 : -1;
        });

      const usersById = new Map(users.map((user) => [user.id, user]));
      const recentCases = [...cases]
        .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1))
        .slice(0, 8)
        .map((item) => {
          const owner = usersById.get(item.userId);
          return {
            id: item.id,
            userId: item.userId,
            userName: owner?.name ?? null,
            userEmail: owner?.email ?? null,
            varaNome: item.varaNome,
            status: item.status,
            createdAt: item.createdAt,
            updatedAt: item.updatedAt
          };
        });

      res.status(200).json({
        status: "ok",
        result: {
          summary: {
            totalUsers: users.length,
            totalMasterUsers: summarizedUsers.filter((user) => user.isMaster).length,
            verifiedUsers: users.filter((user) => user.emailVerified).length,
            activeUsersLast30Days: countRecentUsers(users, 30),
            newUsersLast7Days: countNewUsers(users, 7),
            totalCases: cases.length,
            activeCases: cases.filter((item) => item.status !== "encerrado").length,
            closedCases: cases.filter((item) => item.status === "encerrado").length
          },
          users: summarizedUsers,
          recentCases
        }
      });
    } catch (error) {
      next(error);
    }
  });

  router.get(
    "/admin/users/:id/activity",
    authMiddleware(deps.authVerifier, deps.repository),
    async (req, res, next) => {
      try {
        if (!req.user) {
          throw new HttpError(401, "Usuário não autenticado.");
        }

        ensureAdminPanelAccess(req.user);

        const targetUser = await deps.repository.getUserById(req.params.id);
        if (!targetUser) {
          throw new HttpError(404, "Usuário não encontrado.");
        }

        const allCases = await deps.repository.listAllCases();
        const userCases = allCases
          .filter((item) => item.userId === targetUser.id)
          .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));

        res.status(200).json({
          status: "ok",
          result: {
            user: summarizeAdminUser(targetUser, userCases),
            requests: userCases.map((item) => ({
              id: item.id,
              varaNome: item.varaNome,
              cpf: item.cpf,
              resumo: item.resumo,
              status: item.status,
              createdAt: item.createdAt,
              updatedAt: item.updatedAt
            }))
          }
        });
      } catch (error) {
        next(error);
      }
    }
  );

  router.patch("/admin/users/:id/access", authMiddleware(deps.authVerifier, deps.repository), async (req, res, next) => {
    try {
      if (!req.user) {
        throw new HttpError(401, "Usuário não autenticado.");
      }

      if (!req.user.isMaster) {
        throw new HttpError(403, "Acesso restrito ao usuário master.");
      }

      const payload = validateAccessLevelPayload(req.body);
      const target = await deps.repository.getUserById(req.params.id);
      if (!target) {
        throw new HttpError(404, "Usuário não encontrado.");
      }

      const targetIsBootstrapMaster = isMasterEmail(target.email);
      if (targetIsBootstrapMaster) {
        throw new HttpError(400, "A conta master principal não pode ser alterada pelo painel.");
      }

      if (target.id === req.user.uid) {
        throw new HttpError(400, "Para sua segurança, altere seu acesso usando outra conta master.");
      }

      const updated = await deps.repository.setUserAccessLevel(target.id, payload.accessLevel);
      if (!updated) {
        throw new HttpError(404, "Usuário não encontrado.");
      }

      res.status(200).json({
        status: "ok",
        result: {
          id: updated.id,
          email: updated.email,
          accessLevel: payload.accessLevel,
          isMaster: updated.isMaster,
          isOperator: updated.isOperator ?? false,
          isBootstrapMaster: false
        }
      });
    } catch (error) {
      next(error);
    }
  });

  router.patch("/admin/users/:id/master", authMiddleware(deps.authVerifier, deps.repository), async (req, res, next) => {
    try {
      if (!req.user) {
        throw new HttpError(401, "Usuário não autenticado.");
      }

      if (!req.user.isMaster) {
        throw new HttpError(403, "Acesso restrito ao usuário master.");
      }

      const payload = validateMasterAccessPayload(req.body);
      const target = await deps.repository.getUserById(req.params.id);
      if (!target) {
        throw new HttpError(404, "Usuário não encontrado.");
      }

      const targetIsBootstrapMaster = isMasterEmail(target.email);
      if (targetIsBootstrapMaster) {
        throw new HttpError(400, "A conta master principal não pode ser alterada pelo painel.");
      }

      if (target.id === req.user.uid) {
        throw new HttpError(400, "Para sua segurança, altere seu acesso master usando outra conta master.");
      }

      const updated = await deps.repository.setUserAccessLevel(target.id, payload.isMaster ? "master" : "user");
      if (!updated) {
        throw new HttpError(404, "Usuário não encontrado.");
      }

      res.status(200).json({
        status: "ok",
        result: {
          id: updated.id,
          email: updated.email,
          isMaster: updated.isMaster,
          isOperator: updated.isOperator ?? false,
          isBootstrapMaster: false
        }
      });
    } catch (error) {
      next(error);
    }
  });

  router.delete("/admin/users/:id", authMiddleware(deps.authVerifier, deps.repository), async (req, res, next) => {
    try {
      if (!req.user) {
        throw new HttpError(401, "Usuário não autenticado.");
      }

      if (!req.user.isMaster) {
        throw new HttpError(403, "Acesso restrito ao usuário master.");
      }

      if (req.params.id === req.user.uid) {
        throw new HttpError(400, "Use a opção de excluir a própria conta no menu superior.");
      }

      const target = await deps.repository.getUserById(req.params.id);
      if (!target) {
        throw new HttpError(404, "Usuário não encontrado.");
      }

      if (isMasterEmail(target.email)) {
        throw new HttpError(400, "A conta master principal não pode ser excluída pelo painel.");
      }

      await deleteFirebaseUserIfPossible(target.id);
      const removed = await deps.repository.deleteUserWithCases(target.id);

      res.status(200).json({
        status: "ok",
        result: {
          deletedUserId: target.id,
          deletedCases: removed.deletedCases
        }
      });
    } catch (error) {
      next(error);
    }
  });

  return router;
}





