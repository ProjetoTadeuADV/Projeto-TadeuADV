import { randomUUID } from "node:crypto";
import type { Firestore } from "firebase-admin/firestore";
import type { CaseRepository } from "./caseRepository.js";
import type { CaseRecord, NewCaseInput, UserRecord } from "../types/case.js";

const USERS_COLLECTION = "users";
const CASES_COLLECTION = "cases";

function normalizeOptionalText(value: string | null | undefined): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
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
    emailVerified: data.emailVerified ?? false,
    isMaster: normalizedIsMaster,
    isOperator: normalizedIsOperator,
    createdAt: data.createdAt ?? new Date(0).toISOString(),
    lastSeenAt: data.lastSeenAt ?? new Date(0).toISOString()
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
    profile: { name?: string | null; avatarUrl?: string | null }
  ): Promise<UserRecord | null> {
    const ref = this.firestore.collection(USERS_COLLECTION).doc(userId);
    const snapshot = await ref.get();
    const now = new Date().toISOString();

    const hasName = Object.prototype.hasOwnProperty.call(profile, "name");
    const hasAvatarUrl = Object.prototype.hasOwnProperty.call(profile, "avatarUrl");

    if (!snapshot.exists) {
      const created: UserRecord = {
        id: userId,
        email: null,
        name: hasName ? normalizeOptionalText(profile.name) : null,
        avatarUrl: hasAvatarUrl ? normalizeOptionalText(profile.avatarUrl) : null,
        nameCustomized: hasName,
        avatarUrlCustomized: hasAvatarUrl,
        cpf: null,
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
    const payload: CaseRecord = {
      id: caseId,
      userId: input.userId,
      varaId: input.varaId,
      varaNome: input.varaNome,
      cpf: input.cpf,
      resumo: input.resumo,
      cpfConsulta: input.cpfConsulta,
      status: "recebido",
      createdAt: now,
      updatedAt: now
    };

    await this.firestore.collection(CASES_COLLECTION).doc(caseId).set(payload);
    return payload;
  }

  async listCasesByUserId(userId: string): Promise<CaseRecord[]> {
    const snapshot = await this.firestore
      .collection(CASES_COLLECTION)
      .where("userId", "==", userId)
      .get();

    return snapshot.docs
      .map((doc) => doc.data() as CaseRecord)
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  }

  async getCaseByIdForUser(caseId: string, userId: string): Promise<CaseRecord | null> {
    const snapshot = await this.firestore.collection(CASES_COLLECTION).doc(caseId).get();
    if (!snapshot.exists) {
      return null;
    }

    const data = snapshot.data() as CaseRecord;
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
      .map((doc) => doc.data() as CaseRecord)
      .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
  }
}
