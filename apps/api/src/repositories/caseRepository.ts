import type { CaseRecord, NewCaseInput, UserRecord } from "../types/case.js";

export interface CaseRepository {
  upsertUser(user: UserRecord): Promise<void>;
  getUserById(userId: string): Promise<UserRecord | null>;
  updateUserProfile(
    userId: string,
    profile: { cpf: string; name?: string | null }
  ): Promise<UserRecord | null>;
  setUserMasterStatus(userId: string, isMaster: boolean): Promise<UserRecord | null>;
  createCase(input: NewCaseInput): Promise<CaseRecord>;
  listCasesByUserId(userId: string): Promise<CaseRecord[]>;
  getCaseByIdForUser(caseId: string, userId: string): Promise<CaseRecord | null>;
  listUsers(): Promise<UserRecord[]>;
  listAllCases(): Promise<CaseRecord[]>;
}
