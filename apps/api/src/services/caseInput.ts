import { z } from "zod";
import { getVaraById } from "../constants/varas.js";
import { normalizeCpf, isValidCpf } from "../utils/cpf.js";
import { HttpError } from "../utils/httpError.js";
import type { PetitionInitialData } from "../types/case.js";

const petitionInitialSchema = z.object({
  claimantAddress: z.string().trim().min(8).max(300),
  claimSubject: z.string().trim().min(5).max(160),
  defendantType: z.enum(["pessoa_fisica", "pessoa_juridica", "nao_informado"]),
  defendantName: z.string().trim().min(2).max(200),
  defendantDocument: z.string().trim().max(32).nullable().optional(),
  defendantAddress: z.string().trim().min(8).max(300).nullable().optional(),
  facts: z.string().trim().min(30).max(12_000),
  legalGrounds: z.string().trim().min(30).max(12_000),
  requests: z.array(z.string().trim().min(10).max(600)).min(1).max(8),
  evidence: z.string().trim().max(5_000).nullable().optional(),
  claimValue: z.number().positive().max(100_000_000).nullable().optional(),
  hearingInterest: z.boolean().optional().default(true)
});

const createCaseSchema = z.object({
  varaId: z.string().trim().min(1),
  cpf: z.string().trim().min(11),
  resumo: z.string().trim().min(10).max(5000),
  petitionInitial: petitionInitialSchema.optional()
});

export interface ValidatedCreateCaseInput {
  varaId: string;
  varaNome: string;
  cpf: string;
  resumo: string;
  petitionInitial: PetitionInitialData | null;
}

function normalizeOptionalText(value: string | null | undefined): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeDefendantDocument(value: string | null | undefined): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const digits = value.replace(/\D/g, "");
  return digits.length > 0 ? digits : null;
}

function validateDefendantDocument(
  value: string | null,
  defendantType: PetitionInitialData["defendantType"]
): string | null {
  if (!value) {
    return null;
  }

  if (defendantType === "pessoa_fisica" && value.length !== 11) {
    throw new HttpError(400, "Documento da reclamada inválido para pessoa física.");
  }

  if (defendantType === "pessoa_juridica" && value.length !== 14) {
    throw new HttpError(400, "Documento da reclamada inválido para pessoa jurídica.");
  }

  if (defendantType === "nao_informado" && value.length !== 11 && value.length !== 14) {
    throw new HttpError(400, "Documento da reclamada deve conter CPF (11) ou CNPJ (14).");
  }

  return value;
}

function normalizePetitionInitialData(value: z.infer<typeof petitionInitialSchema>): PetitionInitialData {
  const defendantDocument = validateDefendantDocument(
    normalizeDefendantDocument(value.defendantDocument),
    value.defendantType
  );

  return {
    claimantAddress: value.claimantAddress,
    claimSubject: value.claimSubject,
    defendantType: value.defendantType,
    defendantName: value.defendantName,
    defendantDocument,
    defendantAddress: normalizeOptionalText(value.defendantAddress),
    facts: value.facts,
    legalGrounds: value.legalGrounds,
    requests: value.requests.map((item) => item.trim()),
    evidence: normalizeOptionalText(value.evidence),
    attachments: [],
    claimValue: value.claimValue ?? null,
    hearingInterest: value.hearingInterest ?? true
  };
}

export function validateCreateCaseInput(payload: unknown): ValidatedCreateCaseInput {
  const parsed = createCaseSchema.safeParse(payload);
  if (!parsed.success) {
    throw new HttpError(400, "Payload inválido para criação de caso.", parsed.error.flatten());
  }

  const cpf = normalizeCpf(parsed.data.cpf);
  if (!isValidCpf(cpf)) {
    throw new HttpError(400, "CPF inválido.");
  }

  const vara = getVaraById(parsed.data.varaId);
  if (!vara) {
    throw new HttpError(400, "Vara inválida.");
  }

  return {
    varaId: vara.id,
    varaNome: vara.nome,
    cpf,
    resumo: parsed.data.resumo,
    petitionInitial: parsed.data.petitionInitial
      ? normalizePetitionInitialData(parsed.data.petitionInitial)
      : null
  };
}

