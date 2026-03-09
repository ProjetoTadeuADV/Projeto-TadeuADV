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

export function validateUserProfilePayload(payload: unknown): { cpf: string; name?: string } {
  const parsed = z
    .object({
      cpf: z.string().trim().min(11),
      name: z.string().trim().min(2).max(120).optional()
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
