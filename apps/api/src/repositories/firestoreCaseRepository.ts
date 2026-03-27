import { randomUUID } from "node:crypto";
import type { Firestore } from "firebase-admin/firestore";
import type { CaseRepository } from "./caseRepository.js";
import type {
  CaseChargeRecord,
  CaseMessageRecord,
  CaseMovementRecord,
  CaseProcedureProgress,
  CaseRecord,
  CaseServiceFee,
  NewCaseInput,
  PetitionAttachment,
  PetitionInitialData,
  UserRecord
} from "../types/case.js";

const USERS_COLLECTION = "users";
const CASES_COLLECTION = "cases";

function buildCaseCode(caseId: string, createdAt: string): string {
  const datePart = createdAt.slice(0, 10).replace(/-/g, "");
  return `CASO-${datePart}-${caseId.slice(0, 8).toUpperCase()}`;
}

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
        cep?: string | null;
        street?: string | null;
        number?: string | null;
        complement?: string | null;
        neighborhood?: string | null;
        city?: string | null;
        state?: string | null;
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

function normalizeUserRecord(data: Partial<UserRecord>, fallbackId: string): UserRecord {
  const normalizedIsMaster = data.isMaster ?? false;
  const normalizedIsOperator = normalizedIsMaster ? false : (data.isOperator ?? false);

  return {
    id: data.id ?? fallbackId,
    email: data.email ?? null,
    name: data.name ?? null,
    avatarUrl: normalizeOptionalText(data.avatarUrl),
    nameCustomized: data.nameCustomized ?? false,
    avatarUrlCustomized: data.avatarUrlCustomized ?? false,
    cpf: data.cpf ?? null,
    asaasCustomerId: normalizeOptionalText(data.asaasCustomerId),
    rg: normalizeOptionalText(data.rg),
    rgIssuer: normalizeOptionalText(data.rgIssuer),
    birthDate: normalizeOptionalText(data.birthDate),
    maritalStatus: normalizeOptionalText(data.maritalStatus),
    profession: normalizeOptionalText(data.profession),
    address: normalizeUserAddress(data.address),
    emailVerified: data.emailVerified ?? false,
    isMaster: normalizedIsMaster,
    isOperator: normalizedIsOperator,
    createdAt: data.createdAt ?? new Date(0).toISOString(),
    lastSeenAt: data.lastSeenAt ?? new Date(0).toISOString()
  };
}

