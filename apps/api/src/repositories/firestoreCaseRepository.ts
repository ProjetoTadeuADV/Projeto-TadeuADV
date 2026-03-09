import { randomUUID } from "node:crypto";
import type { Firestore } from "firebase-admin/firestore";
import type { CaseRepository } from "./caseRepository.js";
import type { CaseRecord, NewCaseInput, UserRecord } from "../types/case.js";

const USERS_COLLECTION = "users";
const CASES_COLLECTION = "cases";

export class FirestoreCaseRepository implements CaseRepository {
  constructor(private readonly firestore: Firestore) {}

  async upsertUser(user: UserRecord): Promise<void> {
    const ref = this.firestore.collection(USERS_COLLECTION).doc(user.id);
    const snapshot = await ref.get();
    if (!snapshot.exists) {
      await ref.set(user);
      return;
    }

    const existing = snapshot.data() as UserRecord;
    await ref.set(
      {
        ...existing,
        email: user.email,
        name: user.name,
        cpf: existing.cpf ?? user.cpf ?? null,
        lastSeenAt: user.lastSeenAt
      },
      { merge: true }
    );
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
        cpf: profile.cpf,
        createdAt: now,
        lastSeenAt: now
      };
      await ref.set(created);
      return created;
    }

    const existing = snapshot.data() as UserRecord;
    const updated: UserRecord = {
      ...existing,
      name: profile.name ?? existing.name,
      cpf: profile.cpf,
      lastSeenAt: now
    };
    await ref.set(updated, { merge: true });
    return updated;
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
}
