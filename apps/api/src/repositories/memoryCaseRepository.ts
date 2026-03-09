import { randomUUID } from "node:crypto";
import type { CaseRepository } from "./caseRepository.js";
import type { CaseRecord, NewCaseInput, UserRecord } from "../types/case.js";

export class MemoryCaseRepository implements CaseRepository {
  private readonly users = new Map<string, UserRecord>();
  private readonly cases = new Map<string, CaseRecord>();

  async upsertUser(user: UserRecord): Promise<void> {
    const existing = this.users.get(user.id);
    if (!existing) {
      this.users.set(user.id, user);
      return;
    }

    this.users.set(user.id, {
        ...existing,
        email: user.email,
        name: user.name,
        cpf: existing.cpf ?? user.cpf ?? null,
        lastSeenAt: user.lastSeenAt
      });
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
        cpf: profile.cpf,
        createdAt: now,
        lastSeenAt: now
      };
      this.users.set(userId, created);
      return created;
    }

    const updated: UserRecord = {
      ...existing,
      name: profile.name ?? existing.name,
      cpf: profile.cpf,
      lastSeenAt: now
    };
    this.users.set(userId, updated);
    return updated;
  }

  async createCase(input: NewCaseInput): Promise<CaseRecord> {
    const now = new Date().toISOString();
    const caseId = randomUUID();

    const newCase: CaseRecord = {
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

    this.cases.set(caseId, newCase);
    return newCase;
  }

  async listCasesByUserId(userId: string): Promise<CaseRecord[]> {
    return Array.from(this.cases.values())
      .filter((item) => item.userId === userId)
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  }

  async getCaseByIdForUser(caseId: string, userId: string): Promise<CaseRecord | null> {
    const found = this.cases.get(caseId);
    if (!found || found.userId !== userId) {
      return null;
    }
    return found;
  }
}
