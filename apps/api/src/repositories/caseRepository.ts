import type { CaseRecord, NewCaseInput, UserRecord } from "../types/case.js";

export interface CaseRepository {
  upsertUser(user: UserRecord): Promise<void>;
  getUserById(userId: string): Promise<UserRecord | null>;
  findUserByCpf(cpf: string): Promise<UserRecord | null>;
  updateUserProfile(
    userId: string,
    profile: { cpf: string; name?: string | null }
  ): Promise<UserRecord | null>;
  updateAccountProfile(
    userId: string,
    profile: { name?: string | null; avatarUrl?: string | null }
  ): Promise<UserRecord | null>;
  setUserMasterStatus(userId: string, isMaster: boolean): Promise<UserRecord | null>;
  setUserAccessLevel(
    userId: string,
    accessLevel: "user" | "operator" | "master"
  ): Promise<UserRecord | null>;
  deleteUserWithCases(userId: string): Promise<{ deletedUser: boolean; deletedCases: number }>;
  createCase(input: NewCaseInput): Promise<CaseRecord>;
  listCasesByUserId(userId: string): Promise<CaseRecord[]>;
  getCaseByIdForUser(caseId: string, userId: string): Promise<CaseRecord | null>;
  listUsers(): Promise<UserRecord[]>;
  listAllCases(): Promise<CaseRecord[]>;
}
