import { randomUUID } from "node:crypto";
import type { Firestore } from "firebase-admin/firestore";
import type { CaseRepository } from "./caseRepository.js";
import type {
  CaseMessageRecord,
  CaseMovementRecord,
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

function normalizeCaseRecord(data: Partial<CaseRecord>, fallbackId: string): CaseRecord {
  const createdAt = data.createdAt ?? new Date(0).toISOString();
  const caseCode = normalizeOptionalText(data.caseCode) ?? buildCaseCode(data.id ?? fallbackId, createdAt);

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
    assignedOperatorId: data.assignedOperatorId ?? null,
    assignedOperatorName: data.assignedOperatorName ?? null,
    assignedAt: data.assignedAt ?? null,
    reviewDecision: data.reviewDecision ?? "pending",
    reviewReason: normalizeOptionalText(data.reviewReason),
    reviewedAt: data.reviewedAt ?? null,
    reviewedByUserId: data.reviewedByUserId ?? null,
    reviewedByName: normalizeOptionalText(data.reviewedByName),
    clientDataRequest: normalizeOptionalText(data.clientDataRequest),
    clientDataRequestedAt: data.clientDataRequestedAt ?? null,
    workflowStep: data.workflowStep ?? "triage",
    serviceFee: normalizeCaseServiceFee(data.serviceFee),
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
    const now = new Date().toISOString();
    const movement: CaseMovementRecord = {
      id: randomUUID(),
      stage: "triagem",
      description: `Caso alocado para ${operator.name ?? operator.id}.`,
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
      assignedAt: now,
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
