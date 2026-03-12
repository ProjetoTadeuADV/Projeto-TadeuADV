import { randomUUID } from "node:crypto";
import type { CaseRepository } from "./caseRepository.js";
import type { CaseRecord, NewCaseInput, UserRecord } from "../types/case.js";

function normalizeOptionalText(value: string | null | undefined): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
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
      lastSeenAt: now
    };
    this.users.set(userId, updated);
    return updated;
  }

  async updateAccountProfile(
    userId: string,
    profile: { name?: string | null; avatarUrl?: string | null }
  ): Promise<UserRecord | null> {
    const now = new Date().toISOString();
    const existing = this.users.get(userId);
    const hasName = Object.prototype.hasOwnProperty.call(profile, "name");
    const hasAvatarUrl = Object.prototype.hasOwnProperty.call(profile, "avatarUrl");

    if (!existing) {
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
      this.users.set(userId, created);
      return created;
    }

    const updated: UserRecord = {
      ...existing,
      name: hasName ? normalizeOptionalText(profile.name) : existing.name,
      avatarUrl: hasAvatarUrl ? normalizeOptionalText(profile.avatarUrl) : existing.avatarUrl,
      nameCustomized: hasName ? true : existing.nameCustomized ?? false,
      avatarUrlCustomized: hasAvatarUrl ? true : existing.avatarUrlCustomized ?? false,
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

  async listUsers(): Promise<UserRecord[]> {
    return Array.from(this.users.values()).sort((a, b) => (a.lastSeenAt < b.lastSeenAt ? 1 : -1));
  }

  async listAllCases(): Promise<CaseRecord[]> {
    return Array.from(this.cases.values()).sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
  }
}