function normalizePetitionInitialData(
  value: PetitionInitialData | null | undefined
): PetitionInitialData | null {
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

function normalizeMovementRecord(value: Partial<CaseMovementRecord>): CaseMovementRecord {
  return {
    id: value.id ?? randomUUID(),
    stage: value.stage ?? "outro",
    description: value.description ?? "",
    visibility: value.visibility ?? "public",
    createdAt: value.createdAt ?? new Date(0).toISOString(),
    createdByUserId: value.createdByUserId ?? "",
    createdByName: value.createdByName ?? null,
    statusAfter: value.statusAfter ?? "recebido",
    attachments: value.attachments ?? []
  };
}

function normalizeCaseServiceFee(value: Partial<CaseServiceFee> | null | undefined): CaseServiceFee | null {
  if (!value) {
    return null;
  }

  if (typeof value.amount !== "number" || !Number.isFinite(value.amount) || value.amount <= 0) {
    return null;
  }

  return {
    amount: value.amount,
    dueDate: value.dueDate ?? "",
    provider: "asaas",
    status: value.status ?? "draft",
    externalReference: normalizeOptionalText(value.externalReference),
    paymentUrl: normalizeOptionalText(value.paymentUrl),
    updatedAt: value.updatedAt ?? new Date(0).toISOString()
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
      clientDecisionReason: null,
      payoutStatus: "none",
      payoutAmount: null,
      payoutRequestedAt: null,
      payoutSentAt: null,
      payoutAsaasTransferId: null,
      payoutFailureReason: null
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
    clientDecisionReason: normalizeOptionalText(value.clientDecisionReason),
    payoutStatus: value.payoutStatus ?? "none",
    payoutAmount:
      typeof value.payoutAmount === "number" && Number.isFinite(value.payoutAmount)
        ? value.payoutAmount
        : null,
    payoutRequestedAt: value.payoutRequestedAt ?? null,
    payoutSentAt: value.payoutSentAt ?? null,
    payoutAsaasTransferId: normalizeOptionalText(value.payoutAsaasTransferId),
    payoutFailureReason: normalizeOptionalText(value.payoutFailureReason)
  };
}

function normalizeCaseMessages(value: Partial<CaseMessageRecord>[] | null | undefined): CaseMessageRecord[] {
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

function normalizeCaseRecord(data: Partial<CaseRecord>, fallbackId: string): CaseRecord {
  const createdAt = data.createdAt ?? new Date(0).toISOString();
  const caseCode = normalizeOptionalText(data.caseCode) ?? buildCaseCode(data.id ?? fallbackId, createdAt);
  const assignedOperatorIds = normalizeAssignedOperatorIds(data.assignedOperatorIds, data.assignedOperatorId);
  const assignedOperatorNames = normalizeAssignedOperatorNames(data.assignedOperatorNames, data.assignedOperatorName);

  return {
    id: data.id ?? fallbackId,
    caseCode,
    userId: data.userId ?? "",
    varaId: data.varaId ?? "",
    varaNome: data.varaNome ?? "",
    cpf: data.cpf ?? "",
    resumo: data.resumo ?? "",
    cpfConsulta: data.cpfConsulta ?? null,
    petitionInitial: normalizePetitionInitialData(data.petitionInitial ?? null),
    assignedOperatorId: assignedOperatorIds[0] ?? null,
    assignedOperatorName: assignedOperatorNames[0] ?? null,
    assignedOperatorIds,
    assignedOperatorNames,
    assignedAt: data.assignedAt ?? null,
    reviewDecision: data.reviewDecision ?? "pending",
    reviewReason: normalizeOptionalText(data.reviewReason),
    reviewedAt: data.reviewedAt ?? null,
    reviewedByUserId: data.reviewedByUserId ?? null,
    reviewedByName: normalizeOptionalText(data.reviewedByName),
    clientDataRequest: normalizeOptionalText(data.clientDataRequest),
    clientDataRequestedAt: data.clientDataRequestedAt ?? null,
    workflowStep: data.workflowStep ?? "triage",
    closeRequest: normalizeCaseCloseRequest(data.closeRequest),
    saleRequest: normalizeCaseSaleRequest(data.saleRequest),
    serviceFee: normalizeCaseServiceFee(data.serviceFee),
    charges: normalizeCaseCharges(data.charges),
    procedureProgress: normalizeCaseProcedureProgress(data.procedureProgress),
    messages: normalizeCaseMessages(data.messages),
    movements: (data.movements ?? []).map((item) => normalizeMovementRecord(item)),
    status: data.status ?? "recebido",
    createdAt,
    updatedAt: data.updatedAt ?? createdAt
  };
}

export class FirestoreCaseRepository implements CaseRepository {
  constructor(private readonly firestore: Firestore) {}

  async upsertUser(user: UserRecord): Promise<void> {
    const ref = this.firestore.collection(USERS_COLLECTION).doc(user.id);
    const snapshot = await ref.get();
    if (!snapshot.exists) {
      await ref.set({
        ...user,
        avatarUrl: normalizeOptionalText(user.avatarUrl),
        nameCustomized: false,
        avatarUrlCustomized: false,
        isOperator: user.isMaster ? false : (user.isOperator ?? false)
      });
      return;
    }

    const existing = normalizeUserRecord(snapshot.data() as Partial<UserRecord>, user.id);
    const incomingName = normalizeOptionalText(user.name);
    const incomingAvatar = normalizeOptionalText(user.avatarUrl);
    await ref.set(
      {
        ...existing,
        email: user.email,
        name: existing.nameCustomized ? existing.name ?? null : existing.name ?? incomingName,
        avatarUrl: existing.avatarUrlCustomized ? existing.avatarUrl ?? null : existing.avatarUrl ?? incomingAvatar,
        nameCustomized: existing.nameCustomized,
        avatarUrlCustomized: existing.avatarUrlCustomized,
        cpf: existing.cpf ?? user.cpf ?? null,
        asaasCustomerId: existing.asaasCustomerId ?? null,
        emailVerified: user.emailVerified,
        isMaster: user.isMaster,
        isOperator: user.isMaster ? false : (user.isOperator ?? existing.isOperator ?? false),
        lastSeenAt: user.lastSeenAt
      },
      { merge: true }
    );
  }

  async getUserById(userId: string): Promise<UserRecord | null> {
    const snapshot = await this.firestore.collection(USERS_COLLECTION).doc(userId).get();
    if (!snapshot.exists) {
      return null;
    }

    return normalizeUserRecord(snapshot.data() as Partial<UserRecord>, userId);
  }

  async findUserByCpf(cpf: string): Promise<UserRecord | null> {
    const snapshot = await this.firestore
      .collection(USERS_COLLECTION)
      .where("cpf", "==", cpf)
      .limit(1)
      .get();

    if (snapshot.empty) {
      return null;
    }

    const first = snapshot.docs[0];
    return normalizeUserRecord(first.data() as Partial<UserRecord>, first.id);
  }

  async updateUserProfile(
    userId: string,
    profile: { cpf: string; name?: string | null }
  ): Promise<UserRecord | null> {
    const ref = this.firestore.collection(USERS_COLLECTION).doc(userId);
    const now = new Date().toISOString();
    const snapshot = await ref.get();

    if (!snapshot.exists) {
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
      await ref.set(created);
      return created;
    }

    const existing = normalizeUserRecord(snapshot.data() as Partial<UserRecord>, userId);
    const updated: UserRecord = {
      ...existing,
      name: normalizeOptionalText(profile.name) ?? existing.name,
      nameCustomized: true,
      cpf: profile.cpf,
      asaasCustomerId: existing.asaasCustomerId ?? null,
      lastSeenAt: now
    };
    await ref.set(updated, { merge: true });
    return updated;
  }

  async updateUserAsaasCustomer(userId: string, asaasCustomerId: string): Promise<UserRecord | null> {
    const ref = this.firestore.collection(USERS_COLLECTION).doc(userId);
    const snapshot = await ref.get();
    const now = new Date().toISOString();
    if (!snapshot.exists) {
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
      await ref.set(created, { merge: true });
      return created;
    }

    const existing = normalizeUserRecord(snapshot.data() as Partial<UserRecord>, userId);
    const updated: UserRecord = {
      ...existing,
      asaasCustomerId: normalizeOptionalText(asaasCustomerId),
      lastSeenAt: now
    };
    await ref.set(updated, { merge: true });
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
    const ref = this.firestore.collection(USERS_COLLECTION).doc(userId);
    const snapshot = await ref.get();
    const now = new Date().toISOString();

    const hasName = Object.prototype.hasOwnProperty.call(profile, "name");
    const hasAvatarUrl = Object.prototype.hasOwnProperty.call(profile, "avatarUrl");
    const hasCpf = Object.prototype.hasOwnProperty.call(profile, "cpf");
    const hasRg = Object.prototype.hasOwnProperty.call(profile, "rg");
    const hasRgIssuer = Object.prototype.hasOwnProperty.call(profile, "rgIssuer");
    const hasBirthDate = Object.prototype.hasOwnProperty.call(profile, "birthDate");
    const hasMaritalStatus = Object.prototype.hasOwnProperty.call(profile, "maritalStatus");
    const hasProfession = Object.prototype.hasOwnProperty.call(profile, "profession");
    const hasAddress = Object.prototype.hasOwnProperty.call(profile, "address");

    if (!snapshot.exists) {
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
      await ref.set(created);
      return created;
    }

    const existing = normalizeUserRecord(snapshot.data() as Partial<UserRecord>, userId);
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

    await ref.set(updated, { merge: true });
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
    const ref = this.firestore.collection(USERS_COLLECTION).doc(userId);
    const snapshot = await ref.get();
    if (!snapshot.exists) {
      return null;
    }

    const existing = normalizeUserRecord(snapshot.data() as Partial<UserRecord>, userId);
    const updated: UserRecord = {
      ...existing,
      isMaster: accessLevel === "master",
      isOperator: accessLevel === "operator"
    };
    await ref.set(updated, { merge: true });
    return updated;
  }

  async deleteUserWithCases(userId: string): Promise<{ deletedUser: boolean; deletedCases: number }> {
    const userRef = this.firestore.collection(USERS_COLLECTION).doc(userId);
    const userSnapshot = await userRef.get();
    const caseSnapshots = await this.firestore
      .collection(CASES_COLLECTION)
      .where("userId", "==", userId)
      .get();

    let deletedCases = 0;
    let pendingOps = 0;
    let batch = this.firestore.batch();

    for (const doc of caseSnapshots.docs) {
      batch.delete(doc.ref);
      deletedCases += 1;
      pendingOps += 1;

      if (pendingOps >= 400) {
        await batch.commit();
        batch = this.firestore.batch();
        pendingOps = 0;
      }
    }

    if (userSnapshot.exists) {
      batch.delete(userRef);
      pendingOps += 1;
    }

    if (pendingOps > 0) {
      await batch.commit();
    }

    return {
      deletedUser: userSnapshot.exists,
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
    const payload: CaseRecord = {
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
        clientDecisionReason: null,
        payoutStatus: "none",
        payoutAmount: null,
        payoutRequestedAt: null,
        payoutSentAt: null,
        payoutAsaasTransferId: null,
        payoutFailureReason: null
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

    await this.firestore.collection(CASES_COLLECTION).doc(caseId).set(payload);
    return payload;
  }

  async assignCaseOperator(
    caseId: string,
    operator: { id: string; name: string | null },
    actor: { id: string; name: string | null }
  ): Promise<CaseRecord | null> {
    const ref = this.firestore.collection(CASES_COLLECTION).doc(caseId);
    const snapshot = await ref.get();
    if (!snapshot.exists) {
      return null;
    }

    const existing = normalizeCaseRecord(snapshot.data() as Partial<CaseRecord>, caseId);
    const currentAssignedOperatorIds = existing.assignedOperatorIds ?? [];
    const currentAssignedOperatorNames = existing.assignedOperatorNames ?? [];
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
      statusAfter: existing.status,
      attachments: []
    };

    const updated: CaseRecord = {
      ...existing,
      assignedOperatorId: operator.id,
      assignedOperatorName: operator.name,
      assignedOperatorIds: nextAssignedOperatorIds,
      assignedOperatorNames: nextAssignedOperatorNames,
      assignedAt: now,
      movements: [...existing.movements, movement],
      updatedAt: now
    };

    await ref.set(updated, { merge: true });
    return updated;
  }

  async setCaseOperators(
    caseId: string,
    operators: Array<{ id: string; name: string | null }>,
    actor: { id: string; name: string | null }
  ): Promise<CaseRecord | null> {
    const ref = this.firestore.collection(CASES_COLLECTION).doc(caseId);
    const snapshot = await ref.get();
    if (!snapshot.exists) {
      return null;
    }

    const existing = normalizeCaseRecord(snapshot.data() as Partial<CaseRecord>, caseId);
    const currentAssignedOperatorIds = Array.isArray(existing.assignedOperatorIds)
      ? existing.assignedOperatorIds
      : [];
    const currentAssignedOperatorNames = Array.isArray(existing.assignedOperatorNames)
      ? existing.assignedOperatorNames
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
      statusAfter: existing.status,
      attachments: []
    };

    const updated: CaseRecord = {
      ...existing,
      assignedOperatorId: nextAssignedOperatorIds[0] ?? null,
      assignedOperatorName: nextAssignedOperatorNames[0] ?? null,
      assignedOperatorIds: nextAssignedOperatorIds,
      assignedOperatorNames: nextAssignedOperatorNames,
      assignedAt: nextAssignedOperatorIds.length > 0 ? now : null,
      movements: [...existing.movements, movement],
      updatedAt: now
    };

    await ref.set(updated, { merge: true });
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
    const ref = this.firestore.collection(CASES_COLLECTION).doc(caseId);
    const snapshot = await ref.get();
    if (!snapshot.exists) {
      return null;
    }

    const existing = normalizeCaseRecord(snapshot.data() as Partial<CaseRecord>, caseId);
    const now = new Date().toISOString();
    const updated: CaseRecord = {
      ...existing,
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

    await ref.set(updated, { merge: true });
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
    const ref = this.firestore.collection(CASES_COLLECTION).doc(caseId);
    const snapshot = await ref.get();
    if (!snapshot.exists) {
      return null;
    }

    const existing = normalizeCaseRecord(snapshot.data() as Partial<CaseRecord>, caseId);
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
      ...existing,
      status: movement.statusAfter,
      movements: [...existing.movements, movementRecord],
      updatedAt: now
    };

    await ref.set(updated, { merge: true });
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
    const ref = this.firestore.collection(CASES_COLLECTION).doc(caseId);
    const snapshot = await ref.get();
    if (!snapshot.exists) {
      return null;
    }

    const existing = normalizeCaseRecord(snapshot.data() as Partial<CaseRecord>, caseId);
    if (existing.userId !== userId) {
      return null;
    }

    const now = new Date().toISOString();
    const petitionInitial = existing.petitionInitial
      ? {
          ...existing.petitionInitial,
          attachments: [...(existing.petitionInitial.attachments ?? []), ...attachments]
        }
      : null;

    const updated: CaseRecord = {
      ...existing,
      petitionInitial,
      updatedAt: now
    };

    await ref.set(updated, { merge: true });
    return updated;
  }

  async appendMovementAttachments(
    caseId: string,
    movementId: string,
    attachments: PetitionAttachment[]
  ): Promise<CaseRecord | null> {
    const ref = this.firestore.collection(CASES_COLLECTION).doc(caseId);
    const snapshot = await ref.get();
    if (!snapshot.exists) {
      return null;
    }

    const existing = normalizeCaseRecord(snapshot.data() as Partial<CaseRecord>, caseId);
    const movementIndex = existing.movements.findIndex((item) => item.id === movementId);
    if (movementIndex < 0) {
      return null;
    }

    const now = new Date().toISOString();
    const nextMovements = [...existing.movements];
    const targetMovement = nextMovements[movementIndex];
    nextMovements[movementIndex] = {
      ...targetMovement,
      attachments: [...targetMovement.attachments, ...attachments]
    };

    const updated: CaseRecord = {
      ...existing,
      movements: nextMovements,
      updatedAt: now
    };

    await ref.set(updated, { merge: true });
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
    const ref = this.firestore.collection(CASES_COLLECTION).doc(caseId);
    const snapshot = await ref.get();
    if (!snapshot.exists) {
      return null;
    }

    const existing = normalizeCaseRecord(snapshot.data() as Partial<CaseRecord>, caseId);
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
      ...existing,
      messages: [...existing.messages, nextMessage],
      updatedAt: now
    };

    await ref.set(updated, { merge: true });
    return updated;
  }

  async listCasesByUserId(userId: string): Promise<CaseRecord[]> {
    const snapshot = await this.firestore
      .collection(CASES_COLLECTION)
      .where("userId", "==", userId)
      .get();

    return snapshot.docs
      .map((doc) => normalizeCaseRecord(doc.data() as Partial<CaseRecord>, doc.id))
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  }

  async getCaseByIdForUser(caseId: string, userId: string): Promise<CaseRecord | null> {
    const snapshot = await this.firestore.collection(CASES_COLLECTION).doc(caseId).get();
    if (!snapshot.exists) {
      return null;
    }

    const data = normalizeCaseRecord(snapshot.data() as Partial<CaseRecord>, caseId);
    if (data.userId !== userId) {
      return null;
    }

    return data;
  }

  async listUsers(): Promise<UserRecord[]> {
    const snapshot = await this.firestore.collection(USERS_COLLECTION).get();

    return snapshot.docs
      .map((doc) => normalizeUserRecord(doc.data() as Partial<UserRecord>, doc.id))
      .sort((a, b) => (a.lastSeenAt < b.lastSeenAt ? 1 : -1));
  }

  async listAllCases(): Promise<CaseRecord[]> {
    const snapshot = await this.firestore.collection(CASES_COLLECTION).get();

    return snapshot.docs
      .map((doc) => normalizeCaseRecord(doc.data() as Partial<CaseRecord>, doc.id))
      .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
  }
}
