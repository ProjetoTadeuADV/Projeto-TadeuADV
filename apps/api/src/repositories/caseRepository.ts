import type {
  CaseMessageSenderRole,
  CaseReviewDecision,
  CaseWorkflowStep,
  CaseMovementRecord,
  CaseMovementStage,
  CaseMovementVisibility,
  CaseChargeRecord,
  CaseProcedureProgress,
  CaseServiceFee,
  CaseRecord,
  NewCaseInput,
  PetitionAttachment,
  UserRecord
} from "../types/case.js";

export interface CaseRepository {
  upsertUser(user: UserRecord): Promise<void>;
  getUserById(userId: string): Promise<UserRecord | null>;
  findUserByCpf(cpf: string): Promise<UserRecord | null>;
  updateUserProfile(
    userId: string,
    profile: { cpf: string; name?: string | null }
  ): Promise<UserRecord | null>;
  updateUserAsaasCustomer(userId: string, asaasCustomerId: string): Promise<UserRecord | null>;
  updateAccountProfile(
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
  ): Promise<UserRecord | null>;
  setUserMasterStatus(userId: string, isMaster: boolean): Promise<UserRecord | null>;
  setUserAccessLevel(
    userId: string,
    accessLevel: "user" | "operator" | "master"
  ): Promise<UserRecord | null>;
  deleteUserWithCases(userId: string): Promise<{ deletedUser: boolean; deletedCases: number }>;
  createCase(input: NewCaseInput): Promise<CaseRecord>;
  assignCaseOperator(
    caseId: string,
    operator: { id: string; name: string | null },
    actor: { id: string; name: string | null }
  ): Promise<CaseRecord | null>;
  setCaseOperators(
    caseId: string,
    operators: Array<{ id: string; name: string | null }>,
    actor: { id: string; name: string | null }
  ): Promise<CaseRecord | null>;
  updateCaseWorkflow(
    caseId: string,
    patch: {
      status?: CaseRecord["status"];
      reviewDecision?: CaseReviewDecision;
      reviewReason?: string | null;
      reviewedAt?: string | null;
      reviewedByUserId?: string | null;
      reviewedByName?: string | null;
      clientDataRequest?: string | null;
      clientDataRequestedAt?: string | null;
      workflowStep?: CaseWorkflowStep;
      serviceFee?: CaseServiceFee | null;
      charges?: CaseChargeRecord[] | null;
      procedureProgress?: CaseProcedureProgress | null;
      closeRequest?: CaseRecord["closeRequest"];
    }
  ): Promise<CaseRecord | null>;
  appendCaseMovement(
    caseId: string,
    movement: {
      stage: CaseMovementStage;
      description: string;
      visibility: CaseMovementVisibility;
      createdByUserId: string;
      createdByName: string | null;
      statusAfter: CaseRecord["status"];
    }
  ): Promise<{ caseItem: CaseRecord; movement: CaseMovementRecord } | null>;
  appendCaseAttachments(
    caseId: string,
    userId: string,
    attachments: PetitionAttachment[]
  ): Promise<CaseRecord | null>;
  appendMovementAttachments(
    caseId: string,
    movementId: string,
    attachments: PetitionAttachment[]
  ): Promise<CaseRecord | null>;
  appendCaseMessage(
    caseId: string,
    message: {
      senderUserId: string;
      senderName: string | null;
      senderRole: CaseMessageSenderRole;
      message: string;
      attachments?: PetitionAttachment[];
    }
  ): Promise<CaseRecord | null>;
  listCasesByUserId(userId: string): Promise<CaseRecord[]>;
  getCaseByIdForUser(caseId: string, userId: string): Promise<CaseRecord | null>;
  listUsers(): Promise<UserRecord[]>;
  listAllCases(): Promise<CaseRecord[]>;
}
