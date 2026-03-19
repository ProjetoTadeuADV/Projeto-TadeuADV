import { z } from "zod";
import { getVaraById } from "../constants/varas.js";
import { normalizeCpf, isValidCpf } from "../utils/cpf.js";
import { HttpError } from "../utils/httpError.js";
import type {
  CaseMovementStage,
  CaseMovementVisibility,
  CaseStatus,
  PetitionInitialData
} from "../types/case.js";

const PETITION_TEXT_MAX_LENGTH = 500;

const petitionTimelineEventSchema = z.object({
  eventDate: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Data do evento inválida. Use o formato AAAA-MM-DD.")
    .refine((value) => !Number.isNaN(new Date(`${value}T00:00:00.000Z`).getTime()), {
      message: "Data do evento inválida."
    }),
  description: z.string().trim().min(5).max(PETITION_TEXT_MAX_LENGTH)
});

const petitionPretensionSchema = z
  .object({
    type: z.enum([
      "ressarcimento_valor",
      "indenizacao_danos",
      "cumprimento_compromisso",
      "retratacao",
      "devolucao_produto",
      "outro"
    ]),
    amount: z.number().positive().max(100_000_000).nullable().optional(),
    details: z.string().trim().max(PETITION_TEXT_MAX_LENGTH).nullable().optional()
  })
  .refine((value) => value.type !== "outro" || Boolean(value.details?.trim()), {
    message: "Informe o detalhamento para pretensão do tipo 'Outro'.",
    path: ["details"]
  });

const petitionInitialSchema = z.object({
  claimantAddress: z.string().trim().min(8).max(300),
  claimSubject: z.string().trim().min(5).max(160),
  defendantType: z.enum(["pessoa_fisica", "pessoa_juridica", "nao_informado"]),
  defendantName: z.string().trim().min(2).max(200),
  defendantDocument: z.string().trim().min(11).max(32),
  defendantAddress: z.string().trim().min(8).max(300).nullable().optional(),
  facts: z.string().trim().min(30).max(PETITION_TEXT_MAX_LENGTH),
  legalGrounds: z.string().trim().min(30).max(PETITION_TEXT_MAX_LENGTH),
  requests: z.array(z.string().trim().min(10).max(PETITION_TEXT_MAX_LENGTH)).min(1).max(8),
  timelineEvents: z.array(petitionTimelineEventSchema).min(1).max(40),
  pretensions: z.array(petitionPretensionSchema).max(10).optional().default([]),
  evidence: z.string().trim().max(PETITION_TEXT_MAX_LENGTH).nullable().optional(),
  claimValue: z.number().min(0).max(100_000_000).nullable().optional(),
  hearingInterest: z.boolean().optional().default(true)
});

const createCaseSchema = z.object({
  varaId: z.string().trim().min(1),
  cpf: z.string().trim().min(11),
  resumo: z.string().trim().min(10).max(PETITION_TEXT_MAX_LENGTH),
  petitionInitial: petitionInitialSchema.optional()
});

const assignOperatorSchema = z.object({
  operatorUserId: z.string().trim().min(1)
});

const caseMovementSchema = z.object({
  stage: z.enum(["triagem", "conciliacao", "peticao", "protocolo", "andamento", "solucao", "outro"]),
  description: z.string().trim().min(10).max(5000),
  visibility: z.enum(["public", "internal"]).optional().default("public"),
  status: z.enum(["recebido", "em_analise", "encerrado"]).optional()
});

const caseReviewSchema = z
  .object({
    decision: z.enum(["accepted", "rejected"]),
    reason: z.string().trim().min(10).max(5000),
    requestClientData: z.boolean().optional().default(false),
    clientDataRequest: z.string().trim().max(5000).nullable().optional()
  })
  .superRefine((value, ctx) => {
    if (value.decision === "accepted" && value.requestClientData && !value.clientDataRequest?.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Informe quais dados o cliente deve enviar para continuar.",
        path: ["clientDataRequest"]
      });
    }
  });

