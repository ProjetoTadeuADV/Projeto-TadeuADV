import { randomUUID } from "node:crypto";
import type { CaseRepository } from "./caseRepository.js";
import type {
  CaseChargeRecord,
  CaseMessageRecord,
  CaseProcedureProgress,
  CaseRecord,
  CaseServiceFee,
  CaseWorkflowStep,
  CaseMovementRecord,
  NewCaseInput,
  PetitionAttachment,
  UserRecord
} from "../types/case.js";

function normalizeOptionalText(value: string | null | undefined): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeUserAddress(
  value:
    | {
        cep: string | null;
        street: string | null;
        number: string | null;
        complement: string | null;
        neighborhood: string | null;
        city: string | null;
        state: string | null;
      }
    | null
    | undefined
):
  | {
      cep: string | null;
      street: string | null;
      number: string | null;
      complement: string | null;
      neighborhood: string | null;
      city: string | null;
      state: string | null;
    }
  | null {
  if (!value) {
    return null;
  }

  const normalized = {
    cep: normalizeOptionalText(value.cep),
    street: normalizeOptionalText(value.street),
    number: normalizeOptionalText(value.number),
    complement: normalizeOptionalText(value.complement),
    neighborhood: normalizeOptionalText(value.neighborhood),
    city: normalizeOptionalText(value.city),
    state: normalizeOptionalText(value.state)
  };

  const hasAnyValue = Object.values(normalized).some((item) => item !== null);
  return hasAnyValue ? normalized : null;
}

function buildCaseCode(caseId: string, createdAt: string): string {
  const datePart = createdAt.slice(0, 10).replace(/-/g, "");
  return `CASO-${datePart}-${caseId.slice(0, 8).toUpperCase()}`;
}

function normalizePetitionInitialData(value: NewCaseInput["petitionInitial"]): CaseRecord["petitionInitial"] {
  if (!value) {
    return null;
  }

  return {
    ...value,
    requests: value.requests ?? [],
    timelineEvents: value.timelineEvents ?? [],
    pretensions: value.pretensions ?? [],
    attachments: value.attachments ?? []
  };
}

function normalizeCaseServiceFee(value: CaseServiceFee | null | undefined): CaseServiceFee | null {
  if (!value) {
    return null;
  }

  return {
    amount: value.amount,
    dueDate: value.dueDate,
    provider: "asaas",
    status: value.status,
    externalReference: normalizeOptionalText(value.externalReference),
    paymentUrl: normalizeOptionalText(value.paymentUrl),
    updatedAt: value.updatedAt
  };
}

function normalizeCaseChargeStatus(
  value: CaseChargeRecord["status"] | string | null | undefined
): CaseChargeRecord["status"] {
  if (value === "received" || value === "confirmed" || value === "canceled") {
    return value;
  }

  return "awaiting_payment";
}

function normalizeCaseCharges(value: CaseRecord["charges"] | null | undefined): CaseChargeRecord[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => {
      if (!item || typeof item !== "object") {
        return null;
      }

      if (typeof item.amount !== "number" || !Number.isFinite(item.amount) || item.amount <= 0) {
        return null;
      }

      const createdAt = item.createdAt ?? new Date(0).toISOString();
      return {
        id: item.id ?? randomUUID(),
        amount: item.amount,
        dueDate: item.dueDate ?? "",
        provider: "asaas",
        status: normalizeCaseChargeStatus(item.status),
        externalReference: normalizeOptionalText(item.externalReference),
        paymentUrl: normalizeOptionalText(item.paymentUrl),
        attachmentId: normalizeOptionalText(item.attachmentId),
        createdAt,
        updatedAt: item.updatedAt ?? createdAt,
        createdByUserId: item.createdByUserId ?? "",
        createdByName: normalizeOptionalText(item.createdByName)
      } satisfies CaseChargeRecord;
    })
    .filter((item): item is CaseChargeRecord => item !== null);
}

function defaultProcedureChecklist(): CaseProcedureProgress["petition"]["checklist"] {
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

function normalizeProcedureChecklist(
  value: CaseProcedureProgress["petition"]["checklist"] | null | undefined
): CaseProcedureProgress["petition"]["checklist"] {
  const fallback = defaultProcedureChecklist();
  if (!Array.isArray(value)) {
    return fallback;
  }

  const normalized = value
    .map((item) => {
      if (!item || typeof item !== "object") {
        return null;
      }

      const id = normalizeOptionalText(item.id);
      const label = normalizeOptionalText(item.label);
      if (!id || !label) {
        return null;
      }

      return {
        id,
        label,
        done: item.done === true,
        notes: normalizeOptionalText(item.notes),
        updatedAt: item.updatedAt ?? null
      };
    })
    .filter(
      (
        item
      ): item is {
        id: string;
        label: string;
        done: boolean;
        notes: string | null;
        updatedAt: string | null;
      } => item !== null
    );

  if (normalized.length === 0) {
    return fallback;
  }

  return normalized;
}

function normalizeConciliationAttempts(
  value: CaseProcedureProgress["conciliation"]["attempts"] | null | undefined
): NonNullable<CaseProcedureProgress["conciliation"]["attempts"]> {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => {
      if (!item || typeof item !== "object") {
        return null;
      }

      return {
        id: item.id ?? randomUUID(),
        details: normalizeOptionalText(item.details),
        contactedDefendant: item.contactedDefendant === true,
        defendantContact: normalizeOptionalText(item.defendantContact),
        defendantEmail: normalizeOptionalText(item.defendantEmail),
        emailDraft: normalizeOptionalText(item.emailDraft),
        emailSent: item.emailSent === true,
        emailSentAt: item.emailSentAt ?? null,
        createdAt: item.createdAt ?? new Date(0).toISOString(),
        createdByUserId: item.createdByUserId ?? null,
        createdByName: normalizeOptionalText(item.createdByName)
      };
    })
    .filter((item): item is NonNullable<CaseProcedureProgress["conciliation"]["attempts"]>[number] => item !== null)
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
}

