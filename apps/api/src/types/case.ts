export const CASE_STATUSES = ["recebido", "em_analise", "encerrado"] as const;

export type CaseStatus = (typeof CASE_STATUSES)[number];

export const CASE_STATUS_LABELS: Record<CaseStatus, string> = {
  recebido: "Recebido",
  em_analise: "Em análise",
  encerrado: "Encerrado"
};

export function isCaseStatus(value: string): value is CaseStatus {
  return CASE_STATUSES.includes(value as CaseStatus);
}

export type CaseMovementStage =
  | "triagem"
  | "conciliacao"
  | "peticao"
  | "protocolo"
  | "andamento"
  | "solucao"
  | "outro";

export const CASE_MOVEMENT_STAGES: CaseMovementStage[] = [
  "triagem",
  "conciliacao",
  "peticao",
  "protocolo",
  "andamento",
  "solucao",
  "outro"
];

export const CASE_MOVEMENT_STAGE_LABELS: Record<CaseMovementStage, string> = {
  triagem: "Triagem",
  conciliacao: "Conciliação",
  peticao: "Petição",
  protocolo: "Protocolo",
  andamento: "Andamento",
  solucao: "Solução",
  outro: "Outro"
};

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

export type PetitionPriorAttemptChannel =
  | "reclame_aqui"
  | "procon"
  | "consumidor_gov_br"
  | "direto_reclamado"
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

export type CaseMovementVisibility = "public" | "internal";

export type CaseReviewDecision = "pending" | "accepted" | "rejected";

export type CaseWorkflowStep =
  | "triage"
  | "awaiting_client_data"
  | "awaiting_initial_fee"
  | "in_progress"
  | "closed";

export type CaseTimelineStage =
  | "ajuizamento"
  | "audiencia-conciliacao"
  | "sentenca"
  | "acordo"
  | "transito-julgado"
  | "receber-acao";

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

export interface CaseConciliationAttempt {
  id: string;
  details: string | null;
  contactedDefendant: boolean;
  defendantContact: string | null;
  defendantEmail: string | null;
  emailDraft: string | null;
  emailSent: boolean;
  emailSentAt: string | null;
  createdAt: string;
  createdByUserId: string | null;
  createdByName: string | null;
}

export interface CaseConciliationProgress {
  details?: string | null;
  contactedDefendant: boolean;
  defendantContact: string | null;
  defendantEmail: string | null;
  emailDraft: string | null;
  emailSent: boolean;
  emailSentAt: string | null;
  lastUpdatedAt: string | null;
  agreementReached: boolean;
  agreementClosedAt: string | null;
  attempts?: CaseConciliationAttempt[];
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

export interface CaseTimelineProgress {
  currentStage: CaseTimelineStage;
  notes: string | null;
  updatedAt: string | null;
  updatedByUserId: string | null;
  updatedByName: string | null;
  stageStates?: Partial<Record<CaseTimelineStage, CaseTimelineStageState>>;
}

export interface CaseTimelineStageChecklistItem {
  id: string;
  label: string;
  done: boolean;
  updatedAt: string | null;
}

export interface CaseTimelineStageState {
  checklist: CaseTimelineStageChecklistItem[];
  notes: string | null;
  updatedAt: string | null;
  updatedByUserId: string | null;
  updatedByName: string | null;
}

export interface CaseProcedureProgress {
  timeline: CaseTimelineProgress;
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
  priorAttemptMade: boolean;
  priorAttemptChannel: PetitionPriorAttemptChannel | null;
  priorAttemptChannelOther: string | null;
  priorAttemptProtocol: string | null;
  priorAttemptHadProposal: boolean | null;
  priorAttemptProposalDetails: string | null;
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
  assignedOperatorIds?: string[];
  assignedOperatorNames?: string[];
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
  status: CaseStatus;
  createdAt: string;
  updatedAt: string;
}

export interface NewCaseInput {
  userId: string;
  varaId: string;
  varaNome: string;
  cpf: string;
  resumo: string;
  cpfConsulta: CpfConsultaResult | null;
  petitionInitial?: PetitionInitialData | null;
}

export interface UserRecord {
  id: string;
  email: string | null;
  name: string | null;
  avatarUrl?: string | null;
  nameCustomized?: boolean;
  avatarUrlCustomized?: boolean;
  cpf?: string | null;
  asaasCustomerId?: string | null;
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
  emailVerified: boolean;
  isMaster: boolean;
  isOperator?: boolean;
  createdAt: string;
  lastSeenAt: string;
}
