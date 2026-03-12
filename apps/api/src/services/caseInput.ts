import { z } from "zod";
import { getVaraById } from "../constants/varas.js";
import { normalizeCpf, isValidCpf } from "../utils/cpf.js";
import { HttpError } from "../utils/httpError.js";

const createCaseSchema = z.object({
  varaId: z.string().trim().min(1),
  cpf: z.string().trim().min(11),
  resumo: z.string().trim().min(10).max(5000)
});

export interface ValidatedCreateCaseInput {
  varaId: string;
  varaNome: string;
  cpf: string;
  resumo: string;
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
    resumo: parsed.data.resumo
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
