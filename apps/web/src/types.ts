export interface ApiSuccessResponse<T> {
  status: "ok";
  result: T;
}

export interface ApiErrorResponse {
  status: "error";
  message: string;
  details?: unknown;
}

export interface VaraOption {
  id: string;
  nome: string;
}

export type CaseStatus = "recebido" | "em_analise" | "encerrado";

export interface CpfConsultaResult {
  cpf: string;
  nome: string;
  situacao: "regular" | "pendente" | "indisponivel";
  source: "mock";
  updatedAt: string;
}

export type PetitionDefendantType = "pessoa_fisica" | "pessoa_juridica" | "nao_informado";

export interface PetitionTimelineEvent {
  eventDate: string;
  description: string;
}

export type PetitionPretensionType =
  | "ressarcimento_valor"
  | "indenizacao_danos"
  | "cumprimento_compromisso"
  | "retratacao"
  | "devolucao_produto"
  | "outro";

export interface PetitionPretension {
  type: PetitionPretensionType;
  amount: number | null;
  details: string | null;
}

export interface PetitionAttachment {
  id: string;
  originalName: string;
  storedName: string;
  mimeType: string;
  sizeBytes: number;
  uploadedAt: string;
}

export type CaseMovementStage =
  | "triagem"
  | "conciliacao"
  | "peticao"
  | "protocolo"
  | "andamento"
  | "solucao"
  | "outro";

export type CaseMovementVisibility = "public" | "internal";

export type CaseReviewDecision = "pending" | "accepted" | "rejected";

export type CaseWorkflowStep =
  | "triage"
  | "awaiting_client_data"
  | "awaiting_initial_fee"
  | "in_progress"
  | "closed";

export type CaseMessageSenderRole = "client" | "operator" | "master" | "system";

export type CaseCloseRequestStatus = "none" | "pending" | "approved" | "denied";

export interface CaseCloseRequest {
  status: CaseCloseRequestStatus;
  reason: string | null;
  requestedAt: string | null;
  requestedByUserId: string | null;
  requestedByName: string | null;
  decisionAt: string | null;
  decidedByUserId: string | null;
  decidedByName: string | null;
  decisionReason: string | null;
}

export interface CaseServiceFee {
  amount: number;
  dueDate: string;
  provider: "asaas";
  status: "draft" | "awaiting_payment" | "paid" | "canceled";
  externalReference: string | null;
  paymentUrl: string | null;
  updatedAt: string;
}

export type CaseChargeStatus = "awaiting_payment" | "received" | "confirmed" | "canceled";

export interface CaseChargeRecord {
  id: string;
  amount: number;
  dueDate: string;
  provider: "asaas";
  status: CaseChargeStatus;
  externalReference: string | null;
  paymentUrl: string | null;
  attachmentId: string | null;
  createdAt: string;
  updatedAt: string;
  createdByUserId: string;
  createdByName: string | null;
}

export interface CaseProcedureChecklistItem {
  id: string;
  label: string;
  done: boolean;
  notes: string | null;
  updatedAt: string | null;
}

export interface CaseConciliationProgress {
  contactedDefendant: boolean;
  defendantContact: string | null;
  defendantEmail: string | null;
  emailDraft: string | null;
  emailSent: boolean;
  emailSentAt: string | null;
  lastUpdatedAt: string | null;
  agreementReached: boolean;
  agreementClosedAt: string | null;
}

export interface CasePetitionProgress {
  petitionPulled: boolean;
  petitionPulledAt: string | null;
  jusiaProtocolChecked: boolean;
  jusiaProtocolCheckedAt: string | null;
  protocolCode: string | null;
  protocolCodeUpdatedAt: string | null;
  checklist: CaseProcedureChecklistItem[];
  lastUpdatedAt: string | null;
}

export interface CaseProcedureProgress {
  conciliation: CaseConciliationProgress;
  petition: CasePetitionProgress;
}

export interface CaseMessageRecord {
  id: string;
  caseId: string;
  senderUserId: string;
  senderName: string | null;
  senderRole: CaseMessageSenderRole;
  message: string;
  attachments: PetitionAttachment[];
  createdAt: string;
}