const caseMessageSchema = z.object({
  message: z.string().trim().max(5000).optional().default("")
});

const caseServiceFeeSchema = z.object({
  amount: z.number().positive().max(100_000_000),
  dueDate: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Data de vencimento inválida. Use AAAA-MM-DD.")
    .refine((value) => !Number.isNaN(new Date(`${value}T00:00:00.000Z`).getTime()), {
      message: "Data de vencimento inválida."
    })
});

const caseChargeUpdateSchema = z
  .object({
    amount: z.number().positive().max(100_000_000).optional(),
    dueDate: z
      .string()
      .trim()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "Data de vencimento inválida. Use AAAA-MM-DD.")
      .refine((value) => !Number.isNaN(new Date(`${value}T00:00:00.000Z`).getTime()), {
        message: "Data de vencimento inválida."
      })
      .optional(),
    status: z.enum(["awaiting_payment", "received", "confirmed", "canceled"]).optional()
  })
  .refine((value) => value.amount !== undefined || value.dueDate !== undefined || value.status !== undefined, {
    message: "Informe ao menos um campo para atualização da cobrança."
  });

const caseConciliationProgressSchema = z.object({
  contactedDefendant: z.boolean(),
  defendantContact: z.string().trim().max(300).nullable().optional(),
  defendantEmail: z.string().trim().email("E-mail do reclamado inválido.").nullable().optional(),
  emailDraft: z.string().trim().max(5000).nullable().optional(),
  sendEmailToDefendant: z.boolean().optional().default(false)
});

const casePetitionChecklistItemSchema = z.object({
  id: z.string().trim().min(1).max(80),
  label: z.string().trim().min(2).max(120),
  done: z.boolean(),
  notes: z.string().trim().max(500).nullable().optional()
});

const casePetitionProgressSchema = z.object({
  petitionPulled: z.boolean(),
  jusiaProtocolChecked: z.boolean(),
  protocolCode: z.string().trim().max(120).nullable().optional(),
  checklist: z.array(casePetitionChecklistItemSchema).min(1).max(20)
});

const caseCloseRequestSchema = z.object({
  reason: z.string().trim().min(10).max(5000)
});

const caseCloseRequestDecisionSchema = z
  .object({
    decision: z.enum(["approved", "denied"]),
    reason: z.string().trim().max(5000).nullable().optional()
  })
  .superRefine((value, ctx) => {
    if (value.decision === "denied" && !value.reason?.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Informe o motivo da recusa do encerramento.",
        path: ["reason"]
      });
    }
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

  const trimmed = value.replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim();
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
    throw new HttpError(400, "CPF ou CNPJ da parte reclamada é obrigatório.");
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

function normalizeTimelineEvents(
  value: z.infer<typeof petitionInitialSchema>["timelineEvents"]
): PetitionInitialData["timelineEvents"] {
  return value.map((item) => ({
    eventDate: item.eventDate,
    description: item.description.trim()
  }));
}

function normalizePretensions(
  value: z.infer<typeof petitionInitialSchema>["pretensions"]
): PetitionInitialData["pretensions"] {
  return value.map((item) => ({
    type: item.type,
    amount: item.amount ?? null,
    details: normalizeOptionalText(item.details)
  }));
}

function calculateClaimValue(
  pretensions: PetitionInitialData["pretensions"],
  fallback: number | null | undefined
): number {
  const total = pretensions.reduce((sum, item) => {
    if (typeof item.amount !== "number" || !Number.isFinite(item.amount)) {
      return sum;
    }

    return sum + item.amount;
  }, 0);

  if (total > 0) {
    return Number(total.toFixed(2));
  }

  if (typeof fallback === "number" && Number.isFinite(fallback) && fallback >= 0) {
    return Number(fallback.toFixed(2));
  }

  return 0;
}