export function validateCpfLookupPayload(payload: unknown): { cpf: string } {
  const parsed = z
    .object({
      cpf: z.string().trim().min(11)
    })
    .safeParse(payload);

  if (!parsed.success) {
    throw new HttpError(400, "Payload inválido para consulta CPF.", parsed.error.flatten());
  }

  const cpf = normalizeCpf(parsed.data.cpf);
  if (!isValidCpf(cpf)) {
    throw new HttpError(400, "CPF inválido.");
  }

  return { cpf };
}

export function validateUserProfilePayload(payload: unknown): { cpf: string; name: string } {
  const parsed = z
    .object({
      cpf: z.string().trim().min(11),
      name: z.string().trim().min(2).max(120)
    })
    .safeParse(payload);

  if (!parsed.success) {
    throw new HttpError(400, "Payload inválido para perfil de usuário.", parsed.error.flatten());
  }

  const cpf = normalizeCpf(parsed.data.cpf);
  if (!isValidCpf(cpf)) {
    throw new HttpError(400, "CPF inválido.");
  }

  return {
    cpf,
    name: parsed.data.name
  };
}

export function validateMasterAccessPayload(payload: unknown): { isMaster: boolean } {
  const parsed = z
    .object({
      isMaster: z.boolean()
    })
    .safeParse(payload);

  if (!parsed.success) {
    throw new HttpError(400, "Payload inválido para atualização de acesso master.", parsed.error.flatten());
  }

  return parsed.data;
}

export function validateAccessLevelPayload(
  payload: unknown
): { accessLevel: "user" | "operator" | "master" } {
  const parsed = z
    .object({
      accessLevel: z.enum(["user", "operator", "master"])
    })
    .safeParse(payload);

  if (!parsed.success) {
    throw new HttpError(400, "Payload inválido para atualização de nível de acesso.", parsed.error.flatten());
  }

  return parsed.data;
}

export function validateLoginIdentifierPayload(
  payload: unknown
): { type: "email"; value: string } | { type: "cpf"; value: string } {
  const parsed = z
    .object({
      identifier: z.string().trim().min(1)
    })
    .safeParse(payload);

  if (!parsed.success) {
    throw new HttpError(400, "Payload inválido para login.", parsed.error.flatten());
  }

  const identifier = parsed.data.identifier.trim();
  if (identifier.includes("@")) {
    return {
      type: "email",
      value: identifier.toLowerCase()
    };
  }

  const cpf = normalizeCpf(identifier);
  if (!isValidCpf(cpf)) {
    throw new HttpError(400, "Informe um CPF válido para acessar.");
  }

  return {
    type: "cpf",
    value: cpf
  };
}

export function validateRegisterAvailabilityPayload(payload: unknown): { cpf: string; email: string } {
  const parsed = z
    .object({
      cpf: z.string().trim().min(11),
      email: z.string().trim().email().max(320)
    })
    .safeParse(payload);

  if (!parsed.success) {
    throw new HttpError(400, "Payload inválido para validação de cadastro.", parsed.error.flatten());
  }

  const cpf = normalizeCpf(parsed.data.cpf);
  if (!isValidCpf(cpf)) {
    throw new HttpError(400, "CPF inválido.");
  }

  return {
    cpf,
    email: parsed.data.email.toLowerCase()
  };
}

const accountProfilePatchSchema = z
  .object({
    name: z.string().trim().min(2).max(120).nullable().optional(),
    avatarUrl: z.string().trim().max(2_000_000).nullable().optional()
  })
  .refine((value) => value.name !== undefined || value.avatarUrl !== undefined, {
    message: "Informe ao menos um campo para atualizar."
  });

export function validateAccountProfilePatchPayload(
  payload: unknown
): { name?: string | null; avatarUrl?: string | null } {
  const parsed = accountProfilePatchSchema.safeParse(payload);
  if (!parsed.success) {
    throw new HttpError(400, "Payload inválido para atualizar perfil da conta.", parsed.error.flatten());
  }

  const normalized: { name?: string | null; avatarUrl?: string | null } = {};

  if (Object.prototype.hasOwnProperty.call(parsed.data, "name")) {
    normalized.name = parsed.data.name;
  }

  if (Object.prototype.hasOwnProperty.call(parsed.data, "avatarUrl")) {
    const avatarValue = parsed.data.avatarUrl;
    if (avatarValue === null || typeof avatarValue === "undefined") {
      normalized.avatarUrl = null;
    } else {
      const trimmed = avatarValue.trim();
      normalized.avatarUrl = trimmed.length === 0 ? null : trimmed;
    }
  }

  return normalized;
}