export interface CaseMovementRecord {
  id: string;
  stage: CaseMovementStage;
  description: string;
  visibility: CaseMovementVisibility;
  createdAt: string;
  createdByUserId: string;
  createdByName: string | null;
  statusAfter: CaseStatus;
  attachments: PetitionAttachment[];
}

export interface PetitionInitialData {
  claimantAddress: string;
  claimSubject: string;
  defendantType: PetitionDefendantType;
  defendantName: string;
  defendantDocument: string | null;
  defendantAddress: string | null;
  facts: string;
  legalGrounds: string;
  requests: string[];
  timelineEvents: PetitionTimelineEvent[];
  pretensions: PetitionPretension[];
  evidence: string | null;
  attachments: PetitionAttachment[];
  claimValue: number | null;
  hearingInterest: boolean;
}

export interface CaseRecord {
  id: string;
  caseCode: string;
  userId: string;
  varaId: string;
  varaNome: string;
  cpf: string;
  resumo: string;
  cpfConsulta: CpfConsultaResult | null;
  petitionInitial?: PetitionInitialData | null;
  assignedOperatorId: string | null;
  assignedOperatorName: string | null;
  assignedAt: string | null;
  reviewDecision: CaseReviewDecision;
  reviewReason: string | null;
  reviewedAt: string | null;
  reviewedByUserId: string | null;
  reviewedByName: string | null;
  clientDataRequest: string | null;
  clientDataRequestedAt: string | null;
  workflowStep: CaseWorkflowStep;
  closeRequest: CaseCloseRequest;
  serviceFee: CaseServiceFee | null;
  charges?: CaseChargeRecord[];
  procedureProgress?: CaseProcedureProgress;
  messages: CaseMessageRecord[];
  movements: CaseMovementRecord[];
  clienteNome?: string | null;
  responsavelNome?: string | null;
  responsavelEmail?: string | null;
  status: CaseStatus;
  createdAt: string;
  updatedAt: string;
}

export interface CaseMovementCreateResult {
  caseItem: CaseRecord;
  movement: CaseMovementRecord;
}

export interface AdminOperatorOption {
  id: string;
  name: string | null;
  email: string | null;
  isMaster: boolean;
  isOperator: boolean;
}

export interface AuthAccessProfile {
  uid: string;
  email: string | null;
  name: string | null;
  avatarUrl: string | null;
  emailVerified: boolean;
  isMaster: boolean;
  isOperator: boolean;
  accessLevel: "user" | "operator" | "master";
  canAccessAdmin: boolean;
  isBootstrapMaster: boolean;
}

export interface AccountProfile {
  id: string;
  email: string | null;
  firebaseUid: string;
  name: string | null;
  avatarUrl: string | null;
  cpf: string | null;
  rg: string | null;
  rgIssuer: string | null;
  birthDate: string | null;
  maritalStatus: string | null;
  profession: string | null;
  address: {
    cep: string | null;
    street: string | null;
    number: string | null;
    complement: string | null;
    neighborhood: string | null;
    city: string | null;
    state: string | null;
  } | null;
}

export interface MasterSummary {
  totalUsers: number;
  totalMasterUsers: number;
  verifiedUsers: number;
  activeUsersLast30Days: number;
  newUsersLast7Days: number;
  totalCases: number;
  activeCases: number;
  closedCases: number;
}

export interface MasterUserOverview {
  id: string;
  email: string | null;
  name: string | null;
  avatarUrl: string | null;
  cpf: string | null;
  emailVerified: boolean;
  isMaster: boolean;
  isOperator: boolean;
  accessLevel: "user" | "operator" | "master";
  isBootstrapMaster: boolean;
  createdAt: string;
  lastSeenAt: string;
  totalCases: number;
  activeCases: number;
  lastCaseAt: string | null;
}

export interface MasterRecentCase {
  id: string;
  userId: string;
  userName: string | null;
  userEmail: string | null;
  varaNome: string;
  status: CaseStatus;
  createdAt: string;
  updatedAt: string;
}

export interface MasterOverview {
  summary: MasterSummary;
  users: MasterUserOverview[];
  recentCases: MasterRecentCase[];
}

export interface MasterUserRequest {
  id: string;
  varaNome: string;
  cpf: string;
  resumo: string;
  status: CaseStatus;
  createdAt: string;
  updatedAt: string;
}

export interface MasterUserActivity {
  user: MasterUserOverview;
  requests: MasterUserRequest[];
}