function normalizePetitionInitialData(value: z.infer<typeof petitionInitialSchema>): PetitionInitialData {
  const defendantDocument = validateDefendantDocument(
    normalizeDefendantDocument(value.defendantDocument),
    value.defendantType
  );
  const pretensions = normalizePretensions(value.pretensions ?? []);

  return {
    claimantAddress: value.claimantAddress,
    claimSubject: value.claimSubject,
    defendantType: value.defendantType,
    defendantName: value.defendantName,
    defendantDocument,
    defendantAddress: normalizeOptionalText(value.defendantAddress),
    facts: normalizeOptionalText(value.facts) ?? value.facts,
    legalGrounds: normalizeOptionalText(value.legalGrounds) ?? value.legalGrounds,
    requests: value.requests.map((item) => normalizeOptionalText(item) ?? item.trim()),
    timelineEvents: normalizeTimelineEvents(value.timelineEvents),
    pretensions,
    evidence: normalizeOptionalText(value.evidence),
    attachments: [],
    claimValue: calculateClaimValue(pretensions, value.claimValue),
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
    resumo: normalizeOptionalText(parsed.data.resumo) ?? parsed.data.resumo,
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

export function validateAssignOperatorPayload(payload: unknown): { operatorUserId: string } {
  const parsed = assignOperatorSchema.safeParse(payload);
  if (!parsed.success) {
    throw new HttpError(400, "Payload inválido para alocação de operador.", parsed.error.flatten());
  }

  return {
    operatorUserId: parsed.data.operatorUserId
  };
}

export function validateCaseMovementPayload(payload: unknown): {
  stage: CaseMovementStage;
  description: string;
  visibility: CaseMovementVisibility;
  status?: CaseStatus;
} {
  const parsed = caseMovementSchema.safeParse(payload);
  if (!parsed.success) {
    throw new HttpError(400, "Payload inválido para movimentação do caso.", parsed.error.flatten());
  }

  return {
    stage: parsed.data.stage,
    description: parsed.data.description,
    visibility: parsed.data.visibility ?? "public",
    ...(parsed.data.status ? { status: parsed.data.status } : {})
  };
}

export function validateCaseReviewPayload(payload: unknown): {
  decision: "accepted" | "rejected";
  reason: string;
  requestClientData: boolean;
  clientDataRequest: string | null;
} {
  const parsed = caseReviewSchema.safeParse(payload);
  if (!parsed.success) {
    throw new HttpError(400, "Payload inválido para parecer do caso.", parsed.error.flatten());
  }

  return {
    decision: parsed.data.decision,
    reason: parsed.data.reason.trim(),
    requestClientData: parsed.data.requestClientData ?? false,
    clientDataRequest: normalizeOptionalText(parsed.data.clientDataRequest)
  };
}

export function validateCaseMessagePayload(payload: unknown): { message: string } {
  const parsed = caseMessageSchema.safeParse(payload);
  if (!parsed.success) {
    throw new HttpError(400, "Payload inválido para mensagem do caso.", parsed.error.flatten());
  }

  return {
    message: parsed.data.message.trim()
  };
}

export function validateCaseServiceFeePayload(payload: unknown): {
  amount: number;
  dueDate: string;
} {
  const parsed = caseServiceFeeSchema.safeParse(payload);
  if (!parsed.success) {
    throw new HttpError(400, "Payload inválido para cobrança inicial.", parsed.error.flatten());
  }

  return {
    amount: parsed.data.amount,
    dueDate: parsed.data.dueDate
  };
}

export function validateCaseChargeUpdatePayload(payload: unknown): {
  amount?: number;
  dueDate?: string;
  status?: "awaiting_payment" | "received" | "confirmed" | "canceled";
} {
  const parsed = caseChargeUpdateSchema.safeParse(payload);
  if (!parsed.success) {
    throw new HttpError(400, "Payload inválido para atualização de cobrança.", parsed.error.flatten());
  }

  return {
    ...(typeof parsed.data.amount === "number" ? { amount: parsed.data.amount } : {}),
    ...(typeof parsed.data.dueDate === "string" ? { dueDate: parsed.data.dueDate } : {}),
    ...(parsed.data.status ? { status: parsed.data.status } : {})
  };
}

export function validateCaseConciliationProgressPayload(payload: unknown): {
  contactedDefendant: boolean;
  defendantContact: string | null;
  defendantEmail: string | null;
  emailDraft: string | null;
  sendEmailToDefendant: boolean;
} {
  const parsed = caseConciliationProgressSchema.safeParse(payload);
  if (!parsed.success) {
    throw new HttpError(400, "Payload inválido para andamento de conciliação.", parsed.error.flatten());
  }

  return {
    contactedDefendant: parsed.data.contactedDefendant,
    defendantContact: normalizeOptionalText(parsed.data.defendantContact),
    defendantEmail: normalizeOptionalText(parsed.data.defendantEmail),
    emailDraft: normalizeOptionalText(parsed.data.emailDraft),
    sendEmailToDefendant: parsed.data.sendEmailToDefendant ?? false
  };
}

export function validateCasePetitionProgressPayload(payload: unknown): {
  petitionPulled: boolean;
  jusiaProtocolChecked: boolean;
  protocolCode: string | null;
  checklist: Array<{ id: string; label: string; done: boolean; notes: string | null }>;
} {
  const parsed = casePetitionProgressSchema.safeParse(payload);
  if (!parsed.success) {
    throw new HttpError(400, "Payload inválido para andamento de petição.", parsed.error.flatten());
  }

  return {
    petitionPulled: parsed.data.petitionPulled,
    jusiaProtocolChecked: parsed.data.jusiaProtocolChecked,
    protocolCode: normalizeOptionalText(parsed.data.protocolCode),
    checklist: parsed.data.checklist.map((item) => ({
      id: item.id,
      label: item.label,
      done: item.done,
      notes: normalizeOptionalText(item.notes)
    }))
  };
}

export function validateCaseCloseRequestPayload(payload: unknown): { reason: string } {
  const parsed = caseCloseRequestSchema.safeParse(payload);
  if (!parsed.success) {
    throw new HttpError(400, "Payload inválido para solicitação de encerramento.", parsed.error.flatten());
  }

  return {
    reason: parsed.data.reason.trim()
  };
}

export function validateCaseCloseRequestDecisionPayload(payload: unknown): {
  decision: "approved" | "denied";
  reason: string | null;
} {
  const parsed = caseCloseRequestDecisionSchema.safeParse(payload);
  if (!parsed.success) {
    throw new HttpError(400, "Payload inválido para decisão de encerramento.", parsed.error.flatten());
  }

  return {
    decision: parsed.data.decision,
    reason: normalizeOptionalText(parsed.data.reason)
  };
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
    avatarUrl: z.string().trim().max(2_000_000).nullable().optional(),
    cpf: z.string().trim().max(32).nullable().optional(),
    rg: z.string().trim().max(30).nullable().optional(),
    rgIssuer: z.string().trim().max(40).nullable().optional(),
    birthDate: z.string().trim().max(20).nullable().optional(),
    maritalStatus: z.string().trim().max(80).nullable().optional(),
    profession: z.string().trim().max(120).nullable().optional(),
    address: z
      .object({
        cep: z.string().trim().max(16).nullable().optional(),
        street: z.string().trim().max(160).nullable().optional(),
        number: z.string().trim().max(40).nullable().optional(),
        complement: z.string().trim().max(120).nullable().optional(),
        neighborhood: z.string().trim().max(120).nullable().optional(),
        city: z.string().trim().max(120).nullable().optional(),
        state: z.string().trim().max(8).nullable().optional()
      })
      .nullable()
      .optional()
  })
  .refine(
    (value) =>
      value.name !== undefined ||
      value.avatarUrl !== undefined ||
      value.cpf !== undefined ||
      value.rg !== undefined ||
      value.rgIssuer !== undefined ||
      value.birthDate !== undefined ||
      value.maritalStatus !== undefined ||
      value.profession !== undefined ||
      value.address !== undefined,
    {
      message: "Informe ao menos um campo para atualizar."
    }
  );

function normalizeOptionalCpf(value: string | null | undefined): string | null {
  if (value === null || typeof value === "undefined") {
    return null;
  }

  const digits = normalizeCpf(value);
  if (digits.length === 0) {
    return null;
  }

  if (!isValidCpf(digits)) {
    throw new HttpError(400, "CPF inválido.");
  }

  return digits;
}

function normalizeOptionalBirthDate(value: string | null | undefined): string | null {
  const normalized = normalizeOptionalText(value);
  if (!normalized) {
    return null;
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
    throw new HttpError(400, "Data de nascimento inválida. Use o formato AAAA-MM-DD.");
  }

  const parsed = new Date(`${normalized}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) {
    throw new HttpError(400, "Data de nascimento inválida.");
  }

  return normalized;
}

function normalizeOptionalCep(value: string | null | undefined): string | null {
  if (value === null || typeof value === "undefined") {
    return null;
  }

  const digits = value.replace(/\D/g, "");
  if (digits.length === 0) {
    return null;
  }

  if (digits.length !== 8) {
    throw new HttpError(400, "CEP inválido. Informe 8 dígitos.");
  }

  return digits;
}

export function validateAccountProfilePatchPayload(
  payload: unknown
): {
  name?: string | null;
  avatarUrl?: string | null;
  cpf?: string | null;
  rg?: string | null;
  rgIssuer?: string | null;
  birthDate?: string | null;
  maritalStatus?: string | null;
  profession?: string | null;
  address?: {
    cep: string | null;
    street: string | null;
    number: string | null;
    complement: string | null;
    neighborhood: string | null;
    city: string | null;
    state: string | null;
  } | null;
} {
  const parsed = accountProfilePatchSchema.safeParse(payload);
  if (!parsed.success) {
    throw new HttpError(400, "Payload inválido para atualizar perfil da conta.", parsed.error.flatten());
  }

  const normalized: {
    name?: string | null;
    avatarUrl?: string | null;
    cpf?: string | null;
    rg?: string | null;
    rgIssuer?: string | null;
    birthDate?: string | null;
    maritalStatus?: string | null;
    profession?: string | null;
    address?: {
      cep: string | null;
      street: string | null;
      number: string | null;
      complement: string | null;
      neighborhood: string | null;
      city: string | null;
      state: string | null;
    } | null;
  } = {};

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

  if (Object.prototype.hasOwnProperty.call(parsed.data, "cpf")) {
    normalized.cpf = normalizeOptionalCpf(parsed.data.cpf);
  }

  if (Object.prototype.hasOwnProperty.call(parsed.data, "rg")) {
    normalized.rg = normalizeOptionalText(parsed.data.rg);
  }

  if (Object.prototype.hasOwnProperty.call(parsed.data, "rgIssuer")) {
    normalized.rgIssuer = normalizeOptionalText(parsed.data.rgIssuer);
  }

  if (Object.prototype.hasOwnProperty.call(parsed.data, "birthDate")) {
    normalized.birthDate = normalizeOptionalBirthDate(parsed.data.birthDate);
  }

  if (Object.prototype.hasOwnProperty.call(parsed.data, "maritalStatus")) {
    normalized.maritalStatus = normalizeOptionalText(parsed.data.maritalStatus);
  }

  if (Object.prototype.hasOwnProperty.call(parsed.data, "profession")) {
    normalized.profession = normalizeOptionalText(parsed.data.profession);
  }

  if (Object.prototype.hasOwnProperty.call(parsed.data, "address")) {
    const value = parsed.data.address;
    if (!value) {
      normalized.address = null;
    } else {
      const address = {
        cep: normalizeOptionalCep(value.cep),
        street: normalizeOptionalText(value.street),
        number: normalizeOptionalText(value.number),
        complement: normalizeOptionalText(value.complement),
        neighborhood: normalizeOptionalText(value.neighborhood),
        city: normalizeOptionalText(value.city),
        state: normalizeOptionalText(value.state)
      };

      const hasAnyAddressValue = Object.values(address).some((item) => item !== null);
      normalized.address = hasAnyAddressValue ? address : null;
    }
  }

  return normalized;
}

