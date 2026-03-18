import { randomUUID } from "node:crypto";
import type { CaseRepository } from "./caseRepository.js";
import type {
  CaseMessageRecord,
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

function normalizeCaseRecord(value: CaseRecord): CaseRecord {
  return {
    ...value,
    reviewDecision: value.reviewDecision ?? "pending",
    reviewReason: normalizeOptionalText(value.reviewReason),
    reviewedAt: value.reviewedAt ?? null,
    reviewedByUserId: value.reviewedByUserId ?? null,
    reviewedByName: normalizeOptionalText(value.reviewedByName),
    clientDataRequest: normalizeOptionalText(value.clientDataRequest),
    clientDataRequestedAt: value.clientDataRequestedAt ?? null,
    workflowStep: (value.workflowStep ?? "triage") as CaseWorkflowStep,
    serviceFee: normalizeCaseServiceFee(value.serviceFee),
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
      assignedAt: null,
      reviewDecision: "pending",
      reviewReason: null,
      reviewedAt: null,
      reviewedByUserId: null,
      reviewedByName: null,
      clientDataRequest: null,
      clientDataRequestedAt: null,
      workflowStep: "triage",
      serviceFee: null,
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

    const now = new Date().toISOString();
    const movement: CaseMovementRecord = {
      id: randomUUID(),
      stage: "triagem",
      description: `Caso alocado para ${operator.name ?? operator.id}.`,
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
      assignedAt: now,
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