function normalizeCaseProcedureProgress(
  value: CaseRecord["procedureProgress"] | null | undefined
): CaseProcedureProgress {
  const normalizeTimelineStageStates = (states: unknown) => {
    if (!states || typeof states !== "object") {
      return {};
    }

    const result: NonNullable<CaseProcedureProgress["timeline"]["stageStates"]> = {};
    for (const [stage, rawState] of Object.entries(states)) {
      if (!rawState || typeof rawState !== "object") {
        continue;
      }
      const rawStateRecord = rawState as Record<string, unknown>;
      const rawChecklist = rawStateRecord.checklist;

      const checklist = Array.isArray(rawChecklist)
        ? rawChecklist
            .map((item: unknown) => {
              if (!item || typeof item !== "object") {
                return null;
              }
              const rawChecklistItem = item as Record<string, unknown>;

              const id = typeof rawChecklistItem.id === "string" ? rawChecklistItem.id.trim() : "";
              const label = typeof rawChecklistItem.label === "string" ? rawChecklistItem.label.trim() : "";
              if (!id || !label) {
                return null;
              }

              return {
                id,
                label,
                done: rawChecklistItem.done === true,
                updatedAt: typeof rawChecklistItem.updatedAt === "string" ? rawChecklistItem.updatedAt : null
              };
            })
            .filter(
              (item: { id: string; label: string; done: boolean; updatedAt: string | null } | null): item is {
                id: string;
                label: string;
                done: boolean;
                updatedAt: string | null;
              } => item !== null
            )
        : [];

      result[stage as keyof typeof result] = {
        checklist,
        notes: normalizeOptionalText(rawStateRecord.notes as string | null | undefined),
        updatedAt: typeof rawStateRecord.updatedAt === "string" ? rawStateRecord.updatedAt : null,
        updatedByUserId: typeof rawStateRecord.updatedByUserId === "string" ? rawStateRecord.updatedByUserId : null,
        updatedByName: normalizeOptionalText(rawStateRecord.updatedByName as string | null | undefined)
      };
    }

    return result;
  };

  if (!value) {
    return {
      timeline: {
        currentStage: "ajuizamento",
        notes: null,
        updatedAt: null,
        updatedByUserId: null,
        updatedByName: null,
        stageStates: {}
      },
      conciliation: {
        details: null,
        contactedDefendant: false,
        defendantContact: null,
        defendantEmail: null,
        emailDraft: null,
        emailSent: false,
        emailSentAt: null,
        lastUpdatedAt: null,
        agreementReached: false,
        agreementClosedAt: null,
        attempts: []
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

  return {
    timeline: {
      currentStage: value.timeline?.currentStage ?? "ajuizamento",
      notes: normalizeOptionalText(value.timeline?.notes),
      updatedAt: value.timeline?.updatedAt ?? null,
      updatedByUserId: value.timeline?.updatedByUserId ?? null,
      updatedByName: normalizeOptionalText(value.timeline?.updatedByName),
      stageStates: normalizeTimelineStageStates(value.timeline?.stageStates)
    },
    conciliation: {
      details: normalizeOptionalText(value.conciliation?.details),
      contactedDefendant: value.conciliation?.contactedDefendant === true,
      defendantContact: normalizeOptionalText(value.conciliation?.defendantContact),
      defendantEmail: normalizeOptionalText(value.conciliation?.defendantEmail),
      emailDraft: normalizeOptionalText(value.conciliation?.emailDraft),
      emailSent: value.conciliation?.emailSent === true,
      emailSentAt: value.conciliation?.emailSentAt ?? null,
      lastUpdatedAt: value.conciliation?.lastUpdatedAt ?? null,
      agreementReached: value.conciliation?.agreementReached === true,
      agreementClosedAt: value.conciliation?.agreementClosedAt ?? null,
      attempts: normalizeConciliationAttempts(value.conciliation?.attempts)
    },
    petition: {
      petitionPulled: value.petition?.petitionPulled === true,
      petitionPulledAt: value.petition?.petitionPulledAt ?? null,
      jusiaProtocolChecked: value.petition?.jusiaProtocolChecked === true,
      jusiaProtocolCheckedAt: value.petition?.jusiaProtocolCheckedAt ?? null,
      protocolCode: normalizeOptionalText(value.petition?.protocolCode),
      protocolCodeUpdatedAt: value.petition?.protocolCodeUpdatedAt ?? null,
      checklist: normalizeProcedureChecklist(value.petition?.checklist),
      lastUpdatedAt: value.petition?.lastUpdatedAt ?? null
    }
  };
}

function normalizeCaseCloseRequest(
  value: CaseRecord["closeRequest"] | null | undefined
): CaseRecord["closeRequest"] {
  if (!value) {
    return {
      status: "none",
      reason: null,
      requestedAt: null,
      requestedByUserId: null,
      requestedByName: null,
      decisionAt: null,
      decidedByUserId: null,
      decidedByName: null,
      decisionReason: null
    };
  }

  return {
    status: value.status ?? "none",
    reason: normalizeOptionalText(value.reason),
    requestedAt: value.requestedAt ?? null,
    requestedByUserId: value.requestedByUserId ?? null,
    requestedByName: normalizeOptionalText(value.requestedByName),
    decisionAt: value.decisionAt ?? null,
    decidedByUserId: value.decidedByUserId ?? null,
    decidedByName: normalizeOptionalText(value.decidedByName),
    decisionReason: normalizeOptionalText(value.decisionReason)
  };
}

function normalizeCaseSaleRequest(
  value: CaseRecord["saleRequest"] | null | undefined
): CaseRecord["saleRequest"] {
  if (!value) {
    return {
      status: "none",
      requestedAt: null,
      requestedByUserId: null,
      requestedByName: null,
      requestMessage: null,
      reviewedAt: null,
      reviewedByUserId: null,
      reviewedByName: null,
      reviewSummary: null,
      suggestedAmount: null,
      opinionMessage: null,
      proposalSentAt: null,
      clientDecision: "pending",
      clientDecisionAt: null,
      clientDecisionByUserId: null,
      clientDecisionByName: null,
      clientDecisionReason: null
    };
  }

  return {
    status: value.status ?? "none",
    requestedAt: value.requestedAt ?? null,
    requestedByUserId: value.requestedByUserId ?? null,
    requestedByName: normalizeOptionalText(value.requestedByName),
    requestMessage: normalizeOptionalText(value.requestMessage),
    reviewedAt: value.reviewedAt ?? null,
    reviewedByUserId: value.reviewedByUserId ?? null,
    reviewedByName: normalizeOptionalText(value.reviewedByName),
    reviewSummary: normalizeOptionalText(value.reviewSummary),
    suggestedAmount:
      typeof value.suggestedAmount === "number" && Number.isFinite(value.suggestedAmount)
        ? value.suggestedAmount
        : null,
    opinionMessage: normalizeOptionalText(value.opinionMessage),
    proposalSentAt: value.proposalSentAt ?? null,
    clientDecision: value.clientDecision ?? "pending",
    clientDecisionAt: value.clientDecisionAt ?? null,
    clientDecisionByUserId: value.clientDecisionByUserId ?? null,
    clientDecisionByName: normalizeOptionalText(value.clientDecisionByName),
    clientDecisionReason: normalizeOptionalText(value.clientDecisionReason)
  };
}

function normalizeCaseMessages(value: CaseMessageRecord[] | null | undefined): CaseMessageRecord[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.map((item) => ({
    id: item.id ?? randomUUID(),
    caseId: item.caseId ?? "",
    senderUserId: item.senderUserId ?? "",
    senderName: normalizeOptionalText(item.senderName),
    senderRole: item.senderRole ?? "client",
    message: item.message ?? "",
    attachments: item.attachments ?? [],
    createdAt: item.createdAt ?? new Date(0).toISOString()
  }));
}

function normalizeAssignedOperatorIds(
  ids: string[] | null | undefined,
  legacyId: string | null | undefined
): string[] {
  const normalized = (Array.isArray(ids) ? ids : [])
    .map((item) => item.trim())
    .filter(Boolean);

  if (normalized.length > 0) {
    return Array.from(new Set(normalized));
  }

  const fallback = legacyId?.trim();
  return fallback ? [fallback] : [];
}

function normalizeAssignedOperatorNames(
  names: string[] | null | undefined,
  legacyName: string | null | undefined
): string[] {
  const normalized = (Array.isArray(names) ? names : [])
    .map((item) => item.trim())
    .filter(Boolean);

  if (normalized.length > 0) {
    return Array.from(new Set(normalized));
  }

  const fallback = legacyName?.trim();
  return fallback ? [fallback] : [];
}

function normalizeCaseRecord(value: CaseRecord): CaseRecord {
  const assignedOperatorIds = normalizeAssignedOperatorIds(value.assignedOperatorIds, value.assignedOperatorId);
  const assignedOperatorNames = normalizeAssignedOperatorNames(value.assignedOperatorNames, value.assignedOperatorName);

  return {
    ...value,
    assignedOperatorId: assignedOperatorIds[0] ?? null,
    assignedOperatorName: assignedOperatorNames[0] ?? null,
    assignedOperatorIds,
    assignedOperatorNames,
    reviewDecision: value.reviewDecision ?? "pending",
    reviewReason: normalizeOptionalText(value.reviewReason),
    reviewedAt: value.reviewedAt ?? null,
    reviewedByUserId: value.reviewedByUserId ?? null,
    reviewedByName: normalizeOptionalText(value.reviewedByName),
    clientDataRequest: normalizeOptionalText(value.clientDataRequest),
    clientDataRequestedAt: value.clientDataRequestedAt ?? null,
    workflowStep: (value.workflowStep ?? "triage") as CaseWorkflowStep,
    closeRequest: normalizeCaseCloseRequest(value.closeRequest),
    saleRequest: normalizeCaseSaleRequest(value.saleRequest),
    serviceFee: normalizeCaseServiceFee(value.serviceFee),
    charges: normalizeCaseCharges(value.charges),
    procedureProgress: normalizeCaseProcedureProgress(value.procedureProgress),
    messages: normalizeCaseMessages(value.messages)
  };
}

export class MemoryCaseRepository implements CaseRepository {
  private readonly users = new Map<string, UserRecord>();
  private readonly cases = new Map<string, CaseRecord>();

  async upsertUser(user: UserRecord): Promise<void> {
    const existing = this.users.get(user.id);
    if (!existing) {
      this.users.set(user.id, {
        ...user,
        avatarUrl: normalizeOptionalText(user.avatarUrl),
        nameCustomized: false,
        avatarUrlCustomized: false,
        isOperator: user.isMaster ? false : (user.isOperator ?? false)
      });
      return;
    }

    this.users.set(user.id, {
      ...existing,
      email: user.email,
      name: existing.nameCustomized ? existing.name ?? null : existing.name ?? normalizeOptionalText(user.name),
      avatarUrl: existing.avatarUrlCustomized
        ? existing.avatarUrl ?? null
        : existing.avatarUrl ?? normalizeOptionalText(user.avatarUrl),
      nameCustomized: existing.nameCustomized ?? false,
      avatarUrlCustomized: existing.avatarUrlCustomized ?? false,
      cpf: existing.cpf ?? user.cpf ?? null,
      asaasCustomerId: existing.asaasCustomerId ?? null,
      emailVerified: user.emailVerified,
      isMaster: user.isMaster,
      isOperator: user.isMaster ? false : (user.isOperator ?? existing.isOperator ?? false),
      lastSeenAt: user.lastSeenAt
    });
  }

  async getUserById(userId: string): Promise<UserRecord | null> {
    return this.users.get(userId) ?? null;
  }

  async findUserByCpf(cpf: string): Promise<UserRecord | null> {
    for (const user of this.users.values()) {
      if (user.cpf === cpf) {
        return user;
      }
    }

    return null;
  }

  async updateUserProfile(
    userId: string,
    profile: { cpf: string; name?: string | null }
  ): Promise<UserRecord | null> {
    const now = new Date().toISOString();
    const existing = this.users.get(userId);
    if (!existing) {
      const created: UserRecord = {
        id: userId,
        email: null,
        name: profile.name ?? null,
        avatarUrl: null,
        nameCustomized: true,
        avatarUrlCustomized: false,
        cpf: profile.cpf,
        asaasCustomerId: null,
        emailVerified: false,
        isMaster: false,
        isOperator: false,
        createdAt: now,
        lastSeenAt: now
      };
      this.users.set(userId, created);
      return created;
    }

    const updated: UserRecord = {
      ...existing,
      name: normalizeOptionalText(profile.name) ?? existing.name,
      nameCustomized: true,
      cpf: profile.cpf,
      asaasCustomerId: existing.asaasCustomerId ?? null,
      lastSeenAt: now
    };
    this.users.set(userId, updated);
    return updated;
  }

  async updateUserAsaasCustomer(userId: string, asaasCustomerId: string): Promise<UserRecord | null> {
    const now = new Date().toISOString();
    const existing = this.users.get(userId);
    if (!existing) {
      const created: UserRecord = {
        id: userId,
        email: null,
        name: null,
        avatarUrl: null,
        nameCustomized: false,
        avatarUrlCustomized: false,
        cpf: null,
        asaasCustomerId: normalizeOptionalText(asaasCustomerId),
        emailVerified: false,
        isMaster: false,
        isOperator: false,
        createdAt: now,
        lastSeenAt: now
      };
      this.users.set(userId, created);
      return created;
    }

    const updated: UserRecord = {
      ...existing,
      asaasCustomerId: normalizeOptionalText(asaasCustomerId),
      lastSeenAt: now
    };
    this.users.set(userId, updated);
    return updated;
  }

  async updateAccountProfile(
    userId: string,
    profile: {
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
    }
  ): Promise<UserRecord | null> {
    const now = new Date().toISOString();
    const existing = this.users.get(userId);
    const hasName = Object.prototype.hasOwnProperty.call(profile, "name");
    const hasAvatarUrl = Object.prototype.hasOwnProperty.call(profile, "avatarUrl");
    const hasCpf = Object.prototype.hasOwnProperty.call(profile, "cpf");
    const hasRg = Object.prototype.hasOwnProperty.call(profile, "rg");
    const hasRgIssuer = Object.prototype.hasOwnProperty.call(profile, "rgIssuer");
    const hasBirthDate = Object.prototype.hasOwnProperty.call(profile, "birthDate");
    const hasMaritalStatus = Object.prototype.hasOwnProperty.call(profile, "maritalStatus");
    const hasProfession = Object.prototype.hasOwnProperty.call(profile, "profession");
    const hasAddress = Object.prototype.hasOwnProperty.call(profile, "address");

    if (!existing) {
      const created: UserRecord = {
        id: userId,
        email: null,
        name: hasName ? normalizeOptionalText(profile.name) : null,
        avatarUrl: hasAvatarUrl ? normalizeOptionalText(profile.avatarUrl) : null,
        nameCustomized: hasName,
        avatarUrlCustomized: hasAvatarUrl,
        cpf: hasCpf ? normalizeOptionalText(profile.cpf) : null,
        asaasCustomerId: null,
        rg: hasRg ? normalizeOptionalText(profile.rg) : null,
        rgIssuer: hasRgIssuer ? normalizeOptionalText(profile.rgIssuer) : null,
        birthDate: hasBirthDate ? normalizeOptionalText(profile.birthDate) : null,
        maritalStatus: hasMaritalStatus ? normalizeOptionalText(profile.maritalStatus) : null,
        profession: hasProfession ? normalizeOptionalText(profile.profession) : null,
        address: hasAddress ? normalizeUserAddress(profile.address) : null,
        emailVerified: false,
        isMaster: false,
        isOperator: false,
        createdAt: now,
        lastSeenAt: now
      };
      this.users.set(userId, created);
      return created;
    }

    const updated: UserRecord = {
      ...existing,
      name: hasName ? normalizeOptionalText(profile.name) : existing.name,
      avatarUrl: hasAvatarUrl ? normalizeOptionalText(profile.avatarUrl) : existing.avatarUrl,
      nameCustomized: hasName ? true : existing.nameCustomized ?? false,
      avatarUrlCustomized: hasAvatarUrl ? true : existing.avatarUrlCustomized ?? false,
      cpf: hasCpf ? normalizeOptionalText(profile.cpf) : existing.cpf ?? null,
      asaasCustomerId: existing.asaasCustomerId ?? null,
      rg: hasRg ? normalizeOptionalText(profile.rg) : existing.rg ?? null,
      rgIssuer: hasRgIssuer ? normalizeOptionalText(profile.rgIssuer) : existing.rgIssuer ?? null,
      birthDate: hasBirthDate ? normalizeOptionalText(profile.birthDate) : existing.birthDate ?? null,
      maritalStatus: hasMaritalStatus
        ? normalizeOptionalText(profile.maritalStatus)
        : existing.maritalStatus ?? null,
      profession: hasProfession ? normalizeOptionalText(profile.profession) : existing.profession ?? null,
      address: hasAddress ? normalizeUserAddress(profile.address) : existing.address ?? null,
      lastSeenAt: now
    };
    this.users.set(userId, updated);
    return updated;
  }

  async setUserMasterStatus(userId: string, isMaster: boolean): Promise<UserRecord | null> {
    const accessLevel = isMaster ? "master" : "user";
    return this.setUserAccessLevel(userId, accessLevel);
  }

  async setUserAccessLevel(
    userId: string,
    accessLevel: "user" | "operator" | "master"
  ): Promise<UserRecord | null> {
    const existing = this.users.get(userId);
    if (!existing) {
      return null;
    }

    const updated: UserRecord = {
      ...existing,
      isMaster: accessLevel === "master",
      isOperator: accessLevel === "operator"
    };
    this.users.set(userId, updated);
    return updated;
  }

  async deleteUserWithCases(userId: string): Promise<{ deletedUser: boolean; deletedCases: number }> {
    const deletedUser = this.users.delete(userId);
    let deletedCases = 0;

    for (const [caseId, item] of this.cases.entries()) {
      if (item.userId === userId) {
        this.cases.delete(caseId);
        deletedCases += 1;
      }
    }

    return {
      deletedUser,
      deletedCases
    };
  }

  async createCase(input: NewCaseInput): Promise<CaseRecord> {
    const now = new Date().toISOString();
    const caseId = randomUUID();
    const caseCode = buildCaseCode(caseId, now);
    const initialMovement: CaseMovementRecord = {
      id: randomUUID(),
      stage: "triagem",
      description: "Caso aberto na plataforma e aguardando análise inicial.",
      visibility: "public",
      createdAt: now,
      createdByUserId: input.userId,
      createdByName: input.cpfConsulta?.nome ?? null,
      statusAfter: "recebido",
      attachments: []
    };

    const newCase: CaseRecord = {
      id: caseId,
      caseCode,
      userId: input.userId,
      varaId: input.varaId,
      varaNome: input.varaNome,
      cpf: input.cpf,
      resumo: input.resumo,
      cpfConsulta: input.cpfConsulta,
      petitionInitial: normalizePetitionInitialData(input.petitionInitial ?? null),
      assignedOperatorId: null,
      assignedOperatorName: null,
      assignedOperatorIds: [],
      assignedOperatorNames: [],
      assignedAt: null,
      reviewDecision: "pending",
      reviewReason: null,
      reviewedAt: null,
      reviewedByUserId: null,
      reviewedByName: null,
      clientDataRequest: null,
      clientDataRequestedAt: null,
      workflowStep: "triage",
      closeRequest: {
        status: "none",
        reason: null,
        requestedAt: null,
        requestedByUserId: null,
        requestedByName: null,
        decisionAt: null,
        decidedByUserId: null,
        decidedByName: null,
        decisionReason: null
      },
      saleRequest: {
        status: "none",
        requestedAt: null,
        requestedByUserId: null,
        requestedByName: null,
        requestMessage: null,
        reviewedAt: null,
        reviewedByUserId: null,
        reviewedByName: null,
        reviewSummary: null,
        suggestedAmount: null,
        opinionMessage: null,
        proposalSentAt: null,
        clientDecision: "pending",
        clientDecisionAt: null,
        clientDecisionByUserId: null,
        clientDecisionByName: null,
        clientDecisionReason: null
      },
      serviceFee: null,
      charges: [],
      procedureProgress: normalizeCaseProcedureProgress(null),
      messages: [],
      movements: [initialMovement],
      status: "recebido",
      createdAt: now,
      updatedAt: now
    };

    this.cases.set(caseId, newCase);
    return newCase;
  }

  async assignCaseOperator(
    caseId: string,
    operator: { id: string; name: string | null },
    actor: { id: string; name: string | null }
  ): Promise<CaseRecord | null> {
    const existing = this.cases.get(caseId);
    if (!existing) {
      return null;
    }
    const normalizedExisting = normalizeCaseRecord(existing);
    const currentAssignedOperatorIds = normalizedExisting.assignedOperatorIds ?? [];
    const currentAssignedOperatorNames = normalizedExisting.assignedOperatorNames ?? [];
    const alreadyAssigned = currentAssignedOperatorIds.includes(operator.id);
    const nextAssignedOperatorIds = alreadyAssigned
      ? currentAssignedOperatorIds
      : [...currentAssignedOperatorIds, operator.id];
    const nextAssignedOperatorNames = alreadyAssigned
      ? currentAssignedOperatorNames
      : [
          ...currentAssignedOperatorNames,
          (operator.name ?? operator.id).trim()
        ].filter(Boolean);

    const now = new Date().toISOString();
    const movement: CaseMovementRecord = {
      id: randomUUID(),
      stage: "triagem",
      description: alreadyAssigned
        ? `${operator.name ?? operator.id} já fazia parte dos responsáveis deste caso.`
        : `Responsável ${operator.name ?? operator.id} adicionado ao caso.`,
      visibility: "public",
      createdAt: now,
      createdByUserId: actor.id,
      createdByName: actor.name,
      statusAfter: normalizedExisting.status,
      attachments: []
    };

    const updated: CaseRecord = {
      ...normalizedExisting,
      assignedOperatorId: operator.id,
      assignedOperatorName: operator.name,
      assignedOperatorIds: nextAssignedOperatorIds,
      assignedOperatorNames: nextAssignedOperatorNames,
      assignedAt: now,
      movements: [...(normalizedExisting.movements ?? []), movement],
      updatedAt: now
    };

    this.cases.set(caseId, updated);
    return updated;
  }

  async setCaseOperators(
    caseId: string,
    operators: Array<{ id: string; name: string | null }>,
    actor: { id: string; name: string | null }
  ): Promise<CaseRecord | null> {
    const existing = this.cases.get(caseId);
    if (!existing) {
      return null;
    }

    const normalizedExisting = normalizeCaseRecord(existing);
    const currentAssignedOperatorIds = Array.isArray(normalizedExisting.assignedOperatorIds)
      ? normalizedExisting.assignedOperatorIds
      : [];
    const currentAssignedOperatorNames = Array.isArray(normalizedExisting.assignedOperatorNames)
      ? normalizedExisting.assignedOperatorNames
      : [];
    const currentNameById = new Map<string, string>(
      currentAssignedOperatorIds.map((id, index) => [id, currentAssignedOperatorNames[index] ?? id])
    );

    const nextAssignedOperatorIds: string[] = [];
    const nextAssignedOperatorNames: string[] = [];
    for (const operator of operators) {
      const id = operator.id.trim();
      if (!id || nextAssignedOperatorIds.includes(id)) {
        continue;
      }

      const fallbackName = currentNameById.get(id) ?? id;
      const normalizedName = (operator.name ?? fallbackName).trim() || fallbackName;
      nextAssignedOperatorIds.push(id);
      nextAssignedOperatorNames.push(normalizedName);
    }

    const addedNames = nextAssignedOperatorIds
      .filter((id) => !currentAssignedOperatorIds.includes(id))
      .map((id) => nextAssignedOperatorNames[nextAssignedOperatorIds.indexOf(id)] ?? id);
    const removedNames = currentAssignedOperatorIds
      .filter((id) => !nextAssignedOperatorIds.includes(id))
      .map((id) => currentNameById.get(id) ?? id);

    let movementDescription = "Lista de responsaveis revisada sem alteracoes.";
    if (addedNames.length > 0 && removedNames.length > 0) {
      movementDescription = `Responsaveis atualizados. Adicionados: ${addedNames.join(", ")}. Removidos: ${removedNames.join(", ")}.`;
    } else if (addedNames.length > 0) {
      movementDescription = `Responsaveis adicionados: ${addedNames.join(", ")}.`;
    } else if (removedNames.length > 0) {
      movementDescription = `Responsaveis removidos: ${removedNames.join(", ")}.`;
    }

    const now = new Date().toISOString();
    const movement: CaseMovementRecord = {
      id: randomUUID(),
      stage: "triagem",
      description: movementDescription,
      visibility: "public",
      createdAt: now,
      createdByUserId: actor.id,
      createdByName: actor.name,
      statusAfter: normalizedExisting.status,
      attachments: []
    };

    const updated: CaseRecord = {
      ...normalizedExisting,
      assignedOperatorId: nextAssignedOperatorIds[0] ?? null,
      assignedOperatorName: nextAssignedOperatorNames[0] ?? null,
      assignedOperatorIds: nextAssignedOperatorIds,
      assignedOperatorNames: nextAssignedOperatorNames,
      assignedAt: nextAssignedOperatorIds.length > 0 ? now : null,
      movements: [...(normalizedExisting.movements ?? []), movement],
      updatedAt: now
    };

    this.cases.set(caseId, updated);
    return updated;
  }

  async appendCaseMovement(
    caseId: string,
    movement: {
      stage: CaseMovementRecord["stage"];
      description: string;
      visibility: CaseMovementRecord["visibility"];
      createdByUserId: string;
      createdByName: string | null;
      statusAfter: CaseRecord["status"];
    }
  ): Promise<{ caseItem: CaseRecord; movement: CaseMovementRecord } | null> {
    const existing = this.cases.get(caseId);
    if (!existing) {
      return null;
    }
    const normalizedExisting = normalizeCaseRecord(existing);

    const now = new Date().toISOString();
    const movementRecord: CaseMovementRecord = {
      id: randomUUID(),
      stage: movement.stage,
      description: movement.description,
      visibility: movement.visibility,
      createdAt: now,
      createdByUserId: movement.createdByUserId,
      createdByName: movement.createdByName,
      statusAfter: movement.statusAfter,
      attachments: []
    };

    const updated: CaseRecord = {
      ...normalizedExisting,
      status: movement.statusAfter,
      movements: [...(normalizedExisting.movements ?? []), movementRecord],
      updatedAt: now
    };

    this.cases.set(caseId, updated);
    return {
      caseItem: updated,
      movement: movementRecord
    };
  }

  async appendCaseAttachments(
    caseId: string,
    userId: string,
    attachments: PetitionAttachment[]
  ): Promise<CaseRecord | null> {
    const existing = this.cases.get(caseId);
    if (!existing) {
      return null;
    }
    const normalizedExisting = normalizeCaseRecord(existing);
    if (normalizedExisting.userId !== userId) {
      return null;
    }

    const now = new Date().toISOString();
    const petitionInitial = normalizedExisting.petitionInitial
      ? {
          ...normalizedExisting.petitionInitial,
          attachments: [...(normalizedExisting.petitionInitial.attachments ?? []), ...attachments]
        }
      : null;

    const updated: CaseRecord = {
      ...normalizedExisting,
      petitionInitial,
      updatedAt: now
    };

    this.cases.set(caseId, updated);
    return updated;
  }

  async appendMovementAttachments(
    caseId: string,
    movementId: string,
    attachments: PetitionAttachment[]
  ): Promise<CaseRecord | null> {
    const existing = this.cases.get(caseId);
    if (!existing) {
      return null;
    }
    const normalizedExisting = normalizeCaseRecord(existing);

    const movementIndex = (normalizedExisting.movements ?? []).findIndex((item) => item.id === movementId);
    if (movementIndex < 0) {
      return null;
    }

    const now = new Date().toISOString();
    const nextMovements = [...normalizedExisting.movements];
    const currentMovement = nextMovements[movementIndex];
    nextMovements[movementIndex] = {
      ...currentMovement,
      attachments: [...(currentMovement.attachments ?? []), ...attachments]
    };

    const updated: CaseRecord = {
      ...normalizedExisting,
      movements: nextMovements,
      updatedAt: now
    };

    this.cases.set(caseId, updated);
    return updated;
  }

  async updateCaseWorkflow(
    caseId: string,
    patch: {
      status?: CaseRecord["status"];
      reviewDecision?: CaseRecord["reviewDecision"];
      reviewReason?: string | null;
      reviewedAt?: string | null;
      reviewedByUserId?: string | null;
      reviewedByName?: string | null;
      clientDataRequest?: string | null;
      clientDataRequestedAt?: string | null;
      workflowStep?: CaseRecord["workflowStep"];
      serviceFee?: CaseRecord["serviceFee"];
      charges?: CaseRecord["charges"];
      procedureProgress?: CaseRecord["procedureProgress"];
      closeRequest?: CaseRecord["closeRequest"];
      saleRequest?: CaseRecord["saleRequest"];
    }
  ): Promise<CaseRecord | null> {
    const existing = this.cases.get(caseId);
    if (!existing) {
      return null;
    }
    const normalizedExisting = normalizeCaseRecord(existing);

    const now = new Date().toISOString();
    const updated: CaseRecord = {
      ...normalizedExisting,
      ...(patch.status ? { status: patch.status } : {}),
      ...(patch.reviewDecision ? { reviewDecision: patch.reviewDecision } : {}),
      ...(Object.prototype.hasOwnProperty.call(patch, "reviewReason")
        ? { reviewReason: normalizeOptionalText(patch.reviewReason) }
        : {}),
      ...(Object.prototype.hasOwnProperty.call(patch, "reviewedAt")
        ? { reviewedAt: patch.reviewedAt ?? null }
        : {}),
      ...(Object.prototype.hasOwnProperty.call(patch, "reviewedByUserId")
        ? { reviewedByUserId: patch.reviewedByUserId ?? null }
        : {}),
      ...(Object.prototype.hasOwnProperty.call(patch, "reviewedByName")
        ? { reviewedByName: normalizeOptionalText(patch.reviewedByName) }
        : {}),
      ...(Object.prototype.hasOwnProperty.call(patch, "clientDataRequest")
        ? { clientDataRequest: normalizeOptionalText(patch.clientDataRequest) }
        : {}),
      ...(Object.prototype.hasOwnProperty.call(patch, "clientDataRequestedAt")
        ? { clientDataRequestedAt: patch.clientDataRequestedAt ?? null }
        : {}),
      ...(patch.workflowStep ? { workflowStep: patch.workflowStep } : {}),
      ...(Object.prototype.hasOwnProperty.call(patch, "serviceFee")
        ? { serviceFee: normalizeCaseServiceFee(patch.serviceFee) }
        : {}),
      ...(Object.prototype.hasOwnProperty.call(patch, "charges")
        ? { charges: normalizeCaseCharges(patch.charges) }
        : {}),
      ...(Object.prototype.hasOwnProperty.call(patch, "procedureProgress")
        ? { procedureProgress: normalizeCaseProcedureProgress(patch.procedureProgress) }
        : {}),
      ...(Object.prototype.hasOwnProperty.call(patch, "closeRequest")
        ? { closeRequest: normalizeCaseCloseRequest(patch.closeRequest) }
        : {}),
      ...(Object.prototype.hasOwnProperty.call(patch, "saleRequest")
        ? { saleRequest: normalizeCaseSaleRequest(patch.saleRequest) }
        : {}),
      updatedAt: now
    };

    this.cases.set(caseId, updated);
    return updated;
  }

  async appendCaseMessage(
    caseId: string,
    message: {
      senderUserId: string;
      senderName: string | null;
      senderRole: "client" | "operator" | "master" | "system";
      message: string;
      attachments?: PetitionAttachment[];
    }
  ): Promise<CaseRecord | null> {
    const existing = this.cases.get(caseId);
    if (!existing) {
      return null;
    }
    const normalizedExisting = normalizeCaseRecord(existing);

    const now = new Date().toISOString();
    const nextMessage: CaseMessageRecord = {
      id: randomUUID(),
      caseId,
      senderUserId: message.senderUserId,
      senderName: normalizeOptionalText(message.senderName),
      senderRole: message.senderRole,
      message: message.message.trim(),
      attachments: message.attachments ?? [],
      createdAt: now
    };

    const updated: CaseRecord = {
      ...normalizedExisting,
      messages: [...normalizedExisting.messages, nextMessage],
      updatedAt: now
    };

    this.cases.set(caseId, updated);
    return updated;
  }

  async listCasesByUserId(userId: string): Promise<CaseRecord[]> {
    return Array.from(this.cases.values())
      .filter((item) => item.userId === userId)
      .map((item) => normalizeCaseRecord(item))
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  }

  async getCaseByIdForUser(caseId: string, userId: string): Promise<CaseRecord | null> {
    const found = this.cases.get(caseId);
    if (!found || found.userId !== userId) {
      return null;
    }
    return normalizeCaseRecord(found);
  }

  async listUsers(): Promise<UserRecord[]> {
    return Array.from(this.users.values()).sort((a, b) => (a.lastSeenAt < b.lastSeenAt ? 1 : -1));
  }

  async listAllCases(): Promise<CaseRecord[]> {
    return Array.from(this.cases.values())
      .map((item) => normalizeCaseRecord(item))
      .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
  }
}
